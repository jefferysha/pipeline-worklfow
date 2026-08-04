import { appendTaskRunOperation } from '@tenon/automation'
import type {
  TaskRunOperationFact,
  TaskRunReadModelV1,
} from '@tenon/kernel'
import type { WorkflowRootAnchor } from './workflows.js'
import { readTaskRunForChange } from './serverTaskRunRoutes.js'

type WorkflowRootCheck =
  | { readonly ok: true; readonly anchor: WorkflowRootAnchor }
  | { readonly ok: false; readonly code: 403 | 404; readonly error: string }

export interface TaskRunOperationRouteDeps {
  readonly workflowRootForRequest: (root: string) => WorkflowRootCheck
  readonly mutateRun: (
    anchor: WorkflowRootAnchor,
    change: string,
    operation: TaskRunOperationFact,
  ) => Promise<TaskRunReadModelV1>
  readonly clock: () => string
  readonly operationId: () => string
}

type TaskRunOperationErrorCode =
  | 'TASK_RUN_CHANGE_INVALID'
  | 'TASK_RUN_OPERATION_INVALID'
  | 'TASK_RUN_ROOT_NOT_REGISTERED'
  | 'TASK_RUN_ROOT_FORBIDDEN'
  | 'TASK_RUN_OPERATION_CONFLICT'
  | 'TASK_RUN_PATH_FORBIDDEN'
  | 'TASK_RUN_CORRUPT'

type TaskRunOperationResult =
  | { readonly status: 200; readonly body: TaskRunReadModelV1 }
  | {
      readonly status: 400 | 403 | 404 | 409
      readonly body: { readonly ok: false; readonly code: TaskRunOperationErrorCode; readonly error: string }
    }

export class TaskRunOperationConflictError extends Error {
  override readonly name = 'TaskRunOperationConflictError'
  readonly code = 'TASK_RUN_OPERATION_CONFLICT'
}

function failure(
  status: 400 | 403 | 404 | 409,
  code: TaskRunOperationErrorCode,
  error: string,
): TaskRunOperationResult {
  return { status, body: { ok: false, code, error } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeIdentity(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value) && !value.includes('..')
}

function safeChange(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(value)
}

function parseBody(value: unknown): { readonly root: string; readonly operation: Omit<TaskRunOperationFact, 'operation_id' | 'recorded_at'> } | null {
  if (!isRecord(value)) return null
  const keys = Object.keys(value).sort()
  const allowed = ['expected_run_revision', 'expected_state', 'operation', 'root', 'work_item_id']
  if (keys.some((key) => !allowed.includes(key))) return null
  if (typeof value.root !== 'string' || value.root === ''
    || !['retry', 'cancel', 'resume'].includes(String(value.operation))
    || !Number.isSafeInteger(value.expected_run_revision) || Number(value.expected_run_revision) < 0
    || typeof value.expected_state !== 'string' || value.expected_state === '' || value.expected_state.length > 64) {
    return null
  }
  const operation = value.operation as TaskRunOperationFact['operation']
  if (operation === 'resume') {
    if (value.work_item_id !== undefined) return null
    return {
      root: value.root,
      operation: {
        operation,
        expected_run_revision: Number(value.expected_run_revision),
        expected_state: value.expected_state,
      },
    }
  }
  if (typeof value.work_item_id !== 'string' || !safeIdentity(value.work_item_id)) return null
  return {
    root: value.root,
    operation: {
      operation,
      work_item_id: value.work_item_id,
      expected_run_revision: Number(value.expected_run_revision),
      expected_state: value.expected_state,
    },
  }
}

function errorField(error: unknown, field: string): unknown {
  return typeof error === 'object' && error !== null ? Reflect.get(error, field) : undefined
}

export async function resolveTaskRunOperation(
  path: string,
  body: unknown,
  deps: TaskRunOperationRouteDeps,
): Promise<TaskRunOperationResult | null> {
  const match = /^\/api\/task-runs\/([^/]+)\/operations$/.exec(path)
  if (match === null) return null
  const segment = match[1]
  let change: string
  try {
    change = decodeURIComponent(segment ?? '')
  } catch {
    return failure(400, 'TASK_RUN_CHANGE_INVALID', '非法 change 名')
  }
  if (!safeChange(change)) return failure(400, 'TASK_RUN_CHANGE_INVALID', '非法 change 名')
  const parsed = parseBody(body)
  if (parsed === null) return failure(400, 'TASK_RUN_OPERATION_INVALID', 'Task Run 操作请求无效')
  const rootCheck = deps.workflowRootForRequest(parsed.root)
  if (!rootCheck.ok) {
    return rootCheck.code === 404
      ? failure(404, 'TASK_RUN_ROOT_NOT_REGISTERED', 'root 未注册')
      : failure(403, 'TASK_RUN_ROOT_FORBIDDEN', 'root 不可信')
  }
  try {
    const result = await deps.mutateRun(rootCheck.anchor, change, {
      operation_id: deps.operationId(),
      ...parsed.operation,
      recorded_at: deps.clock(),
    })
    return { status: 200, body: result }
  } catch (error) {
    if (errorField(error, 'status') === 403) {
      return failure(403, 'TASK_RUN_PATH_FORBIDDEN', 'Task Run 路径不可信')
    }
    if (errorField(error, 'code') === 'TASK_RUN_OPERATION_CONFLICT'
      || errorField(error, 'name') === 'TaskRunRevisionConflictError') {
      return failure(409, 'TASK_RUN_OPERATION_CONFLICT', 'Task Run 已变化，请刷新后重试')
    }
    return failure(409, 'TASK_RUN_CORRUPT', 'Task Run 损坏')
  }
}

export async function applyTaskRunOperationForChange(
  changeDir: string,
  operation: TaskRunOperationFact,
): Promise<TaskRunReadModelV1> {
  const current = await readTaskRunForChange(changeDir)
  if (current === null) throw new TaskRunOperationConflictError('Task Run is missing')
  const allowed = current.allowed_operations.some((candidate) =>
    candidate.operation === operation.operation
    && candidate.work_item_id === operation.work_item_id
    && candidate.expected_run_revision === operation.expected_run_revision
    && candidate.expected_state === operation.expected_state)
  if (!allowed) throw new TaskRunOperationConflictError('Task Run operation is no longer allowed')
  await appendTaskRunOperation(changeDir, current.plan.revision_id, operation)
  const updated = await readTaskRunForChange(changeDir)
  if (updated === null) throw new TaskRunOperationConflictError('Task Run disappeared')
  return updated
}
