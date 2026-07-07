// List all registered skills from local dirs + external registry
// Merges: skills/*/SKILL.md and skills/EXTERNAL-SKILLS.md
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function localSkillDirs(repoRoot: string): string[] {
  const dir = join(repoRoot, 'skills')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'))
  })
}

function externalSkillNames(repoRoot: string): string[] {
  const p = join(repoRoot, 'skills', 'EXTERNAL-SKILLS.md')
  if (!existsSync(p)) return []
  const text = readFileSync(p, 'utf8')
  const names: string[] = []
  for (const line of text.split('\n')) {
    const m = /^-\s+(\S+)/.exec(line.trim())
    if (m?.[1]) names.push(m[1])
  }
  return names
}

export function listAllSkills(repoRoot: string): string[] {
  const merged = new Set([...localSkillDirs(repoRoot), ...externalSkillNames(repoRoot)])
  return [...merged].sort()
}
