import { access, chmod, link, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { freezeTrustedExecutable } from '../commands/trusted-executable.js'
import {
  captureStableLaunchers,
  expectedStableLaunchers,
  restoreStableLaunchers,
  writeStableLaunchers,
} from './launchers.js'
import { resolveRuntimePaths } from './paths.js'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

describe('writeStableLaunchers', () => {
  it('writes stable scripts rather than a marketplace bundle symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-launcher-'))
    roots.push(root)
    const paths = resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
    const written = await writeStableLaunchers(paths, root)
    const tenon = await readFile(written.tenon, 'utf8')
    const hook = await readFile(written.hook, 'utf8')
    expect(tenon).toMatch(/^#!\/bin\/sh\n/)
    expect(tenon).toContain(`exec '${process.execPath}'`)
    expect(tenon).not.toContain('/usr/bin/env bash')
    expect(tenon).not.toContain('exec node ')
    expect(tenon).toContain('TENON_RUNTIME_ROOTS=')
    expect(tenon).not.toContain('PLUGIN_ROOT')
    expect(hook).toContain(' hook "$@"')
  })

  it('publishes the frozen Node path and revalidates it before both launcher writes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-launcher-frozen-node-'))
    roots.push(root)
    const paths = resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
    const frozenNode = '/opt/tenon/trusted/node'
    let verifies = 0

    const written = await writeStableLaunchers(paths, root, {
      nodeExecutable: frozenNode,
      verifyNode: () => { verifies += 1 },
    })

    expect(await readFile(written.tenon, 'utf8')).toContain(`exec '${frozenNode}'`)
    expect(await readFile(written.hook, 'utf8')).toContain(`exec '${frozenNode}'`)
    expect(verifies).toBeGreaterThanOrEqual(3)
  })

  it('persists the frozen Node proof and refuses a later same-path executable drift', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-launcher-node-proof-'))
    roots.push(root)
    const runtimeHome = join(root, 'runtime')
    const paths = resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: runtimeHome }, homeDir: root, platform: 'linux' })
    const node = join(root, 'trusted-node')
    const executed = join(root, 'executed')
    await writeFile(node, `#!/bin/sh\nprintf executed > '${executed}'\n`, { mode: 0o755 })
    const trusted = freezeTrustedExecutable(node)
    if (trusted === undefined) throw new Error('test fixture Node must be trustworthy')
    await mkdir(paths.bootstrapRoot, { recursive: true })
    await writeFile(join(paths.bootstrapRoot, 'active.mjs'), '', 'utf8')

    const written = await writeStableLaunchers(paths, root, {
      nodeExecutable: trusted.executable,
      nodeProof: trusted.proof,
      verifyNode: trusted.assert,
    })
    await writeFile(node, '#!/bin/sh\nprintf drifted > /dev/null\n', { mode: 0o755 })

    const result = spawnSync('/bin/sh', [written.tenon], { encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    await expect(access(executed)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(result.stderr).toMatch(/Node identity changed/iu)
  })

  it('does not claim or capture an already exact hardened launcher', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-launcher-exact-noop-'))
    roots.push(root)
    const paths = resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
    const written = await writeStableLaunchers(paths, root)
    const checkpoint = await captureStableLaunchers(paths, root)
    await writeFile(`${written.tenon}.tenon-transition-owner`, 'unrelated-owner\n', 'utf8')
    await writeFile(`${written.hook}.tenon-transition-owner`, 'unrelated-owner\n', 'utf8')

    await writeStableLaunchers(paths, root, { checkpoint })

    expect(await captureStableLaunchers(paths, root)).toEqual(checkpoint)
    expect(await readFile(`${written.tenon}.tenon-transition-owner`, 'utf8')).toBe('unrelated-owner\n')
    expect(await readFile(`${written.hook}.tenon-transition-owner`, 'utf8')).toBe('unrelated-owner\n')
  })

  it('restores pre-existing launcher bytes and modes after a compensated activation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-launcher-rollback-'))
    roots.push(root)
    const bin = join(root, '.local', 'bin')
    await writeFile(join(root, 'placeholder'), '', 'utf8')
    await import('node:fs/promises').then(({ mkdir }) => mkdir(bin, { recursive: true }))
    const tenon = join(bin, 'tenon')
    const hook = join(bin, 'tenon-hook')
    await writeFile(tenon, '#!/bin/sh\necho original\n', 'utf8')
    await writeFile(hook, '#!/bin/sh\necho original-hook\n', 'utf8')
    await chmod(tenon, 0o750)
    await chmod(hook, 0o700)

    const paths = resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
    const snapshot = await captureStableLaunchers(paths, root)
    await writeStableLaunchers(paths, root, { checkpoint: snapshot })
    const committed = await captureStableLaunchers(paths, root)
    await restoreStableLaunchers(snapshot, committed)

    expect(await readFile(tenon, 'utf8')).toBe('#!/bin/sh\necho original\n')
    expect(await readFile(hook, 'utf8')).toBe('#!/bin/sh\necho original-hook\n')
    expect((await stat(tenon)).mode & 0o777).toBe(0o750)
    expect((await stat(hook)).mode & 0o777).toBe(0o700)
  })

  it('removes first-install launchers when activation compensation returns to no active release', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-launcher-first-install-'))
    roots.push(root)
    const paths = resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
    const snapshot = await captureStableLaunchers(paths, root)
    const written = await writeStableLaunchers(paths, root)
    const committed = await captureStableLaunchers(paths, root)
    await restoreStableLaunchers(snapshot, committed)

    await expect(access(written.tenon)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(written.hook)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses to overwrite a launcher changed by another owner after activation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-launcher-cas-'))
    roots.push(root)
    const paths = resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
    const before = await captureStableLaunchers(paths, root)
    await writeStableLaunchers(paths, root, { checkpoint: before })
    const committed = await captureStableLaunchers(paths, root)
    await writeFile(committed.tenon.path, '#!/bin/sh\necho external-owner\n', 'utf8')

    await expect(restoreStableLaunchers(before, committed)).rejects.toThrow('外部修改')
    expect(await readFile(committed.tenon.path, 'utf8')).toContain('external-owner')
  })

  it('preserves external bytes injected after proof and before no-replace publication', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-launcher-proof-race-'))
    roots.push(root)
    const bin = join(root, '.local', 'bin')
    await import('node:fs/promises').then(({ mkdir }) => mkdir(bin, { recursive: true }))
    const tenon = join(bin, 'tenon')
    const hook = join(bin, 'tenon-hook')
    await writeFile(tenon, '#!/bin/sh\necho original\n', 'utf8')
    await writeFile(hook, '#!/bin/sh\necho original-hook\n', 'utf8')
    await chmod(tenon, 0o755)
    await chmod(hook, 0o755)
    const paths = resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
    const checkpoint = await captureStableLaunchers(paths, root)

    await expect(writeStableLaunchers(paths, root, {
      checkpoint,
      beforeReplace: async (path) => {
        if (path === tenon) await writeFile(path, '#!/bin/sh\necho external-owner\n', 'utf8')
      },
    })).rejects.toThrow(/third-party|外部修改|拒绝覆盖/iu)

    expect(await readFile(tenon, 'utf8')).toBe('#!/bin/sh\necho external-owner\n')
    expect(await readFile(hook, 'utf8')).toBe('#!/bin/sh\necho original-hook\n')
  })

  it('resumes after the previous launcher was captured but the replacement was not published', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-launcher-captured-crash-'))
    roots.push(root)
    const bin = join(root, '.local', 'bin')
    await mkdir(bin, { recursive: true })
    const tenon = join(bin, 'tenon')
    const hook = join(bin, 'tenon-hook')
    await writeFile(tenon, '#!/bin/sh\necho original\n', 'utf8')
    await writeFile(hook, '#!/bin/sh\necho original-hook\n', 'utf8')
    await chmod(tenon, 0o750)
    await chmod(hook, 0o700)

    const paths = resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
    const checkpoint = await captureStableLaunchers(paths, root)
    const expected = expectedStableLaunchers(paths, root)
    const transitionRoot = `${tenon}.tenon-transition-v1`
    await mkdir(transitionRoot, { mode: 0o700 })
    await writeFile(
      `${tenon}.tenon-transition-owner`,
      `${JSON.stringify({
        version: 1,
        target: expected.tenon,
        checkpoint: checkpoint.tenon,
        committed: expected.tenon,
      })}\n`,
      { mode: 0o600 },
    )
    await rename(tenon, join(transitionRoot, 'previous'))

    await writeStableLaunchers(paths, root, { checkpoint })

    const converged = await captureStableLaunchers(paths, root)
    expect(converged).toEqual(expected)
    await expect(access(`${tenon}.tenon-transition-owner`)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(transitionRoot)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('retires an exact published transition before a later activation compensation restores launchers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-launcher-published-crash-'))
    roots.push(root)
    const bin = join(root, '.local', 'bin')
    await mkdir(bin, { recursive: true })
    const tenon = join(bin, 'tenon')
    const hook = join(bin, 'tenon-hook')
    await writeFile(tenon, '#!/bin/sh\necho original\n', 'utf8')
    await writeFile(hook, '#!/bin/sh\necho original-hook\n', 'utf8')
    await chmod(tenon, 0o750)
    await chmod(hook, 0o700)

    const paths = resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
    const checkpoint = await captureStableLaunchers(paths, root)
    const expected = expectedStableLaunchers(paths, root)
    const transitionRoot = `${tenon}.tenon-transition-v1`
    const previous = join(transitionRoot, 'previous')
    const next = join(transitionRoot, 'next')
    await mkdir(transitionRoot, { mode: 0o700 })
    await writeFile(
      `${tenon}.tenon-transition-owner`,
      `${JSON.stringify({
        version: 1,
        target: expected.tenon,
        checkpoint: checkpoint.tenon,
        committed: expected.tenon,
      })}\n`,
      { mode: 0o600 },
    )
    await rename(tenon, previous)
    if (expected.tenon.state.kind !== 'file') throw new Error('expected stable launcher must be a file')
    await writeFile(next, expected.tenon.state.content, { mode: expected.tenon.state.mode })
    await link(next, tenon)

    // Recovery observes the committed public bytes. It must retire the exact private transition
    // before a later Dashboard/evidence failure asks compensation to restore the checkpoint.
    await writeStableLaunchers(paths, root, { checkpoint })
    await expect(access(`${tenon}.tenon-transition-owner`)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(transitionRoot)).rejects.toMatchObject({ code: 'ENOENT' })
    await restoreStableLaunchers(checkpoint, expected)

    expect(await readFile(tenon, 'utf8')).toBe('#!/bin/sh\necho original\n')
    expect((await stat(tenon)).mode & 0o777).toBe(0o750)
    expect(await readFile(hook, 'utf8')).toBe('#!/bin/sh\necho original-hook\n')
    expect((await stat(hook)).mode & 0o777).toBe(0o700)
  })

  it('rejects a captured transition whose private previous bytes no longer match the checkpoint', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-launcher-captured-drift-'))
    roots.push(root)
    const bin = join(root, '.local', 'bin')
    await mkdir(bin, { recursive: true })
    const tenon = join(bin, 'tenon')
    const hook = join(bin, 'tenon-hook')
    await writeFile(tenon, '#!/bin/sh\necho original\n', 'utf8')
    await writeFile(hook, '#!/bin/sh\necho original-hook\n', 'utf8')
    const paths = resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
    const checkpoint = await captureStableLaunchers(paths, root)
    const expected = expectedStableLaunchers(paths, root)
    const transitionRoot = `${tenon}.tenon-transition-v1`
    const previous = join(transitionRoot, 'previous')
    await mkdir(transitionRoot, { mode: 0o700 })
    await writeFile(
      `${tenon}.tenon-transition-owner`,
      `${JSON.stringify({
        version: 1,
        target: expected.tenon,
        checkpoint: checkpoint.tenon,
        committed: expected.tenon,
      })}\n`,
      { mode: 0o600 },
    )
    await rename(tenon, previous)
    await writeFile(previous, '#!/bin/sh\necho unrelated\n', 'utf8')

    await expect(writeStableLaunchers(paths, root, { checkpoint }))
      .rejects.toThrow('third-party byte or path state')
    await expect(access(tenon)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(previous, 'utf8')).toBe('#!/bin/sh\necho unrelated\n')
    expect(await readFile(hook, 'utf8')).toBe('#!/bin/sh\necho original-hook\n')
  })

  it('restores an installer-owned partial write even when chmod did not finish', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-launcher-partial-mode-'))
    roots.push(root)
    const bin = join(root, '.local', 'bin')
    await import('node:fs/promises').then(({ mkdir }) => mkdir(bin, { recursive: true }))
    const tenon = join(bin, 'tenon')
    const hook = join(bin, 'tenon-hook')
    await writeFile(tenon, '#!/bin/sh\necho original\n', 'utf8')
    await writeFile(hook, '#!/bin/sh\necho original-hook\n', 'utf8')
    await chmod(tenon, 0o750)
    await chmod(hook, 0o700)

    const paths = resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
    const before = await captureStableLaunchers(paths, root)
    await writeStableLaunchers(paths, root, { checkpoint: before })
    const committed = await captureStableLaunchers(paths, root)
    await chmod(tenon, 0o600)

    await restoreStableLaunchers(before, committed)

    expect(await readFile(tenon, 'utf8')).toBe('#!/bin/sh\necho original\n')
    expect((await stat(tenon)).mode & 0o777).toBe(0o750)
  })
})
