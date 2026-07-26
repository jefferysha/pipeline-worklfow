import { readFile, readdir, realpath } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  readProductIdentity,
  renderCodexAgentsBlock,
  renderProductIdentity,
} from './generate-product-identity.mjs'

const targetUrl = new URL('../packages/kernel/src/product-identity.generated.ts', import.meta.url)
const codexTemplateUrl = new URL('../templates/generated/codex-agents-block.md', import.meta.url)
const agentsUrl = new URL('../AGENTS.md', import.meta.url)
const adapterUrl = new URL('../adapters/codex/install.sh', import.meta.url)
const identity = await readProductIdentity()
const expected = renderProductIdentity(identity)
const actual = await readFile(targetUrl, 'utf8')

if (actual !== expected) {
  console.error('product identity projection is stale; run npm run generate:identity')
  process.exitCode = 1
}

const expectedCodexTemplate = renderCodexAgentsBlock(identity)
const actualCodexTemplate = await readFile(codexTemplateUrl, 'utf8')
if (actualCodexTemplate !== expectedCodexTemplate) {
  console.error('Codex managed block projection is stale; run npm run generate:identity')
  process.exitCode = 1
}

const agents = await readFile(agentsUrl, 'utf8')
const startMarker = '<!-- PIPELINE:CODEX:START -->'
const endMarker = '<!-- PIPELINE:CODEX:END -->'
const starts = [...agents.matchAll(new RegExp(startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))]
const ends = [...agents.matchAll(new RegExp(endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))]
const managedStart = starts[0]?.index ?? -1
const managedEnd = (ends[0]?.index ?? -1) + endMarker.length
const actualManagedBlock = managedStart >= 0 && managedEnd >= endMarker.length
  ? `${agents.slice(managedStart, managedEnd)}\n`
  : ''
if (starts.length !== 1 || ends.length !== 1 || managedStart >= managedEnd
  || actualManagedBlock !== expectedCodexTemplate) {
  console.error('AGENTS.md Codex managed block is stale; run npm run generate:identity and refresh the managed block')
  process.exitCode = 1
}

const adapter = await readFile(adapterUrl, 'utf8')
const templateReferences = adapter.match(/templates\/generated\/codex-agents-block\.md/g) ?? []
if (templateReferences.length !== 1
  || !adapter.includes('cp "$template" "$block_tmp"')
  || !adapter.includes('cat "$template"')) {
  console.error('Codex adapter does not consume the generated managed block')
  process.exitCode = 1
}

const skillsRoot = await realpath(fileURLToPath(new URL('../skills/', import.meta.url)))
const entryPath = await realpath(fileURLToPath(
  new URL(`../skills/${identity.entrySkill}/SKILL.md`, import.meta.url),
))
const entryRelative = relative(skillsRoot, entryPath)
const escapedSkillsRoot = entryRelative === '..'
  || entryRelative.startsWith(`..${sep}`)
  || resolve(dirname(entryPath), '..') !== skillsRoot
const entrySkill = escapedSkillsRoot ? '' : await readFile(entryPath, 'utf8')
const frontmatterEnd = entrySkill.startsWith('---\n') ? entrySkill.indexOf('\n---\n', 4) : -1
const frontmatter = frontmatterEnd === -1 ? '' : entrySkill.slice(4, frontmatterEnd)
const nameLines = frontmatter.split('\n').filter((line) => line.startsWith('name:'))
const matchingEntrySkills = []
const unreadableEntrySkills = []
for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
  try {
    const source = await readFile(resolve(skillsRoot, entry.name, 'SKILL.md'), 'utf8')
    const end = source.startsWith('---\n') ? source.indexOf('\n---\n', 4) : -1
    if (end === -1) continue
    const names = source.slice(4, end).split('\n').filter((line) => line.startsWith('name:'))
    if (names.length === 1 && names[0] === `name: ${identity.entrySkill}`) {
      matchingEntrySkills.push(entry.name)
    }
  } catch {
    unreadableEntrySkills.push(entry.name)
  }
}
if (escapedSkillsRoot
  || nameLines.length !== 1
  || nameLines[0] !== `name: ${identity.entrySkill}`
  || unreadableEntrySkills.length !== 0
  || matchingEntrySkills.length !== 1
  || matchingEntrySkills[0] !== identity.entrySkill) {
  console.error('product entry Skill is missing or its frontmatter name does not match product identity')
  process.exitCode = 1
}
