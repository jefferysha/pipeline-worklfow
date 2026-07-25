import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ensureDocumentLocalePin, readDocumentLocalePin } from './document-locale.js'
const roots: string[] = []

async function freshRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-document-locale-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('document locale pin', () => {
  test('原子创建并幂等读取固定 locale', async () => {
    const root = await freshRoot()
    await expect(ensureDocumentLocalePin(root, 'en')).resolves.toEqual({ version: 1, locale: 'en' })
    await expect(readDocumentLocalePin(root)).resolves.toEqual({ version: 1, locale: 'en' })
    await expect(ensureDocumentLocalePin(root, 'en')).resolves.toEqual({ version: 1, locale: 'en' })
    await expect(readFile(join(root, '.pipeline-document-locale.json'), 'utf8'))
      .resolves.toBe('{"version":1,"locale":"en"}\n')
  })

  test('拒绝覆盖和 symlink pin', async () => {
    const root = await freshRoot()
    await ensureDocumentLocalePin(root, 'zh-CN')
    await expect(ensureDocumentLocalePin(root, 'en')).rejects.toThrow(/固定/)

    const second = await freshRoot()
    await symlink(join(root, '.pipeline-document-locale.json'), join(second, '.pipeline-document-locale.json'))
    await expect(readDocumentLocalePin(second)).rejects.toThrow(/symlink/)
  })
})
