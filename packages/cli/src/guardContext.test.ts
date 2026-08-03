import { mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createStateStore } from '@tenon/kernel'
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

  test('bounded reader rejects an oversized sparse tasks file before materializing its contents', async () => {
    const tasks = join(root, 'openspec', 'changes', 'subject', 'tasks.md')
    await mkdir(join(tasks, '..'), { recursive: true })
    await writeFile(tasks, '# Tasks\n', 'utf8')
    await truncate(tasks, 1_048_578)

    const context = makeGuardCtx(root)('subject')
    expect(context.readFileBounded?.('openspec/changes/subject/tasks.md', 1_048_577))
      .toEqual({ kind: 'invalid' })
  })

  test('bounded reader accepts the exact UTF-8 byte boundary and rejects invalid UTF-8', async () => {
    const tasks = join(root, 'openspec', 'changes', 'subject', 'tasks.md')
    await mkdir(join(tasks, '..'), { recursive: true })
    await writeFile(tasks, 'abcd', 'utf8')
    const context = makeGuardCtx(root)('subject')
    expect(context.readFileBounded?.('openspec/changes/subject/tasks.md', 4))
      .toEqual({ kind: 'ok', text: 'abcd' })
    await writeFile(tasks, Buffer.from([0xc3, 0x28]))
    expect(context.readFileBounded?.('openspec/changes/subject/tasks.md', 4))
      .toEqual({ kind: 'invalid' })
  })
})
