import { createHash } from 'node:crypto'
import { lstat, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export interface LegacyRuntimeRoots {
  readonly homeDir: string
  readonly dataRoot: string
  readonly stateRoot: string
  readonly configRoot: string
}

export interface CapturedLegacyLauncher {
  readonly path: string
  readonly sha256: string
}

const LEGACY_LAUNCHERS = ['pipeline', 'pipeline-hook'] as const
const MAX_LAUNCHER_BYTES = 8 * 1024

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

function expectedMarkers(roots: LegacyRuntimeRoots, name: (typeof LEGACY_LAUNCHERS)[number]): readonly string[] {
  const mode = name === 'pipeline' ? 'cli' : 'hook'
  const bootstrap = join(resolve(roots.dataRoot), 'bootstrap', 'active.mjs')
  return [
    '#!/usr/bin/env bash',
    'set -eu',
    `export PIPELINE_RUNTIME_DATA_ROOT=${shellQuote(resolve(roots.dataRoot))}`,
    `export PIPELINE_RUNTIME_STATE_ROOT=${shellQuote(resolve(roots.stateRoot))}`,
    `export PIPELINE_RUNTIME_CONFIG_ROOT=${shellQuote(resolve(roots.configRoot))}`,
    `[ -f ${shellQuote(bootstrap)} ]`,
    `exec node ${shellQuote(bootstrap)} ${mode} "$@"`,
  ]
}

async function readOwnedLauncher(
  path: string,
  roots: LegacyRuntimeRoots,
  name: (typeof LEGACY_LAUNCHERS)[number],
): Promise<CapturedLegacyLauncher | null> {
  let item
  try {
    item = await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  if (item.isSymbolicLink()) throw new Error(`旧 launcher 是符号链接，拒绝跟随或删除：${path}`)
  if (!item.isFile()) throw new Error(`旧 launcher 不是普通文件，拒绝删除：${path}`)
  if (item.size > MAX_LAUNCHER_BYTES) throw new Error(`旧 launcher 超过大小上限，拒绝删除：${path}`)
  const content = await readFile(path)
  const text = content.toString('utf8')
  for (const marker of expectedMarkers(roots, name)) {
    if (!text.includes(marker)) throw new Error(`旧 launcher 不符合受管模板，拒绝删除：${path}`)
  }
  return { path, sha256: sha256(content) }
}

/**
 * Capture ownership evidence for the exact two legacy launchers.
 *
 * A path existing at the expected location is not enough: it must be a regular file whose runtime
 * roots and bootstrap command match the old managed template. The digest is persisted in the
 * migration receipt and checked again immediately before cleanup.
 */
export async function captureOwnedLegacyLaunchers(
  roots: LegacyRuntimeRoots,
): Promise<readonly CapturedLegacyLauncher[]> {
  const binRoot = join(resolve(roots.homeDir), '.local', 'bin')
  const captured: CapturedLegacyLauncher[] = []
  for (const name of LEGACY_LAUNCHERS) {
    const entry = await readOwnedLauncher(join(binRoot, name), roots, name)
    if (entry !== null) captured.push(entry)
  }
  return captured
}

async function assertCaptured(entry: CapturedLegacyLauncher): Promise<void> {
  const item = await lstat(entry.path)
  if (item.isSymbolicLink() || !item.isFile()) {
    throw new Error(`已捕获的旧 launcher 类型已变化，拒绝删除：${entry.path}`)
  }
  const current = sha256(await readFile(entry.path))
  if (current !== entry.sha256) throw new Error(`已捕获的旧 launcher 摘要已变化，拒绝删除：${entry.path}`)
}

/** Remove only files that still byte-match the ownership receipt; all entries preflight first. */
export async function removeCapturedLegacyLaunchers(
  entries: readonly CapturedLegacyLauncher[],
): Promise<void> {
  for (const entry of entries) await assertCaptured(entry)
  for (const entry of entries) await rm(entry.path)
}
