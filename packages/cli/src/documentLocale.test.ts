import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { resolveChangeDocumentLocale } from './documentLocale.js'

const roots: string[] = []

async function changeDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-legacy-document-locale-'))
  roots.push(root)
  const dir = join(root, 'openspec', 'changes', 'legacy')
  await mkdir(dir, { recursive: true })
  return dir
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('resolveChangeDocumentLocale', () => {
  test('从旧英文 H1 推断并固定，不被新中文默认覆盖', async () => {
    const dir = await changeDir()
    await writeFile(join(dir, 'proposal.md'), '# Proposal\n', 'utf8')
    await expect(resolveChangeDocumentLocale(dir, undefined, true)).resolves.toBe('en')
    await expect(readFile(join(dir, '.pipeline-document-locale.json'), 'utf8'))
      .resolves.toContain('"locale":"en"')
  })

  test('旧文档混合语言或显式 locale 与已有 H1 冲突时 fail-loud', async () => {
    const mixed = await changeDir()
    await writeFile(join(mixed, 'proposal.md'), '# Proposal\n', 'utf8')
    await writeFile(join(mixed, 'design.md'), '# 设计\n', 'utf8')
    await expect(resolveChangeDocumentLocale(mixed, undefined, true)).rejects.toThrow(/不一致/)

    const english = await changeDir()
    await writeFile(join(english, 'tasks.md'), '# Tasks\n', 'utf8')
    await expect(resolveChangeDocumentLocale(english, 'zh-CN', true)).rejects.toThrow(/拒绝固定/)
    await expect(readFile(join(english, '.pipeline-document-locale.json'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('从自定义中文或英文 H1 推断，不依赖固定模板标题', async () => {
    const chinese = await changeDir()
    await writeFile(join(chinese, 'proposal.md'), '# 面向团队的发布治理\n', 'utf8')
    await expect(resolveChangeDocumentLocale(chinese, undefined, true)).resolves.toBe('zh-CN')

    const english = await changeDir()
    await writeFile(join(english, 'proposal.md'), '# Release governance for teams\n', 'utf8')
    await expect(resolveChangeDocumentLocale(english, undefined, true)).resolves.toBe('en')
  })

  test('自定义 H1 同时混用两种文字或完全没有可判断信号时 fail-loud', async () => {
    const mixed = await changeDir()
    await writeFile(join(mixed, 'proposal.md'), '# Release 发布治理\n', 'utf8')
    await expect(resolveChangeDocumentLocale(mixed, undefined, true)).rejects.toThrow(/无法可靠判断|不一致/)

    const ambiguous = await changeDir()
    await writeFile(join(ambiguous, 'proposal.md'), '# 2026-07-25\n', 'utf8')
    await expect(resolveChangeDocumentLocale(ambiguous, undefined, true)).rejects.toThrow(/无法可靠判断/)
  })
})
