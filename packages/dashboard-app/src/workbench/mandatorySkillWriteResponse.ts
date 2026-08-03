import { isValidMandatorySkillList } from './mandatoryConfig'

export interface MandatorySkillWriteSuccess {
  ok: true
  phase: string
  track: string
  skills: string[]
}

export function decodeMandatorySkillWriteSuccess(
  value: unknown,
  expected: { phase: string; track: string },
): MandatorySkillWriteSuccess | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const keys = Object.keys(body)
  if (keys.length !== 4 || !['ok', 'phase', 'track', 'skills'].every((key) => keys.includes(key))) return null
  if (
    body.ok !== true
    || body.phase !== expected.phase
    || body.track !== expected.track
    || !isValidMandatorySkillList(body.skills)
  ) return null
  return {
    ok: true,
    phase: expected.phase,
    track: expected.track,
    skills: [...body.skills],
  }
}
