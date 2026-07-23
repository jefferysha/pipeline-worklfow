import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  DocumentLedgerError,
  ensureDocumentLedger,
  evaluateDocumentEvidence,
  recordDocument,
  recordDocumentReads,
} from './document-ledger.js'

const NOW = '2026-07-23T00:00:00Z'
const dirs: string[] = []

async function fixture(): Promise<{ root: string; changeDir: string; name: string }> {
  const root = await mkdtemp(join(tmpdir(), 'pl-document-ledger-'))
  dirs.push(root)
  const name = 'governed-change'
  const changeDir = join(root, 'openspec', 'changes', name)
  await mkdir(changeDir, { recursive: true })
  await ensureDocumentLedger(changeDir, NOW)
  return { root, changeDir, name }
}

async function writeDoc(root: string, relativePath: string, content = '# evidence\n'): Promise<void> {
  const target = join(root, relativePath)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, content, 'utf8')
}

async function appendSkillHistory(changeDir: string, ...skills: string[]): Promise<void> {
  const jsonl = skills.map((skill) => JSON.stringify({ kind: 'tool', raw: `Skill: ${skill}` })).join('\n')
  await writeFile(join(changeDir, '.pipeline-history.jsonl'), `${jsonl}\n`, 'utf8')
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('OpenSpec document ledger', () => {
  test('真实 producer history + hash-bound read receipt 使 explore 通过；文件变更立即变 stale', async () => {
    const { root, changeDir, name } = await fixture()
    const paths = {
      proposal: `openspec/changes/${name}/proposal.md`,
      design: `openspec/changes/${name}/design.md`,
      tasks: `openspec/changes/${name}/tasks.md`,
      superpowerDesign: `docs/superpowers/specs/${name}-design.md`,
      adr: `docs/adr/${name}.md`,
    }
    await Promise.all(Object.values(paths).map((path) => writeDoc(root, path)))
    await appendSkillHistory(changeDir, 'openspec-propose', 'brainstorming')

    await recordDocument({ repoRoot: root, changeDir, phase: 'open', kind: 'proposal', path: paths.proposal, producer: 'openspec-propose', recordedAt: NOW })
    await recordDocument({ repoRoot: root, changeDir, phase: 'open', kind: 'openspec-design', path: paths.design, producer: 'openspec-propose', recordedAt: NOW })
    await recordDocument({ repoRoot: root, changeDir, phase: 'open', kind: 'tasks', path: paths.tasks, producer: 'openspec-propose', recordedAt: NOW })
    await recordDocument({ repoRoot: root, changeDir, phase: 'explore', kind: 'superpower-design', path: paths.superpowerDesign, producer: 'brainstorming', recordedAt: NOW })
    await recordDocument({ repoRoot: root, changeDir, phase: 'explore', kind: 'adr', path: paths.adr, producer: 'brainstorming', recordedAt: NOW })

    await recordDocumentReads({ repoRoot: root, changeDir, phase: 'explore', kind: 'all', readAt: NOW })
    expect(await evaluateDocumentEvidence(root, changeDir, 'explore')).toMatchObject({ pass: true, blockers: [] })

    await writeDoc(root, paths.proposal, '# changed after read\n')
    const stale = await evaluateDocumentEvidence(root, changeDir, 'explore')
    expect(stale.pass).toBe(false)
    expect(stale.items.find((item) => item.kind === 'proposal')?.status).toBe('stale')
    expect(stale.blockers.join('\n')).toContain("document 'proposal' 已缺失或内容变化")
  })

  test('不允许凭空声明 producer 或将项目外文件登记为 OpenSpec 文档', async () => {
    const { root, changeDir } = await fixture()
    const proposal = 'openspec/changes/governed-change/proposal.md'
    await writeDoc(root, proposal)
    await expect(recordDocument({
      repoRoot: root, changeDir, phase: 'open', kind: 'proposal', path: proposal,
      producer: 'openspec-propose', recordedAt: NOW,
    })).rejects.toThrow(/缺少 Skill 调用证据/)

    await appendSkillHistory(changeDir, 'openspec-propose')
    await expect(recordDocument({
      repoRoot: root, changeDir, phase: 'open', kind: 'proposal', path: '../outside.md',
      producer: 'openspec-propose', recordedAt: NOW,
    })).rejects.toBeInstanceOf(DocumentLedgerError)
  })

  test('旧 Change 可显式 backfill 已存在的前序文档，但不能补登记未来 phase', async () => {
    const { root, changeDir, name } = await fixture()
    const proposal = `openspec/changes/${name}/proposal.md`
    const report = `docs/superpowers/reports/${name}.md`
    await writeDoc(root, proposal)
    await writeDoc(root, report)
    await appendSkillHistory(changeDir, 'openspec-propose', 'verification-before-completion')

    await expect(recordDocument({
      repoRoot: root, changeDir, phase: 'spec', kind: 'proposal', path: proposal,
      producer: 'openspec-propose', recordedAt: NOW,
    })).rejects.toThrow(/只能在其所属 phase/)

    await expect(recordDocument({
      repoRoot: root, changeDir, phase: 'spec', kind: 'proposal', path: proposal,
      producer: 'openspec-propose', recordedAt: NOW, allowBackfill: true,
    })).resolves.toMatchObject({ records: [expect.objectContaining({ kind: 'proposal', path: proposal })] })

    await expect(recordDocument({
      repoRoot: root, changeDir, phase: 'spec', kind: 'verification-report', path: report,
      producer: 'verification-before-completion', recordedAt: NOW, allowBackfill: true,
    })).rejects.toThrow(/未来 phase 'verify'/)
  })
})
