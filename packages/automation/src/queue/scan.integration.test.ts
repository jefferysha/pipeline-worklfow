import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStateStore } from '@pipeline-lite/kernel'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanReadyFromFs } from './scan.js'

/**
 * 真 fs 扫描：真建 openspec/changes/*，真读回 automation 字段，真判 dep 满足（merged ∪ archived）。
 */
describe('scanReadyFromFs（真 fs 枚举 + 真读 automation 字段）', () => {
  let root: string
  const store = createStateStore()
  const clock = () => '2026-07-07T00:00:00Z'
  const changesDir = () => join(root, 'openspec', 'changes')

  const initQueued = async (name: string, queuedAt: string, depends: string[] = []) => {
    const dir = await store.init({ repoRoot: root, name, track: 'backend', preset: 'full', clock })
    await store.setMany(dir, {
      phase: 'build',
      automation: 'queued',
      automation_queued_at: queuedAt,
      depends_on: depends.length ? depends : 'null',
    })
    return dir
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'afk-scan-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('挑出 build+queued 就绪 change，按 queued_at FIFO', async () => {
    await initQueued('later', '2026-07-07T09:00:00Z')
    await initQueued('earlier', '2026-07-07T08:00:00Z')
    // 一个 spec 相位的 change 不该入选
    const dir = await store.init({ repoRoot: root, name: 'notbuild', track: 'backend', preset: 'full', clock })
    await store.setMany(dir, { phase: 'spec', automation: 'queued' })

    expect(await scanReadyFromFs(changesDir(), store)).toEqual(['earlier', 'later'])
  })

  it('dep automation=merged → 满足；dep 仍 queued → 不放行', async () => {
    await initQueued('dep', '2026-07-07T08:00:00Z')
    await initQueued('child', '2026-07-07T08:30:00Z', ['dep'])
    // dep 尚未 merged：child 不就绪，dep 就绪
    expect(await scanReadyFromFs(changesDir(), store)).toEqual(['dep'])
    // dep 翻 merged → child 解锁
    const depDir = join(changesDir(), 'dep')
    await store.set(depDir, 'automation', 'merged')
    expect(await scanReadyFromFs(changesDir(), store)).toEqual(['child'])
  })

  it('dep 已归档（archive/*-<dep>）→ 满足', async () => {
    await initQueued('child', '2026-07-07T08:00:00Z', ['archdep'])
    // 没有 archdep 活跃 change 也没归档 → 不就绪
    expect(await scanReadyFromFs(changesDir(), store)).toEqual([])
    // 造一个归档目录 openspec/changes/archive/2026-07-06-archdep
    await mkdir(join(changesDir(), 'archive', '2026-07-06-archdep'), { recursive: true })
    expect(await scanReadyFromFs(changesDir(), store)).toEqual(['child'])
  })
})
