import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStateStore } from '@pipeline-lite/kernel'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RunOutcome } from '../types.js'
import { createAutomation } from './sdk.js'

/**
 * SDK 对外 API 端到端（真 fs kernel store）：enqueue → scanReady → runRound（注入 fake runChange）。
 * 真读写 .pipeline.yaml automation 字段，断言真实落盘的状态机推进。
 */
describe('createAutomation SDK', () => {
  let root: string
  const store = createStateStore()
  const clock = () => '2026-07-07T00:00:00Z'

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'afk-sdk-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const initBuild = async (name: string) => {
    const dir = await store.init({ repoRoot: root, name, track: 'backend', preset: 'full', clock })
    await store.set(dir, 'phase', 'build')
    return dir
  }

  it('enqueue：off → queued + 落 queued_at（真字段）', async () => {
    const dir = await initBuild('x')
    const afk = createAutomation({ repoRoot: root, store, clock, config: { level: 'L1' } })
    expect(await afk.enqueue('x')).toBe(true)
    expect(await store.get(dir, 'automation')).toBe('queued')
    expect(await store.get(dir, 'automation_queued_at')).toBe('2026-07-07T00:00:00Z')
  })

  it('scanReady：真扫出 build+queued 就绪 change', async () => {
    await initBuild('x')
    const afk = createAutomation({ repoRoot: root, store, clock, config: { level: 'L1' } })
    await afk.enqueue('x')
    expect(await afk.scanReady()).toEqual(['x'])
  })

  it('runRound L1：真 claim + 跑（fake runChange）→ 落盘 paused（report-only 不自动 merge）', async () => {
    const dir = await initBuild('x')
    const afk = createAutomation({ repoRoot: root, store, clock, config: { level: 'L1' } })
    await afk.enqueue('x')
    const runChange = async (): Promise<RunOutcome> => ({
      commits: [{ sha: 'a'.repeat(40) }],
      verifyResult: 'pass',
      buildSha: 'a'.repeat(40),
      phaseEvent: 'verify-pass',
    })
    await afk.runRound(runChange)
    expect(await store.get(dir, 'automation')).toBe('paused') // L1 默认安全：不 merged
  })

  it('runRound L3：成功 → 真落盘 merged', async () => {
    const dir = await initBuild('x')
    const afk = createAutomation({ repoRoot: root, store, clock, config: { level: 'L3' } })
    await afk.enqueue('x')
    await afk.runRound(async () => ({
      commits: [{ sha: 'a'.repeat(40) }],
      verifyResult: 'pass',
      buildSha: 'a'.repeat(40),
      phaseEvent: 'verify-pass',
    }))
    expect(await store.get(dir, 'automation')).toBe('merged')
  })

  it('enabled=false（fail-safe OFF）：enqueue 拒绝（退回纯人工是安全的）', async () => {
    await initBuild('x')
    const afk = createAutomation({ repoRoot: root, store, clock, config: { level: 'L1', enabled: false } })
    expect(await afk.enqueue('x')).toBe(false)
  })
})
