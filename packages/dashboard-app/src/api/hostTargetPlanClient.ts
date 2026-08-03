import { decodeHostTargetCatalog, decodeHostTargetDetection, decodeHostTargetPlan } from './hostTargetPlanDecoders'
import type { HostId, HostOperation, HostTargetCatalog, HostTargetDetection, HostTargetPlan } from './hostTargetPlanTypes'
import { isRecord, readJson } from './transport'

export type HostTargetPlanErrorKind = 'network' | 'http' | 'decoder' | 'mismatch'

export type HostTargetPlanErrorCode =
  | 'HOST_TARGET_NETWORK_ERROR'
  | 'HOST_TARGET_HTTP_ERROR'
  | 'HOST_TARGET_QUERY_INVALID'
  | 'HOST_TARGET_PLAN_UNAVAILABLE'
  | 'HOST_TARGET_PLAN_INVALID'
  | 'HOST_TARGET_DETECTION_RESPONSE_INVALID'
  | 'HOST_TARGET_CATALOG_RESPONSE_INVALID'
  | 'HOST_TARGET_PLAN_RESPONSE_INVALID'
  | 'HOST_TARGET_PLAN_REQUEST_MISMATCH'

type HostTargetPlanHttpErrorCode = Extract<
  HostTargetPlanErrorCode,
  'HOST_TARGET_QUERY_INVALID' | 'HOST_TARGET_PLAN_UNAVAILABLE' | 'HOST_TARGET_PLAN_INVALID'
>

const HTTP_ERROR_CODES: ReadonlySet<string> = new Set([
  'HOST_TARGET_QUERY_INVALID',
  'HOST_TARGET_PLAN_UNAVAILABLE',
  'HOST_TARGET_PLAN_INVALID',
])

function isHttpErrorCode(value: string): value is HostTargetPlanHttpErrorCode {
  return HTTP_ERROR_CODES.has(value)
}

function httpErrorCode(value: unknown): HostTargetPlanErrorCode {
  if (isRecord(value)
    && typeof value.code === 'string'
    && isHttpErrorCode(value.code)) {
    return value.code
  }
  return 'HOST_TARGET_HTTP_ERROR'
}

export class HostTargetPlanClientError extends Error {
  constructor(
    public readonly kind: HostTargetPlanErrorKind,
    public readonly code: HostTargetPlanErrorCode,
    public readonly status?: number,
  ) {
    super(code)
    this.name = 'HostTargetPlanClientError'
  }
}

async function getJson(
  path: string,
  invalidResponseCode: Extract<
    HostTargetPlanErrorCode,
    'HOST_TARGET_CATALOG_RESPONSE_INVALID' | 'HOST_TARGET_DETECTION_RESPONSE_INVALID' | 'HOST_TARGET_PLAN_RESPONSE_INVALID'
  >,
  signal?: AbortSignal,
): Promise<{ response: Response; value: unknown }> {
  let response: Response
  try {
    response = await fetch(path, {
      headers: { Accept: 'application/json' },
      ...(signal === undefined ? {} : { signal }),
    })
  } catch {
    throw new HostTargetPlanClientError('network', 'HOST_TARGET_NETWORK_ERROR')
  }
  if (!response.ok) {
    let body: unknown
    try {
      body = await readJson(response)
    } catch {
      body = null
    }
    throw new HostTargetPlanClientError('http', httpErrorCode(body), response.status)
  }
  try {
    return { response, value: await readJson(response) }
  } catch {
    throw new HostTargetPlanClientError('decoder', invalidResponseCode, response.status)
  }
}

export async function fetchHostTargetDetection(signal?: AbortSignal): Promise<HostTargetDetection> {
  const { response, value } = await getJson(
    '/api/host-target-detection',
    'HOST_TARGET_DETECTION_RESPONSE_INVALID',
    signal,
  )
  const detection = decodeHostTargetDetection(value)
  if (!detection) {
    throw new HostTargetPlanClientError(
      'decoder',
      'HOST_TARGET_DETECTION_RESPONSE_INVALID',
      response.status,
    )
  }
  return detection
}

export async function fetchHostTargets(signal?: AbortSignal): Promise<HostTargetCatalog> {
  const { response, value } = await getJson(
    '/api/host-targets',
    'HOST_TARGET_CATALOG_RESPONSE_INVALID',
    signal,
  )
  const catalog = decodeHostTargetCatalog(value)
  if (!catalog) {
    throw new HostTargetPlanClientError(
      'decoder',
      'HOST_TARGET_CATALOG_RESPONSE_INVALID',
      response.status,
    )
  }
  return catalog
}

export async function fetchHostTargetPlan(
  host: HostId,
  operation: HostOperation,
  signal?: AbortSignal,
): Promise<HostTargetPlan> {
  const params = new URLSearchParams({ host, operation })
  const { response, value } = await getJson(
    `/api/host-target-plan?${params}`,
    'HOST_TARGET_PLAN_RESPONSE_INVALID',
    signal,
  )
  const plan = decodeHostTargetPlan(value)
  if (!plan) {
    throw new HostTargetPlanClientError(
      'decoder',
      'HOST_TARGET_PLAN_RESPONSE_INVALID',
      response.status,
    )
  }
  if (plan.host.id !== host || plan.operation !== operation) {
    throw new HostTargetPlanClientError(
      'mismatch',
      'HOST_TARGET_PLAN_REQUEST_MISMATCH',
      response.status,
    )
  }
  return plan
}
