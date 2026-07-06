import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createHistoryWriter, HISTORY_FILE } from './history.js'

describe('createHistoryWriter —— .pipeline-history.jsonl 侧文件（CONTRACT §1）', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'lite-history-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('append 创建文件并逐行追加，一行一个合法 JSON、保持顺序', async () => {
    const w = createHistoryWriter()
    await w.append(dir, { ts: '2026-07-06T00:00:00Z', kind: 'init', by: 'jeff' })
    await w.append(dir, { ts: '2026-07-06T00:00:01Z', kind: 'set', field: 'plan', to: 'docs/p.md' })
    await w.append(dir, { ts: '2026-07-06T00:00:02Z', kind: 'transition', from: 'open', to: 'explore' })

    const raw = await readFile(join(dir, HISTORY_FILE), 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    const lines = raw.trimEnd().split('\n')
    expect(lines).toHaveLength(3)
    const parsed = lines.map((l) => JSON.parse(l) as Record<string, string>)
    expect(parsed[0]).toEqual({ ts: '2026-07-06T00:00:00Z', kind: 'init', by: 'jeff' })
    expect(parsed[1]).toEqual({ ts: '2026-07-06T00:00:01Z', kind: 'set', field: 'plan', to: 'docs/p.md' })
    expect(parsed[2]).toEqual({ ts: '2026-07-06T00:00:02Z', kind: 'transition', from: 'open', to: 'explore' })
  })

  test('目录不存在 → 抛错（best-effort 语义由调用方兜，writer 本身 fail-loud）', async () => {
    const w = createHistoryWriter()
    await expect(
      w.append(join(dir, 'no-such-subdir'), { ts: 't', kind: 'set' }),
    ).rejects.toThrow()
  })
})
