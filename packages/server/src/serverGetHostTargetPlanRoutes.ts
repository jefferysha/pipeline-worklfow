import type { PipelineCliRunner } from './operations.js'
import { detectNativeHostTargets } from './hostTargetDetection.js'
import {
  decodeHostTargetCatalog,
  decodeHostTargetPlan,
  isHostId,
  type HostOperation,
  type HostTargetCatalogDto,
  type HostTargetPlanDto,
} from './hostTargetPlanProtocol.js'

export interface HostTargetPlanRouteDeps {
  readonly hostHome: string
  readonly operationsAvailable: boolean
  readonly operationRunner: PipelineCliRunner
  readonly runtime: HostTargetPlanRuntime
}

export interface HostTargetPlanRouteResult {
  readonly status: number
  readonly body: unknown
}

export interface HostTargetPlanRuntime {
  resolve(
    key: string,
    load: (signal: AbortSignal) => Promise<HostTargetPlanRouteResult>,
  ): Promise<HostTargetPlanRouteResult>
}

export interface HostTargetPlanRuntimeOptions {
  readonly maxConcurrent?: number
  readonly timeoutMs?: number
  readonly now?: () => number
}

const MAX_HOST_PLAN_KEYS = 25
const DEFAULT_MAX_CONCURRENT_HOST_PLAN_LOADS = 4
const DEFAULT_HOST_PLAN_TIMEOUT_MS = 10_000

const PLAN_UNAVAILABLE: HostTargetPlanRouteResult = {
  status: 503,
  body: { ok: false, code: 'HOST_TARGET_PLAN_UNAVAILABLE', error: '宿主计划功能当前不可用' },
}

interface QueuedHostPlanLoad {
  readonly load: (signal: AbortSignal) => Promise<HostTargetPlanRouteResult>
  readonly resolve: (result: HostTargetPlanRouteResult) => void
  readonly reject: (error: unknown) => void
  readonly deadline: number
}

function parseHostTargetPlanJson(stdout: string): unknown | null {
  const trimmed = stdout.trim()
  if (trimmed === '') return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

export function createHostTargetPlanRuntime(
  options: HostTargetPlanRuntimeOptions = {},
): HostTargetPlanRuntime {
  const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT_HOST_PLAN_LOADS
  const timeoutMs = options.timeoutMs ?? DEFAULT_HOST_PLAN_TIMEOUT_MS
  const now = options.now ?? (() => globalThis.performance.now())
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > MAX_HOST_PLAN_KEYS) {
    throw new Error(`maxConcurrent 必须是 1..${MAX_HOST_PLAN_KEYS} 的整数`)
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs 必须是正数')
  }

  const cache = new Map<string, HostTargetPlanRouteResult>()
  const inFlight = new Map<string, Promise<HostTargetPlanRouteResult>>()
  const queue: QueuedHostPlanLoad[] = []
  let active = 0

  const drain = (): void => {
    while (active < maxConcurrent) {
      const queued = queue.shift()
      if (queued === undefined) return
      const remainingMs = queued.deadline - now()
      if (remainingMs <= 0) {
        queued.resolve(PLAN_UNAVAILABLE)
        continue
      }
      active += 1
      const controller = new AbortController()
      let settled = false
      const finish = (
        settle: () => void,
      ): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        active -= 1
        settle()
        drain()
      }
      const timer = setTimeout(() => {
        controller.abort()
        finish(() => queued.resolve(PLAN_UNAVAILABLE))
      }, remainingMs)
      timer.unref?.()
      try {
        void queued.load(controller.signal).then(
          (result) => finish(() => queued.resolve(result)),
          (error: unknown) => finish(() => queued.reject(error)),
        )
      } catch (error) {
        finish(() => queued.reject(error))
      }
    }
  }

  const schedule = (
    load: (signal: AbortSignal) => Promise<HostTargetPlanRouteResult>,
  ): Promise<HostTargetPlanRouteResult> => {
    const scheduled = new Promise<HostTargetPlanRouteResult>((resolve, reject) => {
      queue.push({
        load,
        resolve,
        reject,
        deadline: now() + timeoutMs,
      })
    })
    drain()
    return scheduled
  }

  return {
    resolve(key, load) {
      const cached = cache.get(key)
      if (cached !== undefined) return Promise.resolve(cached)
      const existing = inFlight.get(key)
      if (existing !== undefined) return existing

      const queued = schedule(load)
      const shared = queued.then((result) => {
        if (result.status === 200) {
          cache.delete(key)
          cache.set(key, result)
          while (cache.size > MAX_HOST_PLAN_KEYS) {
            const oldest = cache.keys().next().value
            if (oldest === undefined) break
            cache.delete(oldest)
          }
        }
        return result
      })
      inFlight.set(key, shared)
      const cleanup = (): void => {
        if (inFlight.get(key) === shared) inFlight.delete(key)
      }
      void shared.then(cleanup, cleanup)
      return shared
    },
  }
}

const QUERY_INVALID: HostTargetPlanRouteResult = {
  status: 400,
  body: { ok: false, code: 'HOST_TARGET_QUERY_INVALID', error: '宿主计划查询参数无效' },
}

const PLAN_INVALID: HostTargetPlanRouteResult = {
  status: 502,
  body: { ok: false, code: 'HOST_TARGET_PLAN_INVALID', error: '宿主计划响应无效' },
}

function parsePlanQuery(searchParams: URLSearchParams): {
  host: Parameters<typeof decodeHostTargetPlan>[1]
  operation: HostOperation
} | null {
  const entries = [...searchParams.entries()]
  if (
    entries.length !== 2
    || searchParams.getAll('host').length !== 1
    || searchParams.getAll('operation').length !== 1
    || entries.some(([key]) => key !== 'host' && key !== 'operation')
  ) return null
  const host = searchParams.get('host')
  const operation = searchParams.get('operation')
  if (!isHostId(host) || (operation !== 'setup' && operation !== 'update')) return null
  return { host, operation }
}

async function runAndDecode(
  args: readonly string[],
  deps: HostTargetPlanRouteDeps,
  decode: (value: unknown) => HostTargetCatalogDto | HostTargetPlanDto | null,
  signal: AbortSignal,
): Promise<HostTargetPlanRouteResult> {
  try {
    const result = await deps.operationRunner(deps.hostHome, args, { signal })
    if (result.exitCode !== 0) return PLAN_INVALID
    const decoded = decode(parseHostTargetPlanJson(result.stdout))
    return decoded === null ? PLAN_INVALID : { status: 200, body: decoded }
  } catch {
    return PLAN_INVALID
  }
}

export async function resolveHostTargetPlanRoute(
  requestUrl: string,
  path: string,
  deps: HostTargetPlanRouteDeps,
): Promise<HostTargetPlanRouteResult | null> {
  if (
    path !== '/api/host-targets'
    && path !== '/api/host-target-plan'
    && path !== '/api/host-target-detection'
  ) return null
  const searchParams = new URL(requestUrl, 'http://localhost').searchParams
  if (path === '/api/host-target-detection') {
    if ([...searchParams].length !== 0) return QUERY_INVALID
    return detectNativeHostTargets(deps.hostHome)
  }
  if (path === '/api/host-targets') {
    if ([...searchParams].length !== 0) return QUERY_INVALID
    if (!deps.operationsAvailable) return PLAN_UNAVAILABLE
    return deps.runtime.resolve(
      'catalog',
      (signal) => runAndDecode(['host-target-plan', '--json'], deps, decodeHostTargetCatalog, signal),
    )
  }
  const query = parsePlanQuery(searchParams)
  if (query === null) return QUERY_INVALID
  if (!deps.operationsAvailable) return PLAN_UNAVAILABLE
  return deps.runtime.resolve(
    `plan:${query.host}:${query.operation}`,
    (signal) => runAndDecode(
      ['host-target-plan', '--host', query.host, '--operation', query.operation, '--json'],
      deps,
      (value) => decodeHostTargetPlan(value, query.host, query.operation),
      signal,
    ),
  )
}
