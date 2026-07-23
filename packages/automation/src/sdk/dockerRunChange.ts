/**
 * createDockerRunChange（BACKLOG #29-wire）—— 把 #29c 的生产 LifecyclePorts 装配成一个
 * scheduler 可喂的 RunChange，接通 `automation.runRound` 与真 docker 执行。
 *
 * 这是交接文档描述的接线点（GOAL H · Stage B 后 RunChange 吃 ExecutionContext，name/runner/loop_id
 * 由 context 权威携带）：
 *   runChange = (context, signal) => runChangeInSandbox(
 *     createLifecyclePorts({ exec: nodeExec, hostRepoDir, image, uid, gid, cpus }),
 *     { hostRepoDir, name: context.change, base, autoMerge: level === 'L3', runner: context.runner }, signal)
 *
 * autoMerge 严格由 level 派生（L3 → true 真 merge-back；L1/L2 → false report-only 安全默认），
 * 与 scheduler settleSuccess 的分级落态（L3 merged / L1·L2 paused）同源——两处都读同一 level，
 * 不会出现「settle 说 merged 但 lifecycle 没 merge」的口径漂移。
 *
 * exec 缺省 nodeExec（真 docker/git 子进程）；测试可注入 fake exec 断言 argv 而不起容器。
 *
 * store（可选，Task 1 收尾缺口修复——见 .superpowers/sdd/task-1-report.md「Concerns」）：注入真
 * kernel StateStore 后，把 createLifecyclePorts 的 setStateField 适配到
 * store.set(join(hostRepoDir, 'openspec', 'changes', name), field, value)——changeDir 解析同
 * sdk.ts::storeWriter 同款约定，供 lifecycle.ts::runChangeInSandbox 运行期真写回
 * automation_sandbox/automation_worktree（下游取消/详情靠这两个字段定位容器/worktree）。真部署
 * 接线：packages/cli/src/commands/afk.ts 的 cmdAfk 传 deps.store。未注入 → ports.ts 既有 no-op
 * 缺省接管（不 throw、不阻断 run，静默跳过写回）。
 *
 * H7-S3（H7 返工·修死 r2 阻断5 的生产半边——r2 §5：「createDockerRunChange 没有 workflowCoordinate
 * 选项，也未向 lifecycle 传入」「生产 AFK 恒走 default-transition」）：本函数现每次 run 都用
 * opts.store（同上，复用同一份注入面，不新开第二条读取通道）现读该 change 的 state，经 kernel
 * resolveWorkflowName（`fields.workflow || 'default'` 单一真相源，见 workflow/engine.ts）派生
 * cfg.workflowKind（'default'|'custom'）恒显式传给 lifecycle——不再让它恒 undefined、被 lifecycle
 * 当成"这次调用没有 workflowKind 概念"而不施加 custom fail-closed。custom workflow 坐标本身
 * custom workflow 的稳定坐标由 H10 prepare 后的同一份 frozen skillBundle 提供：workflow/step/
 * coordinateDigest 同时驱动 verifier binding，stepPrompt 同时驱动 agent 指令。任一坐标字段缺失仍
 * 诚实缺席并由 H7-S2 custom gate fail-closed，不从可变 state 二次拼接半份坐标。
 */
import { join } from 'node:path'
import { assertLoopRunner, resolveWorkflowName, type StateStore } from '@pipeline-lite/kernel'
import { runChangeInSandbox, type RunChangeConfig } from '../lifecycle/lifecycle.js'
import type { LoopPathPolicy } from '../lifecycle/denylist.js'
import { createLifecyclePorts } from '../lifecycle/ports.js'
import { nodeExec, type ExecFn } from '../runner/exec.js'
import { filterRunnerEnvironment, type ImageRunExpectation } from '../runner/runner.js'
import { sanitizePath, type RunChange } from '../scheduler/scheduler.js'
import type { PreparedExecutionContext } from '../admission/execution-context.js'
import type { AutomationLevel } from '../types.js'
import type { VerificationIssuerIdentity, VerifierPort } from '../verifier/verifier.js'

/** L3 缺少权威 path-policy resolver 是生产装配错误，不得退化成 allowlist=undefined。 */
export class PathPolicyResolverUnconfiguredError extends Error {
  readonly _tag = 'PathPolicyResolverUnconfiguredError'
  constructor() {
    super('L3 requires resolvePathPolicy; refusing to run with an unenforced allowlist')
    this.name = 'PathPolicyResolverUnconfiguredError'
  }
}

export interface DockerRunChangeOptions {
  /** host 仓库根（命名分支从它 fork、merge 回它；worktree 落在其 .sandcastle/worktrees/）。 */
  readonly hostRepoDir: string
  /** host 当前 base 分支（命名分支从它 fork、L3 merge 回它）。 */
  readonly base: string
  /** 分级放权档位——L3 真自动 merge-back；L1/L2 report-only 不合并（安全默认）。 */
  readonly level: AutomationLevel
  /** 沙箱镜像名；缺省 sandcastle:local（真部署镜像）。 */
  readonly image?: string
  /** 子进程 exec 面；缺省 nodeExec（真 docker/git）。测试注入 fake。 */
  readonly exec?: ExecFn
  readonly uid?: number
  readonly gid?: number
  readonly cpus?: number
  readonly idleMs?: number
  readonly graceMs?: number
  /**
   * 额外注入沙箱的 env。普通键原样透传；OPENAI_API_KEY/CODEX_HOME/CLAUDE_CODE_OAUTH_TOKEN
   * 仍受 runner 互斥过滤，不能借本接缝把对侧凭证注入容器。
   */
  readonly extraEnv?: Readonly<Record<string, string>>
  /**
   * 真 kernel StateStore（可选）：注入后运行期真写回 automation_sandbox/automation_worktree
   * （changeDir 解析 = join(hostRepoDir, 'openspec', 'changes', name)，同 sdk.ts::storeWriter
   * 同款约定）。未注入 → createLifecyclePorts 走既有 no-op 缺省，不 throw、不阻断 run。
   *
   * 四闸安全（Task 1 复查 Fix 2）：automation_worktree 的值 = join(hostRepoDir, '.sandcastle',
   * 'worktrees', <branch>)（worktree.ts::worktreePathFor）——hostRepoDir 是真机器路径，可含任意
   * 子串（如 "repo #2" 这类去重目录名），直写会撞 kernel 四闸（parse.ts::quoteGate 禁换行/
   * ": "/" #"/首引号）同步 throw QuoteGateError，且该错误无 _tag，classifyFailure 只当瞬态
   * retry 处理——同一 hostRepoDir 永不可能好转，直到 attempts 耗尽 failed。故写前复用
   * scheduler.ts::sanitizePath()（四闸清洗的同一份实现，不分叉出第二份；**不截断**——真机验收
   * P1：深路径项目 worktree 全路径 > 200 字符被 sanitize 的 slice(0,200) 截成残路径，server 侧
   * cancelAfkRun 按残路径写 .cancel-requested → ENOENT → dashboard cancel 永远 500）。
   * automation_sandbox 不需要：containerName 由 container.ts::createDockerSandbox
   * 生成，定长安全字符集 [0-9a-z-]（sandcastle-<base36 时间戳>-<6 位 hex 随机>），不可能含
   * 四闸任何一种禁串。
   */
  readonly store?: StateStore
  /**
   * loop denylist 解析器（决议 #12，可选）：**loop_id** → 生效的 denylist glob 清单。GOAL H ·
   * Stage B 后按 ExecutionContext.loop_id 精确查（不再按 change 前缀猜）——现成帮手
   * denylist.ts::denylistForLoop + kernel loadRegistry，接线见 packages/cli/src/commands/afk.ts。
   * 返回非空 → run 结算时 git diff --name-only 对 glob 匹配，违规判 conflict 保留现场。返回 [] /
   * 未传 → 检查跳过；resolver throw 原样 fail-loud，绝不把读取故障冒充成空 denylist。
   */
  readonly resolveDenylist?: (loopId: string) => Promise<readonly string[]>
  /**
   * G5 生产路径：从同一 registry 快照解析 allowlist+denylist。解析失败原样抛出，且发生在创建沙箱前；
   * L3 的空 allowlist 表示零路径获准。与 legacy resolveDenylist 同传时以本字段为准。
   */
  readonly resolvePathPolicy?: (loopId: string) => Promise<LoopPathPolicy>
  /**
   * GOAL H · Stage C kill-switch 接缝③：**loop_id** → 此刻是否仍 active。绑定
   * admission.isActive；L3 merge 前调，停用则跳过 merge、置 killSwitched（见 lifecycle.ts
   * checkActive）。未传 → 不查（行为不变）。
   */
  readonly checkActive?: (loopId: string) => Promise<boolean>
  /**
   * Stage B 返工 #3 docker 启动许可（可选）：loop_id → governance 锁内现读 active → 执行 fn（docker
   * create/start）。绑 kernel withLoopStartPermit（见 afk.ts）。未传 → 不加许可。
   *
   * H10 §1（复审阻断1修复）：新增 `prepared` 形参——本函数下方 runChange 闭包把它持有的真实
   * PreparedExecutionContext 的 `policy_epoch`/`skill_bundle_id` 两值原样传入（见下方 withStartPermit
   * 构造点），kernel::withLoopStartPermit 据此在 governance 锁内比对此刻现读 registry 与 prepare 阶段
   * 冻结值是否一致，不符则拒绝启动（详见 kernel governance.ts::LoopPolicyChangedError 文档）。
   */
  readonly startPermit?: <T>(
    loopId: string,
    prepared: { readonly policy_epoch: string; readonly skill_bundle_id?: string | null },
    fn: () => Promise<T>,
  ) => Promise<T>
  /**
   * Stage B 返工 #3 + G②/G5 merge 许可（可选）：loop_id + prepare 时冻结的治理身份 → governance
   * 锁内现读 active + 复核 policy_epoch/skill_bundle_id + verifyBase base-SHA CAS → 执行 fn（merge）。
   * 绑 kernel withLoopMergePermit（见 afk-executor.ts）。
   */
  readonly mergePermit?: <T>(
    loopId: string,
    prepared: { readonly policy_epoch: string; readonly skill_bundle_id?: string | null },
    fn: () => Promise<T>,
    verifyBase: () => Promise<boolean>,
  ) => Promise<T>
  /**
   * host 侧环境（v5 T22 codex 凭证透传，可选）：缺省 process.env（真部署零接线）。仅当该 run
   * 解析出 runner === 'codex' 时，从中透传 OPENAI_API_KEY / CODEX_HOME 进沙箱（CODEX_HOME
   * 还会由 ports.ts::createSandbox 按同一绝对路径挂载目录，env var 单独进容器只是悬空路径）。
   * runner=claude-code 才注入 Claude 凭证；缺省 runner 由上游归一为 codex。显式 opts.extraEnv 的
   * 同名键优先于 host 透传（调用方显式配置不被环境静默覆盖）。测试注入 fake（hermetic，不读
   * 真机 env）。凭证值只进 docker run 子进程 argv（-e K=V），不进任何日志/错误消息——错误面
   * （scheduler sanitize / startContainer throw）只引用 stderr 片段，不回显 argv。
   */
  readonly hostEnv?: Readonly<Record<string, string | undefined>>
  /** 透传给 lifecycle 合成 non-loop context 的注入时钟。 */
  readonly clock?: () => string
  /** L3 durable merge intent/receipt 写入口；L3 物理 merge 强制要求。 */
  readonly mergeJournal?: NonNullable<RunChangeConfig['mergeJournal']>
  /** H6 provider usage durable ledger 写入口。 */
  readonly usageJournal?: NonNullable<RunChangeConfig['usageJournal']>
  /**
   * H7 verifier Phase 2（可选）：host 侧核验产生面，透传给 createLifecyclePorts。未传 → 缺省
   * createDefaultVerifierPort()（未接线真实核验能力时诚实回 inconclusive，见 verifier.ts 顶注/
   * ports.ts）。真实核验能力（跑测试/静态检查等）由调用方在此注入。
   *
   * 自定义 verifier 必须同时登记 verifierExpectedIssuerIdentity；只注入 verifier 而不登记 host
   * 侧 identity 时，boundary 会 fail-closed 为 sentinel。默认 verifier 缺省使用其固定 identity。
   */
  readonly verifier?: VerifierPort
  /** 自定义 verifier 的完整 host 身份锚（kind + 各 kind 的身份字段），不信返回对象自报。 */
  readonly verifierExpectedIssuerIdentity?: VerificationIssuerIdentity
  /**
   * host 对当前 bundled CLI 的可信摘要期望；透传到 ports 的 runWork，再交
   * buildAfkRunCommand 在容器内对镜像 bundle + attestation 做双重核对。
   */
  readonly imageExpectation?: ImageRunExpectation
}

/**
 * H7-S3（修死 r2 阻断5 的生产半边）：每次 run 现读该 change 的真实 workflow 归属（default|
 * custom），供 lifecycle.ts 的 requireWorkflowBinding fail-closed 判定使用。单一真相源用 kernel
 * resolveWorkflowName(state)（`fields.workflow || 'default'`，同 cli init/transition/advance/
 * fields 等既有读取面，见 kernel workflow/engine.ts）——不是编译期常量、不是 cfg 硬编码、不重新
 * 发明第二份判定逻辑。custom fail-closed 门槛本身（true 时要求 canonical.binding.kind 必须是
 * workflow-transition）已由 H7-S2 在 verifier.ts::evaluateVerificationGate / lifecycle.ts 接好，
 * 本函数只负责诚实分类，不重复判定。
 *
 * 未注入 opts.store（历史零 store 调用点/既有 fake-exec 单测）→ 无法读取该 change 的 state，诚实
 * 回退 'default'：这些调用点在 H7-S3 之前压根没有 workflowKind 概念（cfg.workflowKind 此前从未被
 * dockerRunChange 传过，等效于 undefined，lifecycle 按 'default' 语义处理），本增量不倒退它们的
 * 既有行为——真实生产装配（packages/cli/src/commands/afk.ts）恒传 store（CliDeps.store 非可选
 * 字段），故这条回退分支在生产环境不会触发。
 *
 * 已注入 store 但读取本身失败（fs I/O / parse 故障——理论上此刻这个 change 正在被本进程跑
 * automation，.pipeline.yaml 必然存在且可读，只覆盖异常竞态，如并发外部编辑/宿主 fs 故障）→
 * fail-closed 回 'custom'：宁可这一轮不自动 merge（下一轮/人工复核仍可推进），也不在无法确认
 * 「这不是 custom workflow」时把它当更宽松的 default 放行——呼应本文件与 lifecycle.ts 其它
 * boundary 一贯姿势（如 lifecycle.ts 的 verifyBase 读不到 base ref 就保守判「已变」不 merge）：
 * 拿不到锚 → 更保守的一侧，绝不静默倒向更宽松的一侧。
 */
const resolveWorkflowKindFor = async (
  store: StateStore | undefined,
  changeDir: (name: string) => string,
  name: string,
): Promise<'default' | 'custom'> => {
  if (!store) return 'default'
  try {
    const state = await store.read(changeDir(name))
    return resolveWorkflowName(state) === 'default' ? 'default' : 'custom'
  } catch {
    return 'custom'
  }
}

/** codex 凭证透传（v5 T22）：只挑 OPENAI_API_KEY / CODEX_HOME 两个白名单键，绝不整份 env 灌进容器。 */
const codexCredentialEnv = (hostEnv: Readonly<Record<string, string | undefined>>): Record<string, string> => {
  const out: Record<string, string> = {}
  if (hostEnv.OPENAI_API_KEY !== undefined && hostEnv.OPENAI_API_KEY !== '') out.OPENAI_API_KEY = hostEnv.OPENAI_API_KEY
  if (hostEnv.CODEX_HOME !== undefined && hostEnv.CODEX_HOME !== '') out.CODEX_HOME = hostEnv.CODEX_HOME
  return out
}

/**
 * claude-code 凭证透传（v6 T2）：与 codexCredentialEnv 对称的另一半——runner 明确为 claude-code 时
 * 从 hostEnv 白名单透传唯一键 CLAUDE_CODE_OAUTH_TOKEN（此前该路径零透传通道，cli afk run 又
 * 没传 extraEnv，沙箱脚本判空静默回落「确定性模式」）。互斥纪律不变：凭证只随点名它的 runner
 * 走；值只进 docker run argv，不进日志/错误消息（同上方 hostEnv 字段注释）。
 */
const claudeCredentialEnv = (hostEnv: Readonly<Record<string, string | undefined>>): Record<string, string> => {
  const out: Record<string, string> = {}
  if (hostEnv.CLAUDE_CODE_OAUTH_TOKEN !== undefined && hostEnv.CLAUDE_CODE_OAUTH_TOKEN !== '') {
    out.CLAUDE_CODE_OAUTH_TOKEN = hostEnv.CLAUDE_CODE_OAUTH_TOKEN
  }
  return out
}

/** 构造绑真 docker/git 的 RunChange（喂给 automation.runRound）。 */
export const createDockerRunChange = (opts: DockerRunChangeOptions): RunChange => {
  const exec = opts.exec ?? nodeExec
  const { store, hostRepoDir } = opts
  const changeDir = (name: string): string => join(hostRepoDir, 'openspec', 'changes', name)
  // 仅 automation_worktree 需要四闸消毒（见上方 store 字段注释）；automation_sandbox 值域天然安全，
  // 不误消毒不该消毒的字段。
  const setStateField = store
    ? (name: string, field: string, value: string): Promise<void> =>
        store.set(changeDir(name), field as never, field === 'automation_worktree' ? sanitizePath(value) : value)
    : undefined
  const ports = createLifecyclePorts({
    exec,
    hostRepoDir: opts.hostRepoDir,
    image: opts.image,
    uid: opts.uid,
    gid: opts.gid,
    cpus: opts.cpus,
    idleMs: opts.idleMs,
    graceMs: opts.graceMs,
    setStateField,
    verifier: opts.verifier,
    verifierExpectedIssuerIdentity: opts.verifierExpectedIssuerIdentity,
    imageExpectation: opts.imageExpectation,
  })
  const autoMerge = opts.level === 'L3'
  // H10 §4/§8任务6：形参类型收窄为 PreparedExecutionContext（RunChange 的真实契约，见
  // scheduler.ts::RunChange——本函数一直被当作它的实现使用，此前形参标注成更宽的 ExecutionContext
  // 只是历史遗留，两者对本函数体内的读取字段（change/loop_id/runner 等）零行为差异，收窄不改变任何
  // 既有调用点）。本文件自身不读 context.skillBundle——它随 context 原样透传进下方 cfg.context，
  // 真正消费/挂载/校验该字段的是 lifecycle.ts::runChangeInSandbox 与 ports.ts::createSandbox。
  return async (context: PreparedExecutionContext, signal) => {
    const { change: name, loop_id: loopId } = context
    const runner = assertLoopRunner(context.runner ?? 'codex')
    if (autoMerge && opts.resolvePathPolicy === undefined) {
      throw new PathPolicyResolverUnconfiguredError()
    }
    // G5：每次 run 在创建沙箱前从一次 registry 快照解析完整路径策略。读取失败必须 fail-loud；否则
    // 瞬时 EIO 会被误当作空 denylist/全放行 allowlist，L3 可借此合并声明范围外产出。
    const pathPolicy = opts.resolvePathPolicy
      ? await opts.resolvePathPolicy(loopId)
      : { allowlist: undefined, denylist: opts.resolveDenylist ? await opts.resolveDenylist(loopId) : [] }
    const { allowlist, denylist } = pathPolicy
    // runner 由 ExecutionContext 权威携带（admission 从 context.loop_id → loop.runner 派生）。
    // v5 T22 + v6 T2：凭证按已校验的 context.runner 互斥透传——codex 拿 OPENAI_API_KEY/CODEX_HOME，
    // 显式 claude-code 拿 CLAUDE_CODE_OAUTH_TOKEN；extraEnv 只允许覆盖同 runner 凭证，普通键透传。
    const hostEnv = opts.hostEnv ?? process.env
    const credEnv = runner === 'codex' ? codexCredentialEnv(hostEnv) : claudeCredentialEnv(hostEnv)
    const extraEnv = { ...credEnv, ...filterRunnerEnvironment(runner, opts.extraEnv) }
    // kill-switch 接缝③：把 admission.isActive 绑定到本 run 的 loop_id 传给 lifecycle（L3 merge 前重查）。
    const checkActive = opts.checkActive ? (): Promise<boolean> => opts.checkActive!(loopId) : undefined
    // Stage B 返工 #3：start/merge permit 绑定本 run 的 loop_id（governance 锁 kill-switch 原子性）。
    // H10 §1（复审阻断1修复）：真传 context 里 admission/prepare 阶段冻结的 policy_epoch/
    // skill_bundle_id——本闭包持有的 context 就是那份真实 PreparedExecutionContext（非手写伪造），
    // withLoopStartPermit 据此在 governance 锁内复核这两值此刻是否仍与 registry 一致。
    const withStartPermit = opts.startPermit
      ? <T>(fn: () => Promise<T>): Promise<T> =>
          opts.startPermit!(loopId, { policy_epoch: context.policy_epoch, skill_bundle_id: context.skill_bundle_id }, fn)
      : undefined
    const withMergePermit = opts.mergePermit
      ? <T>(fn: () => Promise<T>, verifyBase: () => Promise<boolean>): Promise<T> =>
          opts.mergePermit!(
            loopId,
            { policy_epoch: context.policy_epoch, skill_bundle_id: context.skill_bundle_id },
            fn,
            verifyBase,
          )
      : undefined
    // H7-S3：每次 run 现读该 change 的真实 workflow 归属（default|custom），恒显式传
    // cfg.workflowKind（不留 undefined 隐式当 'default' 处理）——见 resolveWorkflowKindFor 文档。
    const workflowKind = await resolveWorkflowKindFor(store, changeDir, name)
    // H10 prepare 的 frozen bundle 是 custom workflow 坐标与 prompt 的权威来源；它已通过输入摘要
    // TOCTOU 复核。不要在这里二次 loadWorkflow/state 重新读取，否则 verifier 与 agent 可能看见两版定义。
    const preparedBundle = context.preparedKind === 'loop-bundle' ? context.skillBundle : undefined
    const workflowCoordinate = workflowKind === 'custom'
      && preparedBundle?.resolutionSource === 'custom'
      && preparedBundle.workflow !== undefined
      && preparedBundle.step !== undefined
      && preparedBundle.coordinateDigest !== undefined
      ? {
          workflow_digest: preparedBundle.coordinateDigest,
          workflow: preparedBundle.workflow,
          step: preparedBundle.step,
        }
      : undefined
    const workflowStepPrompt = workflowKind === 'custom' ? preparedBundle?.stepPrompt : undefined
    return runChangeInSandbox(
      ports,
      // H7 verifier Phase 2：真透传 context（本闭包持有的真实 ExecutionContext）——VerifierPort 的
      // subject 字段（attempt_id/change/workflow_run_id）用真实 admission 归属，不落回 lifecycle 内部
      // 合成的最小兜底值。
      //
      // H7-S3（r2 阻断5 核验结论 §5「lifecycle 在缺席时用 attempt ID 冒作 workflow run ID」）：这里
      // 刻意不把 workflow_run_id 从 state.runMetadata.runId（kernel WorkflowRunRepository 的稳定
      // run 身份，见 workflow-run-repository.ts）派生后注入 context——即便本函数此刻确实拿得到这个
      // 真实值（上面 resolveWorkflowKindFor 同一次 store.read 就能顺带读出）。原因：
      // scheduler.ts::handleOne 结算时持有的 ExecutionContext 与这里收到的 context 形参是**同一个
      // 对象引用**（scheduler 用它调 runChange(ctx, signal)，之后自己仍用这份 ctx 算
      // expectedSubject，见 scheduler.ts::expectedSubjectFor 的 `ctx.workflow_run_id ??
      // ctx.attempt_id`）。若只往「喂给 runChangeInSandbox 的这份 cfg.context」注入真实
      // workflow_run_id（构造一个新对象，不会传播回 scheduler 手上那份），会制造一个新的结构性
      // 撕裂：lifecycle 产生的 verification.subject.workflow_run_id = 真实值，但 scheduler 结算时
      // expectedSubjectFor(ctx) 仍按原 ctx 算出 attempt_id（admission 装配的原始 context 从未带这个
      // 字段——见 admission/loop-admission.ts::reserve 的 ExecutionContext 构造点）——两边对不上，
      // H7-S2 的 subject-mismatch fail-closed 会把**本该合法 authorized 的 default workflow run**
      // 也一并拦成 paused，这是退步不是修复。真正安全的写入点是 admission.reserve() 构造
      // ExecutionContext 那一刻，让 scheduler 与 lifecycle 从一开始就共享同一个带真实
      // workflow_run_id 的对象——但那个文件不在本增量改动清单内。故这里保持现状（`?? attempt_id`
      // 兜底，H7-S2 既有行为不变），如实记录这条边界，不做只接一半、反而更危险的注入去冒充"已修"。
      {
        hostRepoDir: opts.hostRepoDir, name, base: opts.base, autoMerge, extraEnv, allowlist, denylist, runner, clock: opts.clock,
        checkActive, withStartPermit, withMergePermit, context, workflowKind, workflowCoordinate, workflowStepPrompt,
        mergeJournal: opts.mergeJournal, requireMergeJournal: autoMerge, usageJournal: opts.usageJournal,
      },
      signal,
    )
  }
}
