import { WorkflowPathError, WorkflowReadError, type WorkflowRootAnchor } from './workflows.js'
import type { ChangeSnapshot } from './types.js'
import { buildOrchestrationGraph, OrchestrationGraphLimitError } from './orchestrationGraph.js'
import { ContextBundlePathError } from './contextBundlePreviewSupport.js'

type WorkflowRootCheck =
  | { readonly ok: true; readonly anchor: WorkflowRootAnchor }
  | { readonly ok: false; readonly code: 403 | 404; readonly error: string }

export interface OrchestrationGraphRouteDeps {
  readonly workflowRootForRequest: (root: string) => WorkflowRootCheck
  readonly readChange: (root: WorkflowRootAnchor, change: string) => Promise<ChangeSnapshot | null>
}

export interface OrchestrationGraphRouteResult {
  readonly status: number
  readonly body: unknown
}

export const ORCHESTRATION_GRAPH_ERROR_CODES = [
  'ORCHESTRATION_ROOT_REQUIRED',
  'ORCHESTRATION_ROOT_NOT_REGISTERED',
  'ORCHESTRATION_ROOT_FORBIDDEN',
  'ORCHESTRATION_CHANGE_INVALID',
  'ORCHESTRATION_CHANGE_NOT_FOUND',
  'ORCHESTRATION_CHANGE_FORBIDDEN',
  'ORCHESTRATION_CHANGE_UNREADABLE',
  'ORCHESTRATION_DEFINITION_FORBIDDEN',
  'ORCHESTRATION_DEFINITION_UNREADABLE',
  'ORCHESTRATION_GRAPH_LIMIT_EXCEEDED',
] as const

type OrchestrationGraphErrorCode = (typeof ORCHESTRATION_GRAPH_ERROR_CODES)[number]

function failure(status: number, code: OrchestrationGraphErrorCode, error: string): OrchestrationGraphRouteResult {
  return { status, body: { ok: false, code, error } }
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
    return failure(400, 'ORCHESTRATION_CHANGE_INVALID', '非法 change 名（仅允许 a-z A-Z 0-9 - _）')
  }
  const root = params.get('root') ?? ''
  if (root === '') return failure(400, 'ORCHESTRATION_ROOT_REQUIRED', '缺少 root 参数')
  const rootCheck = deps.workflowRootForRequest(root)
  if (!rootCheck.ok) {
    return failure(
      rootCheck.code,
      rootCheck.code === 404 ? 'ORCHESTRATION_ROOT_NOT_REGISTERED' : 'ORCHESTRATION_ROOT_FORBIDDEN',
      rootCheck.code === 404 ? 'root 未注册' : 'root 不可信',
    )
  }

  let change: ChangeSnapshot | null
  try {
    change = await deps.readChange(rootCheck.anchor, name)
  } catch (error) {
    if (error instanceof WorkflowPathError) {
      return failure(403, 'ORCHESTRATION_DEFINITION_FORBIDDEN', 'Workflow 定义路径不可信')
    }
    if (error instanceof WorkflowReadError) {
      return failure(500, 'ORCHESTRATION_DEFINITION_UNREADABLE', '编排图读取失败')
    }
    if (error instanceof ContextBundlePathError && error.status === 403) {
      return failure(403, 'ORCHESTRATION_CHANGE_FORBIDDEN', 'Change 路径不可信')
    }
    return failure(500, 'ORCHESTRATION_CHANGE_UNREADABLE', '编排图读取失败')
  }
  if (change === null) {
    return failure(404, 'ORCHESTRATION_CHANGE_NOT_FOUND', '找不到该 change（无 canonical/legacy 状态）')
  }
  if (change.workflowDefinition === undefined) {
    return failure(500, 'ORCHESTRATION_DEFINITION_UNREADABLE', '编排图读取失败')
  }
  try {
    return {
      status: 200,
      body: buildOrchestrationGraph({
        root: rootCheck.anchor.path,
        change,
        definition: change.workflowDefinition,
      }),
    }
  } catch (error) {
    if (error instanceof OrchestrationGraphLimitError) {
      return failure(413, 'ORCHESTRATION_GRAPH_LIMIT_EXCEEDED', '编排图超过安全上限')
    }
    throw error
  }
}
