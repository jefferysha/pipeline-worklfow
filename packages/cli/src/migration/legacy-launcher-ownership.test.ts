import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  captureOwnedLegacyLaunchers,
  removeCapturedLegacyLaunchers,
} from './legacy-launcher-ownership.js'

function oldLauncher(dataRoot: string, stateRoot: string, configRoot: string, mode: 'cli' | 'hook'): string {
  const missing = mode === 'hook'
    ? 'exit 0'
    : 'printf "tenon runtime bootstrap unavailable; run tenon setup --codex or tenon setup --claude\\n" >&2\n  exit 1'
  return `#!/usr/bin/env bash
set -eu
export PIPELINE_RUNTIME_DATA_ROOT='${dataRoot}'
export PIPELINE_RUNTIME_STATE_ROOT='${stateRoot}'
export PIPELINE_RUNTIME_CONFIG_ROOT='${configRoot}'
[ -f '${join(dataRoot, 'bootstrap', 'active.mjs')}' ] || { ${missing}; }
exec node '${join(dataRoot, 'bootstrap', 'active.mjs')}' ${mode} "$@"
`
}

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'tenon-legacy-owner-'))
  const dataRoot = join(home, 'Library', 'Application Support', 'pipeline-lite')
  const stateRoot = join(dataRoot, 'state')
  const configRoot = join(dataRoot, 'config')
  const bin = join(home, '.local', 'bin')
  await mkdir(bin, { recursive: true })
  await writeFile(join(bin, 'pipeline'), oldLauncher(dataRoot, stateRoot, configRoot, 'cli'), { mode: 0o755 })
  await writeFile(join(bin, 'pipeline-hook'), oldLauncher(dataRoot, stateRoot, configRoot, 'hook'), { mode: 0o755 })
  return { home, dataRoot, stateRoot, configRoot, bin }
}

describe('legacy launcher ownership', () => {
  it('captures exact hashes only for the two recognized managed launchers', async () => {
    const f = await fixture()
    const captured = await captureOwnedLegacyLaunchers({
      homeDir: f.home,
      dataRoot: f.dataRoot,
      stateRoot: f.stateRoot,
      configRoot: f.configRoot,
    })

    expect(captured).toHaveLength(2)
    expect(captured.map((entry) => entry.path)).toEqual([
      join(f.bin, 'pipeline'),
      join(f.bin, 'pipeline-hook'),
    ])
    expect(captured.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256))).toBe(true)
  })

  it('refuses an external symlink instead of following or deleting it', async () => {
    const f = await fixture()
    const outside = join(f.home, 'user-script')
    await writeFile(outside, '#!/bin/sh\necho user\n')
    await rm(join(f.bin, 'pipeline'))
    await symlink(outside, join(f.bin, 'pipeline'))

    await expect(captureOwnedLegacyLaunchers({
      homeDir: f.home,
      dataRoot: f.dataRoot,
      stateRoot: f.stateRoot,
      configRoot: f.configRoot,
    })).rejects.toThrow(/符号链接/)
    await expect(readFile(outside, 'utf8')).resolves.toContain('echo user')
  })

  it('does not remove a launcher that changed after ownership capture', async () => {
    const f = await fixture()
    const captured = await captureOwnedLegacyLaunchers({
      homeDir: f.home,
      dataRoot: f.dataRoot,
      stateRoot: f.stateRoot,
      configRoot: f.configRoot,
    })
    await writeFile(join(f.bin, 'pipeline'), '#!/bin/sh\necho user replacement\n')

    await expect(removeCapturedLegacyLaunchers(captured)).rejects.toThrow(/摘要已变化/)
    await expect(readFile(join(f.bin, 'pipeline'), 'utf8')).resolves.toContain('user replacement')
  })
})
