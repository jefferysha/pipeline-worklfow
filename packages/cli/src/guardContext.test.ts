import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createStateStore } from '@pipeline-lite/kernel'
import { makeGuardCtx } from './guardContext.js'

describe('guard context dependency archive sources', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'guard-context-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test('active dependency trusts only its canonical archived field, not a stale same-name archive', async () => {
    const store = createStateStore()
    const dependency = await store.init({
      repoRoot: root,
      name: 'dep',
      track: 'simple',
      reviewSeed: 'pending',
      preset: 'tweak',
      clock: () => '2026-07-24T00:00:00Z',
    })
    await mkdir(join(root, 'openspec', 'changes', 'archive', '2026-07-01-dep'), { recursive: true })

    const context = makeGuardCtx(root)('subject')
    expect(context.dirExists?.('openspec/changes/dep')).toBe(true)
    expect(context.changeArchived?.('dep')).toBe(true)
    expect(context.activeChangeArchived?.('dep')).toBe(false)

    await store.set(dependency, 'archived', 'true')
    expect(context.activeChangeArchived?.('dep')).toBe(true)
  })

  test('damaged active canonical state fails closed even when a stale physical archive exists', async () => {
    const store = createStateStore()
    const dependency = await store.init({
      repoRoot: root,
      name: 'dep',
      track: 'simple',
      reviewSeed: 'pending',
      preset: 'tweak',
      clock: () => '2026-07-24T00:00:00Z',
    })
    await mkdir(join(root, 'openspec', 'changes', 'archive', '2026-07-01-dep'), { recursive: true })
    await writeFile(join(dependency, '.pipeline-run', 'current.json'), '{broken', 'utf8')

    const context = makeGuardCtx(root)('subject')
    expect(context.changeArchived?.('dep')).toBe(true)
    expect(context.activeChangeArchived?.('dep')).toBe(false)
  })
})
