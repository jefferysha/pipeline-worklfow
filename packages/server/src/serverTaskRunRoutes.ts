import {
  compileTaskSchedule,
  deriveTaskRunReadModel,
  readTaskPlanForChange,
  type TaskPlanExecutionPlan,
  type TaskRunAdmissionV1,
  type TaskRunReadModelV1,
} from '@tenon/kernel'
import { readTaskRunJournal } from '@tenon/automation'
import type { WorkflowRootAnchor } from './workflows.js'

type WorkflowRootCheck =
  | { readonly ok: true; readonly anchor: WorkflowRootAnchor }
  | { readonly ok: false; readonly code: 403 | 404; readonly error: string }

export interface TaskRunRouteDeps {
  readonly workflowRootForRequest: (root: string) => WorkflowRootCheck
  readonly readRun: (anchor: WorkflowRootAnchor, change: string) => Promise<TaskRunReadModelV1 | null>
}

export const TASK_RUN_ERROR_CODES = [
  'TASK_RUN_CHANGE_INVALID',
  'TASK_RUN_ROOT_REQUIRED',
  'TASK_RUN_ROOT_NOT_REGISTERED',
  'TASK_RUN_ROOT_FORBIDDEN',
  'TASK_RUN_NOT_FOUND',
  'TASK_RUN_PATH_FORBIDDEN',
  'TASK_RUN_CORRUPT',
] as const

export type TaskRunErrorCode = (typeof TASK_RUN_ERROR_CODES)[number]

export interface TaskRunErrorResponse {
  readonly ok: false
  readonly code: TaskRunErrorCode
  readonly error: string
}

export type TaskRunRouteResult =
  | { readonly status: 200; readonly body: TaskRunReadModelV1 }
  | { readonly status: 400 | 403 | 404 | 409; readonly body: TaskRunErrorResponse }

function isChangeName(name: string): boolean {
  return name !== '' && /^[a-zA-Z0-9_-]+$/.test(name) && !name.includes('..')
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const status = Reflect.get(error, 'status')
  return typeof status === 'number' ? status : undefined
}

function failure(
  status: 400 | 403 | 404 | 409,
  code: TaskRunErrorCode,
  error: string,
): TaskRunRouteResult {
  return { status, body: { ok: false, code, error } }
}

export async function resolveTaskRunRoute(
  rawUrl: string,
  path: string,
  deps: TaskRunRouteDeps,
): Promise<TaskRunRouteResult | null> {
  const match = /^\/api\/task-runs\/([^/]+)$/.exec(path)
  if (match === null) return null
  const segment = match[1]
  if (segment === undefined) {
    return failure(400, 'TASK_RUN_CHANGE_INVALID', '非法 Task Run 路径')
  }
  let change: string
  try {
    change = decodeURIComponent(segment)
  } catch {
    return failure(400, 'TASK_RUN_CHANGE_INVALID', '非法 change 名（仅允许 a-z A-Z 0-9 - _）')
  }
  if (!isChangeName(change)) {
    return failure(400, 'TASK_RUN_CHANGE_INVALID', '非法 change 名（仅允许 a-z A-Z 0-9 - _）')
  }
  const root = new URL(rawUrl, 'http://localhost').searchParams.get('root') ?? ''
  if (root === '') return failure(400, 'TASK_RUN_ROOT_REQUIRED', '缺少 root')
  const rootCheck = deps.workflowRootForRequest(root)
  if (!rootCheck.ok) {
    return rootCheck.code === 404
      ? failure(404, 'TASK_RUN_ROOT_NOT_REGISTERED', 'root 未注册')
      : failure(403, 'TASK_RUN_ROOT_FORBIDDEN', 'root 不可信')
  }
  try {
    const run = await deps.readRun(rootCheck.anchor, change)
    return run === null
      ? failure(404, 'TASK_RUN_NOT_FOUND', 'Task Run 不存在')
      : { status: 200, body: run }
  } catch (error) {
    if (errorStatus(error) === 403) {
      return failure(403, 'TASK_RUN_PATH_FORBIDDEN', 'Task Run 路径不可信')
    }
    return failure(409, 'TASK_RUN_CORRUPT', 'Task Run 损坏')
  }
}

const missingAdmission: TaskRunAdmissionV1 = {
  status: 'blocked',
  blockers: [{
    code: 'AUTHORITATIVE_ADMISSION_MISSING',
    detail: 'Authoritative frozen WorkflowRun admission evidence is unavailable.',
    remediation: 'RECHECK_PRE_CLAIM_ADMISSION',
  }],
}

export async function readTaskRunForChange(
  changeDir: string,
  admission: TaskRunAdmissionV1 = missingAdmission,
): Promise<TaskRunReadModelV1 | null> {
  const readModel = await readTaskPlanForChange(changeDir)
  if (readModel === null || readModel.source !== 'canonical') return null
  const plan: TaskPlanExecutionPlan = {
    plan_id: readModel.plan_id,
    revision_id: readModel.revision_id,
    revision_number: readModel.revision_number,
    fingerprint: readModel.fingerprint,
    status: readModel.revision_status,
    groups: readModel.groups,
    work_items: readModel.items,
  }
  const journal = await readTaskRunJournal(changeDir, readModel.revision_id)
  return deriveTaskRunReadModel({
    plan,
    schedule: compileTaskSchedule(plan),
    attempts: journal.attempts,
    operations: journal.operations,
    validator_verdicts: journal.validator_verdicts,
    admission,
    run_revision: journal.run_revision,
  })
}
