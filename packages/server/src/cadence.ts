/**
 * Global dashboard cadence scheduler.
 *
 * The clock only decides *when* an existing governed loop is due. Execution is
 * delegated to the production CLI (`pipeline loops run <id> --json`), so
 * admission, reservation, Docker, verification and settlement stay single-
 * sourced in automation/CLI. Durable ledger facts decide last finish and
 * in-flight state; a degraded ledger is fail-closed.
 */
import {
  budgetDayOf,
  cadenceMinutes,
  createLoopLedgerStore,
  loadRegistry,
  projectLoopLedger,
  type LedgerReadResult,
  type LoopRegistry,
} from '@pipeline-lite/kernel'
import type { PipelineCliResult, PipelineCliRunner } from './operations.js'

export type CadenceLoopState =
  | 'inactive'
  | 'continuous'
  | 'waiting'
  | 'in-flight'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked'

export interface CadenceLoopStatus {
  readonly root: string
  readonly loop_id: string
  readonly cadence: string
  readonly runner: string
  readonly state: CadenceLoopState
  readonly last_finished_at: string | null
  readonly due_at: string | null
  readonly attempted_at?: string
  readonly exit_code?: number
  readonly error?: string
}

export interface CadenceStatusSnapshot {
  readonly enabled: true
  readonly poll_interval_ms: number
  readonly generated_at: string
  readonly running: boolean
  readonly loops: readonly CadenceLoopStatus[]
  readonly errors: readonly string[]
}

type RegistryLoader = (root: string) => { data: LoopRegistry | null; errors: string[] }
type LedgerReader = (root: string) => Promise<LedgerReadResult>

export interface CadenceSchedulerOptions {
  readonly roots: () => string[]
  readonly clock: () => string
  readonly runPipelineCli: PipelineCliRunner
  readonly pollIntervalMs?: number
  readonly loadRegistry?: RegistryLoader
  readonly readLedger?: LedgerReader
  readonly scheduleInterval?: (callback: () => void, ms: number) => ReturnType<typeof setInterval>
  readonly clearScheduledInterval?: (handle: ReturnType<typeof setInterval>) => void
}

export interface CadenceScheduler {
  start(): void
  tick(): Promise<void>
  stop(): void
  snapshot(): CadenceStatusSnapshot
}

function asMillis(iso: string, label: string): number {
  const value = Date.parse(iso)
  if (!Number.isFinite(value)) throw new Error(`${label} 不是合法 ISO8601：${iso}`)
  return value
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function resultError(result: PipelineCliResult): string {
  return result.stderr.trim() || result.stdout.trim() || `pipeline CLI exit ${result.exitCode}`
}

function keyOf(root: string, loopId: string): string {
  return `${root}\u0000${loopId}`
}

export function createCadenceScheduler(options: CadenceSchedulerOptions): CadenceScheduler {
  const pollIntervalMs = options.pollIntervalMs ?? 30_000
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 100) {
    throw new Error(`cadence pollIntervalMs 必须是 >=100 的安全整数，收到 ${String(pollIntervalMs)}`)
  }
  const registryLoader = options.loadRegistry ?? loadRegistry
  const ledgerStore = createLoopLedgerStore()
  const readLedger = options.readLedger ?? ((root: string) => ledgerStore.read(root))
  const scheduleInterval = options.scheduleInterval ?? setInterval
  const clearScheduledInterval = options.clearScheduledInterval ?? clearInterval
  const lastAttemptAt = new Map<string, string>()
  let timer: ReturnType<typeof setInterval> | null = null
  let tickPromise: Promise<void> | null = null
  let latest: CadenceStatusSnapshot = {
    enabled: true,
    poll_interval_ms: pollIntervalMs,
    generated_at: options.clock(),
    running: false,
    loops: [],
    errors: [],
  }

  async function runTick(): Promise<void> {
    const now = options.clock()
    const nowMs = asMillis(now, 'cadence clock')
    const rows: CadenceLoopStatus[] = []
    const errors: string[] = []
    const due: Array<{ root: string; loopId: string; rowIndex: number }> = []

    for (const root of [...new Set(options.roots())]) {
      let loaded: ReturnType<RegistryLoader>
      let ledger: LedgerReadResult
      try {
        loaded = registryLoader(root)
        if (loaded.errors.length > 0 || loaded.data === null) {
          errors.push(`${root}: ${loaded.errors.join('；') || 'loops.yaml 缺失'}`)
          continue
        }
        ledger = await readLedger(root)
      } catch (error) {
        errors.push(`${root}: ${errorMessage(error)}`)
        continue
      }

      for (const loop of loaded.data.loops) {
        const base = {
          root,
          loop_id: loop.id,
          cadence: loop.cadence,
          runner: loop.runner,
          last_finished_at: null,
          due_at: null,
        } as const
        if (loop.status !== 'active') {
          rows.push({ ...base, state: 'inactive' })
          continue
        }
        const cadenceMins = cadenceMinutes(loop.cadence)
        if (cadenceMins === null) {
          rows.push({ ...base, state: 'continuous' })
          continue
        }

        try {
          const projection = projectLoopLedger(ledger.records, ledger.rejected.length, loop.id, budgetDayOf(now))
          const lastFinishedAt = projection.lastFinishedAt ?? null
          if (projection.health === 'degraded') {
            rows.push({
              ...base,
              last_finished_at: lastFinishedAt,
              state: 'blocked',
              error: `durable loop ledger 含 ${ledger.rejected.length} 条坏行或关系损坏`,
            })
            continue
          }
          if (projection.inFlight > 0) {
            rows.push({ ...base, last_finished_at: lastFinishedAt, state: 'in-flight' })
            continue
          }

          const key = keyOf(root, loop.id)
          const reference = lastAttemptAt.get(key) ?? lastFinishedAt
          const dueMs = reference === null ? nowMs : asMillis(reference, 'last cadence reference') + cadenceMins * 60_000
          const dueAt = new Date(dueMs).toISOString()
          if (nowMs < dueMs) {
            rows.push({ ...base, last_finished_at: lastFinishedAt, due_at: dueAt, state: 'waiting' })
            continue
          }
          const rowIndex = rows.length
          rows.push({ ...base, last_finished_at: lastFinishedAt, due_at: dueAt, attempted_at: now, state: 'running' })
          due.push({ root, loopId: loop.id, rowIndex })
          lastAttemptAt.set(key, now)
        } catch (error) {
          rows.push({ ...base, state: 'blocked', error: errorMessage(error) })
        }
      }
    }

    latest = {
      enabled: true,
      poll_interval_ms: pollIntervalMs,
      generated_at: now,
      running: due.length > 0,
      loops: rows,
      errors,
    }

    await Promise.all(due.map(async (item) => {
      const current = rows[item.rowIndex]
      if (current === undefined) return
      let result: PipelineCliResult
      try {
        result = await options.runPipelineCli(item.root, ['loops', 'run', item.loopId, '--json'])
      } catch (error) {
        rows[item.rowIndex] = { ...current, state: 'failed', error: errorMessage(error) }
        return
      }
      rows[item.rowIndex] = result.exitCode === 0
        ? { ...current, state: 'succeeded', exit_code: 0 }
        : { ...current, state: 'failed', exit_code: result.exitCode, error: resultError(result) }
    }))

    latest = { ...latest, running: false, loops: rows }
  }

  function tick(): Promise<void> {
    if (tickPromise !== null) return tickPromise
    tickPromise = runTick().finally(() => { tickPromise = null })
    return tickPromise
  }

  return {
    start(): void {
      if (timer !== null) return
      void tick()
      timer = scheduleInterval(() => { void tick() }, pollIntervalMs)
    },
    tick,
    stop(): void {
      if (timer === null) return
      clearScheduledInterval(timer)
      timer = null
    },
    snapshot(): CadenceStatusSnapshot {
      return {
        ...latest,
        loops: latest.loops.map((row) => ({ ...row })),
        errors: [...latest.errors],
      }
    },
  }
}
