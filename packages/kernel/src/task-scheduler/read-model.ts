import {
  TASK_RUN_SCHEMA_VERSION,
  type DeriveTaskRunInput,
  type DerivedWorkItemState,
  type TaskRunInvalidationV1,
  type TaskRunOperationV1,
  type TaskRunReadModelV1,
  type WorkItemAttemptFact,
} from './run-types.js'

function latestAttempts(attempts: readonly WorkItemAttemptFact[]): ReadonlyMap<string, WorkItemAttemptFact> {
  const latest = new Map<string, WorkItemAttemptFact>()
  for (const attempt of attempts) {
    const current = latest.get(attempt.work_item_id)
    const sameAttemptIsNewer = current !== undefined
      && attempt.attempt_number === current.attempt_number
      && (attempt.journal_sequence !== undefined && current.journal_sequence !== undefined
        ? attempt.journal_sequence > current.journal_sequence
        : attempt.recorded_at > current.recorded_at)
    if (current === undefined || attempt.attempt_number > current.attempt_number || sameAttemptIsNewer) {
      latest.set(attempt.work_item_id, attempt)
    }
  }
  return latest
}

export function deriveTaskRunReadModel(input: DeriveTaskRunInput): TaskRunReadModelV1 {
  const latest = latestAttempts(input.attempts)
  const operationFacts = input.operations ?? []
  const itemOperations = new Map<string, (typeof operationFacts)[number]>()
  let resumeOperation: (typeof operationFacts)[number] | undefined
  for (const operation of operationFacts) {
    if (operation.operation === 'resume' && operation.work_item_id === undefined) {
      resumeOperation = operation
    } else if (operation.work_item_id !== undefined) {
      itemOperations.set(operation.work_item_id, operation)
    }
  }
  const operationAfterAttempt = (
    operation: (typeof operationFacts)[number] | undefined,
    attempt: WorkItemAttemptFact | undefined,
  ): boolean => operation !== undefined
    && (attempt === undefined
      || (operation.journal_sequence !== undefined && attempt.journal_sequence !== undefined
        ? operation.journal_sequence > attempt.journal_sequence
        : operation.recorded_at >= attempt.recorded_at))
  const byId = new Map(input.plan.work_items.map((item) => [item.id, item]))
  const effectiveValidatorVerdicts = input.validator_verdicts.map((verdict) => {
    const digestChanged = Object.entries(verdict.input_digests ?? {}).some(([workItemId, expected]) =>
      latest.get(workItemId)?.output_digest !== expected)
    return digestChanged
      ? { ...verdict, status: 'invalidated' as const, code: 'UPSTREAM_OUTPUT_CHANGED' }
      : verdict
  })
  const verdictByIdentity = new Map(effectiveValidatorVerdicts.map((verdict) => [
    `${verdict.scope}:${verdict.target_id ?? 'run'}:${verdict.validator_id}`,
    verdict,
  ]))
  const states = new Map<string, DerivedWorkItemState>()
  const invalidations: TaskRunInvalidationV1[] = []
  const resolving = new Set<string>()

  const stateFor = (id: string): DerivedWorkItemState => {
    const memoized = states.get(id)
    if (memoized !== undefined) return memoized
    if (resolving.has(id)) return 'blocked-upstream'
    resolving.add(id)
    const workItem = byId.get(id)
    const recordedAttempt = latest.get(id)
    const itemOperation = itemOperations.get(id)
    const retried = itemOperation?.operation === 'retry' && operationAfterAttempt(itemOperation, recordedAttempt)
    const resumed = operationAfterAttempt(resumeOperation, recordedAttempt)
    const attempt = retried || resumed ? undefined : recordedAttempt
    let state: DerivedWorkItemState = 'pending'
    if (workItem === undefined) state = 'blocked-upstream'
    else if (itemOperation?.operation === 'cancel' && operationAfterAttempt(itemOperation, recordedAttempt)) {
      state = 'cancelled'
    }
    else if (attempt?.status === 'failed' || attempt?.status === 'cancelled' || attempt?.status === 'running') {
      state = attempt.status
    } else {
      const dependencyStates = workItem.depends_on.map((dependency) => stateFor(dependency))
      const terminalUpstream = dependencyStates.some((candidate) =>
        candidate === 'failed' || candidate === 'cancelled' || candidate === 'blocked-upstream')
      if (terminalUpstream) state = 'blocked-upstream'
      else if (attempt?.status === 'succeeded') {
        const validatorVerdicts = workItem.validators.map((validator) =>
          verdictByIdentity.get(`work-item:${id}:${validator.id}`))
        if (validatorVerdicts.some((verdict) => verdict?.status === 'failed')) {
          state = 'failed'
        } else if (validatorVerdicts.some((verdict) => verdict?.status === 'invalidated')) {
          state = 'invalidated'
        } else if (validatorVerdicts.some((verdict) => verdict === undefined || verdict.status === 'pending')) {
          state = 'running'
        } else {
          const mismatches = workItem.depends_on.flatMap((dependency) => {
            const expected = attempt.input_digests[dependency]
            const actual = latest.get(dependency)?.output_digest
            return expected !== undefined && actual !== undefined && expected !== actual
              ? [{
                  work_item_id: id,
                  caused_by_work_item_id: dependency,
                  expected_digest: expected,
                  actual_digest: actual,
                }]
              : []
          })
          if (mismatches.length > 0) {
            invalidations.push(...mismatches)
            state = 'invalidated'
          } else state = 'succeeded'
        }
      } else if (dependencyStates.every((candidate) => candidate === 'succeeded')) state = 'ready'
      else state = attempt?.status ?? 'pending'
    }
    resolving.delete(id)
    states.set(id, state)
    return state
  }

  const items = [...input.plan.work_items]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((workItem) => ({
      work_item_id: workItem.id,
      title: workItem.title,
      state: stateFor(workItem.id),
      depends_on: workItem.depends_on,
      resource_claims: workItem.resource_claims,
      latest_attempt: latest.get(workItem.id) ?? null,
    }))
  const itemStates = new Map(items.map((item) => [item.work_item_id, item.state]))
  const groupsById = new Map(input.plan.groups.map((group) => [group.id, group]))
  const childGroupIdsByParent = new Map<string, string[]>()
  for (const group of input.plan.groups) {
    if (group.parent_id === null) continue
    const childGroupIds = childGroupIdsByParent.get(group.parent_id) ?? []
    childGroupIds.push(group.id)
    childGroupIdsByParent.set(group.parent_id, childGroupIds)
  }
  const recursivelyOwnedWorkItemIds = (groupId: string): readonly string[] => {
    const workItemIds = new Set<string>()
    const visitedGroupIds = new Set<string>()
    const visit = (currentGroupId: string): void => {
      if (visitedGroupIds.has(currentGroupId)) return
      visitedGroupIds.add(currentGroupId)
      const group = groupsById.get(currentGroupId)
      if (group === undefined) return
      for (const workItemId of group.work_item_ids) workItemIds.add(workItemId)
      for (const childGroupId of [...(childGroupIdsByParent.get(currentGroupId) ?? [])].sort()) {
        visit(childGroupId)
      }
    }
    visit(groupId)
    return [...workItemIds].sort()
  }
  const runValidators = effectiveValidatorVerdicts.filter((verdict) => verdict.scope === 'run')
  const integrationFailed = runValidators.some((verdict) => verdict.status === 'failed')
  const integrationPending = runValidators.some((verdict) =>
    verdict.status !== 'passed' && verdict.status !== 'failed')
    || (input.plan.work_items.length > 1 && !runValidators.some((verdict) => verdict.status === 'passed'))
  const groups = [...input.plan.groups]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((group) => {
      const workItemIds = recursivelyOwnedWorkItemIds(group.id)
      const groupStates = workItemIds.map((id) => itemStates.get(id) ?? 'blocked-upstream')
      const groupValidators = effectiveValidatorVerdicts.filter((verdict) =>
        verdict.scope === 'group' && verdict.target_id === group.id)
      const groupValidatorFailed = groupValidators.some((verdict) => verdict.status === 'failed')
      const groupValidatorPending = groupValidators.some((verdict) =>
        verdict.status !== 'passed' && verdict.status !== 'failed')
        || (workItemIds.length > 1 && !groupValidators.some((verdict) => verdict.status === 'passed'))
      const state = groupValidatorFailed || groupStates.some((candidate) => candidate === 'failed')
        ? 'failed' as const
        : groupStates.every((candidate) => candidate === 'succeeded') && !groupValidatorPending
          ? 'succeeded' as const
          : groupStates.some((candidate) => candidate === 'blocked-upstream')
            ? 'blocked' as const
            : groupStates.some((candidate) => candidate === 'running' || candidate === 'invalidated')
              ? 'running' as const
              : 'pending' as const
      return { group_id: group.id, state, work_item_ids: workItemIds }
    })

  const derivedStates = items.map(({ state }) => state)
  const groupStates = groups.map(({ state: groupState }) => groupState)
  const state = input.admission.status === 'blocked' || !input.schedule.valid
    ? 'blocked' as const
    : integrationFailed
        || derivedStates.some((candidate) => candidate === 'failed')
        || groupStates.some((candidate) => candidate === 'failed')
      ? 'failed' as const
      : derivedStates.length > 0 && derivedStates.every((candidate) => candidate === 'cancelled')
        ? 'cancelled' as const
      : derivedStates.length > 0
          && derivedStates.every((candidate) => candidate === 'succeeded')
          && groupStates.every((candidate) => candidate === 'succeeded')
          && !integrationPending
        ? 'succeeded' as const
        : input.attempts.length > 0 || derivedStates.some((candidate) => candidate === 'invalidated')
          ? 'running' as const
          : 'admitted' as const

  const operations: TaskRunOperationV1[] = []
  if (input.admission.status === 'admitted' && input.schedule.valid) {
    for (const item of items) {
      if (item.state === 'failed' || item.state === 'cancelled' || item.state === 'invalidated') {
        operations.push({
          operation: 'retry',
          work_item_id: item.work_item_id,
          expected_run_revision: input.run_revision,
          expected_state: item.state,
        })
      } else if (item.state === 'running') {
        operations.push({
          operation: 'cancel',
          work_item_id: item.work_item_id,
          expected_run_revision: input.run_revision,
          expected_state: item.state,
        })
      }
    }
    if (state === 'cancelled') {
      operations.push({ operation: 'resume', expected_run_revision: input.run_revision, expected_state: state })
    }
  }

  return {
    schema_version: TASK_RUN_SCHEMA_VERSION,
    plan: {
      plan_id: input.plan.plan_id,
      revision_id: input.plan.revision_id,
      revision_number: input.plan.revision_number,
      fingerprint: input.plan.fingerprint,
    },
    run_revision: input.run_revision,
    state,
    admission: input.admission,
    waves: input.schedule.waves,
    parallelism: input.schedule.waves.reduce((maximum, wave) => Math.max(maximum, wave.parallelism), 0),
    serialized_resource_conflicts: input.schedule.serialized_resource_conflicts,
    items,
    attempts: [...input.attempts],
    operations: [...operationFacts],
    blockers: [
      ...input.admission.blockers,
      ...input.schedule.blockers.map((blocker) => ({
        code: blocker.code,
        detail: blocker.detail,
        remediation: blocker.remediation,
      })),
    ],
    invalidations,
    validator_verdicts: effectiveValidatorVerdicts,
    groups,
    allowed_operations: operations,
  }
}
