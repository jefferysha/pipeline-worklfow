import type { WorkflowRootAnchor } from './workflows.js'
import type { ChangeSnapshot } from './types.js'
import { buildOrchestrationGraph } from './orchestrationGraph.js'
import type { WorkflowDefinitionStatusResponse } from './workflowDefinitionStatus.js'

type WorkflowRootCheck =
  | { readonly ok: true; readonly anchor: WorkflowRootAnchor }
  | { readonly ok: false; readonly code: 403 | 404; readonly error: string }

export interface OrchestrationGraphRouteDeps {
  readonly workflowRootForRequest: (root: string) => WorkflowRootCheck
  readonly readChange: (root: string, change: string) => Promise<ChangeSnapshot | null>
  readonly readDefinition: (root: string, change: string) => Promise<WorkflowDefinitionStatusResponse>
}

export interface OrchestrationGraphRouteResult {
  readonly status: number
  readonly body: unknown
}

function isChangeName(name: string): boolean {
  return name !== '' && /^[a-zA-Z0-9_-]+$/.test(name) && !name.includes('..')
}

export async function resolveOrchestrationGraphRoute(
  rawUrl: string,
  path: string,
  deps: OrchestrationGraphRouteDeps,
): Promise<OrchestrationGraphRouteResult | null> {
  if (path !== '/api/orchestration-graph') return null
  const params = new URL(rawUrl, 'http://localhost').searchParams
  const name = params.get('change') ?? ''
  if (!isChangeName(name)) {
    return { status: 400, body: { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' } }
  }
  const rootCheck = deps.workflowRootForRequest(params.get('root') ?? '')
  if (!rootCheck.ok) return { status: rootCheck.code, body: { ok: false, error: rootCheck.error } }

  try {
    const change = await deps.readChange(rootCheck.anchor.path, name)
    if (change === null) {
      return { status: 400, body: { ok: false, error: '找不到该 change（无 canonical/legacy 状态）' } }
    }
    const definition = await deps.readDefinition(rootCheck.anchor.path, name)
    return { status: 200, body: buildOrchestrationGraph({ root: rootCheck.anchor.path, change, definition }) }
  } catch {
    return { status: 500, body: { ok: false, error: '编排图读取失败' } }
  }
}
