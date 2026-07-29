import type {
  AutomationStarterTemplate,
  OperationResponse,
  WbAfkReadiness,
  WbAutomationSettings,
  WbCadenceStatus,
  WbDockerImages,
  WbSecretsKeys,
} from './automationTypes'
import {
  decodeAfkReadiness,
  decodeAutomationSettingsEnvelope,
  decodeCadenceStatus,
  decodeDockerImages,
  decodeOperationResponse,
  decodeProjection,
  decodeSecrets,
  decodeStarters,
} from './automationDecoders'
import { ApiError, getToken, isRecord, readJson, throwApiError, wrapNetwork } from './transport'

async function decodeResponse<T>(
  response: Response,
  decode: (value: unknown) => T | null,
  invalidMessage: string,
): Promise<T> {
  const body = decode(await readJson(response))
  if (!body) throw new ApiError(invalidMessage, response.status)
  return body
}

export async function fetchAutomationSettings(root: string): Promise<WbAutomationSettings> {
  let response: Response
  try {
    response = await fetch(`/api/automation?root=${encodeURIComponent(root)}`, {
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) await throwApiError(response, 'AFK 执行配置获取失败')
  return decodeResponse(response, decodeAutomationSettingsEnvelope, 'AFK 执行配置响应形状无效')
}

export async function postAutomationSettings(input: {
  root: string
} & WbAutomationSettings): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/automation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(input),
    })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) await throwApiError(response, 'AFK 执行配置写回失败')
}

export async function fetchAutomationStarters(root: string): Promise<AutomationStarterTemplate[]> {
  let response: Response
  try {
    response = await fetch(`/api/operations/starters?root=${encodeURIComponent(root)}`, {
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) await throwApiError(response, 'Starter 目录获取失败')
  return decodeResponse(response, decodeStarters, 'Starter 目录响应形状无效')
}

export async function fetchCadenceStatus(root: string): Promise<WbCadenceStatus> {
  let response: Response
  try {
    response = await fetch(`/api/cadence/status?root=${encodeURIComponent(root)}`, {
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) await throwApiError(response, 'cadence 状态获取失败')
  return decodeResponse(response, decodeCadenceStatus, 'cadence 状态响应形状无效')
}

async function postOperation(path: string, input: Record<string, unknown>): Promise<OperationResponse> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(input),
    })
  } catch (error) {
    wrapNetwork(error)
  }
  const raw = await readJson(response)
  const body = decodeOperationResponse(raw)
  if (!body) {
    const detail = isRecord(raw) && typeof raw.error === 'string'
      ? raw.error
      : `操作响应形状无效（${response.status}）`
    throw new ApiError(detail, response.status, isRecord(raw) && typeof raw.error === 'string')
  }
  return body
}

export const postLoopStarterInit = (input: Record<string, unknown>): Promise<OperationResponse> =>
  postOperation('/api/operations/loops/init', input)

export const postLoopRun = (input: Record<string, unknown>): Promise<OperationResponse> =>
  postOperation('/api/operations/loops/run', input)

export const postLoopSync = (input: Record<string, unknown>): Promise<OperationResponse> =>
  postOperation('/api/operations/loops/sync', input)

export const postTriage = (input: Record<string, unknown>): Promise<OperationResponse> =>
  postOperation('/api/operations/triage', input)

export const postArtifactRegister = (input: Record<string, unknown>): Promise<OperationResponse> =>
  postOperation('/api/operations/artifact/register', input)

export async function postProjectionAction(input: {
  root: string
  change: string
  action: 'repair-projection' | 'import-legacy'
  force_canonical?: boolean
  confirm_import?: boolean
}): Promise<{ ok: true; projection: { status: string; [key: string]: unknown } }> {
  let response: Response
  try {
    response = await fetch(`/api/change/${encodeURIComponent(input.change)}/projection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(input),
    })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) await throwApiError(response, 'Projection 操作失败')
  return decodeResponse(response, decodeProjection, 'Projection 操作响应形状无效')
}

export function postAfkCommand(
  name: string,
  root: string,
  action: 'cancel' | 'enqueue' | 'retry' | 'dismiss',
): Promise<Response> {
  return fetch(`/api/afk/${encodeURIComponent(name)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ root }),
  })
}

async function postAfkAction(
  name: string,
  root: string,
  action: 'enqueue' | 'retry' | 'dismiss',
  fallback: string,
): Promise<void> {
  let response: Response
  try {
    response = await postAfkCommand(name, root, action)
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) await throwApiError(response, fallback)
}

export const postAfkEnqueue = (name: string, root: string): Promise<void> =>
  postAfkAction(name, root, 'enqueue', '挂队失败')

export const postAfkRetry = (name: string, root: string): Promise<void> =>
  postAfkAction(name, root, 'retry', '重试失败')

export const postAfkDismiss = (name: string, root: string): Promise<void> =>
  postAfkAction(name, root, 'dismiss', '放弃失败')

export async function fetchDockerImages(): Promise<WbDockerImages> {
  let response: Response
  try {
    response = await fetch('/api/docker/images', { headers: { Accept: 'application/json' } })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) await throwApiError(response, 'Docker 镜像获取失败')
  return decodeResponse(response, decodeDockerImages, 'malformed docker images payload')
}

export async function fetchAfkReadiness(root: string): Promise<WbAfkReadiness> {
  let response: Response
  try {
    response = await fetch(`/api/afk/readiness?root=${encodeURIComponent(root)}`, {
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) await throwApiError(response, 'AFK 就绪度获取失败')
  return decodeResponse(response, decodeAfkReadiness, 'malformed readiness payload')
}

export async function fetchSecrets(): Promise<WbSecretsKeys> {
  const response = await fetch('/api/secrets', { headers: { Accept: 'application/json' } })
  if (!response.ok) throw await secretError(response)
  return decodeResponse(response, decodeSecrets, 'malformed secrets payload')
}

async function secretError(response: Response): Promise<ApiError> {
  try {
    const detail = await readJson(response)
    if (isRecord(detail) && typeof detail.error === 'string') {
      return new ApiError(detail.error, response.status, true)
    }
  } catch {
    // Fall through to the stable HTTP status message.
  }
  return new ApiError(`secret request failed (${response.status})`, response.status)
}

export async function postSecret(key: string, value: string): Promise<void> {
  const response = await fetch('/api/secrets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ key, value }),
  })
  if (!response.ok) throw await secretError(response)
}

export async function deleteSecret(key: string): Promise<void> {
  const response = await fetch(`/api/secrets?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!response.ok) throw await secretError(response)
}

export function fetchAfkLog(name: string, root: string): Promise<Response> {
  return fetch(`/api/afk/${encodeURIComponent(name)}/log?root=${encodeURIComponent(root)}`)
}
