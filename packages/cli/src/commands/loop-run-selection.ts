/**
 * H14 real-run 的纯选择层。
 *
 * selector 只决定允许执行哪些 loop，不能替 change 发明归属。每个 ready change 都先按
 * durable ledger binding → 最长前缀的既有 kernel 规则解析自然归属；任一归属不可判定即整批
 * fail-closed。成功结果保留 ready FIFO，并把自然归属作为 expectedLoopId 观察值；admission
 * 在 reserve 锁内按最新 durable binding/前缀重算，只有仍相等才放行。
 */
import {
  latestChangeLoopBinding,
  resolveLoopBinding,
  type BindingDenyReason,
  type LedgerRecord,
  type LoopEntry,
} from '@tenon/kernel'

export interface TargetedRunCandidate {
  readonly change: string
  readonly expectedLoopId: string
  readonly expectedAutonomyLevel: 'L1' | 'L2' | 'L3' | null
}

export type LoopRunSelectionErrorReason = BindingDenyReason | 'duplicate-ready-change'

export interface LoopRunSelectionError {
  readonly reason: LoopRunSelectionErrorReason
  readonly change: string
  readonly detail: string
}

export type LoopRunSelectionResult =
  | { readonly ok: true; readonly targets: TargetedRunCandidate[] }
  | { readonly ok: false; readonly error: LoopRunSelectionError }

export interface LoopRunSelectionInput {
  readonly selectedLoopIds: readonly string[]
  /** scanReady 产出的权威 FIFO。重复项是上游损坏，不能静默去重。 */
  readonly readyChanges: readonly string[]
  readonly loops: readonly LoopEntry[]
  /** 已按 append-only ledger 文件序排列的 typed records。 */
  readonly ledgerRecords: readonly LedgerRecord[]
}

export function selectTargetedRunCandidates(input: LoopRunSelectionInput): LoopRunSelectionResult {
  const selected = new Set(input.selectedLoopIds)
  const seenChanges = new Set<string>()
  const targets: TargetedRunCandidate[] = []

  for (const change of input.readyChanges) {
    if (seenChanges.has(change)) {
      return {
        ok: false,
        error: {
          reason: 'duplicate-ready-change',
          change,
          detail: `readyChanges 中出现重复 change「${change}」；拒绝重复 reserve/claim`,
        },
      }
    }
    seenChanges.add(change)

    const latest = latestChangeLoopBinding(input.ledgerRecords, change)
    const resolution = resolveLoopBinding({
      change,
      latestBindingLoopId: latest?.loop_id,
      loops: input.loops,
    })
    if (!resolution.ok) {
      return {
        ok: false,
        error: {
          reason: resolution.reason,
          change,
          detail: resolution.detail,
        },
      }
    }

    if (selected.has(resolution.loopId)) {
      const owner = input.loops.find((loop) => loop.id === resolution.loopId)
      if (owner === undefined) {
        return {
          ok: false,
          error: {
            reason: 'bound-loop-missing',
            change,
            detail: `已解析 loop「${resolution.loopId}」不在 selector registry 快照`,
          },
        }
      }
      targets.push({
        change,
        expectedLoopId: resolution.loopId,
        expectedAutonomyLevel: owner.autonomy_level,
      })
    }
  }

  return { ok: true, targets }
}
