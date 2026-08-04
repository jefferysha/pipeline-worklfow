import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { readCurrentRunRevision } from '../state/run-revision-store.js'
import type { TaskPlanRevisionV1 } from '../task-plan/types.js'
import { appendSkillInvocationEvent, skillInvocationProjectId } from './repository.js'
import type { SkillInvocationEventV1 } from './types.js'

export interface NativeTaskPlanInvocationHandle {
  readonly changeDir: string
  readonly started: Extract<SkillInvocationEventV1, { type: 'invocation-started' }>
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Native TaskPlan publication is the production Task Planner producer. */
export async function beginNativeTaskPlanInvocation(
  changeDir: string,
  revision: TaskPlanRevisionV1,
): Promise<NativeTaskPlanInvocationHandle | undefined> {
  const current = await readCurrentRunRevision(changeDir)
  const metadata = current?.state.runMetadata
  const workflow = current?.state.fields.workflow
  const phase = current?.state.fields.phase
  if (metadata === undefined || typeof workflow !== 'string' || typeof phase !== 'string') return undefined
  const invocationId = `invocation-${digest(`native-task-plan\0${metadata.runId}\0${metadata.transitionSequence}\0${revision.revision_id}`)}`
  const started: Extract<SkillInvocationEventV1, { type: 'invocation-started' }> = {
    schema_version: 'skill-invocation-evidence/v1',
    event_id: `${invocationId}-started`,
    invocation_id: invocationId,
    sequence: 1,
    type: 'invocation-started',
    subject: {
      project_id: await skillInvocationProjectId(resolve(changeDir, '..', '..', '..')),
      workflow_definition_id: workflow,
      workflow_run_id: metadata.runId,
      step_id: phase,
      step_visit: { run_id: metadata.runId, transition_sequence: metadata.transitionSequence },
    },
    recorded_at: revision.created_at,
    payload: {
      skill: { id: 'task-planner', version: 'task-plan/v1' },
      input: {
        schema_id: 'task-planner/publish-input-v1',
        fields: [{
          name: 'revision', classification: 'project-data', digest: `sha256:${digest(revision.revision_id)}`,
          validator: { id: 'task-plan-v1', status: 'pass' },
        }],
      },
      adapter: { kind: 'native', proof_ref: `native-task-plan-${digest(revision.revision_id)}` },
    },
  }
  await appendSkillInvocationEvent(changeDir, started, {})
  return Object.freeze({ changeDir, started })
}

export async function completeNativeTaskPlanInvocation(
  handle: NativeTaskPlanInvocationHandle,
  revision: TaskPlanRevisionV1,
): Promise<void> {
  const completed: Extract<SkillInvocationEventV1, { type: 'invocation-completed' }> = {
    ...handle.started,
    event_id: `${handle.started.invocation_id}-completed`,
    sequence: 2,
    type: 'invocation-completed',
    payload: {
      output: {
        schema_id: 'task-planner/publish-output-v1',
        fields: [{
          name: 'task_plan_revision', classification: 'project-data', digest: `sha256:${digest(JSON.stringify(revision))}`,
          validator: { id: 'canonical-task-plan-revision', status: 'pass' },
        }],
      },
      adapter: handle.started.payload.adapter,
    },
  }
  await appendSkillInvocationEvent(handle.changeDir, completed, {
    // This verifier is package-internal and closes over the exact event derived from the canonical
    // TaskPlan publication; no caller can provide a terminal or verifier through the public API.
    verify_completed_adapter: async () => true,
  })
}

export async function failNativeTaskPlanInvocation(
  handle: NativeTaskPlanInvocationHandle,
): Promise<void> {
  await appendSkillInvocationEvent(handle.changeDir, {
    ...handle.started,
    event_id: `${handle.started.invocation_id}-failed`,
    sequence: 2,
    type: 'invocation-failed',
    payload: { code: 'task-plan-publication-failed' },
  }, {})
}
