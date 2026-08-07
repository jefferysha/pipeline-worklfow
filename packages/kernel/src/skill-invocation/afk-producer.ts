import { createHash } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { createLoopLedgerStore } from '../loops/ledger-store.js'
import type {
  BudgetReservationRecord,
  ReservationActivatedRecord,
  RunRecord,
  SkillBundleSnapshotRecord,
} from '../loops/ledger-types.js'
import { readCurrentRunRevision } from '../state/run-revision-store.js'
import { appendSkillInvocationEvent, skillInvocationProjectId } from './repository.js'
import type { SkillInvocationEventV1, SkillInvocationSubjectV1 } from './types.js'
import {
  consumeVerifiedAfkInteractionReceipt,
  inspectVerifiedAfkInteractionReceipt,
  type VerifiedAfkInteractionReceipt,
} from './afk-interaction-receipt.js'

export class AfkSkillInvocationProofError extends Error {
  override readonly name = 'AfkSkillInvocationProofError'
}

export interface DurableAfkSkillInvocationHandle {
  readonly changeDir: string
  readonly change: string
  readonly loopId: string
  readonly workflowRunId: string
  readonly snapshotSha256: string
  readonly started: Extract<SkillInvocationEventV1, { type: 'invocation-started' }>
  readonly attempt: { readonly attempt_id: string; readonly reservation_id: string }
  readonly nextSequence: number
}

const issuedHandles = new WeakSet<object>()

const digest = (...parts: readonly string[]): string => {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part).update('\0')
  return hash.digest('hex')
}

const eventId = (invocationId: string, suffix: string): string => `${invocationId}-${suffix}`

function scalar(value: string | readonly string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

interface AnchoredAfkStart {
  readonly subject: SkillInvocationSubjectV1
  readonly reservation: BudgetReservationRecord
  readonly activation: ReservationActivatedRecord
  readonly snapshot: SkillBundleSnapshotRecord
}

async function anchoredStart(changeDir: string, reservationId: string): Promise<AnchoredAfkStart> {
  const revision = await readCurrentRunRevision(changeDir)
  const metadata = revision?.state.runMetadata
  const workflow = scalar(revision?.state.fields.workflow)
  const step = scalar(revision?.state.fields.phase)
  if (metadata === undefined || workflow === '' || step === '') {
    throw new AfkSkillInvocationProofError('canonical WorkflowRun StepVisit identity is missing')
  }
  const repoRoot = resolve(changeDir, '..', '..', '..')
  const read = await createLoopLedgerStore().read(repoRoot)
  if (read.rejected.length > 0) {
    throw new AfkSkillInvocationProofError('AFK lifecycle cannot use a degraded loop ledger')
  }
  const reservations = read.records.filter((record): record is BudgetReservationRecord =>
    record.kind === 'budget-reservation' && record.reservation_id === reservationId)
  const activations = read.records.filter((record): record is ReservationActivatedRecord =>
    record.kind === 'reservation-activated' && record.reservation_id === reservationId)
  const snapshots = read.records.filter((record): record is SkillBundleSnapshotRecord =>
    record.kind === 'skill-bundle-snapshot' && record.reservation_id === reservationId)
  const terminals = read.records.filter((record): record is RunRecord =>
    record.kind === 'run' && record.reservation_id === reservationId)
  const reservation = reservations[0]
  const activation = activations[0]
  const snapshot = snapshots[0]
  if (reservations.length !== 1 || activations.length !== 1 || snapshots.length !== 1
    || terminals.length !== 0 || reservation === undefined || activation === undefined || snapshot === undefined
    || reservation.change !== basename(changeDir)
    || activation.attempt_id !== reservation.attempt_id
    || activation.change !== reservation.change || activation.loop_id !== reservation.loop_id
    || snapshot.attempt_id !== reservation.attempt_id || snapshot.loop_id !== reservation.loop_id
    || snapshot.workflow_run_id !== metadata.runId
    || snapshot.workflow !== workflow || snapshot.step !== step) {
    throw new AfkSkillInvocationProofError(
      'AFK lifecycle binding lacks one exact open reservation, snapshot, activation, and canonical StepVisit',
    )
  }
  return {
    reservation,
    activation,
    snapshot,
    subject: {
      project_id: await skillInvocationProjectId(repoRoot),
      workflow_definition_id: workflow,
      workflow_run_id: metadata.runId,
      step_id: step,
      step_visit: { run_id: metadata.runId, transition_sequence: metadata.transitionSequence },
      attempt: { attempt_id: reservation.attempt_id, reservation_id: reservation.reservation_id },
    },
  }
}

/** All invocation fields are derived from the unique durable open AFK reservation. */
export async function startDurableAfkSkillInvocations(
  changeDir: string,
  reservationId: string,
  interactionReceipts: readonly VerifiedAfkInteractionReceipt[] = [],
): Promise<readonly DurableAfkSkillInvocationHandle[]> {
  const { subject, reservation, activation, snapshot } = await anchoredStart(changeDir, reservationId)
  const attempt = { attempt_id: reservation.attempt_id, reservation_id: reservation.reservation_id }
  const interactions = interactionReceipts.map((receipt) => ({
    receipt,
    input: inspectVerifiedAfkInteractionReceipt(receipt),
  }))
  if (interactions.some(({ input }) => input === undefined)
    || new Set(interactions.map(({ input }) => input?.skill_id)).size !== interactions.length
    || interactions.some(({ input }) => input?.attempt_id !== attempt.attempt_id
      || input.reservation_id !== attempt.reservation_id
      || input.snapshot_sha256 !== snapshot.snapshot_sha256
      || !snapshot.slots.some((slot) => slot.concrete_skill_id === input.skill_id))) {
    throw new AfkSkillInvocationProofError('AFK interaction receipt does not match the exact prepared attempt and skill bundle')
  }
  const handles: DurableAfkSkillInvocationHandle[] = []
  for (const slot of snapshot.slots) {
    const invocationId = `invocation-${digest('afk', attempt.attempt_id, attempt.reservation_id, slot.concrete_skill_id, slot.tree_sha256)}`
    const started: Extract<SkillInvocationEventV1, { type: 'invocation-started' }> = {
      schema_version: 'skill-invocation-evidence/v1', event_id: eventId(invocationId, 'started'),
      invocation_id: invocationId, sequence: 1, type: 'invocation-started', subject,
      recorded_at: activation.started_at,
      payload: {
        skill: { id: slot.concrete_skill_id, version: `sha256-${slot.tree_sha256}` },
        input: { schema_id: 'tenon-afk-skill-input/v1', fields: [{
          name: 'skill_bundle', classification: 'configuration', digest: `sha256:${snapshot.snapshot_sha256}`,
          validator: { id: 'sealed-skill-bundle', status: 'pass' },
        }] },
        adapter: { kind: 'afk', proof_ref: `afk-attempt-${digest(attempt.attempt_id, attempt.reservation_id, slot.concrete_skill_id)}` },
      },
    }
    await appendSkillInvocationEvent(changeDir, started, { attempt })
    const interaction = interactions.find(({ input }) => input?.skill_id === slot.concrete_skill_id)
    let nextSequence = 2
    if (interaction?.input !== undefined) {
      const { input } = interaction
      await appendSkillInvocationEvent(changeDir, {
        ...started, event_id: eventId(invocationId, 'question'), sequence: nextSequence,
        type: 'question-recorded', recorded_at: input.recorded_at, payload: input.question,
      }, { attempt })
      nextSequence += 1
      await appendSkillInvocationEvent(changeDir, {
        ...started, event_id: eventId(invocationId, 'decision'), sequence: nextSequence,
        type: 'decision-recorded', recorded_at: input.recorded_at, payload: input.decision,
      }, {
        attempt,
        verify_recommended_default: async ({ decision, question }) =>
          JSON.stringify(decision) === JSON.stringify(input.decision)
          && JSON.stringify(question) === JSON.stringify(input.question),
      })
      nextSequence += 1
      consumeVerifiedAfkInteractionReceipt(interaction.receipt)
    }
    const handle = Object.freeze({
      changeDir,
      change: reservation.change,
      loopId: reservation.loop_id,
      workflowRunId: snapshot.workflow_run_id,
      snapshotSha256: snapshot.snapshot_sha256,
      started,
      attempt,
      nextSequence,
    })
    issuedHandles.add(handle)
    handles.push(handle)
  }
  return Object.freeze(handles)
}

function consume(handle: DurableAfkSkillInvocationHandle): void {
  if (!issuedHandles.has(handle)) {
    throw new AfkSkillInvocationProofError('AFK lifecycle handle was not issued or already terminal')
  }
  issuedHandles.delete(handle)
}

export async function finishDurableAfkSkillInvocations(
  handles: readonly DurableAfkSkillInvocationHandle[],
): Promise<void> {
  for (const handle of handles) {
    const repoRoot = resolve(handle.changeDir, '..', '..', '..')
    const read = await createLoopLedgerStore().read(repoRoot)
    const terminals = read.records.filter((record): record is RunRecord =>
      record.kind === 'run' && record.reservation_id === handle.attempt.reservation_id)
    const terminal = terminals[0]
    if (read.rejected.length > 0 || terminals.length !== 1 || terminal === undefined
      || terminal.attempt_id !== handle.attempt.attempt_id
      || terminal.change !== handle.change || terminal.loop_id !== handle.loopId
      || terminal.workflow_run_id !== handle.workflowRunId
      || terminal.skill_bundle_snapshot_sha256 !== handle.snapshotSha256) {
      throw new AfkSkillInvocationProofError('AFK completion lacks one exact durable terminal RunRecord')
    }
    consume(handle)
    if (terminal.error?.cause === 'scheduler-interrupted') {
      await appendSkillInvocationEvent(handle.changeDir, {
        ...handle.started, event_id: eventId(handle.started.invocation_id, 'interrupted'), sequence: handle.nextSequence,
        type: 'invocation-interrupted', recorded_at: terminal.finished_at,
        payload: { code: 'scheduler-interrupted', recovery: {
          owner_id: 'tenon-afk-scheduler',
          proof_ref: `afk-recovery-${digest(handle.started.invocation_id, terminal.run_record_id)}`,
        } },
      }, { attempt: handle.attempt, verify_interruption_recovery: async () => true })
    } else if (terminal.error !== undefined) {
      await appendSkillInvocationEvent(handle.changeDir, {
        ...handle.started, event_id: eventId(handle.started.invocation_id, 'failed'), sequence: handle.nextSequence,
        type: 'invocation-failed', recorded_at: terminal.finished_at, payload: { code: 'afk-run-failed' },
      }, { attempt: handle.attempt })
    } else {
      await appendSkillInvocationEvent(handle.changeDir, {
        ...handle.started, event_id: eventId(handle.started.invocation_id, 'completed'), sequence: handle.nextSequence,
        type: 'invocation-completed', recorded_at: terminal.finished_at,
        payload: { output: { schema_id: 'tenon-afk-skill-output/v1', fields: [{
          name: 'run_outcome', classification: 'project-data', digest: `sha256:${digest(JSON.stringify(terminal))}`,
          validator: { id: 'afk-run-outcome', status: 'pass' },
        }] }, adapter: handle.started.payload.adapter },
      }, { attempt: handle.attempt, verify_completed_adapter: async () => true })
    }
  }
}
