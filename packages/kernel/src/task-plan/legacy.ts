import { deepFreeze } from './internal.js'
import {
  TASK_PLAN_READ_SCHEMA_VERSION,
  type LegacyTaskPlanReadModelV1,
  type TaskPlanRevisionV1,
} from './types.js'

function displayId(order: number): string {
  return `legacy-display-${String(order + 1).padStart(4, '0')}`
}

export function isCanonicalTaskPlanTasksMarkdown(markdown: string): boolean {
  return /^# Tasks\r?\n\r?\n<!-- tenon-task-plan revision=[^>]+ digest=[^>]+ -->\r?\n/u.test(markdown)
}

/**
 * Read-only compatibility adapter. Display IDs exist only for rendering and are deliberately
 * unrelated to canonical WorkItem IDs; callers must honor schedulable=false.
 */
export function adaptLegacyTasksMd(markdown: string): LegacyTaskPlanReadModelV1 {
  let stage: string | null = null
  const items: Array<LegacyTaskPlanReadModelV1['items'][number]> = []
  for (const line of markdown.split(/\r?\n/u)) {
    const heading = /^\s{0,3}#{2,6}\s+(.+?)\s*#*\s*$/u.exec(line)
    if (heading) {
      stage = (heading[1] ?? '').trim() || null
      continue
    }
    const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/u.exec(line)
    if (!task) continue
    const rawTitle = (task[2] ?? '').trim()
    if (rawTitle === '') continue
    const order = items.length
    items.push({
      id: displayId(order),
      identity_quality: 'legacy-derived',
      title: rawTitle,
      stage,
      completed: (task[1] ?? '').toLowerCase() === 'x',
      order,
      depends_on: [],
      requirement_refs: [],
      acceptance_refs: [],
      resource_claims: [],
      expected_outputs: [],
      validators: [],
    })
  }
  return deepFreeze({
    schema_version: TASK_PLAN_READ_SCHEMA_VERSION,
    source: 'legacy',
    schedulable: false,
    groups: [],
    items,
    completeness: { state: 'unknown', reason: 'legacy-semantics-unproven' },
    projection: { state: 'legacy' },
  })
}

function safeComment(value: string): string {
  return value.replace(/--/gu, '')
}

/** Canonical-to-Markdown compatibility projection. Markdown is never decoded back as canonical. */
export function renderTaskPlanTasksMd(
  revision: TaskPlanRevisionV1,
  input: { readonly completed_work_item_ids?: readonly string[]; readonly digest: string },
): string {
  const completed = new Set(input.completed_work_item_ids ?? [])
  const itemById = new Map(revision.work_items.map((item) => [item.id, item]))
  const lines = [
    '# Tasks',
    '',
    `<!-- tenon-task-plan revision=${safeComment(revision.revision_id)} digest=${safeComment(input.digest)} -->`,
  ]
  for (const group of revision.groups) {
    lines.push('', `## ${group.title} <!-- task-group:${safeComment(group.id)} -->`, '')
    for (const id of group.work_item_ids) {
      const item = itemById.get(id)
      if (item !== undefined) lines.push(`- [${completed.has(id) ? 'x' : ' '}] ${item.title} <!-- work-item:${safeComment(id)} -->`)
    }
  }
  return `${lines.join('\n')}\n`
}
