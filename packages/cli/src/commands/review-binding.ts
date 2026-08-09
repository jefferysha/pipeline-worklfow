import {
  formatReviewMarker,
  readReviewGateBinding,
  reviewGateBindingForState,
  reviewGateBindingMatches,
  writeReviewGateBindingUnderLock,
  INTERACTION_PROJECTION_WRITE_FAILED,
  type PipelineState,
  type RunRevision,
} from '@tenon/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import type { InteractionCapture } from '../interaction-emitter.js'

export async function refreshReviewGateBinding(
  changeDir: string,
  state: PipelineState,
  phase: string,
  event: string,
  requestedAt: string,
  options: { readonly tolerateUnreadable?: boolean } = {},
): Promise<void> {
  let existing: Awaited<ReturnType<typeof readReviewGateBinding>>
  try {
    existing = await readReviewGateBinding(changeDir)
  } catch {
    if (options.tolerateUnreadable !== true) throw new Error('review gate binding unreadable')
    existing = undefined
  }
  if (!reviewGateBindingMatches(existing, state, phase, event)) {
    await writeReviewGateBindingUnderLock(
      changeDir,
      reviewGateBindingForState(state, phase, event, requestedAt),
    )
  }
}

/** Request recovery treats an unreadable sidecar as stale; authorization readers stay strict. */
export async function readReviewGateBindingForRequest(changeDir: string): Promise<Awaited<ReturnType<typeof readReviewGateBinding>>> {
  try {
    return await readReviewGateBinding(changeDir)
  } catch {
    return undefined
  }
}

/** A replaced receipt must have a new ordered request timestamp, even under a fixed test clock. */
export function freshReviewRequestedAt(previous: string, now: () => string): string {
  const candidate = now()
  if (previous === '') return candidate
  const previousMs = Date.parse(previous)
  const candidateMs = Date.parse(candidate)
  if (!Number.isFinite(previousMs) || !Number.isFinite(candidateMs) || candidateMs > previousMs) return candidate
  return new Date(previousMs + 1).toISOString()
}

export async function assertReviewGateBinding(
  changeDir: string,
  state: PipelineState,
  phase: string,
  event: string,
): Promise<void> {
  const binding = await readReviewGateBinding(changeDir)
  if (!reviewGateBindingMatches(binding, state, phase, event)) {
    throw new Error(`phase '${phase}' 的 review receipt 未绑定当前 canonical decision state；请重新 request ${event}`)
  }
}

export async function clearReviewMarker(deps: CliDeps): Promise<boolean> {
  if (!deps.clearReviewMarker) return true
  try {
    await deps.clearReviewMarker()
    return true
  } catch (error) {
    deps.io.err(`WARN: review marker 清理失败（approval receipt 已提交，可重试 acknowledge）: ${errMsg(error)}`)
    return false
  }
}

export async function writeReviewMarker(
  deps: CliDeps,
  phase: string,
  event: string,
  name: string,
  requestedAt: string,
): Promise<boolean> {
  if (!deps.writeReviewMarker) return true
  try {
    await deps.writeReviewMarker(formatReviewMarker({ phase, event, changeName: name, requestedAt }))
    return true
  } catch (error) {
    deps.io.err(`WARN: review marker 写入失败（canonical pending receipt 已提交，可重试 request）: ${errMsg(error)}`)
    return false
  }
}

/** Best-effort stale acknowledgement trace; canonical receipt remains pending/unchanged. */
export async function recordRejectedAcknowledgement(
  deps: CliDeps,
  interaction: InteractionCapture | undefined,
  changeDir: string,
  changeName: string,
  state: PipelineState,
  revision: RunRevision | undefined,
  event: string,
): Promise<void> {
  if (interaction === undefined || revision === undefined) {
    if (interaction !== undefined) {
      deps.io.err(`WARN: ${INTERACTION_PROJECTION_WRITE_FAILED} interaction projection 未写入（缺 canonical run/workflow/state anchor；canonical review acknowledgement 已拒绝）`)
    }
    return
  }
  try {
    await interaction.recordReviewAcknowledged({
      changeDir,
      changeName,
      state,
      revision,
      beforeRevision: revision,
      event,
      requestedAt: scalar(state, 'review_requested_at'),
      rejected: true,
      clock: freshReviewRequestedAt(scalar(state, 'review_requested_at'), deps.clock),
    })
  } catch (error) {
    deps.io.err(`WARN: ${INTERACTION_PROJECTION_WRITE_FAILED} interaction projection 写入失败（canonical review acknowledgement 已拒绝）: ${errMsg(error)}`)
  }
}

function scalar(state: PipelineState, field: 'review_requested_at'): string {
  const value = state.fields[field]
  return Array.isArray(value) ? value.join(',') : (value ?? '')
}
