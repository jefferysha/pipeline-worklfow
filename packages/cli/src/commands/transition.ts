/**
 * transition <name> <event> —— 状态机转换（CONTRACT §3，2026-07-06 oracle 实测回写）。
 * stdout：无（`[TRANSITION] name: old -> new` 走 stderr，对齐老内核 green() 落 stderr）；
 * exit：0 成功 / 1 非法转换、未知事件、事件前置校验不满足或其它错误（老内核实测口径）/
 *       2 非 default workflow 的 step guard 未通过。
 *
 * 编排现在整个下沉进 kernel 单一 TransitionApplication 用例（G1 支点，2026-07-17，见
 * packages/kernel/src/workflow/transition-application.ts）——default/custom 双轨分流、
 * runRepo.transact 事务边界、commit、breadcrumb→history→review-marker 收尾，此前 CLI 与
 * server（server/transition.ts）各自实现一份，现在唯一落在 kernel，两边共调同一个用例
 * （GOAL.md G1 验收目标：消灭这两处复制）。本文件现在只是一层薄 adapter：
 *   ① 校验 change 名 + 把 CliDeps 的 fs/git 原语绑成 TransitionContext/TransitionCommand
 *   ② 调 TransitionApplication.execute()
 *   ③ 把 TransitionApplicationResult 的判别式 kind 精确映射成 exit code + stderr 文案
 *      （文案/exit code 逐字对齐重构前的可观测行为，见 transition.test.ts）。
 *
 * 事件表（flow/transition-table.ts）/ 前置校验 + 副作用（flow/default-event-policy.ts 的
 * DefaultEventPolicy typed guard/action，G2 P3 起）仍是 **kernel 单一真相源**（BACKLOG #25b /
 * GOAL B2），cli 与 server 共消费、不再各持镜像——现在连"怎么编排这些消费"本身也统一了，
 * 不只是事件表数据共享。
 *
 * ── BACKLOG #14 盘点表：老仓 state-transition.sh cmd_transition（case 块逐字对位）──
 * | 事件/面           | 老仓行号  | 副作用/校验                                        | lite 落点 |
 * |-------------------|----------|---------------------------------------------------|-----------|
 * | （全事件）        | L72      | .txn 事务锁串行化                                  | runRepo.transact ✓（锁边界现在由 kernel TransitionApplication 持有）|
 * | （全事件）        | L113     | require_phase：当前 phase == 事件 from             | kernel TransitionApplication（planDefaultTransition）✓（本文件收 event-source-mismatch 映射 stderr）|
 * | （全事件）        | L225-226 | phase=to + phase_status（pending/in_progress/done）| kernel flow.transition ✓（相位序泛化）|
 * | （全事件）        | L227     | green [TRANSITION] from → to（stderr）             | 本文件 ✓（lite 用 ASCII "->"，stderr 面 oracle 不比）|
 * | （全事件）        | L239-264 | 进 review 相位落 .pipeline-pending-review 三行     | kernel TransitionApplication（execute 收尾）✓（manifest.reviewPhases 单一真相源）|
 * | （全事件）        | L267     | transitions_history {at,from,to,event}             | history JSONL ✓（event → raw，与 legacy.ts 导入映射同口径；写盘现在也在 kernel 收尾里）|
 * | （全事件）        | L269-300 | lifecycle hooks（manifest pipeline_hooks，ship 受 auto_commit 闸）| 缺 —— 需 kernel/manifest 派生面（BACKLOG #18）+ M2 hooks 接线，本轮不越权 |
 * | explore-complete  | L120-126 | design_doc 非空/非 null/文件存在                   | kernel DefaultEventPolicy guard ✓ |
 * | spec-complete     | L127-138 | track≠pm → plan 非空/非 null/文件存在              | kernel DefaultEventPolicy guard ✓ |
 * | spec-complete     | L231-237 | automation 挂起入队（ac_enabled+opted_in）         | 缺 —— automation 子系统（BACKLOG #29b/M5），本轮不越权 |
 * | build-complete    | L144-147 | build_mode/isolation 必须已设                      | kernel DefaultEventPolicy guard ✓ |
 * | build-complete    | L148     | validate_enum isolation ∈ {branch,worktree}        | kernel DefaultEventPolicy guard ✓（set 闸外的纵深防线）|
 * | build-complete    | L150-153 | preset=full ∧ build_mode=direct → direct_override=true | kernel DefaultEventPolicy guard ✓ |
 * | build-complete    | L156-161 | build_sha 冻结 = git HEAD stdout；取不到 → WARN 留原值（unborn 仓字面 "HEAD"，T6 怪癖）| kernel DefaultEventPolicy action ✓（WARN 由本文件据 build-sha-missing 警告映射发出）|
 * | verify-pass       | L167-172 | verification_report 非空/非 null/文件存在          | kernel DefaultEventPolicy guard ✓ |
 * | verify-pass       | L173-176 | branch_status == handled                           | kernel DefaultEventPolicy guard ✓ |
 * | verify-pass       | L179-190 | track≠pm → agent/codex_review_result == pass       | kernel DefaultEventPolicy guard ✓ |
 * | verify-pass       | L192-199 | barrier：build_sha 非空非 null ∧ HEAD 可取 ∧ 不等 → 双行 ERROR 拒 | kernel DefaultEventPolicy guard ✓ |
 * | verify-pass       | L201-204 | verify_result=pass + verified_at=now               | kernel DefaultEventPolicy action ✓ |
 * | verify-fail       | L207-210 | verify_result=fail + build_sha=null + phase_status=in_progress | kernel DefaultEventPolicy action ✓（phase_status 在 flow）|
 * | archived          | L213-217 | archived=true + archived_at=now + phase_status=done | kernel DefaultEventPolicy action ✓（phase_status 在 flow）|
 * | 其它事件          | L219-221 | 无专属校验（open-complete/ship-complete/自定义相位事件）| kernel default 通行 ✓ |
 * 校验失败 = 任何写盘之前 exit 1（老仓 case 校验先于 cmd_set phase），ERROR 文案逐字对齐。
 * 文件存在性经 deps.guardCtx 注入（main.ts/harness 全量注入 = 真实校验；未注入 = lite
 * 降级跳过文件面、字段面仍全量——GUARD-RULES §7.2 同款降级口径）。
 */
import {
  compileWorkflow, createTransitionApplication, loadRegistry, loadWorkflow, nodeLoopIoStrict,
} from '@pipeline-lite/kernel'
import type { TransitionContext } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'

export async function cmdTransition(deps: CliDeps, name: string, event: string): Promise<number> {
  if (!isValidChangeName(name)) {
    deps.io.err(`ERROR: change-name 非法: '${name}' (仅允许 a-z A-Z 0-9 - _)`)
    return 1
  }

  const dir = changeDir(deps.cwd, name)
  // kernel 单源注入面：文件存在性经 guardCtx（缺省降级跳过文件面），git HEAD 经 deps.gitHeadSha
  const context: TransitionContext = {
    fileExists: deps.guardCtx?.(name)?.fileExists,
    gitHeadSha: deps.gitHeadSha,
  }

  // breadcrumb/review-marker 端口绑定：与改动前直接喂给 applyBreadcrumbTail/applyReviewMarkerTail
  // 的绑定逻辑逐字一致，只是现在整体交给 TransitionApplication 编排，不再由本文件逐步调用。
  // writeReviewMarker 的 root 形参在 CLI 单进程场景被适配掉（CLI 用闭包 cwd，不受传入 root 值
  // 影响；server 的多项目端口形状才真正需要 root）。
  const app = createTransitionApplication({
    runRepository: deps.runRepo,
    flow: deps.flow,
    clock: deps.clock,
    history: deps.history,
    breadcrumb: deps.writeBreadcrumb ? { write: deps.writeBreadcrumb } : undefined,
    reviewMarker: deps.writeReviewMarker
      ? { write: (_root, content) => deps.writeReviewMarker!(content) }
      : undefined,
    documentEvidence: deps.documentEvidence,
    resolveConstraintContext: async ({ policy }) => {
      const registry = loadRegistry(deps.cwd, nodeLoopIoStrict)
      if (registry.data === null) throw new Error(`loops registry 无法校验：${registry.errors.join('；')}`)
      const loop = registry.data.loops.find((candidate) => candidate.id === policy.loop_id)
      return { active: loop?.status === 'active', humanGateSatisfied: deps.env?.('PIPELINE_AFK') !== '1' }
    },
  })

  try {
    const result = await app.execute({
      root: deps.cwd,
      changeDir: dir,
      changeName: name,
      event,
      context,
      // loadWorkflow→compileWorkflow：TransitionApplication 收编译产物 WorkflowIR；编译错误
      // （= 基础设施错误）经 execute 抛出，落本文件 catch → ERROR + exit 1（同 loadWorkflow 既有语义）。
      loadWorkflow: (wfName) => {
        const def = loadWorkflow(deps.cwd, wfName)
        return def ? compileWorkflow(def) : null
      },
    })

    switch (result.kind) {
      case 'applied': {
        for (const w of result.warnings) {
          switch (w.kind) {
            case 'build-sha-missing':
              deps.io.err('WARN: build-complete 未取到 git HEAD（非 git 仓？）build_sha 留空，verify 不做 SHA 校验')
              break
            case 'projection-write-failed':
              switch (w.projection) {
                case 'state-yaml':
                  deps.io.err(`WARN: state YAML projection 写入失败（canonical 已提交）: ${errMsg(w.cause)}`)
                  break
                case 'breadcrumb':
                  deps.io.err(`WARN: breadcrumb 写入失败: ${errMsg(w.cause)}`)
                  break
                case 'history':
                  deps.io.err(`WARN: history 写入失败: ${errMsg(w.cause)}`)
                  break
                case 'review-marker':
                  deps.io.err(`WARN: review marker 写入失败: ${errMsg(w.cause)}`)
                  break
              }
              break
          }
        }
        deps.io.err(`[TRANSITION] ${name}: ${result.from} -> ${result.to}`)
        return 0
      }
      case 'unknown-event':
        deps.io.err(`ERROR: 未知 event: ${event}`)
        return 1
      case 'event-source-mismatch':
        deps.io.err(`ERROR: illegal transition: ${result.current} -> ${result.to}`)
        return 1
      case 'illegal-transition':
        deps.io.err(`ERROR: illegal transition: ${result.from} -> ${result.to}`)
        return 1
      case 'precondition-violated':
        for (const line of result.lines) deps.io.err(line)
        return 1
      case 'workflow-not-found':
        deps.io.err(
          `ERROR: workflow '${result.workflowName}' 未找到（期望 .pipeline/workflows/${result.workflowName}.yaml）`,
        )
        return 1
      case 'step-not-in-graph':
        deps.io.err(`ERROR: step '${result.stepId}' 不在 workflow '${result.workflowName}' 里`)
        return 1
      case 'event-unsupported':
        deps.io.err(
          `ERROR: step '${result.stepId}' 不支持 event '${result.event}'；该 step 支持：${result.available.join(', ') || '(无)'}`,
        )
        return 1
      case 'step-guard-failed':
        deps.io.err(`ERROR: step '${result.stepId}' guard 未通过：`)
        for (const line of result.failures) deps.io.err(line)
        return 2
      case 'document-evidence-failed':
        deps.io.err(`ERROR: OpenSpec 文档证据未通过（phase=${result.phase}）：`)
        for (const blocker of result.blockers) deps.io.err(`  - ${blocker}`)
        return 1
      case 'constraint-denied':
        deps.io.err(`ERROR: automation constraint denied transition: ${result.reason}`)
        return 1
    }
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }
}
