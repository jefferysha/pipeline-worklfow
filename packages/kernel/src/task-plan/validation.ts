import { decodeTaskPlanRevisionAttemptV1 } from './codec.js'
import { taskPlanAggregateEntityIdEntries, type TaskPlanAggregate } from './domain.js'
import { deepFreeze, exactResourceKey } from './internal.js'
import { taskPlanDtoToDomain } from './persistence.js'
import { TASK_PLAN_LIMITS } from './types.js'
import type {
  TaskPlanCoverageEntry,
  TaskPlanDependencyDiagnostics,
  TaskPlanResourceDiagnostics,
  TaskPlanRevisionV1,
  TaskPlanValidationIssue,
  TaskPlanValidationIssueCode,
  TaskPlanValidationResult,
} from './types.js'

interface IssueCollector {
  readonly items: TaskPlanValidationIssue[]
  truncated: boolean
}

function ordinalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function issue(
  collector: IssueCollector,
  code: TaskPlanValidationIssueCode,
  path: string,
  relatedIds: readonly string[],
): void {
  if (collector.items.length >= TASK_PLAN_LIMITS.maxValidationIssues - 1) {
    collector.truncated = true
    return
  }
  collector.items.push({
    severity: 'error',
    code,
    path,
    related_ids: [...new Set(relatedIds)].sort(ordinalCompare),
  })
}

function truncate(collector: IssueCollector): void {
  collector.truncated = true
}

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) repeated.add(value)
    else seen.add(value)
  }
  return [...repeated].sort(ordinalCompare)
}

function cyclicIds(graph: ReadonlyMap<string, readonly string[]>): readonly string[] {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const cycle = new Set<string>()
  const path: string[] = []

  const visit = (id: string): void => {
    if (visited.has(id)) return
    const activeIndex = path.indexOf(id)
    if (activeIndex >= 0) {
      for (const cyclic of path.slice(activeIndex)) cycle.add(cyclic)
      return
    }
    visiting.add(id)
    path.push(id)
    for (const next of graph.get(id) ?? []) {
      if (graph.has(next)) visit(next)
    }
    path.pop()
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of [...graph.keys()].sort(ordinalCompare)) visit(id)
  return [...cycle].sort(ordinalCompare)
}

function coverageEntries(
  catalogIds: readonly string[],
  workItems: TaskPlanAggregate['workItems'],
  refs: (item: TaskPlanAggregate['workItems'][number]) => readonly string[],
  collector: IssueCollector,
): readonly TaskPlanCoverageEntry[] {
  const covered = new Map(catalogIds.map((id) => [id, [] as string[]]))
  let relationCount = 0
  for (const item of workItems) {
    for (const ref of new Set(refs(item))) {
      const matches = covered.get(ref)
      if (matches === undefined) continue
      if (relationCount >= TASK_PLAN_LIMITS.maxDiagnosticEntries) {
        truncate(collector)
        continue
      }
      matches.push(item.id)
      relationCount += 1
    }
  }
  return [...covered.entries()].sort(([left], [right]) => ordinalCompare(left, right))
    .map(([id, workItemIds]) => ({ id, work_item_ids: workItemIds.sort(ordinalCompare) }))
}

function isReachable(
  before: string,
  after: string,
  dependents: ReadonlyMap<string, ReadonlySet<string>>,
  budget: { remaining: number },
): boolean | undefined {
  const pending = [...(dependents.get(before) ?? [])]
  const visited = new Set<string>()
  while (pending.length > 0) {
    if (budget.remaining <= 0) return undefined
    budget.remaining -= 1
    const candidate = pending.pop()
    if (candidate === undefined || visited.has(candidate)) continue
    if (candidate === after) return true
    visited.add(candidate)
    pending.push(...(dependents.get(candidate) ?? []))
  }
  return false
}

function resourceDiagnostics(
  revision: TaskPlanAggregate,
  dependents: ReadonlyMap<string, ReadonlySet<string>>,
  collector: IssueCollector,
): TaskPlanResourceDiagnostics {
  const writers = new Map<string, Set<string>>()
  for (const [itemIndex, item] of revision.workItems.entries()) {
    const claimKeys = item.resourceClaims.map((claim) => `${claim.access}:${exactResourceKey(claim.kind, claim.key) ?? `${claim.kind}:${claim.key}`}`)
    for (const repeated of duplicates(claimKeys)) {
      issue(collector, 'resource-claim-duplicate', `$.work_items[${itemIndex}].resource_claims`, [item.id, repeated])
    }
    for (const claim of item.resourceClaims) {
      if (claim.access !== 'write') continue
      const key = exactResourceKey(claim.kind, claim.key) ?? `${claim.kind}:${claim.key}`
      const members = writers.get(key) ?? new Set<string>()
      members.add(item.id)
      writers.set(key, members)
    }
  }

  const conflicts: Array<{ resource: string; work_item_ids: readonly string[] }> = []
  const serialized: Array<{ resource: string; before_work_item_id: string; after_work_item_id: string }> = []
  const traversalBudget = { remaining: TASK_PLAN_LIMITS.maxValidationSteps }
  let diagnosticCount = 0
  resourceLoop:
  for (const [resource, members] of [...writers.entries()].sort(([left], [right]) => ordinalCompare(left, right))) {
    const ids = [...members].sort(ordinalCompare)
    for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
        if (diagnosticCount >= TASK_PLAN_LIMITS.maxDiagnosticEntries) {
          truncate(collector)
          break resourceLoop
        }
        const left = ids[leftIndex]
        const right = ids[rightIndex]
        if (left === undefined || right === undefined) {
          truncate(collector)
          break resourceLoop
        }
        const leftBefore = isReachable(left, right, dependents, traversalBudget)
        const rightBefore = isReachable(right, left, dependents, traversalBudget)
        if (leftBefore === undefined || rightBefore === undefined) {
          truncate(collector)
          break resourceLoop
        }
        diagnosticCount += 1
        if (leftBefore !== rightBefore) {
          serialized.push({
            resource,
            before_work_item_id: leftBefore ? left : right,
            after_work_item_id: leftBefore ? right : left,
          })
        } else {
          conflicts.push({ resource, work_item_ids: [left, right] })
        }
      }
    }
  }
  return { conflicts, serialized }
}

export function validateTaskPlanRevisionV1(revision: TaskPlanRevisionV1): TaskPlanValidationResult {
  const decoded = decodeTaskPlanRevisionAttemptV1(revision)
  const hasNonDuplicateCodecError = decoded.errors.some((entry) => entry.code !== 'duplicate_id')
  if (decoded.value === undefined || decoded.overflow || hasNonDuplicateCodecError) {
    const issues: TaskPlanValidationIssue[] = decoded.errors
      .slice(0, TASK_PLAN_LIMITS.maxValidationIssues - 1)
      .map((entry) => ({
        severity: 'error',
        code: 'task-plan-contract-invalid',
        path: entry.path,
        related_ids: [entry.code],
      }))
    const truncated = decoded.overflow || decoded.errors.length >= TASK_PLAN_LIMITS.maxValidationIssues
    if (truncated) {
      issues.push({
        severity: 'error',
        code: 'diagnostic-budget-exceeded',
        path: '$',
        related_ids: [],
      })
    }
    issues.sort((left, right) =>
      ordinalCompare(
        `${left.code}\u0000${left.path}\u0000${left.related_ids.join('\u0000')}`,
        `${right.code}\u0000${right.path}\u0000${right.related_ids.join('\u0000')}`,
      ),
    )
    return deepFreeze({
      valid: false,
      freezable: false,
      truncated,
      issues,
      coverage: {
        complete: false,
        requirements: [],
        acceptance_criteria: [],
        uncovered_requirement_ids: [],
        uncovered_acceptance_ids: [],
      },
      dependencies: { edges: [], cyclic_work_item_ids: [] },
      resources: { conflicts: [], serialized: [] },
    })
  }
  return validateTaskPlanAggregate(taskPlanDtoToDomain(decoded.value))
}

/** Evaluates domain graph invariants without consulting a persistence record or storage. */
export function validateTaskPlanAggregate(validatedRevision: TaskPlanAggregate): TaskPlanValidationResult {
  const collector: IssueCollector = { items: [], truncated: false }
  const entityIds = new Set<string>()
  for (const { id, path } of taskPlanAggregateEntityIdEntries(validatedRevision)) {
    if (entityIds.has(id)) issue(collector, 'entity-id-duplicate', path, [id])
    else entityIds.add(id)
  }
  const groupIds = new Set(validatedRevision.groups.map((group) => group.id))
  const itemIds = new Set(validatedRevision.workItems.map((item) => item.id))
  const requirementIds = new Set(validatedRevision.requirements.map((entry) => entry.id))
  const acceptanceIds = new Set(validatedRevision.acceptanceCriteria.map((entry) => entry.id))
  const memberships = new Map<string, string[]>()

  const groupGraph = new Map<string, readonly string[]>()
  for (const [groupIndex, group] of validatedRevision.groups.entries()) {
    groupGraph.set(group.id, group.parentId === null ? [] : [group.parentId])
    if (group.parentId !== null && !groupIds.has(group.parentId)) {
      issue(collector, 'group-parent-unknown', `$.groups[${groupIndex}].parent_id`, [group.id, group.parentId])
    }
    for (const workItemId of group.workItemIds) {
      if (!itemIds.has(workItemId)) {
        issue(collector, 'group-work-item-unknown', `$.groups[${groupIndex}].work_item_ids`, [group.id, workItemId])
      }
      const owners = memberships.get(workItemId) ?? []
      owners.push(group.id)
      memberships.set(workItemId, owners)
    }
  }
  const groupCycle = cyclicIds(groupGraph)
  if (groupCycle.length > 0) issue(collector, 'group-cycle', '$.groups', groupCycle)

  const dependencyGraph = new Map<string, readonly string[]>()
  const dependents = new Map<string, Set<string>>()
  const edges: Array<{ from_work_item_id: string; to_work_item_id: string }> = []
  for (const [itemIndex, item] of validatedRevision.workItems.entries()) {
    const owners = memberships.get(item.id) ?? []
    if (owners.length === 0) issue(collector, 'work-item-unowned', `$.work_items[${itemIndex}].group_id`, [item.id])
    if (owners.length > 1) issue(collector, 'work-item-multiple-groups', `$.work_items[${itemIndex}].group_id`, [item.id, ...owners])
    const soleOwner = owners.length === 1 ? owners[0] : undefined
    if (soleOwner !== undefined && soleOwner !== item.groupId) {
      issue(collector, 'work-item-group-mismatch', `$.work_items[${itemIndex}].group_id`, [item.id, item.groupId, soleOwner])
    }
    if (!groupIds.has(item.groupId)) {
      issue(collector, 'work-item-group-mismatch', `$.work_items[${itemIndex}].group_id`, [item.id, item.groupId])
    }

    for (const repeated of duplicates(item.requirementRefs)) {
      issue(collector, 'requirement-ref-duplicate', `$.work_items[${itemIndex}].requirement_refs`, [item.id, repeated])
    }
    for (const ref of item.requirementRefs) if (!requirementIds.has(ref)) {
      issue(collector, 'requirement-ref-unknown', `$.work_items[${itemIndex}].requirement_refs`, [item.id, ref])
    }
    for (const repeated of duplicates(item.acceptanceRefs)) {
      issue(collector, 'acceptance-ref-duplicate', `$.work_items[${itemIndex}].acceptance_refs`, [item.id, repeated])
    }
    for (const ref of item.acceptanceRefs) if (!acceptanceIds.has(ref)) {
      issue(collector, 'acceptance-ref-unknown', `$.work_items[${itemIndex}].acceptance_refs`, [item.id, ref])
    }

    for (const repeated of duplicates(item.dependsOn)) {
      issue(collector, 'dependency-duplicate', `$.work_items[${itemIndex}].depends_on`, [item.id, repeated])
    }
    const validDependencies: string[] = []
    for (const dependency of [...new Set(item.dependsOn)]) {
      if (dependency === item.id) issue(collector, 'dependency-self', `$.work_items[${itemIndex}].depends_on`, [item.id])
      else if (!itemIds.has(dependency)) issue(collector, 'dependency-unknown', `$.work_items[${itemIndex}].depends_on`, [item.id, dependency])
      else {
        validDependencies.push(dependency)
        if (edges.length < TASK_PLAN_LIMITS.maxDiagnosticEntries) {
          edges.push({ from_work_item_id: dependency, to_work_item_id: item.id })
        } else truncate(collector)
        const downstream = dependents.get(dependency) ?? new Set<string>()
        downstream.add(item.id)
        dependents.set(dependency, downstream)
      }
    }
    dependencyGraph.set(item.id, validDependencies)

    const outputIds = new Set(item.expectedOutputs.map((output) => output.id))
    for (const [validatorIndex, validator] of item.validators.entries()) {
      for (const outputId of validator.outputIds) if (!outputIds.has(outputId)) {
        issue(collector, 'validator-output-unknown', `$.work_items[${itemIndex}].validators[${validatorIndex}].output_ids`, [
          item.id, validator.id, outputId,
        ])
      }
    }
  }

  const dependencyCycle = cyclicIds(dependencyGraph)
  if (dependencyCycle.length > 0) issue(collector, 'dependency-cycle', '$.work_items', dependencyCycle)
  edges.sort((left, right) =>
    ordinalCompare(
      `${left.from_work_item_id}\u0000${left.to_work_item_id}`,
      `${right.from_work_item_id}\u0000${right.to_work_item_id}`,
    ),
  )

  const requirementCoverage = coverageEntries(
    [...requirementIds], validatedRevision.workItems, (item) => item.requirementRefs, collector,
  )
  const acceptanceCoverage = coverageEntries(
    [...acceptanceIds], validatedRevision.workItems, (item) => item.acceptanceRefs, collector,
  )
  const uncoveredRequirementIds = requirementCoverage.filter((entry) => entry.work_item_ids.length === 0).map((entry) => entry.id)
  const uncoveredAcceptanceIds = acceptanceCoverage.filter((entry) => entry.work_item_ids.length === 0).map((entry) => entry.id)
  for (const id of uncoveredRequirementIds) issue(collector, 'requirement-uncovered', '$.requirements', [id])
  for (const id of uncoveredAcceptanceIds) issue(collector, 'acceptance-uncovered', '$.acceptance_criteria', [id])

  const dependencies: TaskPlanDependencyDiagnostics = {
    edges,
    cyclic_work_item_ids: dependencyCycle,
  }
  const resources = resourceDiagnostics(validatedRevision, dependents, collector)
  const issues = collector.items
  if (collector.truncated) {
    if (issues.length >= TASK_PLAN_LIMITS.maxValidationIssues) issues.pop()
    issues.push({
      severity: 'error',
      code: 'diagnostic-budget-exceeded',
      path: '$',
      related_ids: [],
    })
  }
  issues.sort((left, right) =>
    ordinalCompare(
      `${left.code}\u0000${left.path}\u0000${left.related_ids.join('\u0000')}`,
      `${right.code}\u0000${right.path}\u0000${right.related_ids.join('\u0000')}`,
    ),
  )
  const coverage = {
    complete: uncoveredRequirementIds.length === 0 && uncoveredAcceptanceIds.length === 0,
    requirements: requirementCoverage,
    acceptance_criteria: acceptanceCoverage,
    uncovered_requirement_ids: uncoveredRequirementIds,
    uncovered_acceptance_ids: uncoveredAcceptanceIds,
  }
  return deepFreeze({
    valid: issues.length === 0 && !collector.truncated,
    freezable: issues.length === 0 && !collector.truncated,
    truncated: collector.truncated,
    issues,
    coverage,
    dependencies,
    resources,
  })
}
