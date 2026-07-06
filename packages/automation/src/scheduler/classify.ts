/**
 * 失败分类（③）—— 移植老仓 scheduler/classify.ts:1-119。
 *
 * 决定失败 run 回 queued（retry）还是直接 conflict（绝不重试、留现场）。分类**按 error 的 tag /
 * 类型，绝不按 message 字符串**（spec 硬规则：message 会漂，tag 不会）。
 *   - conflict 类：AbortedRunError（操作员 abort，人为停的绝不自动重试）、SyncError /
 *     MergeToHostTimeoutError / WorktreeError（merge-back 失败）、BarrierDriftError（build_sha
 *     drift，verify 目标偏离 reviewed commit——重试只会再撞同一移动靶）。
 *   - retry 类：verify-fail sentinel、AgentIdleTimeoutError（瞬态挂起）、ExecError（含瞬态
 *     126/137）、其余一切 → 回 queued 直到 attempts 耗尽。
 */
import type { Classification } from '../types.js'

/** shell 无法 exec 的瞬态竞态码（与 lifecycle git-setup 重试同集，勿扩大）。 */
const TRANSIENT_EXEC_EXIT_CODES = new Set([126, 137])

interface Tagged {
  _tag?: string
  exitCode?: number
  message?: string
  preservedWorktreePath?: string
  preservedPath?: string
}

/** verify-fail 用 sentinel 而非 throw（resolved-but-failed）。 */
export interface VerifyFailSentinel {
  verifyFail: true
}

const isVerifyFailSentinel = (e: unknown): e is VerifyFailSentinel =>
  typeof e === 'object' && e !== null && (e as VerifyFailSentinel).verifyFail === true

/** 从结构化字段或 message 兜底抓 preserved 路径（含空格路径不截断）。 */
const preservedPathOf = (err: Tagged): string | undefined => {
  if (err.preservedWorktreePath) return err.preservedWorktreePath
  const m = err.message?.match(/preserved (?:at )?(.+?)\s*$/im)
  return m?.[1]
}

export const classifyFailure = (err: unknown): Classification => {
  if (isVerifyFailSentinel(err)) {
    return { kind: 'retry', message: 'verify-fail' }
  }

  const tagged = (typeof err === 'object' && err !== null ? err : {}) as Tagged
  const tag = tagged._tag

  // 操作员 abort → conflict，绝不重试，留现场。preservedPath 直取 AbortedRunError 字段。
  if (tag === 'AbortedRunError') {
    return {
      kind: 'conflict',
      message: tagged.message ?? 'aborted',
      preservedPath: tagged.preservedPath ?? preservedPathOf(tagged),
    }
  }

  // merge-back 失败 / build_sha drift → conflict，绝不重试。
  if (tag === 'SyncError' || tag === 'MergeToHostTimeoutError' || tag === 'WorktreeError' || tag === 'BarrierDriftError') {
    return {
      kind: 'conflict',
      message: tagged.message ?? 'merge conflict / barrier drift',
      preservedPath: preservedPathOf(tagged),
    }
  }

  // agent idle-timeout = 瞬态挂起 → retry（下次可能有进展，非移动靶）。
  if (tag === 'AgentIdleTimeoutError') {
    return { kind: 'retry', message: tagged.message ?? 'agent idle timeout' }
  }

  // 其余（ExecError 任意 exit、超时、agent 错误）都 retry：瞬态 126/137 与真 build/verify 非零
  // 都回 queued 直到 attempts 耗尽。仅让 message 更可读，动作不变。
  const isTransient = tag === 'ExecError' && typeof tagged.exitCode === 'number' && TRANSIENT_EXEC_EXIT_CODES.has(tagged.exitCode)

  return {
    kind: 'retry',
    message: tagged.message ?? (isTransient ? 'transient exec failure' : err instanceof Error ? err.message : 'run failed'),
  }
}
