import type { SkillRef } from './types.js'

export function isSkillUnlocked(
  skillId: string,
  skills: readonly SkillRef[],
  completedSinceStepEntry: ReadonlySet<string>,
): boolean {
  const ref = skills.find((s) => s.id === skillId)
  if (!ref) return false
  return (ref.depends_on ?? []).every((dep) => completedSinceStepEntry.has(dep))
}
