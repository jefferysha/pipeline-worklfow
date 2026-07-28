import type { PipelineCliRunner } from './operations.js'
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
    load: () => Promise<HostTargetPlanRouteResult>,
  ): Promise<HostTargetPlanRouteResult>
}

const MAX_HOST_PLAN_KEYS = 25

function parseHostTargetPlanJson(stdout: string): unknown | null {
  const trimmed = stdout.trim()
  if (trimmed === '') return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

export function createHostTargetPlanRuntime(): HostTargetPlanRuntime {
  const cache = new Map<string, HostTargetPlanRouteResult>()
  const inFlight = new Map<string, Promise<HostTargetPlanRouteResult>>()
  let queueTail: Promise<void> = Promise.resolve()

  return {
    resolve(key, load) {
      const cached = cache.get(key)
      if (cached !== undefined) return Promise.resolve(cached)
      const existing = inFlight.get(key)
      if (existing !== undefined) return existing

      const queued = queueTail.then(load)
      queueTail = queued.then(() => undefined, () => undefined)
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

const PLAN_UNAVAILABLE: HostTargetPlanRouteResult = {
  status: 503,
  body: { ok: false, code: 'HOST_TARGET_PLAN_UNAVAILABLE', error: '宿主计划功能当前不可用' },
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
): Promise<HostTargetPlanRouteResult> {
  try {
    const result = await deps.operationRunner(deps.hostHome, args)
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
  if (path !== '/api/host-targets' && path !== '/api/host-target-plan') return null
  const searchParams = new URL(requestUrl, 'http://localhost').searchParams
  if (path === '/api/host-targets') {
    if ([...searchParams].length !== 0) return QUERY_INVALID
    if (!deps.operationsAvailable) return PLAN_UNAVAILABLE
    return deps.runtime.resolve(
      'catalog',
      () => runAndDecode(['host-target-plan', '--json'], deps, decodeHostTargetCatalog),
    )
  }
  const query = parsePlanQuery(searchParams)
  if (query === null) return QUERY_INVALID
  if (!deps.operationsAvailable) return PLAN_UNAVAILABLE
  return deps.runtime.resolve(
    `plan:${query.host}:${query.operation}`,
    () => runAndDecode(
      ['host-target-plan', '--host', query.host, '--operation', query.operation, '--json'],
      deps,
      (value) => decodeHostTargetPlan(value, query.host, query.operation),
    ),
  )
}
