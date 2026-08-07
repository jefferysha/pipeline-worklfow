import { exactResourceKey } from '../task-plan/internal.js'
import type { TaskPlanExecutionPlan } from './run-types.js'
import type { TaskScheduleBlocker, TaskScheduleCompilation } from './types.js'

function invalid(blockers: readonly TaskScheduleBlocker[]): TaskScheduleCompilation {
  return { valid: false, waves: [], blockers, serialized_resource_conflicts: [] }
}

function cycleMembers(
  items: ReadonlyMap<string, { readonly depends_on: readonly string[] }>,
): readonly string[] {
  let nextIndex = 0
  const indices = new Map<string, number>()
  const lowLinks = new Map<string, number>()
  const stack: string[] = []
  const stacked = new Set<string>()
  const cyclic = new Set<string>()
  const visit = (id: string): void => {
    const index = nextIndex++
    indices.set(id, index)
    lowLinks.set(id, index)
    stack.push(id)
    stacked.add(id)
    for (const dependency of [...(items.get(id)?.depends_on ?? [])].sort()) {
      if (!indices.has(dependency)) {
        visit(dependency)
        lowLinks.set(id, Math.min(lowLinks.get(id) ?? index, lowLinks.get(dependency) ?? index))
      } else if (stacked.has(dependency)) {
        lowLinks.set(id, Math.min(lowLinks.get(id) ?? index, indices.get(dependency) ?? index))
      }
    }
    if (lowLinks.get(id) !== indices.get(id)) return
    const component: string[] = []
    let member: string | undefined
    do {
      member = stack.pop()
      if (member !== undefined) {
        stacked.delete(member)
        component.push(member)
      }
    } while (member !== id && member !== undefined)
    if (component.length > 1 || (component.length === 1 && items.get(id)?.depends_on.includes(id))) {
      for (const entry of component) cyclic.add(entry)
    }
  }
  for (const id of [...items.keys()].sort()) if (!indices.has(id)) visit(id)
  return [...cyclic].sort()
}

type TaskSchedulePlan = Pick<TaskPlanExecutionPlan, 'status' | 'work_items'>

export function compileTaskSchedule(plan: TaskSchedulePlan): TaskScheduleCompilation {
  if (plan.status !== 'frozen') {
    return invalid([{
      code: 'TASK_PLAN_NOT_FROZEN',
      work_item_ids: [],
      detail: 'TaskPlan revision must be frozen before scheduling.',
      remediation: 'FREEZE_VALID_PLAN',
    }])
  }

  const items = new Map<string, (typeof plan.work_items)[number]>()
  const duplicates = new Set<string>()
  for (const workItem of plan.work_items) {
    if (items.has(workItem.id)) duplicates.add(workItem.id)
    else items.set(workItem.id, workItem)
  }
  if (duplicates.size > 0) {
    const ids = [...duplicates].sort()
    return invalid([{
      code: 'WORK_ITEM_DUPLICATE',
      work_item_ids: ids,
      detail: `Duplicate WorkItem identities: ${ids.join(', ')}`,
      remediation: 'FIX_PLAN_IDENTITIES',
    }])
  }

  const unknown = new Set<string>()
  for (const workItem of items.values()) {
    for (const dependency of workItem.depends_on) {
      if (!items.has(dependency)) unknown.add(`${workItem.id}:${dependency}`)
    }
  }
  if (unknown.size > 0) {
    const ids = [...unknown].sort()
    return invalid([{
      code: 'DEPENDENCY_UNKNOWN',
      work_item_ids: ids,
      detail: `Unknown dependency targets: ${ids.join(', ')}`,
      remediation: 'FIX_DEPENDENCIES',
    }])
  }

  const writeClaims = new Map<string, readonly string[]>()
  const ambiguousClaims: string[] = []
  for (const workItem of items.values()) {
    const keys: string[] = []
    for (const claim of workItem.resource_claims) {
      const key = exactResourceKey(claim.kind, claim.key)
      if (key === undefined) ambiguousClaims.push(`${workItem.id}:${claim.kind}:${claim.key}`)
      else if (claim.access === 'write') keys.push(key)
    }
    writeClaims.set(workItem.id, [...new Set(keys)].sort())
  }
  if (ambiguousClaims.length > 0) {
    const ids = ambiguousClaims.sort()
    return invalid([{
      code: 'RESOURCE_CLAIM_AMBIGUOUS',
      work_item_ids: ids,
      detail: `Ambiguous resource claims: ${ids.join(', ')}`,
      remediation: 'FIX_PLAN_IDENTITIES',
    }])
  }

  const remaining = new Map<string, Set<string>>()
  for (const workItem of items.values()) {
    remaining.set(workItem.id, new Set(workItem.depends_on))
  }
  const waves: TaskScheduleCompilation['waves'][number][] = []
  const serialized: TaskScheduleCompilation['serialized_resource_conflicts'][number][] = []
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter(([, dependencies]) => dependencies.size === 0)
      .map(([id]) => id)
      .sort()
    if (ready.length === 0) {
      const ids = cycleMembers(items)
      return invalid([{
        code: 'DEPENDENCY_CYCLE',
        work_item_ids: ids,
        detail: `Dependency cycle includes: ${ids.join(', ')}`,
        remediation: 'FIX_DEPENDENCIES',
      }])
    }
    const selected: string[] = []
    const selectedWriters = new Map<string, string>()
    for (const id of ready) {
      const claims = writeClaims.get(id) ?? []
      const conflicts = claims.flatMap((resource) => {
        const before = selectedWriters.get(resource)
        return before === undefined ? [] : [{ resource, before }]
      })
      if (conflicts.length > 0) {
        for (const { resource, before } of conflicts) {
          serialized.push({
            resource,
            before_work_item_id: before,
            after_work_item_id: id,
          })
        }
        continue
      }
      selected.push(id)
      for (const resource of claims) selectedWriters.set(resource, id)
    }
    waves.push({ index: waves.length, work_item_ids: selected, parallelism: selected.length })
    for (const id of selected) remaining.delete(id)
    for (const dependencies of remaining.values()) {
      for (const id of selected) dependencies.delete(id)
    }
  }
  return { valid: true, waves, blockers: [], serialized_resource_conflicts: serialized }
}
