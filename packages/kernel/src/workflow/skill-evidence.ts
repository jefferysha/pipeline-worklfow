import type { SkillRef } from './types.js'

interface WorkflowHistoryLine {
  readonly kind?: string
  readonly to?: string
  readonly raw?: string
}

function decodeHistoryLine(value: unknown): WorkflowHistoryLine | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.kind !== undefined && typeof record.kind !== 'string') return undefined
  if (record.to !== undefined && typeof record.to !== 'string') return undefined
  if (record.raw !== undefined && typeof record.raw !== 'string') return undefined
  return {
    ...(typeof record.kind === 'string' ? { kind: record.kind } : {}),
    ...(typeof record.to === 'string' ? { to: record.to } : {}),
    ...(typeof record.raw === 'string' ? { raw: record.raw } : {}),
  }
}

/** Pipeline-owned skills may be presented by Codex with the plugin namespace. */
export function canonicalWorkflowSkillId(skillId: string): string {
  return skillId.startsWith('pipeline-lite:') ? skillId.slice('pipeline-lite:'.length) : skillId
}

function skillIdFromHistory(raw: string): string | null {
  const match = /^(?:Skill|CodexSkillRead): (.+)$/.exec(raw)
  return match?.[1] === undefined ? null : canonicalWorkflowSkillId(match[1])
}

/**
 * Return only skill completions recorded after the most recent transition into the current step.
 * A malformed JSONL line is ignored; an unreadable history file is handled by the adapter.
 */
export function completedWorkflowSkillsSinceStepEntry(
  historyRaw: string,
  currentStepId: string,
): ReadonlySet<string> {
  const lines: WorkflowHistoryLine[] = []
  for (const line of historyRaw.split('\n')) {
    if (line.trim() === '') continue
    try {
      const decoded = decodeHistoryLine(JSON.parse(line))
      if (decoded) lines.push(decoded)
    } catch {
      // A damaged compatibility-history line cannot manufacture or erase another valid receipt.
    }
  }

  let enteredAt = -1
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]
    if (line?.kind === 'transition' && line.to === currentStepId) {
      enteredAt = index
      break
    }
  }

  const completed = new Set<string>()
  for (const line of lines.slice(enteredAt + 1)) {
    if (line.kind !== 'tool') continue
    const skillId = skillIdFromHistory(line.raw ?? '')
    if (skillId !== null) completed.add(skillId)
  }
  return completed
}

/** Every declared node is mandatory before the step can exit; depends_on controls invocation order. */
export function missingWorkflowStepSkills(
  skills: readonly SkillRef[],
  completed: ReadonlySet<string>,
): readonly string[] {
  return skills
    .map((skill) => canonicalWorkflowSkillId(skill.id))
    .filter((skillId, index, all) => all.indexOf(skillId) === index && !completed.has(skillId))
}
