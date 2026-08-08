import { access, chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  captureStableLaunchers,
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
    await writeStableLaunchers(paths, root)
    await restoreStableLaunchers(snapshot)

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
    await restoreStableLaunchers(snapshot)

    await expect(access(written.tenon)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(written.hook)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses to overwrite a launcher changed by another owner after activation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-launcher-cas-'))
    roots.push(root)
    const paths = resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
    const before = await captureStableLaunchers(paths, root)
    await writeStableLaunchers(paths, root)
    const committed = await captureStableLaunchers(paths, root)
    await writeFile(committed.tenon.path, '#!/bin/sh\necho external-owner\n', 'utf8')

    await expect(restoreStableLaunchers(before, committed)).rejects.toThrow('外部修改')
    expect(await readFile(committed.tenon.path, 'utf8')).toContain('external-owner')
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
    await writeStableLaunchers(paths, root)
    const committed = await captureStableLaunchers(paths, root)
    await chmod(tenon, 0o600)

    await restoreStableLaunchers(before, committed)

    expect(await readFile(tenon, 'utf8')).toBe('#!/bin/sh\necho original\n')
    expect((await stat(tenon)).mode & 0o777).toBe(0o750)
  })
})
