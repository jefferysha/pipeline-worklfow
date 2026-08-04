import { readCurrentRunRevision } from '../state/run-revision-store.js'
import { resolveNativeActiveDocumentSkill } from './document-confirmation.js'
import {
  appendSkillInvocationEvent,
  readSkillInvocationEventsForApplication,
  type AppendSkillInvocationEventOptions,
} from './repository.js'
import type {
  SkillInvocationEventV1,
  SkillInvocationFieldClassification,
  SkillInvocationQuestionPayloadV1,
} from './types.js'

export class SkillInvocationInteractionBindingError extends Error {
  override readonly name = 'SkillInvocationInteractionBindingError'
}

export interface HostSkillInvocationInteractionReceiptV1 {
  readonly schema_version: 'host-skill-interaction-receipt/v1'
  readonly receipt_id: string
  readonly recorded_at: string
  readonly binding: {
    readonly host_session_id: string
    readonly invocation_id?: string
  }
  readonly questions: readonly {
    readonly question: SkillInvocationQuestionPayloadV1
    readonly decision: {
      readonly selected_option_ids: readonly string[]
      readonly free_text?: {
        readonly classification: SkillInvocationFieldClassification
        readonly digest: string
      }
    }
  }[]
}

const safeId = (value: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/u.test(value)

function invocationGroups(events: readonly SkillInvocationEventV1[]): Map<string, SkillInvocationEventV1[]> {
  const groups = new Map<string, SkillInvocationEventV1[]>()
  for (const event of events) {
    const group = groups.get(event.invocation_id) ?? []
    group.push(event)
    groups.set(event.invocation_id, group)
  }
  return groups
}

function isCurrentIncomplete(
  events: readonly SkillInvocationEventV1[],
  runId: string,
  transitionSequence: number,
): boolean {
  const started = events.find((event) => event.type === 'invocation-started')
  return started !== undefined
    && started.subject.workflow_run_id === runId
    && started.subject.step_visit.run_id === runId
    && started.subject.step_visit.transition_sequence === transitionSequence
    && !events.some((event) => event.type === 'invocation-completed'
      || event.type === 'invocation-failed'
      || event.type === 'invocation-interrupted')
}

/** Host hook application command. It chooses the invocation from canonical state, never caller binding. */
export async function recordHostSkillInvocationInteraction(
  changeDir: string,
  receipt: HostSkillInvocationInteractionReceiptV1,
): Promise<void> {
  if (!safeId(receipt.receipt_id) || receipt.questions.length === 0 || receipt.questions.length > 3) {
    throw new SkillInvocationInteractionBindingError('host interaction receipt identity or question count is invalid')
  }
  const current = await readCurrentRunRevision(changeDir)
  const metadata = current?.state.runMetadata
  if (metadata === undefined) throw new SkillInvocationInteractionBindingError('canonical WorkflowRun identity is missing')
  const active = await resolveNativeActiveDocumentSkill(changeDir, {
    sessionId: receipt.binding.host_session_id,
    observedAt: receipt.recorded_at,
    ...(receipt.binding.invocation_id === undefined ? {} : { invocationId: receipt.binding.invocation_id }),
  })
  if (active === undefined) {
    throw new SkillInvocationInteractionBindingError('host interaction lacks one exact active Skill invocation in this session')
  }
  const allEvents = await readSkillInvocationEventsForApplication(changeDir)
  const invocationEvents = invocationGroups(allEvents).get(active.invocationId)
  if (invocationEvents === undefined
    || !isCurrentIncomplete(invocationEvents, metadata.runId, metadata.transitionSequence)) {
    throw new SkillInvocationInteractionBindingError('active host Skill invocation does not match the canonical StepVisit')
  }
  const started = invocationEvents.find((event): event is Extract<SkillInvocationEventV1, { type: 'invocation-started' }> =>
    event.type === 'invocation-started')
  if (started === undefined) throw new SkillInvocationInteractionBindingError('invocation start is missing')
  const options: AppendSkillInvocationEventOptions = {
    ...(started.subject.attempt === undefined ? {} : { attempt: started.subject.attempt }),
  }
  let sequence = Math.max(...invocationEvents.map((event) => event.sequence)) + 1
  for (const [index, item] of receipt.questions.entries()) {
    if (!item.question.shown || item.question.requiredness !== 'hard-gate') {
      throw new SkillInvocationInteractionBindingError('host response receipt must describe an actually shown hard-gate question')
    }
    if (item.decision.selected_option_ids.length === 0 && item.decision.free_text === undefined) {
      throw new SkillInvocationInteractionBindingError('host response receipt has an empty answer')
    }
    const questionId = `${started.invocation_id}-${receipt.receipt_id}-q${index + 1}`
    const questionEvent: SkillInvocationEventV1 = {
      ...started,
      event_id: `${questionId}-shown`,
      sequence,
      type: 'question-recorded',
      recorded_at: receipt.recorded_at,
      payload: { ...item.question, question_id: questionId },
    }
    await appendSkillInvocationEvent(changeDir, questionEvent, options)
    sequence += 1
    await appendSkillInvocationEvent(changeDir, {
      ...started,
      event_id: `${questionId}-answered`,
      sequence,
      type: 'decision-recorded',
      recorded_at: receipt.recorded_at,
      payload: {
        decision_id: `${started.invocation_id}-${receipt.receipt_id}-d${index + 1}`,
        question_id: questionId,
        mode: 'user-answer',
        selected_option_ids: [...item.decision.selected_option_ids],
        ...(item.decision.free_text === undefined ? {} : { free_text: { ...item.decision.free_text } }),
      },
    }, options)
    sequence += 1
  }
}
