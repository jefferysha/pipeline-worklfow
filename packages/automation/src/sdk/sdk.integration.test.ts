import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStateStore } from '@pipeline-lite/kernel'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RunOutcome } from '../types.js'
import { createAutomation, storeWriter } from './sdk.js'

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

  // ── T21：.pipeline/automation.json 装配（优先级 显式 deps.config > 文件 > DEFAULT）──
  const seedJson = async (obj: unknown) => {
    await mkdir(join(root, '.pipeline'), { recursive: true })
    await writeFile(join(root, '.pipeline', 'automation.json'), JSON.stringify(obj, null, 2), 'utf8')
  }

  it('automation.json 的 max_parallel/max_retries/default_opt_in 真进生效配置（不是假开关）', async () => {
    await seedJson({ version: 1, max_parallel: 2, max_retries: 3, default_opt_in: false })
    const afk = createAutomation({ repoRoot: root, store, clock })
    expect(afk.config.maxParallel).toBe(2)
    expect(afk.config.maxRetries).toBe(3)
    expect(afk.config.defaultOptIn).toBe(false)
  })

  it('文件 default_opt_in=false 覆盖 SDK 内置 true：未显式预置 queued 的 change enqueue 拒绝', async () => {
    await initBuild('x')
    await seedJson({ version: 1, default_opt_in: false })
    const afk = createAutomation({ repoRoot: root, store, clock, config: { level: 'L1' } })
    expect(await afk.enqueue('x')).toBe(false)
  })

  it('显式 deps.config 优先于 automation.json（文件说 2 并发，调用方显式给 6 → 6）', async () => {
    await seedJson({ version: 1, max_parallel: 2 })
    const afk = createAutomation({ repoRoot: root, store, clock, config: { maxParallel: 6 } })
    expect(afk.config.maxParallel).toBe(6)
  })

  it('损坏 automation.json → fail-open 全默认（SDK 内置 enabled/defaultOptIn 仍为 true）', async () => {
    await mkdir(join(root, '.pipeline'), { recursive: true })
    await writeFile(join(root, '.pipeline', 'automation.json'), '{{{broken', 'utf8')
    const afk = createAutomation({ repoRoot: root, store, clock })
    expect(afk.config.maxParallel).toBe(4)
    expect(afk.config.maxRetries).toBe(1)
    expect(afk.config.defaultOptIn).toBe(true)
    expect(afk.config.enabled).toBe(true)
  })

  it('文件手塞 enabled/level 被忽略（双源打架防线：这两个键不属于本文件）', async () => {
    await seedJson({ version: 1, enabled: false, level: 'L3', max_parallel: 5 })
    const afk = createAutomation({ repoRoot: root, store, clock })
    expect(afk.config.enabled).toBe(true) // SDK 内置显式 opt-in 语义不被文件翻转
    expect(afk.config.level).toBe('L1')
    expect(afk.config.maxParallel).toBe(5)
  })

  // ── F-b：storeWriter.markFailedSync 的 shutdown 写点——last_error/cause 同写（真落盘）──
  it('storeWriter.markFailedSync：中断标 failed + last_error=reason + cause 同写空串（中断非 tag 类，覆盖旧残留，读取端 regex 兜）', async () => {
    const dir = await initBuild('x')
    // 预置上一轮残留 cause——验证同写覆盖（防「消息换了、成因还是旧的」撕裂）
    await store.setMany(dir, { automation: 'running', automation_cause: 'timeout', automation_last_error: 'agent idle timeout' })
    const writer = storeWriter(store, (name) => join(root, 'openspec', 'changes', name))
    writer.markFailedSync('x', 'scheduler interrupted')
    // fire-and-forget（void promise）：轮询等真落盘
    for (let i = 0; i < 100 && (await store.get(dir, 'automation')) !== 'failed'; i++) {
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(await store.get(dir, 'automation')).toBe('failed')
    expect(await store.get(dir, 'automation_last_error')).toBe('scheduler interrupted')
    expect(await store.get(dir, 'automation_cause')).toBe('')
  })
})
