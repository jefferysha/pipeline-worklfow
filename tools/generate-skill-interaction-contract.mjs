import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const root = new URL('../', import.meta.url)
const templateUrl = new URL('templates/skill-interaction-contract.md', root)
const skillIds = [
  'tenon',
  'tenon-open',
  'tenon-explore',
  'tenon-spec',
  'tenon-build',
  'tenon-verify',
  'tenon-ship',
  'tenon-archive',
]
const start = '<!-- TENON:INTERACTION-MODE:START -->'
const end = '<!-- TENON:INTERACTION-MODE:END -->'

export function projectInteractionContract(source, contract) {
  const first = source.indexOf(start)
  const last = source.indexOf(end)
  if ((first === -1) !== (last === -1) || (first !== -1 && source.indexOf(start, first + 1) !== -1)) {
    throw new Error('Skill interaction contract markers are malformed')
  }
  if (first !== -1) {
    return `${source.slice(0, first)}${contract}${source.slice(last + end.length)}`
  }
  if (!source.startsWith('---\n')) throw new Error('Skill frontmatter is missing')
  const frontmatterEnd = source.indexOf('\n---\n', 4)
  if (frontmatterEnd === -1) throw new Error('Skill frontmatter is malformed')
  const insertion = frontmatterEnd + '\n---\n'.length
  return `${source.slice(0, insertion)}\n${contract}\n${source.slice(insertion)}`
}

export async function generateSkillInteractionContract({ check = false } = {}) {
  const contract = (await readFile(templateUrl, 'utf8')).trimEnd()
  const stale = []
  for (const id of skillIds) {
    const skillUrl = new URL(`skills/${id}/SKILL.md`, root)
    const source = await readFile(skillUrl, 'utf8')
    const projected = projectInteractionContract(source, contract)
    if (projected === source) continue
    if (check) stale.push(id)
    else await writeFile(skillUrl, projected, 'utf8')
  }
  if (stale.length > 0) {
    throw new Error(`Skill interaction contract projection is stale: ${stale.join(', ')}`)
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (invokedPath === import.meta.url) {
  await generateSkillInteractionContract({ check: process.argv.includes('--check') })
}
