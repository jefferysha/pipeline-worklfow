import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { atomicLinkPublish } from './atomic-publish.js'

const dirs: string[] = []
async function freshDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'pl-atomic-publish-'))
  dirs.push(d)
  return d
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

describe('atomicLinkPublish —— 独占创建原子发布（W1 第二增量第 9 轮 codex review：提炼共享' +
  '实现，避免 store.ts/transition-record-store.ts 各自维护一份 tmp+link+unlink 时漂移）', () => {
  test('成功：target 落盘且内容完整，临时文件不残留', async () => {
    const dir = await freshDir()
    const target = join(dir, 'out.txt')
    await atomicLinkPublish(dir, '.tmp', target, 'hello world')
    expect(await readFile(target, 'utf8')).toBe('hello world')
    expect(await readdir(dir)).toEqual(['out.txt'])
  })

  test('target 已存在 → 原生 EEXIST 错误，不转译；临时文件不残留', async () => {
    const dir = await freshDir()
    const target = join(dir, 'out.txt')
    await atomicLinkPublish(dir, '.tmp', target, 'first')
    await expect(atomicLinkPublish(dir, '.tmp', target, 'second')).rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(target, 'utf8')).toBe('first') // 第二次失败请求没有覆盖第一次的内容
    expect(await readdir(dir)).toEqual(['out.txt']) // 第二次失败请求自己的临时文件也已清理
  })

  test('目标目录不存在（mkdir 由调用方负责，这里不兜底）→ writeFile 阶段直接失败，' +
    '不会残留一个"写了一半"的临时文件（因为 wx 创建那一步本身就没成功）', async () => {
    const dir = await freshDir()
    const missingDir = join(dir, 'no-such-subdir')
    await expect(atomicLinkPublish(missingDir, '.tmp', join(missingDir, 'out.txt'), 'x')).rejects.toThrow()
  })
})
