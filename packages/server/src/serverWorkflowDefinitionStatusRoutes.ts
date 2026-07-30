import { join } from 'node:path'
import {
  builtinWorkflow,
  compileWorkflow,
  resolveEffectiveWorkflowPlan,
  type PipelineState,
} from '@tenon/kernel'
import {
  assertWorkflowRootAnchor,
  readWorkflowForApi,
  WorkflowNotFoundError,
  type WorkflowRootAnchor,
} from './workflows.js'
import {
  projectWorkflowDefinitionStatus,
  type WorkflowDefinitionCurrent,
} from './workflowDefinitionStatus.js'

type WorkflowRootCheck =
  | { readonly ok: true; readonly anchor: WorkflowRootAnchor }
  | { readonly ok: false; readonly code: 403 | 404; readonly error: string }

export interface WorkflowDefinitionStatusRouteDeps {
  readonly workflowRootForRequest: (root: string) => WorkflowRootCheck
  readonly stateStorageExists: (changeDir: string) => boolean
  readonly readState: (changeDir: string) => Promise<PipelineState>
  readonly readCurrent: (anchor: WorkflowRootAnchor, workflow: string) => WorkflowDefinitionCurrent
}

export interface WorkflowDefinitionStatusRouteResult {
  readonly status: number
  readonly body: unknown
}

function isChangeName(name: string): boolean {
  return name !== '' && /^[a-zA-Z0-9_-]+$/.test(name) && !name.includes('..')
}

export function readCurrentWorkflowDefinition(
  anchor: WorkflowRootAnchor,
  workflow: string,
): WorkflowDefinitionCurrent {
  try {
    assertWorkflowRootAnchor(anchor)
    const plan = resolveEffectiveWorkflowPlan(workflow, (name) => {
      const definition = builtinWorkflow(name) ?? readWorkflowForApi(anchor, name)
      return compileWorkflow(definition)
    })
    if (plan === null) return { kind: 'missing' }
    assertWorkflowRootAnchor(anchor)
    return { kind: 'current', fingerprint: plan.workflowFingerprint }
  } catch (error) {
    return error instanceof WorkflowNotFoundError ? { kind: 'missing' } : { kind: 'invalid' }
  }
}

export async function resolveWorkflowDefinitionStatusRoute(
  rawUrl: string,
  path: string,
  deps: WorkflowDefinitionStatusRouteDeps,
): Promise<WorkflowDefinitionStatusRouteResult | null> {
  if (path !== '/api/workflow-definition-status') return null

  const params = new URL(rawUrl, 'http://localhost').searchParams
  const name = params.get('change') ?? ''
  if (!isChangeName(name)) {
    return { status: 400, body: { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' } }
  }
  const rootCheck = deps.workflowRootForRequest(params.get('root') ?? '')
  if (!rootCheck.ok) {
    return { status: rootCheck.code, body: { ok: false, error: rootCheck.error } }
  }
  const changeDir = join(rootCheck.anchor.path, 'openspec', 'changes', name)
  if (!deps.stateStorageExists(changeDir)) {
    return { status: 400, body: { ok: false, error: '找不到该 change（无 canonical/legacy 状态）' } }
  }

  let state: PipelineState
  try {
    state = await deps.readState(changeDir)
  } catch {
    return { status: 500, body: { ok: false, error: 'canonical change 读取失败' } }
  }
  const snapshot = state.runMetadata?.workflowPlanSnapshot
  const fieldWorkflow = state.fields.workflow
  const workflow = snapshot?.workflowId
    ?? (Array.isArray(fieldWorkflow) ? fieldWorkflow.join(',') : fieldWorkflow)
    ?? 'default'
  const frozenFingerprint = snapshot?.workflowFingerprint ?? null
  const current = frozenFingerprint === null
    ? { kind: 'invalid' } as const
    : deps.readCurrent(rootCheck.anchor, workflow)
  return {
    status: 200,
    body: projectWorkflowDefinitionStatus(workflow, frozenFingerprint, current),
  }
}
