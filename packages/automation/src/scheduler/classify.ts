/**
 * 失败分类（③）—— 移植老仓 scheduler/classify.ts:1-119。
 *
 * 决定失败 run 回 queued（retry）还是直接 conflict（绝不重试、留现场）。分类**按 error 的 tag /
 * 类型，绝不按 message 字符串**（spec 硬规则：message 会漂，tag 不会）。
 *   - conflict 类：AbortedRunError（操作员 abort，人为停的绝不自动重试）、CancelledRunError
 *     （dashboard 取消，docker kill 容器前落标记，runWork 结算转的 tagged error，语义同
 *     AbortedRunError，见 afk-workbench Task 3 / lifecycle.ts）、SyncError /
 *     MergeToHostTimeoutError / WorktreeError（merge-back 失败）、BarrierDriftError（build_sha
 *     drift，verify 目标偏离 reviewed commit——重试只会再撞同一移动靶）。
 *   - retry 类：verify-fail sentinel、AgentIdleTimeoutError（瞬态挂起）、ExecError（含瞬态
 *     126/137）、其余一切 → 回 queued 直到 attempts 耗尽。
 */
import type { Classification } from '../types.js'

/** shell 无法 exec 的瞬态竞态码（与 lifecycle git-setup 重试同集，勿扩大）。 */
const TRANSIENT_EXEC_EXIT_CODES = new Set([126, 137])

/** verify-fail 用 sentinel 而非 throw（resolved-but-failed）。 */
export interface VerifyFailSentinel {
  verifyFail: true
}

type SafeRead = { readonly ok: true; readonly value: unknown } | { readonly ok: false }

interface FailureSnapshot {
  readonly tagReadable: boolean
  readonly tag?: string
  readonly verifyFail: boolean
  readonly message?: string
  readonly exitCode?: number
  readonly preservedWorktreePath?: string
  readonly preservedPath?: string
  readonly cleanupReadable: boolean
  readonly cleanupError?: unknown
}

const safeRead = (source: unknown, key: string): SafeRead => {
  if (typeof source !== 'object' || source === null) return { ok: true, value: undefined }
  try {
    return { ok: true, value: (source as Record<string, unknown>)[key] }
  } catch {
    return { ok: false }
  }
}

/** 任意 error 可能是 Proxy；所有分类字段各读一次且异常只记录为 unreadable，绝不向外逃逸。 */
const snapshotFailure = (source: unknown): FailureSnapshot => {
  const tag = safeRead(source, '_tag')
  const verifyFail = safeRead(source, 'verifyFail')
  const message = safeRead(source, 'message')
  const exitCode = safeRead(source, 'exitCode')
  const preservedWorktreePath = safeRead(source, 'preservedWorktreePath')
  const preservedPath = safeRead(source, 'preservedPath')
  const cleanupError = safeRead(source, 'cleanupError')
  return {
    tagReadable: tag.ok,
    tag: tag.ok && typeof tag.value === 'string' ? tag.value : undefined,
    verifyFail: verifyFail.ok && verifyFail.value === true,
    message: message.ok && typeof message.value === 'string' ? message.value : undefined,
    exitCode: exitCode.ok && typeof exitCode.value === 'number' ? exitCode.value : undefined,
    preservedWorktreePath: preservedWorktreePath.ok && typeof preservedWorktreePath.value === 'string'
      ? preservedWorktreePath.value : undefined,
    preservedPath: preservedPath.ok && typeof preservedPath.value === 'string' ? preservedPath.value : undefined,
    cleanupReadable: cleanupError.ok,
    cleanupError: cleanupError.ok ? cleanupError.value : undefined,
  }
}

/** 从结构化字段或 message 兜底抓 preserved 路径（含空格路径不截断）。 */
const preservedPathOf = (err: FailureSnapshot): string | undefined => {
  if (err.preservedWorktreePath) return err.preservedWorktreePath
  const m = err.message?.match(/preserved (?:at )?(.+?)\s*$/im)
  return m?.[1]
}

export const classifyFailure = (err: unknown): Classification => {
  const tagged = snapshotFailure(err)
  const tag = tagged.tag

  const cleanupValueIsObject = typeof tagged.cleanupError === 'object' && tagged.cleanupError !== null
  const nestedCleanup = cleanupValueIsObject ? snapshotFailure(tagged.cleanupError) : undefined
  const directCleanup = tag === 'ContainerCleanupError'
  const trustedCombined = tag === 'RunAndCleanupError'
  const nestedTaggedCleanup = nestedCleanup?.tag === 'ContainerCleanupError'
  const unreadableNestedTag = nestedCleanup !== undefined && !nestedCleanup.tagReadable
  // `RunAndCleanupError` 是 lifecycle 在主流程与 owned-container 清理同时失败时本地构造的
  // 可信组合 tag；其 cleanup payload 即使被 Proxy 隐去、缺席或显式 undefined，也只能让诊断
  // 退化，不能把处置从 conflict 降成 retry（否则带泄漏现场的任务会自动重排）。
  const cleanupCandidate = directCleanup || trustedCombined || nestedTaggedCleanup || unreadableNestedTag
  if (cleanupCandidate) {
    const cleanupMessage = directCleanup ? tagged.message : nestedCleanup?.message
    return {
      kind: 'conflict',
      message: directCleanup
        ? (cleanupMessage ?? 'container cleanup failed')
        : `${tagged.message ?? 'run failed'}; cleanup failed: ${cleanupMessage ?? 'container cleanup failed'}`,
      cause: 'container-cleanup',
      preservedPath: tagged.preservedPath ?? preservedPathOf(tagged)
        ?? nestedCleanup?.preservedPath ?? (nestedCleanup ? preservedPathOf(nestedCleanup) : undefined),
    }
  }

  if (tagged.verifyFail) {
    return { kind: 'retry', message: 'verify-fail', cause: 'verify-fail' }
  }

  if (tag === 'LoopPolicyChangedError') {
    return { kind: 'retry', message: tagged.message ?? 'loop policy changed before start', cause: 'skill-bundle-policy-changed' }
  }

  // 操作员 abort / dashboard 取消（CancelledRunError，afk-workbench Task 3：docker kill 前落标记，
  // runWork 结算探测到后转的 tagged error）→ conflict，绝不重试，留现场。preservedPath 直取结构化
  // 字段——两者都在 runChangeInSandbox 同一处构造，构造时早已知道 worktreePath，抄同一个模式。
  // cause=cancelled（F-b）：人为取消是干净 tag 信号——此前读取端只有 200 字符截断 message 可 regex，
  // 「用户取消」常被误判 unknown。
  if (tag === 'AbortedRunError' || tag === 'CancelledRunError') {
    return {
      kind: 'conflict',
      message: tagged.message ?? 'aborted',
      cause: 'cancelled',
      preservedPath: tagged.preservedPath ?? preservedPathOf(tagged),
    }
  }
  if (tag === 'SchedulerInterruptedError') {
    return {
      kind: 'conflict',
      message: tagged.message ?? 'scheduler interrupted',
      cause: 'scheduler-interrupted',
    }
  }

  // merge-back 失败 / build_sha drift / denylist 违规（T4 决议 #12：run 产出触碰 loop 拉黑路径，
  // 重试只会再产出同一批越界文件——settled，人工核对现场）→ conflict，绝不重试。
  if (
    tag === 'SyncError' ||
    tag === 'MergeToHostTimeoutError' ||
    tag === 'WorktreeError' ||
    tag === 'BarrierDriftError' ||
    tag === 'DenylistViolationError' ||
    tag === 'AllowlistViolationError'
  ) {
    return {
      kind: 'conflict',
      message: tagged.message ?? 'merge conflict / barrier drift',
      cause: 'conflict',
      preservedPath: preservedPathOf(tagged),
    }
  }

  // H10 r1 阻断6/4（任务B1）：容器 mount 前 host 侧 skill bundle 核验失败
  // （ports.ts::verifySkillBundleSnapshot，发生在 createDockerSandbox 之前——agent 从未启动）→
  // conflict，绝不重试：同一份可能被篡改/漂移的 CAS 快照，盲目重试只会撞同一个损坏内容，需要人工
  // 核对现场（是否真的被篡改，还是 TOCTOU 竞态）。cause 用专属值 'skill-bundle-snapshot-corrupt'
  // （不复用泛泛的 'conflict'）——scheduler.ts::settlementFor 据此 override charge:'none' +
  // reason:'skill-bundle-snapshot-corrupt'（agent 此刻从未启动，不能按 reserved-estimate 收费）。
  if (tag === 'SkillBundleSnapshotMismatchError') {
    return {
      kind: 'conflict',
      message: tagged.message ?? 'skill bundle snapshot corrupt',
      cause: 'skill-bundle-snapshot-corrupt',
    }
  }

  // agent idle-timeout = 瞬态挂起 → retry（下次可能有进展，非移动靶）。
  if (tag === 'AgentIdleTimeoutError') {
    return { kind: 'retry', message: tagged.message ?? 'agent idle timeout', cause: 'timeout' }
  }

  // 其余（ExecError 任意 exit、超时、agent 错误）都 retry：瞬态 126/137 与真 build/verify 非零
  // 都回 queued 直到 attempts 耗尽。仅让 message 更可读，动作不变。cause 空串 = 未知（ExecError
  // 的 exit 码混着基础设施抖动与真 build 失败，tag 面无法干净定成因——不猜，读取端 regex 兜底）。
  const isTransient = tag === 'ExecError' && typeof tagged.exitCode === 'number' && TRANSIENT_EXEC_EXIT_CODES.has(tagged.exitCode)

  return {
    kind: 'retry',
    message: tagged.message ?? (isTransient ? 'transient exec failure' : 'run failed'),
    cause: '',
  }
}
