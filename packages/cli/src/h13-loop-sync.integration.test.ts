/**
 * H13 真实进程边界：直接执行重建后的本地 dist binary，确认 loops sync dry-run
 * 经过 Commander 与命令分派后仍是零写入，并保持 Codex-first fixture。
 */
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createLoopsYamlText } from '@pipeline-lite/kernel'

const DIST_BINARY = fileURLToPath(new URL('../dist/pipeline.mjs', import.meta.url))

let repoRoot: string

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'pipeline-h13-binary-'))
  await mkdir(join(repoRoot, '.pipeline'), { recursive: true })
  const created = createLoopsYamlText({
    id: 'sync-loop',
    name: 'Sync loop',
    kind: 'orchestrator',
    goal: 'Keep loop documents synchronized.',
    cadence: '1h',
    risk: 'low',
    runner: 'codex',
    change_prefix: 'sync-loop-',
    phases: ['decide', 'record'],
    human_gates: ['destructive changes'],
    state: 'docs/loops/progress.md',
    design_doc: 'LOOP.md',
    status: 'paused',
    budget: { max_runs_per_day: 4, max_in_flight: 1, on_exceed: 'pause' },
    kill_criteria: ['goal reached'],
  })
  expect(created.error).toBeNull()
  expect(created.text).not.toBeNull()
  await writeFile(join(repoRoot, '.pipeline', 'loops.yaml'), created.text!, 'utf8')
  await writeFile(join(repoRoot, 'LOOP.md'), '# Human notes\n', 'utf8')
})

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true })
})

describe('H13 local binary', () => {
  test('dist/pipeline.mjs loops sync --dry-run 真执行、输出计划且零写入', async () => {
    const before = await readFile(join(repoRoot, 'LOOP.md'), 'utf8')

    const result = spawnSync(process.execPath, [
      DIST_BINARY,
      'loops', 'sync', 'sync-loop', '--dry-run', '--json',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      schema_version: 1,
      command: 'loop-sync',
      ok: true,
      mode: 'dry-run',
      status: 'planned',
      scope: { kind: 'loop', loop_id: 'sync-loop' },
    })
    expect(await readFile(join(repoRoot, 'LOOP.md'), 'utf8')).toBe(before)

    const failure = spawnSync(process.execPath, [
      DIST_BINARY,
      'loops', 'sync', 'missing-loop', '--dry-run', '--json',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    expect(failure.error).toBeUndefined()
    expect(failure.status).not.toBe(0)
    expect(JSON.parse(failure.stdout)).toMatchObject({
      schema_version: 1,
      command: 'loop-sync',
      ok: false,
      mode: 'dry-run',
    })
    expect(await readFile(join(repoRoot, 'LOOP.md'), 'utf8')).toBe(before)

    const missingMode = spawnSync(process.execPath, [
      DIST_BINARY,
      'loops', 'sync', 'sync-loop', '--json',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    expect(missingMode.error).toBeUndefined()
    expect(missingMode.status).not.toBe(0)
    expect(JSON.parse(missingMode.stdout)).toMatchObject({
      schema_version: 1,
      command: 'loop-sync',
      ok: false,
      status: 'error',
      error: { code: 'usage-error' },
    })
    expect(await readFile(join(repoRoot, 'LOOP.md'), 'utf8')).toBe(before)
  })
})
