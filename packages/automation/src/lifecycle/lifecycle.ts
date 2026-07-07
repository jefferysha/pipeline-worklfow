/**
 * change 沙箱生命周期纯编排（BACKLOG #29）—— 挂队→入沙箱→跑 pipeline→merge-back→teardown。
 *
 * 老仓真相源：scheduler/runChange.ts:721-1108（createRunChange 的 run() 编排）+ lifecycle/
 * SandboxLifecycle.ts（merge-back）+ WorktreeManager.ts（per-change 命名分支 worktree）。
 *
 * 本模块是**纯编排 + 注入面**：worktree / sandbox / runWork / collectCommits / mergeToBase / git
 * 全是注入 port（真 docker/git 走 IT + #29c，单测用 fake 驱动全链）。不阉割的守卫（DESIGN §7）以
 * 注入契约表达：
 *   - 沙箱注入 PIPELINE_AFK=1（headless 放行三门，老仓 runChange env）。
 *   - build_sha barrier 全链同源（deriveBarrierSha，命名分支 HEAD，不信沙箱自报）。
 *   - abort → **保留 worktree**（不 remove）+ AbortedRunError（DESIGN §7-item4：失败/abort 绝不清沙箱）。
 *   - 分级放权：autoMerge=false（L1/L2 report-only）→ 收集 commits + 派生 build_sha 供人工复核，
 *     但**不 mergeToBase**（不自动合并回主线，安全默认）；autoMerge=true（L3）→ 真 merge-back。
 */
import { PIPELINE_AFK_ENV } from '../queue/gate.js'
import { type RunOutcome } from '../types.js'
import type { SandboxReport } from '../runner/runner.js'
import { type GitFace, deriveBarrierSha } from './barrier.js'

/** per-change 命名分支前缀（老仓 sandcastle-pipeline/<name>）。 */
export const NAMED_BRANCH_PREFIX = 'sandcastle-pipeline/'

/** 沙箱句柄注入面（exec + env 可见 + close 杀容器 + containerName 供运行期写回 automation_sandbox）。 */
export interface SandboxHandle {
  readonly env: Record<string, string>
  /** 真容器名（container.ts::createDockerSandbox 生成的 sandcastle-<random>），供写回 automation_sandbox 字段。 */
  readonly containerName: string
  exec(cmd: string, options?: { onLine?: (line: string) => void }): Promise<{ stdout: string; stderr: string; exitCode: number }>
  close(): Promise<void>
}

/** worktree 注入面（per-change 命名分支 worktree 的 create/remove）。 */
export interface WorktreePort {
  create(repoDir: string, branch: string): Promise<{ path: string; branch: string }>
  remove(path: string): Promise<void>
}

/**
 * 沙箱内 pipeline 驱动（production 绑 ports.ts::createLifecyclePorts 的真实现，返回结构化握手）。
 *
 * 历史注记（afk-workbench Task 2 → teardown 现场缺口修复，见
 * `.superpowers/sdd/task-2-report.md` "Fix: log survives teardown"）：Task 2 曾在这里加过第 3 个
 * `worktreePath` 参数，为了让真实现（ports.ts）把结算日志落盘到 worktree 内
 * `.sandcastle-run.log`。Task 2 自己的实测（真 docker 跑通一个成功 run）随后发现：这个位置在
 * **成功**和**普通（非 tagged）失败**这两类最常见结算下，会在 `runWork` 返回后、
 * `runChangeInSandbox` 的 finally 块里被 `worktree.remove` 立即删掉——日志刚写完就随 worktree
 * 一起消失，只有 abort/conflict 保留现场那一类才读得到。真实现现已改写到 host 侧
 * `openspec/changes/<name>/.sandcastle-run.log`（由 hostRepoDir + name 派生，
 * createLifecyclePorts 的 hostRepoDir 闭包已有，每次调用都传 name，不需要额外状态），故不再
 * 需要 worktreePath，这个参数原样撤回——不留一个真实现不再使用的死参数。
 */
export type RunWork = (
  exec: SandboxHandle['exec'],
  name: string,
  signal: AbortSignal,
) => Promise<SandboxReport>

/** 生命周期全部注入 port（真 docker/git/worktree 走 #29c 生产接线）。 */
export interface LifecyclePorts {
  readonly worktree: WorktreePort
  createSandbox(opts: { env: Record<string, string>; worktreePath: string }): Promise<SandboxHandle>
  runWork: RunWork
  /** 收集命名分支相对 base 的 commits（FIFO；last = build HEAD）。 */
  collectCommits(input: { worktreePath: string; branch: string; base: string }): Promise<{ sha: string }[]>
  /** 把命名分支 merge 回 host base（仅 autoMerge=L3 时调）。 */
  mergeToBase(input: { worktreePath: string; branch: string; base: string }): Promise<void>
  readonly git: GitFace
  /**
   * 运行期写回单个 automation_* 字段（name=change 名，非路径；同 scheduler.ts::StateWriter.setField
   * 同款签名/语义——沿用既有约定，非新发明。真实现由 ports.ts 生产装配层适配注入的写入依赖，
   * 未注入时 no-op）。容器/worktree 创建成功后写 automation_sandbox/automation_worktree（下游
   * 取消/详情要用这两个字段定位容器/worktree）。
   */
  setStateField(name: string, field: string, value: string): Promise<void>
}

export interface RunChangeConfig {
  readonly hostRepoDir: string
  readonly name: string
  /** host 当前 base 分支（命名分支从它 fork、merge 回它）。 */
  readonly base: string
  /** L3 → true（自动 merge 回主线）；L1/L2 report-only → false（不自动合并，安全默认）。 */
  readonly autoMerge: boolean
  /**
   * 额外注入沙箱的 env（真部署接线用：CLAUDE_CODE_OAUTH_TOKEN 供沙箱内 agent 认证、
   * ANTHROPIC_BASE_URL 供路由走 tap 代理而非直连——此前实现只硬编码了 PIPELINE_AFK=1，
   * 从未有通道能把凭证/路由配置真正传进容器，是先前收编遗漏的真缺口）。与
   * PIPELINE_AFK_ENV 合并，不覆盖后者（extraEnv 尝试设同名键也不生效，硬护栏优先）。
   */
  readonly extraEnv?: Readonly<Record<string, string>>
}

/**
 * abort（kanban "停止" / 单 change SIGTERM）时抛（老仓 AbortedRunError）：与其它失败不同，
 * per-change worktree **不 remove**——保留供人工接管。reason 原样透传（不包裹）。
 */
export class AbortedRunError extends Error {
  override readonly name = 'AbortedRunError'
  readonly _tag = 'AbortedRunError'
  readonly reason: unknown
  readonly preservedPath: string
  constructor(reason: unknown, preservedPath: string) {
    super(typeof reason === 'string' ? reason : ((reason as { message?: string } | undefined)?.message ?? String(reason)))
    this.reason = reason
    this.preservedPath = preservedPath
  }
}

/**
 * 冲突/漂移类错误的 tag（BACKLOG #29c 现场保留补强）：merge-back 冲突（SyncError）/ merge 超时
 * （MergeToHostTimeoutError）/ build_sha 漂移（BarrierDriftError）/ worktree 失败（WorktreeError）
 * → **保留 worktree 现场**（不 remove），供人工在 dashboard 接管（DESIGN §7-item4「失败/冲突绝不清沙箱」）。
 * #29 仅在 abort 时保留现场；真 merge-back 引入真冲突后，conflict 类错误也必须保留（否则 preserved_path
 * 指向已删目录）。retry 类错误（瞬态/verify-fail）仍照清 worktree（下轮重建，不误留现场）。
 */
const PRESERVE_ERROR_TAGS = new Set(['SyncError', 'MergeToHostTimeoutError', 'BarrierDriftError', 'WorktreeError'])
const isPreserveError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && PRESERVE_ERROR_TAGS.has((err as { _tag?: string })._tag ?? '')

/** 给 RunOutcome 打诚实化标志：buildSha 缺失（零 commit / 跑空）→ noop:true，即便 verify pass。 */
const finalizeRunOutcome = (o: Omit<RunOutcome, 'noop'>): RunOutcome => ({ ...o, noop: !o.buildSha })

/**
 * 跑一个 change 端到端（沙箱生命周期编排）。返回 RunOutcome 或抛 tagged error（scheduler 据 tag 分类）。
 */
export const runChangeInSandbox = async (ports: LifecyclePorts, cfg: RunChangeConfig, signal: AbortSignal): Promise<RunOutcome> => {
  const branch = `${NAMED_BRANCH_PREFIX}${cfg.name}`
  const wt = await ports.worktree.create(cfg.hostRepoDir, branch)
  const worktreePath = wt.path

  let handle: SandboxHandle | undefined
  // #29c：conflict 类错误保留现场（不清 worktree）；见 PRESERVE_ERROR_TAGS。
  let preserve = false
  try {
    // 沙箱 env 注入 PIPELINE_AFK=1（headless 放行三门）+ 调用方 extraEnv（token/代理地址等）；
    // PIPELINE_AFK_ENV 放最后展开，extraEnv 若尝试同名覆盖也不生效（硬护栏优先）。
    const env: Record<string, string> = { ...cfg.extraEnv, [PIPELINE_AFK_ENV]: '1' }
    handle = await ports.createSandbox({ env, worktreePath })
    const sandbox = handle

    // 容器/worktree 都真创建成功 → 真写回 automation_sandbox/automation_worktree（runWork 前，
    // 抄 scheduler.ts 写 automation_last_error/automation_preserved_path 的既有模式）。
    await ports.setStateField(cfg.name, 'automation_sandbox', sandbox.containerName)
    await ports.setStateField(cfg.name, 'automation_worktree', worktreePath)

    const report = await ports.runWork((cmd, options) => sandbox.exec(cmd, options), cfg.name, signal)
    // abort 检查（老仓在每轮前后查 signal.aborted）：转 catch 走 preserve 现场。
    if (signal.aborted) throw new AbortedRunError(signal.reason, worktreePath)

    const commits = await ports.collectCommits({ worktreePath, branch: wt.branch, base: cfg.base })

    // barrier 全链同源：命名分支 HEAD == landed；不信沙箱自报（report.build_sha）。
    const barrier = await deriveBarrierSha({
      git: ports.git,
      branch: wt.branch,
      commits,
      sandboxReportedSha: report.build_sha,
    })

    // 分级放权：仅 L3（autoMerge）且有 commit 才真 merge 回主线；L1/L2 report-only 只报告。
    if (cfg.autoMerge && commits.length > 0) {
      await ports.mergeToBase({ worktreePath, branch: wt.branch, base: cfg.base })
    }

    return finalizeRunOutcome({
      commits,
      verifyResult: report.verify_result,
      buildSha: barrier.buildSha,
      branch: wt.branch,
      phaseEvent: report.phase_event,
    })
  } catch (err) {
    if (signal.aborted) {
      // abort：杀容器但**保留 worktree**（留现场），抛 AbortedRunError 带 unwrapped reason + 路径。
      if (handle) await handle.close().catch(() => {})
      handle = undefined // 让 finally 跳过二次 close
      throw new AbortedRunError(signal.reason, worktreePath)
    }
    // conflict 类（merge 冲突 / barrier drift / worktree 失败）→ 保留现场，不清 worktree。
    if (isPreserveError(err)) preserve = true
    throw err
  } finally {
    if (handle) await handle.close().catch(() => {})
    // 非 abort、非 conflict 路径才 teardown worktree（错误吞掉）；abort/conflict 保留现场。
    if (!signal.aborted && !preserve) {
      await ports.worktree.remove(worktreePath).catch(() => {})
    }
  }
}
