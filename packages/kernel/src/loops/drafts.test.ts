import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { addDraftMark, clearDraftMark, draftMarksPath, readDraftMarks } from './drafts.js'

describe('loops/drafts —— 「agent 草稿 · 待你审阅」标记 sidecar（loop-init P2，真 fs 临时目录）', () => {
  let repoRoot: string
  let path: string
  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'lite-drafts-'))
    path = draftMarksPath(repoRoot)
  })
  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true })
  })

  test('draftMarksPath = <repoRoot>/.pipeline/loops.drafts.json', () => {
    expect(path).toBe(join(repoRoot, '.pipeline', 'loops.drafts.json'))
  })

  describe('readDraftMarks —— fail-open 语义（缺失/坏 JSON/形状不符一律 []，绝不抛）', () => {
    test('① 缺文件读 → [] 不抛', () => {
      expect(readDraftMarks(path)).toEqual([])
    })
    test('合法 {version:1, ids:[...]} → 原样返回', async () => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, JSON.stringify({ version: 1, ids: ['a-loop', 'b-loop'] }), 'utf8')
      expect(readDraftMarks(path)).toEqual(['a-loop', 'b-loop'])
    })
    test('② 坏 JSON → []', async () => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, '{oops', 'utf8')
      expect(readDraftMarks(path)).toEqual([])
    })
    test('② 形状不符 {ids:"x"}（ids 非数组）→ []', async () => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, JSON.stringify({ version: 1, ids: 'x' }), 'utf8')
      expect(readDraftMarks(path)).toEqual([])
    })
    test('② 形状不符：数组顶层 → []', async () => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, JSON.stringify(['a-loop', 'b-loop']), 'utf8')
      expect(readDraftMarks(path)).toEqual([])
    })
    test('② 形状不符：version 非 1 → []', async () => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, JSON.stringify({ version: 2, ids: ['a-loop'] }), 'utf8')
      expect(readDraftMarks(path)).toEqual([])
    })
    test('② 形状不符：ids 内含非字符串 → []', async () => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, JSON.stringify({ version: 1, ids: ['a-loop', 42] }), 'utf8')
      expect(readDraftMarks(path)).toEqual([])
    })
  })

  describe('addDraftMark —— 幂等增（首写自动建目录）', () => {
    test('③ add → read 回显（首写自动 mkdir .pipeline）', async () => {
      await addDraftMark(path, 'a-loop')
      expect(readDraftMarks(path)).toEqual(['a-loop'])
    })
    test('③ 多次 add 追加保序', async () => {
      await addDraftMark(path, 'a-loop')
      await addDraftMark(path, 'b-loop')
      expect(readDraftMarks(path)).toEqual(['a-loop', 'b-loop'])
    })
    test('③ 重复 add 幂等（不重复）', async () => {
      await addDraftMark(path, 'a-loop')
      await addDraftMark(path, 'a-loop')
      expect(readDraftMarks(path)).toEqual(['a-loop'])
    })
  })

  describe('clearDraftMark —— 只删目标 id、幂等', () => {
    test('④ clear 只删目标 id，其余保留', async () => {
      await addDraftMark(path, 'a-loop')
      await addDraftMark(path, 'b-loop')
      await addDraftMark(path, 'c-loop')
      await clearDraftMark(path, 'b-loop')
      expect(readDraftMarks(path)).toEqual(['a-loop', 'c-loop'])
    })
    test('④ clear 不存在的 id → 幂等无错、其余不动', async () => {
      await addDraftMark(path, 'a-loop')
      await clearDraftMark(path, 'ghost-loop')
      expect(readDraftMarks(path)).toEqual(['a-loop'])
    })
    test('④ clear 不存在 id 且文件缺失 → 幂等无错、不建文件', async () => {
      await expect(clearDraftMark(path, 'ghost-loop')).resolves.toBeUndefined()
      await expect(readFile(path, 'utf8')).rejects.toThrow()
    })
    test('清最后一个标记后保留 {version:1, ids:[]} 文件（不删文件）', async () => {
      await addDraftMark(path, 'solo-loop')
      await clearDraftMark(path, 'solo-loop')
      const raw = await readFile(path, 'utf8')
      expect(raw).toBe('{\n  "version": 1,\n  "ids": []\n}\n')
      expect(readDraftMarks(path)).toEqual([])
    })
  })

  describe('原子写 + 逐字节格式', () => {
    test('⑤ 写后同目录无 tmp 残留（tmp+rename 同目录）', async () => {
      await addDraftMark(path, 'a-loop')
      await addDraftMark(path, 'b-loop')
      await clearDraftMark(path, 'a-loop')
      const entries = await readdir(dirname(path))
      expect(entries).toEqual(['loops.drafts.json'])
    })
    test('⑥ 文件内容逐字节：{"version":1,"ids":[...]} 2 空格缩进 + 尾换行', async () => {
      await addDraftMark(path, 'a-loop')
      await addDraftMark(path, 'b-loop')
      const raw = await readFile(path, 'utf8')
      expect(raw).toBe('{\n  "version": 1,\n  "ids": [\n    "a-loop",\n    "b-loop"\n  ]\n}\n')
    })
  })
})
