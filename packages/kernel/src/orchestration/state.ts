import type {
  ApplyCommandResult,
  BoardCommandV1,
  BoardSnapshotV1,
  ChangeStatusV1,
  GateEvaluationV1,
  RepositoryContextSnapshotV1,
  SkillResultEnvelopeV1,
  SkillRunV1,
  ValidationReportV1,
  WorkGraphV1,
  WorkItemRuntimeV1,
} from './types.js'
import { BOARD_SNAPSHOT_SCHEMA, type DevelopmentRequestV1 } from './types.js'

function ok(state: BoardSnapshotV1): ApplyCommandResult {
  return { ok: true, state: freezeSnapshot(state) }
}

function failure(
  code: Exclude<ApplyCommandResult, { readonly ok: true }>['code'],
  message: string,
): ApplyCommandResult {
  return { ok: false, code, message }
}

function freezeSnapshot(state: BoardSnapshotV1): BoardSnapshotV1 {
  return Object.freeze({
    ...state,
    work_items: Object.freeze([...state.work_items]),
    runs: Object.freeze([...state.runs]),
    validations: Object.freeze([...state.validations]),
    gates: Object.freeze([...state.gates]),
  })
}

export function createOrchestrationState(request: DevelopmentRequestV1, now = request.created_at): BoardSnapshotV1 {
  return freezeSnapshot({
    schema_version: BOARD_SNAPSHOT_SCHEMA,
    change_id: request.change_id,
    revision: 0,
    status: 'draft',
    request,
    work_items: [],
    runs: [],
    validations: [],
    gates: [],
    updated_at: now,
  })
}

function commandPrelude(state: BoardSnapshotV1, command: BoardCommandV1): ApplyCommandResult | undefined {
  if (command.change_id !== state.change_id) return failure('contract-invalid', 'command.change_id 与状态不匹配')
  if (command.expected_revision !== state.revision) return failure(
    'revision-conflict',
    `expected_revision=${command.expected_revision} 与当前 revision=${state.revision} 不一致`,
  )
  if (state.status === 'cancelled' && command.type !== 'cancel') return failure('invalid-transition', '已取消的 Change 不能继续执行')
  return undefined
}

function commit(state: BoardSnapshotV1, command: BoardCommandV1, patch: Partial<BoardSnapshotV1>): BoardSnapshotV1 {
  return {
    ...state,
    ...patch,
    revision: state.revision + 1,
    updated_at: command.issued_at,
  }
}

function transition(state: BoardSnapshotV1, allowed: readonly ChangeStatusV1[], next: ChangeStatusV1, command: BoardCommandV1): ApplyCommandResult | BoardSnapshotV1 {
  if (!allowed.includes(state.status)) return failure('invalid-transition', `当前状态 ${state.status} 不允许转移到 ${next}`)
  return commit(state, command, { status: next })
}

function findItem(state: BoardSnapshotV1, id: string): WorkItemRuntimeV1 | undefined {
  return state.work_items.find((item) => item.work_item_id === id)
}

function replaceItem(items: readonly WorkItemRuntimeV1[], replacement: WorkItemRuntimeV1): readonly WorkItemRuntimeV1[] {
  return items.map((item) => item.work_item_id === replacement.work_item_id ? replacement : item)
}

function findRun(state: BoardSnapshotV1, id: string): SkillRunV1 | undefined {
  return state.runs.find((run) => run.run_id === id)
}

function allItemsCompleted(state: BoardSnapshotV1, items = state.work_items): boolean {
  return items.length > 0 && items.every((item) => item.status === 'completed')
}

function dependenciesCompleted(state: BoardSnapshotV1, itemId: string): boolean {
  const planItem = state.graph?.task_plan.work_items.find((item) => item.id === itemId)
  if (planItem === undefined) return false
  return planItem.depends_on.every((dependencyId) => findItem(state, dependencyId)?.status === 'completed')
}

function promoteReadyItems(state: BoardSnapshotV1, items: readonly WorkItemRuntimeV1[]): readonly WorkItemRuntimeV1[] {
  return items.map((item) => {
    if (item.status !== 'pending' || !dependenciesCompleted(state, item.work_item_id)) return item
    return { ...item, status: 'ready' }
  })
}

function initialItems(graph: WorkGraphV1): readonly WorkItemRuntimeV1[] {
  return graph.task_plan.work_items.map((item) => ({
    work_item_id: item.id,
    status: item.depends_on.length === 0 ? 'ready' : 'pending',
    attempt: 0,
  }))
}

function selectedSkillExists(state: BoardSnapshotV1, skillId: string, version: string): boolean {
  return state.resolution?.selected_skills.some((skill) => skill.id === skillId && skill.version === version) ?? false
}

function runFromCommand(state: BoardSnapshotV1, command: Extract<BoardCommandV1, { type: 'begin-skill-run' }>): SkillRunV1 {
  const item = findItem(state, command.work_item_id)
  return {
    schema_version: 'skill-run/v1',
    run_id: command.run_id,
    work_item_id: command.work_item_id,
    skill_id: command.skill_id,
    skill_version: command.skill_version,
    attempt: (item?.attempt ?? 0) + 1,
    status: 'running',
    requested_at: command.now,
    claimed_at: command.now,
    started_at: command.now,
  }
}

function runResultPatch(run: SkillRunV1, result: SkillResultEnvelopeV1, now: string): SkillRunV1 {
  const terminalStatus = result.status === 'completed' ? 'completed' : 'failed'
  return { ...run, status: terminalStatus, finished_at: now, result_id: result.result_id,
    ...(terminalStatus === 'failed' ? { error_code: result.status } : {}) }
}

function gateIsSuccessful(gate: GateEvaluationV1): boolean {
  return gate.status === 'passed' || gate.status === 'waived'
}

export function applyBoardCommand(state: BoardSnapshotV1, command: BoardCommandV1): ApplyCommandResult {
  const prelude = commandPrelude(state, command)
  if (prelude !== undefined) return prelude

  switch (command.type) {
    case 'record-assessment': {
      if (!['draft', 'contextualizing', 'assessing', 'waiting-input', 'blocked'].includes(state.status)) {
        return failure('invalid-transition', `当前状态 ${state.status} 不能记录 assessment`)
      }
      if (command.assessment.request_id !== state.request.request_id || command.context.project_id !== state.request.project_id) {
        return failure('contract-invalid', 'assessment/context 未绑定当前 request/project')
      }
      const nextStatus: ChangeStatusV1 = command.assessment.status === 'complete' ? 'planning' : 'waiting-input'
      const context: RepositoryContextSnapshotV1 = command.context
      return ok(commit(state, command, { status: nextStatus, assessment: command.assessment, context }))
    }
    case 'attach-work-graph': {
      const next = transition(state, ['planning'], 'planned', command)
      if ('ok' in next) return next
      if (command.graph.change_id !== state.change_id) return failure('contract-invalid', 'graph.change_id 与状态不匹配')
      if (command.graph.task_plan.status !== 'frozen') return failure('contract-invalid', '只有 frozen TaskPlanRevision 才能进入执行图')
      return ok(commit(state, command, { status: 'planned', graph: command.graph, work_items: initialItems(command.graph) }))
    }
    case 'resolve-capabilities': {
      if (state.status !== 'planned') return failure('invalid-transition', `当前状态 ${state.status} 不能解析能力`)
      if (command.resolution.assessment_id !== state.assessment?.assessment_id) return failure('contract-invalid', 'resolution 未绑定当前 assessment')
      return ok(commit(state, command, { status: command.resolution.status === 'resolved' ? 'ready' : command.resolution.status === 'needs-input' ? 'waiting-input' : 'blocked', resolution: command.resolution }))
    }
    case 'start': {
      const next = transition(state, ['ready'], 'executing', command)
      if (!('ok' in next) && state.work_items.length === 0) return failure('contract-invalid', '没有可执行的 work item')
      return 'ok' in next ? next : ok(next)
    }
    case 'claim-work-item': {
      const item = findItem(state, command.work_item_id)
      if (item === undefined) return failure('not-found', `找不到 work item ${command.work_item_id}`)
      if (!['ready', 'queued'].includes(item.status)) return failure('invalid-transition', `work item ${item.work_item_id} 当前为 ${item.status}`)
      if (command.worker_id.trim() === '') return failure('contract-invalid', 'worker_id 不能为空')
      if (!dependenciesCompleted(state, item.work_item_id)) return failure('blocked', `work item ${item.work_item_id} 的依赖尚未完成`)
      const nextItem: WorkItemRuntimeV1 = { ...item, status: 'running', blocked_reason: undefined }
      const items = replaceItem(state.work_items, nextItem)
      return ok(commit(state, command, { status: 'executing', work_items: items }))
    }
    case 'begin-skill-run': {
      const item = findItem(state, command.work_item_id)
      if (item === undefined) return failure('not-found', `找不到 work item ${command.work_item_id}`)
      if (item.status !== 'running') return failure('invalid-transition', '只有 running work item 才能开始 Skill run')
      if (item.active_run_id !== undefined) return failure('invalid-transition', '同一 work item 已有 active run')
      if (!selectedSkillExists(state, command.skill_id, command.skill_version)) return failure('contract-invalid', 'Skill 不在当前 resolution 中')
      if (findRun(state, command.run_id) !== undefined) return failure('contract-invalid', `run_id ${command.run_id} 已存在`)
      return ok(commit(state, command, { runs: [...state.runs, runFromCommand(state, command)], work_items: replaceItem(state.work_items, { ...item, active_run_id: command.run_id }) }))
    }
    case 'complete-skill-run': {
      const run = findRun(state, command.run_id)
      if (run === undefined) return failure('not-found', `找不到 run ${command.run_id}`)
      if (run.status !== 'running') return failure('invalid-transition', `run ${run.run_id} 当前为 ${run.status}`)
      if (command.result.run_id !== run.run_id || command.result.result_id === '') return failure('contract-invalid', 'result 未正确绑定 run')
      const updatedRun = runResultPatch(run, command.result, command.issued_at)
      const currentItem = findItem(state, run.work_item_id)
      if (currentItem === undefined) return failure('not-found', `找不到 run 对应 work item ${run.work_item_id}`)
      const contractProven = command.result.status === 'completed' && command.result.contract_status === 'validated'
      const nextItem: WorkItemRuntimeV1 = contractProven
        ? { ...currentItem, status: 'reviewing', active_run_id: undefined }
        : { ...currentItem, status: command.result.status === 'failed' ? 'failed' : 'blocked', active_run_id: undefined,
            blocked_reason: command.result.contract_status === 'validated' ? command.result.status : 'result-contract-unproven' }
      const nextStatus: ChangeStatusV1 = contractProven ? 'reviewing' : (command.result.status === 'failed' ? 'failed' : 'blocked')
      return ok(commit(state, command, {
        status: nextStatus,
        runs: state.runs.map((candidate) => candidate.run_id === run.run_id ? updatedRun : candidate),
        work_items: replaceItem(state.work_items, nextItem),
      }))
    }
    case 'record-validation': {
      const item = findItem(state, command.report.work_item_id)
      if (item === undefined) return failure('not-found', `找不到 work item ${command.report.work_item_id}`)
      if (item.status !== 'reviewing') return failure('invalid-transition', '只有 reviewing work item 才能验证')
      const pass = command.report.status === 'pass' && command.report.checks.every((check) => check.status === 'pass')
      const nextItem: WorkItemRuntimeV1 = pass
        ? { ...item, status: 'completed', blocked_reason: undefined }
        : { ...item, status: 'blocked', blocked_reason: 'validation-failed' }
      const promoted = promoteReadyItems({ ...state, work_items: replaceItem(state.work_items, nextItem) }, replaceItem(state.work_items, nextItem))
      const nextStatus: ChangeStatusV1 = pass
        ? (allItemsCompleted(state, promoted) ? 'verifying' : 'executing')
        : 'blocked'
      return ok(commit(state, command, {
        status: nextStatus,
        work_items: promoted,
        validations: [...state.validations, command.report],
      }))
    }
    case 'evaluate-gate': {
      if (!['verifying', 'reviewing', 'ready'].includes(state.status)) return failure('invalid-transition', `当前状态 ${state.status} 不能评估 gate`)
      if (command.gate.change_id !== state.change_id) return failure('contract-invalid', 'gate.change_id 与状态不匹配')
      if (command.gate.status === 'waived' && (command.gate.rationale === undefined || command.gate.rationale.trim() === '')) {
        return failure('contract-invalid', 'waive gate 必须提供 rationale')
      }
      const gates = [...state.gates, command.gate]
      const complete = allItemsCompleted(state) && gateIsSuccessful(command.gate)
      return ok(commit(state, command, { status: complete ? 'completed' : (gateIsSuccessful(command.gate) ? 'verifying' : 'blocked'), gates }))
    }
    case 'pause': {
      if (!['executing', 'reviewing', 'verifying', 'ready'].includes(state.status)) return failure('invalid-transition', `当前状态 ${state.status} 不能暂停`)
      if (command.reason.trim() === '') return failure('contract-invalid', 'pause 必须提供 reason')
      const resumeStatus = state.status as Exclude<ChangeStatusV1, 'paused'>
      return ok(commit(state, command, { status: 'paused', resume_status: resumeStatus }))
    }
    case 'resume': {
      if (state.status !== 'paused' || state.resume_status === undefined) return failure('invalid-transition', '当前状态不是可恢复的 paused')
      return ok(commit(state, command, { status: state.resume_status, resume_status: undefined }))
    }
    case 'retry-work-item': {
      const item = findItem(state, command.work_item_id)
      if (item === undefined) return failure('not-found', `找不到 work item ${command.work_item_id}`)
      if (!['failed', 'blocked'].includes(item.status)) return failure('invalid-transition', '只有 failed/blocked work item 才能 retry')
      const nextItem: WorkItemRuntimeV1 = { ...item, status: dependenciesCompleted(state, item.work_item_id) ? 'queued' : 'pending', attempt: item.attempt + 1, blocked_reason: undefined }
      return ok(commit(state, command, { status: 'executing', work_items: replaceItem(state.work_items, nextItem) }))
    }
    case 'cancel': {
      if (state.status === 'completed') return failure('invalid-transition', '已完成的 Change 不能取消')
      return ok(commit(state, command, { status: 'cancelled', work_items: state.work_items.map((item) => item.status === 'completed' ? item : { ...item, status: 'cancelled', active_run_id: undefined }) }))
    }
  }
}
