import { PIPELINE_AFK_ENV } from '../queue/gate.js'
import { type RunOutcome } from '../types.js'
import { filterRunnerEnvironment, type SandboxReport } from '../runner/runner.js'
import { markNonLoopPrepared, type PreparedExecutionContext, type PreparedSkillBundle } from '../admission/execution-context.js'
import {
  assertLoopRunner, evaluateConstraintPolicy,
  type ConstraintDecision, type VerificationBinding, type VerificationIssuer,
} from '@pipeline-lite/kernel'
import {
  DEFAULT_VERIFIER_ISSUER_IDENTITY, enforceVerificationBoundary, evaluateVerificationGate, freezeVerifierInput,
  type VerificationIssuerIdentity, type VerifierPort,
} from '../verifier/verifier.js'
import { certifyLifecycleOutcome } from './outcome.js'
import { type GitFace, deriveBarrierSha } from './barrier.js'
import { MergeJournalError, type MergeBackReceipt, type MergeIntentDraft } from './mergeback.js'
import {
  AllowlistViolationError, DenylistViolationError, PathPolicyUnconfiguredError,
  matchAllowlist, matchDenylist, matchesPathGlob,
} from './denylist.js'
import { createPhaseWatch } from './transitionWatch.js'
import {
  AbortedRunError,
  BaseAdvancedError,
  CancelledRunError,
  LifecycleContainerCleanupError,
  NAMED_BRANCH_PREFIX,
  PIPELINE_ATTEMPT_CONTEXT_B64_ENV,
  PIPELINE_AUTOMATION_POLICY_ENV,
  PIPELINE_WORKFLOW_STEP_PROMPT_B64_ENV,
  RunAndCleanupError,
  SKILL_BUNDLE_CONTAINER_DIR,
  createAgentExitWatch,
  finalizeRunOutcome,
  isBaseRefCas,
  isLoopNotActive,
  isPreserveError,
  type LifecyclePorts,
  type RunChangeConfig,
  type SandboxHandle,
} from './lifecycle-support.js'

export const runChangeInSandbox = async (ports: LifecyclePorts, cfg: RunChangeConfig, signal: AbortSignal): Promise<RunOutcome> => {
  const branch = `${NAMED_BRANCH_PREFIX}${cfg.name}`
  // H7-S2：executionContext/workflowRunId 只依赖 cfg，与 barrier/commits 无关——提到函数顶层，供
  // verifier 产生点（barrier 派生后，见下方）与本层自己的 mergeGate 判定（同样在 barrier 派生后，
  // 但在另一个不共享块作用域的位置）共用同一份数据源，两处 expectedSubject 结构上不可能对不齐。
  // H10 r1 阻断3/D5 返工（任务B1）：合成兜底 context 从未走 admission.reserve()/prepareSkillBundle，
  // 没有真实治理 epoch/loop 归属，也没有 bundle 可携带——经 markNonLoopPrepared() 产出判别联合的
  // NonLoopExecutionContext 分支（唯一合法构造点，见 execution-context.ts 头注），不再手写字面量
  // 冒充满足 PreparedExecutionContext（H10 r1 复审阻断3：裸字面量按结构类型曾经天然满足接口）。
  const executionContext: PreparedExecutionContext = cfg.context ?? markNonLoopPrepared({
    attempt_id: cfg.name, reservation_id: cfg.name, loop_id: cfg.name, change: cfg.name,
    level: cfg.autoMerge ? 'L3' : 'L1', runner: cfg.runner ?? 'codex',
    admitted_at: (cfg.clock ?? (() => new Date().toISOString()))(),
    reservation: { runs: 1, tokens: 0, token_basis: 'risk-default' },
    // policy_epoch 留该字段类型（string）允许的诚实空值，skill_bundle_id 留 null（诚实表达「本次
    // 执行无 bundle 绑定」，见 execution-context.ts 头注），绝不瞎编冒充真实值。
    policy_epoch: '',
    skill_bundle_id: null,
  })
  // H5 policy snapshot is authoritative when present. Legacy/non-loop L3 still requires an explicitly
  // resolved allowlist; undefined must never silently mean allow-all.
  if (cfg.autoMerge && executionContext.automation_policy === undefined && cfg.allowlist === undefined) {
    throw new PathPolicyUnconfiguredError()
  }
  // 必须早于 worktree.create / createSandbox：未知 runner 不能先产生宿主或 Docker 副作用再在命令层报错。
  // context 是权威来源；合成 non-loop context 已把缺省归一为 codex。
  const runner = assertLoopRunner(executionContext.runner ?? 'codex')
  const workflowRunId = executionContext.workflow_run_id ?? executionContext.attempt_id
  // H7-S2 custom fail-closed：custom workflow（cfg.workflowKind==='custom'）要求 merge 授权必须落在
  // 真实 workflow-transition binding 上；未传 cfg.workflowKind（存量单测/未升级调用点）视为 'default'
  // 语义（不加限制，行为不变）——生产装配（H7-S3）恒显式传，不依赖本兜底。
  const requireWorkflowBinding = cfg.workflowKind === 'custom'
  const wt = await ports.worktree.create(cfg.hostRepoDir, branch)
  const worktreePath = wt.path

  let handle: SandboxHandle | undefined
  // #29c：conflict 类错误保留现场（不清 worktree）；见 PRESERVE_ERROR_TAGS。
  let preserve = false
  // H14 r3：finally 里的 close 失败若与主错误并发，必须把清理诊断挂在主错误上而不是覆盖/吞掉。
  let hasPrimaryError = false
  let primaryError: unknown
  // T4（决策 G）：沙箱日志 [TRANSITION] 行 → automation_current_phase 运行期回写（值变才写，限流
  // 防 SSE 指纹风暴）；run 结算（成功/失败/取消一切路径的 finally）清空。写回 best-effort（.catch
  // 同 setStateField 既有风格），字段写失败绝不拖垮 run。
  const phaseWatch = createPhaseWatch(cfg.name, (value) =>
    ports.setStateField(cfg.name, 'automation_current_phase', value),
  )
  // 观察项③：[AGENT_EXIT] 标记行 → automation_last_error 同步落（幂等一次、best-effort，见
  // createAgentExitWatch）。settle 只**排空在途写**不清字段——错误消息本就要在 run 结算后留存可见。
  // F-b：cause=agent-exit 与 last_error 同写（诚实 tag：它只知道 agent 非零退出，不猜凭证失效）；
  // 若 run 随后真失败，scheduler applyFailure 会按最终失败 tag 整体覆盖两字段。排空保证观察写严格
  // 先于结算落地（codex P2）——否则延迟写会倒序覆盖 applyFailure 的权威终态成因,dashboard 显陈旧诊断。
  const agentExitWatch = createAgentExitWatch(async (value) => {
    await ports.setStateField(cfg.name, 'automation_last_error', value)
    await ports.setStateField(cfg.name, 'automation_cause', 'agent-exit')
  })
  try {
    // H10 §4/§8任务6：skillBundle 缺席（none-bundle 直通/非 loop AFK 直跑）→ 不追加任何元数据键，
    // env 与本字段引入前逐字节相同；有值时只注入三条小型元数据（容器内固定目录/聚合 hash/profile
    // id），绝不把 skill 正文放进 env（正文由 ports.createSandbox 经 docker cp 放进容器私有目录，
    // 设计定稿 §4「否决把全文放进 environment」）。
    //
    // H10 r1 阻断3/D5 返工（任务B1）：`executionContext` 现是判别联合，`skillBundle` 只存在于
    // `preparedKind==='loop-bundle'` 分支——显式判别窄化（不能再靠 `?.` 悄悄放过 non-loop 分支）。
    const skillBundle = executionContext.preparedKind === 'loop-bundle' ? executionContext.skillBundle : undefined
    const skillBundleEnv: Record<string, string> = skillBundle
      ? {
          PIPELINE_SKILL_BUNDLE_DIR: SKILL_BUNDLE_CONTAINER_DIR,
          PIPELINE_SKILL_BUNDLE_SHA256: skillBundle.snapshotSha256,
          // skillBundle 存在时 skill_bundle_id 理应恒为非空 profile 字符串（prepareSkillBundle 只在
          // ctx.skill_bundle_id 有值时才产出 skillBundle，见 execution-context.ts/loop-admission.ts
          // 头注）；`?? ''` 只是防御性兜底，不掩盖上游不变量被打破时的诊断（诚实空串而非编造值）。
          PIPELINE_SKILL_BUNDLE_ID: executionContext.skill_bundle_id ?? '',
        }
      : {}
    const automationPolicyEnv: Record<string, string> = executionContext.automation_policy === undefined
      ? {}
      : {
          [PIPELINE_AUTOMATION_POLICY_ENV]: Buffer.from(
            JSON.stringify(executionContext.automation_policy), 'utf8',
          ).toString('base64url'),
        }
    const attemptContextEnv: Record<string, string> = executionContext.attempt_context === undefined
      ? {}
      : {
          [PIPELINE_ATTEMPT_CONTEXT_B64_ENV]: Buffer.from(
            JSON.stringify(executionContext.attempt_context), 'utf8',
          ).toString('base64url'),
        }
    const workflowStepPromptEnv: Record<string, string> = cfg.workflowStepPrompt === undefined
      ? {}
      : {
          [PIPELINE_WORKFLOW_STEP_PROMPT_B64_ENV]: Buffer.from(cfg.workflowStepPrompt, 'utf8').toString('base64url'),
        }
    // 沙箱 env 注入 PIPELINE_AFK=1 + runner-scoped extraEnv + skill bundle 元数据。硬护栏与冻结事实
    // 放后，调用方不能覆盖；真实 Docker port 会用同一纯函数再过滤一次，封住公共 port 直调旁路。
    const env: Record<string, string> = {
      ...filterRunnerEnvironment(runner, cfg.extraEnv),
      ...skillBundleEnv,
      ...automationPolicyEnv,
      ...attemptContextEnv,
      ...workflowStepPromptEnv,
      [PIPELINE_AFK_ENV]: '1',
    }
    // Stage B 返工 #3：docker create/start 置于 start permit（governance 锁内现读 active → 启动）。loop 在
    // 这一刻已 paused → LoopNotActiveError → 不启动容器，返回 killSwitched no-op（finally 清 worktree）。
    // 许可只覆盖 createSandbox（docker create/start），返回即释放锁——容器运行期不持锁。
    const runStartPermit = cfg.withStartPermit ?? (<T>(fn: () => Promise<T>): Promise<T> => fn())
    let sandbox: SandboxHandle
    try {
      sandbox = await runStartPermit(() => ports.createSandbox({ env, worktreePath, skillBundle, runner }))
    } catch (permitErr) {
      // start permit 只在 loop 此刻已 paused 时抛 LoopNotActiveError（base-SHA CAS 是 merge 期专属，启动期
      // 不涉及）→ 不启动容器、返回 killSwitched no-op（scheduler 落 paused）。其余异常 fail-loud 原样抛。
      if (isLoopNotActive(permitErr)) {
        return finalizeRunOutcome({ commits: [], verifyResult: 'pass', phaseEvent: 'build-complete', requireWorkflowBinding }, true)
      }
      throw permitErr
    }
    handle = sandbox

    // 容器/worktree 都真创建成功 → 真写回 automation_sandbox/automation_worktree（runWork 前，
    // 抄 scheduler.ts 写 automation_last_error/automation_preserved_path 的既有模式）。
    // B9 best-effort（.catch 同 phaseWatch/agentExitWatch/handle.close/worktree.remove 既有风格）：
    // 这两个字段只是给 dashboard 定位容器/worktree，store 瞬态抖动写失败绝不能把本可继续的成功 run
    // 拖进 catch 判死重来。
    await ports.setStateField(cfg.name, 'automation_sandbox', sandbox.containerName).catch(() => {})
    await ports.setStateField(cfg.name, 'automation_worktree', worktreePath).catch(() => {})

    // exec 包装层 tee 日志行给 phaseWatch（[TRANSITION] 检出点）+ agentExitWatch（[AGENT_EXIT]
    // 检出点，观察项③）——runWork 自己的 onLine（race idle 检测）原样续传，互不挤占。
    const report = await ports.runWork(
      (cmd, options) =>
        sandbox.exec(cmd, {
          ...options,
          onLine: (line) => {
            phaseWatch.onLine(line)
            agentExitWatch.onLine(line)
            options?.onLine?.(line)
          },
        }),
      cfg.name,
      signal,
      runner, // 已在任何 worktree/Docker 副作用前闭集校验；合成入口 Codex-first。
    )
    if (report.provider_usage !== undefined) {
      if (cfg.usageJournal === undefined) {
        throw new Error('provider usage journal is not configured; refusing to lose trusted usage')
      }
      await cfg.usageJournal.recordProviderUsage({ context: executionContext, usage: report.provider_usage })
    }

    // dashboard 取消（afk-workbench Task 3）：本进程的 signal 从没被 abort 过（触发 kill 的是另一个
    // 常驻进程），只能靠标记文件判断——必须先于下面的 signal.aborted 检查（这条路径上 signal.aborted
    // 永远是 false，顺序反了就永远走不到这里）。
    if (await ports.worktree.hasCancelMarker(worktreePath)) {
      throw new CancelledRunError('cancel requested via dashboard', worktreePath)
    }

    // abort 检查（老仓在每轮前后查 signal.aborted）：转 catch 走 preserve 现场。
    if (signal.aborted) throw new AbortedRunError(signal.reason, worktreePath)

    // G②：冻结「当时 base ref SHA」作 expected——commits/diff/barrier 都相对此 base 收集。merge permit
    // 持锁内 CAS 校验 base 未被第三方推进（变了则拒 merge、fail-loud）；mergeBackToBase 亦据此二次校验。
    // 与 barrier 派生同为 ports.git.revParse（git 不健康时此处与 barrier 一并 throw，行为一致，不新增故障面）。
    const expectedBaseSha = await ports.git.revParse(cfg.base)
    const commits = await ports.collectCommits({ worktreePath, branch: wt.branch, base: cfg.base })

    // 决议 #12：run 结算 denylist 检查——loop 语境（denylist 非空）且真有产出（commits 非空）时，
    // git diff --name-only 对 denylist glob 匹配；命中 = 违规 → conflict 保留现场，且必须先于
    // mergeToBase（违规产出绝不允许 L3 自动 merge 回主线）。无 loop 语境跳过（零 diff 开销）。
    const denylist = cfg.denylist ?? []
    const enforceAllowlist = cfg.autoMerge
    const constraints = executionContext.automation_policy?.constraints
    if ((constraints !== undefined || enforceAllowlist || denylist.length > 0) && commits.length > 0) {
      const files = await ports.diffNames({ worktreePath, branch: wt.branch, base: cfg.base })
      if (constraints !== undefined) {
        const enforceDecision = (decision: ConstraintDecision, operation: 'write' | 'merge'): void => {
          if (decision.allowed) return
          const operationPolicy = operation === 'write' ? constraints.write : constraints.merge
          if (decision.reason === 'path-outside-allowlist') {
            throw new AllowlistViolationError(decision.paths ?? [], operationPolicy.allowlist, worktreePath)
          }
          if (decision.reason === 'path-denied') {
            throw new DenylistViolationError(matchDenylist(decision.paths ?? [], operationPolicy.denylist), worktreePath)
          }
          throw new Error(`constraint ${operation} rejected: ${decision.reason}`)
        }
        enforceDecision(evaluateConstraintPolicy(constraints, {
          operation: 'write', active: true, paths: files, matches: matchesPathGlob,
        }), 'write')
        if (cfg.autoMerge) {
          enforceDecision(evaluateConstraintPolicy(constraints, {
            operation: 'merge', active: true, paths: files, matches: matchesPathGlob,
          }), 'merge')
        }
      } else {
        if (enforceAllowlist) {
          const outside = matchAllowlist(files, cfg.allowlist ?? [])
          if (outside.length > 0) throw new AllowlistViolationError(outside, cfg.allowlist ?? [], worktreePath)
        }
        const violations = matchDenylist(files, denylist)
        if (violations.length > 0) throw new DenylistViolationError(violations, worktreePath)
      }
    }

    // barrier 全链同源：命名分支 HEAD == landed；不信沙箱自报（report.build_sha）。
    const barrier = await deriveBarrierSha({
      git: ports.git,
      branch: wt.branch,
      commits,
      sandboxReportedSha: report.build_sha,
    })

    // H7 verifier Phase 2：merge 判断块之前、取得权威 build_sha（barrier，非沙箱自报）后调
    // VerifierPort——产出结构化 VerificationResult，原样携带进 RunOutcome，供 scheduler settlement
    // 消费点（scheduler.ts evaluateVerificationGate 调用点）判定结算 merged/paused/retry。无 commit
    // （no-op，barrier.buildSha 缺席）→ 没有可核验的构建，跳过调用。全档（L1/L2/L3）都调——诚实记录
    // 不是只服务 L3 自动合并判断。
    let verification: RunOutcome['verification']
    if (barrier.buildSha !== undefined) {
      // custom workflow 坐标：cfg.workflowCoordinate 真持有时才构造 workflow-transition（见上方
      // 顶注 + RunChangeConfig.workflowCoordinate 文档——本包当前无生产来源填充它，恒走 default 轨）。
      const workflowBinding: VerificationBinding = cfg.workflowCoordinate
        ? {
            kind: 'workflow-transition',
            workflow_digest: cfg.workflowCoordinate.workflow_digest,
            workflow: cfg.workflowCoordinate.workflow,
            step: cfg.workflowCoordinate.step,
            event: report.phase_event,
          }
        : { kind: 'default-transition', event: report.phase_event }
      const verifierInput = freezeVerifierInput({
        context: executionContext,
        workflowRunId,
        workflowBinding,
        revisionSha: barrier.buildSha,
        worktreePath,
        // 完整 issuer identity 锚从装配面取；缺席时只兼容默认端口的固定 name/version。
        // 遗留 kind-only 字段刻意不参与：同 kind 的 B/999 不能冒充锚定的 A/version。
        expectedIssuerIdentity: ports.verifierExpectedIssuerIdentity ?? DEFAULT_VERIFIER_ISSUER_IDENTITY,
      })
      const rawVerification = await ports.verifier.verify(verifierInput)
      // H7 复审阻断1 核心修复：绝不把 VerifierPort 的运行时输出原样直信——先经 enforceVerificationBoundary
      // 窄校验（sandbox 冒充 trusted:true / passed 却零 evidence / verdict 垃圾字面量等一律被拦），
      // 非法结果替换成安全 sentinel（verdict=inconclusive + issuer 降级 untrusted），never authorized。
      verification = enforceVerificationBoundary(rawVerification, verifierInput)
    }
    // 本层同样用 evaluateVerificationGate 判定是否**物理** merge——绝不能让 git 历史真的 merge 了、
    // 而 ledger/automation 状态却诚实地说"未合并、停给人工复核"（那会是真正的谎报，本仓注释诚实性
    // 门禁的姊妹问题就发生在状态字段上）。scheduler 用同一份判定表对 outcome.verification 重算一次
    // 只为落盘 reason/cause，两处判定必须是同一个纯函数、同一个输入，绝不允许出现"物理已合并但
    // 结算判未授权"的分裂。
    const mergeGate = evaluateVerificationGate({
      verification,
      buildSha: barrier.buildSha,
      // H7-S2：本层自己持有的归属数据——与上方 verifierInput 构造用的是同一份 executionContext/
      // workflowRunId（函数顶层计算，见上方注释），物理 merge 判定与产生点校验的"这是谁的核验结果"
      // 结构上不可能对不齐。
      expectedSubject: { workflow_run_id: workflowRunId, attempt_id: executionContext.attempt_id, change: executionContext.change },
      requireWorkflowBinding,
      expectedAutomationPolicy: executionContext.automation_policy,
    })

    // 分级放权：仅 L3（autoMerge）且有 commit 且 verification gate 授权才真 merge 回主线；L1/L2
    // report-only 只报告；gate 未授权（absent/untrusted/inconclusive/SHA 漂移）→ fail-closed 跳过
    // merge（同 kill-switch 跳过模式，但语义不同——不置 killSwitched，scheduler 会据 outcome.verification
    // 重算同一 gate 落 paused + 诚实 reason，见 scheduler.ts writeBackSuccess/settlementFor）。
    // kill-switch 接缝③：merge 前重查 loop 是否仍 active，停用则跳过 merge、置 killSwitched
    // （checkActive throw = 不确定 → 保守跳过 merge，宁可不自动合并也不在停用疑云下 merge 回主线）。
    let killSwitched = false
    let mergeLanded = false
    let hostSyncPending = false
    let mergeJournalPending = false
    if (cfg.autoMerge && commits.length > 0 && mergeGate.kind === 'authorized') {
      if (cfg.requireMergeJournal === true && cfg.mergeJournal === undefined) {
        throw new MergeJournalError('L3 auto-merge 缺少 durable merge journal 装配，base ref 未推进')
      }
      // G②：merge 前 CAS——重读 base ref SHA 与冻结值比对；读不到（git 故障）→ 保守视为「已变」不 merge。
      const verifyBase = async (): Promise<boolean> => {
        try {
          return (await ports.git.revParse(cfg.base)) === expectedBaseSha
        } catch {
          return false
        }
      }
      const mergeJournal = cfg.mergeJournal
      let mergeIntentRecordId: string | undefined
      const mergeInput = {
        worktreePath, branch: wt.branch, base: cfg.base, expectedBaseSha, expectedBranchSha: barrier.buildSha,
        onIntent: mergeJournal
          ? async (draft: MergeIntentDraft): Promise<void> => {
              mergeIntentRecordId = await mergeJournal.recordMergeIntent({
                draft, context: executionContext, verification, verifyResult: report.verify_result,
                buildSha: barrier.buildSha, branch: wt.branch, commits,
              })
            }
          : undefined,
        onLanded: mergeJournal
          ? (receipt: MergeBackReceipt) => {
              if (mergeIntentRecordId === undefined) throw new MergeJournalError('merge-landed 缺少已 fsync 的 intent record id')
              return mergeJournal.recordMergeLanded({ intentRecordId: mergeIntentRecordId, receipt, context: executionContext })
            }
          : undefined,
      }
      if (cfg.withMergePermit) {
        // Stage B 返工 #3 + G②：merge active 检查 + base-SHA CAS + 动作 + ref 更新在同一 merge permit
        // （governance 锁内现读 active + verifyBase CAS → mergeToBase，持锁到 ref 更新完成）。
        try {
          const receipt = await cfg.withMergePermit(() => ports.mergeToBase(mergeInput), verifyBase)
          mergeLanded = receipt?.landed ?? true
          hostSyncPending = receipt?.hostSynced === false
          mergeJournalPending = receipt?.landedJournalError !== undefined
        } catch (mergeErr) {
          // G² 子问题1 分流——三类语义不同，绝不共用成功退出路径：
          //   · LoopNotActiveError（loop 停用，permit 预检抛）→ killSwitched 跳过 merge、正常落 paused（停给人工复核）。
          //   · BaseRefCasError（base 在 freeze→merge 前窗口被推进，permit verifyBase 预检抛）→ fail-loud：转
          //     BaseAdvancedError（留现场 + round ok=false），绝不当 killSwitched 成功吞掉（旧行为会删 worktree、
          //     round 假 ok=true、CLI 打印跑完一轮返 0）。
          //   · else（含 mergeBackToBase 自身 update-ref CAS 失败——base 在 merge 已开始之后被推进——抛的
          //     SyncError{baseAdvanced:true}）→ **原样透传**：baseAdvanced 标记随对象保留，scheduler 据此记 round
          //     failure 使 ok=false（fail-loud）；普通 content-conflict SyncError（baseAdvanced=false）透传后 round 仍 ok。
          //     绝不在此把 update-ref CAS 失败吞成无 baseAdvanced 的普通 conflict。
          if (isLoopNotActive(mergeErr)) killSwitched = true
          else if (isBaseRefCas(mergeErr)) {
            throw new BaseAdvancedError(
              `${mergeErr instanceof Error ? mergeErr.message : String(mergeErr)}——命名分支与 worktree 现场保留于 ${worktreePath}（供人工复核/重试）`,
              worktreePath,
            )
          } else throw mergeErr
        }
      } else {
        // 无 permit（未接线）：退回 checkActive 非原子预检 + mergeBackToBase 自身 base-SHA 校验（行为不变外仍拦错 base）。
        const active = cfg.checkActive ? await cfg.checkActive().catch(() => false) : true
        if (active) {
          const receipt = await ports.mergeToBase(mergeInput)
          mergeLanded = receipt?.landed ?? true
          hostSyncPending = receipt?.hostSynced === false
          mergeJournalPending = receipt?.landedJournalError !== undefined
        }
        else killSwitched = true
      }
    }

    return finalizeRunOutcome({
      commits,
      verifyResult: report.verify_result,
      buildSha: barrier.buildSha,
      branch: wt.branch,
      phaseEvent: report.phase_event,
      verification,
      requireWorkflowBinding,
      mergeLanded,
      hostSyncPending,
      mergeJournalPending,
    }, killSwitched)
  } catch (err) {
    if (signal.aborted) {
      // abort：finally 统一且仅一次 close；若 close 也失败，仍保留 AbortedRunError 主错误并附诊断。
      preserve = true
      primaryError = new AbortedRunError(signal.reason, worktreePath)
      hasPrimaryError = true
      throw primaryError
    }

    // err 是任意外部边界值，可能是会在 instanceof/get/_tag/toString 时抛错的 Proxy。必须先登记，
    // 保证 finally 中 cleanup 再失败时无条件保留原 primary/cause 并生成 RunAndCleanupError。
    primaryError = err
    hasPrimaryError = true

    // dashboard 取消（afk-workbench Task 3）：docker kill 容器后，runWork 的真实现（ports.ts）对
    // exec 非零退出直接 throw 一个普通 Error——从不把"非零退出"当一个正常返回值交回这里（见
    // ports.ts `if (res.exitCode !== 0) throw new Error(...)`）。这才是 kill 后的真实主路径；
    // try 块里 runWork resolve 之后那一次取消检测只覆盖"run 碰巧抢在 kill 生效前正常跑完"的窄
    // 竞态，覆盖不到这里——取消检测必须在 catch 里也做一次。err 若已经是那次检测抛出的
    // CancelledRunError 则跳过重复探测，直接按它走下面统一的 isPreserveError 归类。
    let settled = err
    try {
      if (!(err instanceof CancelledRunError) && (await ports.worktree.hasCancelMarker(worktreePath))) {
        settled = new CancelledRunError('cancel requested via dashboard', worktreePath)
      }
    } catch {
      // 无法安全判定是否为 dashboard 取消时，不覆盖原错误，也不删除可能需要接管的现场。
      preserve = true
    }

    // conflict 类（merge 冲突 / barrier drift / worktree 失败 / dashboard 取消）→ 保留现场，不清 worktree。
    try {
      if (isPreserveError(settled)) preserve = true
    } catch {
      // 敌意 Proxy 的 _tag getter 失败时分类未知；fail-closed 保留现场，原错误继续传播。
      preserve = true
    }
    primaryError = settled
    throw settled
  } finally {
    // T4 结算清理：完成/失败/取消一切路径都清 automation_current_phase（写过才清；排空在途写）。
    await phaseWatch.settle().catch(() => {})
    // codex P2:排空 agent-exit 观察器在途写(不清字段)——run promise 结算前落定,scheduler 终态分类严格后写。
    await agentExitWatch.settle().catch(() => {})
    let cleanupError: LifecycleContainerCleanupError | undefined
    if (handle) {
      try {
        // 不在保护区外读取 handle 的任何属性：handle 可由外部 port 返回，getter/Proxy 可能抛错。
        await handle.close()
      } catch (error) {
        let containerName = '<unavailable-owned-container>'
        try {
          const candidate = handle.containerName
          if (typeof candidate === 'string' && candidate.length > 0) containerName = candidate
        } catch {
          // 名称只用于诊断；读取失败不能阻断 close 故障进入可信 cleanup wrapper。
        }
        // 即便 close() 已抛带同名 tag 的对象，也一律包进本模块创建并冻结的可信错误；外来值可能是 Proxy。
        cleanupError = new LifecycleContainerCleanupError(containerName, error, worktreePath)
        // 容器是否仍占用 bind-mounted worktree 未知；绝不删除现场，也绝不自动伪装成成功。
        preserve = true
      }
    }
    if (cleanupError !== undefined) {
      if (!hasPrimaryError) throw cleanupError
      throw new RunAndCleanupError(primaryError, cleanupError, worktreePath)
    }
    // 非 abort、非 conflict 路径才 teardown worktree（错误吞掉）；abort/conflict 保留现场。
    if (!signal.aborted && !preserve) {
      await ports.worktree.remove(worktreePath).catch(() => {})
    }
  }
}
