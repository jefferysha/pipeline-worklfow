import type { WorkflowRootAnchor } from './workflows.js'

type WorkflowRootCheck =
  | { readonly ok: true; readonly anchor: WorkflowRootAnchor }
  | { readonly ok: false; readonly code: 403 | 404; readonly error: string }

export interface TaskPlanRouteDeps {
  readonly workflowRootForRequest: (root: string) => WorkflowRootCheck
  readonly readPlan: (anchor: WorkflowRootAnchor, change: string) => Promise<unknown | null>
}

export interface TaskPlanRouteResult {
  readonly status: number
  readonly body: unknown
}

function isChangeName(name: string): boolean {
  return name !== '' && /^[a-zA-Z0-9_-]+$/.test(name) && !name.includes('..')
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const status = Reflect.get(error, 'status')
  return typeof status === 'number' ? status : undefined
}

export async function resolveTaskPlanRoute(
  rawUrl: string,
  path: string,
  deps: TaskPlanRouteDeps,
): Promise<TaskPlanRouteResult | null> {
  const match = /^\/api\/task-plans\/([^/]+)$/.exec(path)
  if (match === null) return null
  const segment = match[1]
  if (segment === undefined) {
    return { status: 400, body: { ok: false, error: '非法 TaskPlan 路径' } }
  }
  let change: string
  try {
    change = decodeURIComponent(segment)
  } catch {
    return { status: 400, body: { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' } }
  }
  if (!isChangeName(change)) {
    return { status: 400, body: { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' } }
  }
  const root = new URL(rawUrl, 'http://localhost').searchParams.get('root') ?? ''
  if (root === '') return { status: 400, body: { ok: false, error: '缺少 root' } }
  const rootCheck = deps.workflowRootForRequest(root)
  if (!rootCheck.ok) {
    return {
      status: rootCheck.code,
      body: { ok: false, error: rootCheck.code === 404 ? 'root 未注册' : 'root 不可信' },
    }
  }
  try {
    const plan = await deps.readPlan(rootCheck.anchor, change)
    return plan === null
      ? { status: 404, body: { ok: false, error: 'TaskPlan 不存在' } }
      : { status: 200, body: plan }
  } catch (error) {
    if (errorStatus(error) === 403) {
      return { status: 403, body: { ok: false, error: 'canonical TaskPlan 路径不可信' } }
    }
    return { status: 409, body: { ok: false, error: 'canonical TaskPlan 损坏' } }
  }
}
