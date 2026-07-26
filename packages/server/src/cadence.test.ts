import { describe, expect, it, vi } from 'vitest'
import type { LedgerRecord, LoopEntry, LoopRegistry } from '@tenon/kernel'
import { createCadenceScheduler } from './cadence.js'

const NOW = '2026-07-20T12:00:00Z'

function loop(overrides: Partial<LoopEntry> = {}): LoopEntry {
  return {
    id: 'codex-loop', name: 'Codex loop', kind: 'orchestrator',
    goal: 'Run the real Codex-first workflow on its declared cadence', cadence: '1h', risk: 'low',
    runner: 'codex', change_prefix: 'codex-', phases: ['proposal'], human_gates: ['review'],
    design_doc: 'docs/codex-loop.md', status: 'active',
    budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip-run' },
    kill_criteria: ['stop on verification failure'], autonomy_level: 'L1', allowlist: [], denylist: [],
    ...overrides,
  }
}

function terminal(finishedAt: string): LedgerRecord {
  return {
    schema_version: 1, kind: 'run', record_id: 'record-run-1', run_record_id: 'run-1',
    recorded_at: finishedAt, attempt_id: 'attempt-1', loop_id: 'codex-loop', change: 'codex-change',
    level: 'L1', runner: 'codex', admitted_at: finishedAt, finished_at: finishedAt,
    result: 'paused', reason: 'completed', usage_record_ids: [],
    accounting: { reserved_tokens: 0, charged_tokens: 0, charge_source: 'none' },
  }
}

function harness(input: { loops?: LoopEntry[]; records?: LedgerRecord[]; exitCode?: number } = {}) {
  const registry: LoopRegistry = { version: 1, loops: input.loops ?? [loop()] }
  const runPipelineCli = vi.fn(async () => ({
    exitCode: input.exitCode ?? 0,
    stdout: JSON.stringify({ ok: (input.exitCode ?? 0) === 0, selected: 1 }),
    stderr: input.exitCode ? 'real runner failed' : '',
  }))
  const scheduler = createCadenceScheduler({
    roots: () => ['/repo'], clock: () => NOW, pollIntervalMs: 30_000,
    loadRegistry: () => ({ data: registry, errors: [] }),
    readLedger: async () => ({ records: input.records ?? [], rejected: [] }),
    runPipelineCli,
  })
  return { scheduler, runPipelineCli }
}

describe('cadence scheduler：真实 loop run 的时钟编排', () => {
  it('从未运行的 active finite loop 到期 → 真调用现有 loops run，而非复制执行器', async () => {
    const { scheduler, runPipelineCli } = harness()
    await scheduler.tick()

    expect(runPipelineCli).toHaveBeenCalledWith('/repo', ['loops', 'run', 'codex-loop', '--json'])
    expect(scheduler.snapshot()).toMatchObject({
      enabled: true,
      loops: [{ root: '/repo', loop_id: 'codex-loop', cadence: '1h', runner: 'codex', state: 'succeeded', exit_code: 0 }],
    })
  })

  it('最近 terminal 未满 cadence、paused、continuous 均不执行，并如实报告原因', async () => {
    const { scheduler, runPipelineCli } = harness({
      loops: [loop(), loop({ id: 'paused-loop', status: 'paused' }), loop({ id: 'continuous-loop', cadence: 'continuous' })],
      records: [terminal('2026-07-20T11:30:00Z')],
    })
    await scheduler.tick()

    expect(runPipelineCli).not.toHaveBeenCalled()
    expect(scheduler.snapshot().loops).toEqual(expect.arrayContaining([
      expect.objectContaining({ loop_id: 'codex-loop', state: 'waiting', due_at: '2026-07-20T12:30:00.000Z' }),
      expect.objectContaining({ loop_id: 'paused-loop', state: 'inactive' }),
      expect.objectContaining({ loop_id: 'continuous-loop', state: 'continuous' }),
    ]))
  })

  it('同一 tick 正在执行时合并重入，绝不双发同一个 loop', async () => {
    let release!: () => void
    const blocked = new Promise<void>((resolve) => { release = resolve })
    const { scheduler, runPipelineCli } = harness()
    runPipelineCli.mockImplementation(async () => {
      await blocked
      return { exitCode: 0, stdout: '{}', stderr: '' }
    })

    const first = scheduler.tick()
    const second = scheduler.tick()
    await vi.waitFor(() => expect(runPipelineCli).toHaveBeenCalledTimes(1))
    release()
    await Promise.all([first, second])
    expect(runPipelineCli).toHaveBeenCalledTimes(1)
  })

  it('坏 ledger fail-closed；真实 CLI 非零进入 failed 状态且保留 stderr', async () => {
    const bad = harness()
    bad.scheduler = createCadenceScheduler({
      roots: () => ['/repo'], clock: () => NOW, pollIntervalMs: 30_000,
      loadRegistry: () => ({ data: { version: 1, loops: [loop()] }, errors: [] }),
      readLedger: async () => ({ records: [], rejected: [{ line: 1, raw: '{bad', errors: ['bad json'] }] }),
      runPipelineCli: bad.runPipelineCli,
    })
    await bad.scheduler.tick()
    expect(bad.runPipelineCli).not.toHaveBeenCalled()
    expect(bad.scheduler.snapshot().loops[0]).toMatchObject({ state: 'blocked', error: expect.stringContaining('坏行') })

    const failed = harness({ exitCode: 7 })
    await failed.scheduler.tick()
    expect(failed.scheduler.snapshot().loops[0]).toMatchObject({
      state: 'failed', exit_code: 7, error: 'real runner failed',
    })
  })
})
