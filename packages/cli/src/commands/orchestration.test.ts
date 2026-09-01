import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createOrchestrationLedger } from '@tenon/kernel'
import type { CliDeps } from '../deps.js'
import { cmdOrchestrationControl, cmdOrchestrationEvents, cmdOrchestrationInit, cmdOrchestrationStatus, cmdOrchestrationWatch, parseOrchestrationAfter } from './orchestration.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

function deps(cwd: string, out: string[], err: string[]): CliDeps {
  return { cwd, clock: () => '2026-09-02T00:00:00.000Z', io: { out: (line) => out.push(line), err: (line) => err.push(line) } } as unknown as CliDeps
}

describe('orchestration CLI v2', () => {
  it('rejects unsafe cursors before touching the ledger', () => {
    expect(parseOrchestrationAfter('-1')).toBe(-1)
    expect(parseOrchestrationAfter('2049')).toBe(-1)
    expect(parseOrchestrationAfter('12')).toBe(12)
  })

  it('initializes, reports, lists events and controls a real ledger', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'tenon-cli-orchestration-')); roots.push(cwd)
    await mkdir(path.join(cwd, 'openspec', 'changes', 'demo'), { recursive: true })
    const output: string[] = []; const errors: string[] = []; const injected = deps(cwd, output, errors)
    expect(await cmdOrchestrationInit(injected, 'demo', 'project-1', 'corr-1')).toBe(0)
    expect(await cmdOrchestrationStatus(injected, 'demo', true)).toBe(0)
    expect(await cmdOrchestrationEvents(injected, 'demo', 0, true)).toBe(0)
    expect(await cmdOrchestrationWatch(injected, 'demo', true, false)).toBe(0)
    expect(await cmdOrchestrationControl(injected, 'demo', 'pause-change', 'operator')).toBe(1)
    expect(errors.at(-1)).toContain('pause-state')
    expect(output.some((line) => line.includes('orchestration-cli-status/v2'))).toBe(true)
  })
})
