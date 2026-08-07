import type {
  CanonicalTaskPlanReadModelV1,
  LegacyTaskPlanReadModelV1,
  TaskPlanReadModelV1,
} from '../api/taskPlanClient'

export type TaskPlanItem = TaskPlanReadModelV1['items'][number]

function searchable(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function canonicalSearchParts(
  plan: CanonicalTaskPlanReadModelV1,
  item: CanonicalTaskPlanReadModelV1['items'][number],
): readonly string[] {
  const group = plan.groups.find((candidate) => candidate.id === item.group_id)
  const requirementTitles = item.requirement_refs.flatMap((id) => {
    const entry = plan.requirements.find((candidate) => candidate.id === id)
    return entry === undefined ? [] : [entry.title]
  })
  const acceptanceTitles = item.acceptance_refs.flatMap((id) => {
    const entry = plan.acceptance_criteria.find((candidate) => candidate.id === id)
    return entry === undefined ? [] : [entry.title]
  })
  return [
    item.id,
    item.title,
    item.group_id,
    group?.title ?? '',
    ...item.requirement_refs,
    ...requirementTitles,
    ...item.acceptance_refs,
    ...acceptanceTitles,
  ]
}

function legacySearchParts(item: LegacyTaskPlanReadModelV1['items'][number]): readonly string[] {
  return [item.id, item.title, item.stage ?? '']
}

export function taskPlanSearchableText(plan: TaskPlanReadModelV1, item: TaskPlanItem): string {
  const parts = plan.source === 'canonical' && item.identity_quality === 'canonical'
    ? canonicalSearchParts(plan, item)
    : plan.source === 'legacy' && item.identity_quality === 'legacy-derived'
      ? legacySearchParts(item)
      : [item.id, item.title]
  return parts.map(searchable).filter((part) => part !== '').join(' ')
}

export function filterTaskPlanItems(plan: TaskPlanReadModelV1, query: string): readonly TaskPlanItem[] {
  const normalizedQuery = searchable(query)
  if (normalizedQuery === '') return plan.items
  return plan.items.filter((item) => taskPlanSearchableText(plan, item).includes(normalizedQuery))
}

export function groupTitle(
  plan: CanonicalTaskPlanReadModelV1,
  groupId: string,
): string | undefined {
  return plan.groups.find((group) => group.id === groupId)?.title
}
