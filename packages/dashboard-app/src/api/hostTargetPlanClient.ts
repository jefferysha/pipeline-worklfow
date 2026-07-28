import { decodeHostTargetCatalog, decodeHostTargetPlan } from './hostTargetPlanDecoders'
import type { HostOperation, HostTargetCatalog, HostTargetPlan } from './hostTargetPlanTypes'
import { ApiError, readJson, throwApiError, wrapNetwork } from './transport'

async function getJson(path: string, fallback: string): Promise<{ response: Response; value: unknown }> {
  let response: Response
  try {
    response = await fetch(path, { headers: { Accept: 'application/json' } })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) await throwApiError(response, fallback)
  return { response, value: await readJson(response) }
}

export async function fetchHostTargets(): Promise<HostTargetCatalog> {
  const { response, value } = await getJson('/api/host-targets', '宿主目录获取失败')
  const catalog = decodeHostTargetCatalog(value)
  if (!catalog) throw new ApiError('宿主目录响应形状无效', response.status)
  return catalog
}

export async function fetchHostTargetPlan(
  host: string,
  operation: HostOperation,
): Promise<HostTargetPlan> {
  const params = new URLSearchParams({ host, operation })
  const { response, value } = await getJson(`/api/host-target-plan?${params}`, '宿主计划获取失败')
  const plan = decodeHostTargetPlan(value)
  if (!plan) throw new ApiError('宿主计划响应形状无效', response.status)
  if (plan.host.id !== host || plan.operation !== operation) {
    throw new ApiError('宿主计划响应与请求不匹配', response.status)
  }
  return plan
}
