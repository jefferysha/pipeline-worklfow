import {
  parsePipelineCliJson,
  type PipelineCliRunner,
} from './operations.js'
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
}

export interface HostTargetPlanRouteResult {
  readonly status: number
  readonly body: unknown
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
    const decoded = decode(parsePipelineCliJson(result.stdout))
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
    return runAndDecode(['host-target-plan', '--json'], deps, decodeHostTargetCatalog)
  }
  const query = parsePlanQuery(searchParams)
  if (query === null) return QUERY_INVALID
  if (!deps.operationsAvailable) return PLAN_UNAVAILABLE
  return runAndDecode(
    ['host-target-plan', '--host', query.host, '--operation', query.operation, '--json'],
    deps,
    (value) => decodeHostTargetPlan(value, query.host, query.operation),
  )
}
