/**
 * server 端点客户端（严格同源）——消费 packages/server：
 *   GET  /api/snapshot                 整机聚合快照
 *   GET  /api/stream                   SSE：snapshot 事件 + 心跳
 *   POST /api/change/<name>/transition  写回转换（B5 token 鉴权）
 *
 * token 从 server 同源注入的 window.__PIPELINE_DASHBOARD_TOKEN__ 读取（#25）；缺省空串
 * （dev / 独立预览下只读端点可用，写端点会 401——符合安全模型）。
 */
import type { Snapshot } from '../types'

declare global {
  interface Window {
    __PIPELINE_DASHBOARD_TOKEN__?: string
  }
}

export function getToken(): string {
  if (typeof window === 'undefined') return ''
  return window.__PIPELINE_DASHBOARD_TOKEN__ ?? ''
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function fetchSnapshot(): Promise<Snapshot> {
  let res: Response
  try {
    res = await fetch('/api/snapshot', { headers: { Accept: 'application/json' } })
  } catch (err) {
    throw new ApiError(`网络错误：${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) throw new ApiError(`快照获取失败（${res.status}）`, res.status)
  return (await res.json()) as Snapshot
}

/**
 * 写回一次相位转换。server 契约：body { root, event }；写端点强制 token（Authorization: Bearer）。
 * 失败抛 ApiError（含 server 的 error 文案），调用方 toast 呈现。
 */
export async function postTransition(name: string, root: string, event: string): Promise<void> {
  const url = `/api/change/${encodeURIComponent(name)}/transition`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ root, event }),
    })
  } catch (err) {
    throw new ApiError(`网络错误：${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { error?: string; detail?: unknown }
      // guard 前置失败时 server 给 { error: lines[0], detail: lines }——全量透传，只显示
      // 第一条会让用户「修一条→再撞下一条」（评审 P1-5）。单条时两者等价，仍走 error。
      if (body && Array.isArray(body.detail) && body.detail.length > 1) {
        detail = body.detail.filter((l): l is string => typeof l === 'string').join('；')
      } else if (body && typeof body.error === 'string') {
        detail = body.error
      }
    } catch {
      /* 无 JSON 体 */
    }
    throw new ApiError(detail || `转换失败（${res.status}）`, res.status)
  }
}

/** 非 2xx 响应统一读 server 的 { error } 信封抛 ApiError（G18 写函数共用）。 */
async function throwApiError(res: Response, fallback: string): Promise<never> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: string }
    if (body && typeof body.error === 'string') detail = body.error
  } catch {
    /* 无 JSON 体 */
  }
  throw new ApiError(detail || `${fallback}（${res.status}）`, res.status)
}

function wrapNetwork(err: unknown): never {
  throw new ApiError(`网络错误：${err instanceof Error ? err.message : String(err)}`)
}

/** G18：注册项目进机器级注册表（POST /api/projects）。返回 server 规范化后的 root。 */
export async function registerProject(root: string): Promise<{ root: string }> {
  let res: Response
  try {
    res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ root }),
    })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, '注册项目失败')
  return (await res.json()) as { root: string }
}

/** G18：注销项目（DELETE /api/projects?root=）。DELETE 无请求体，不带 Content-Type。 */
export async function unregisterProject(root: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`/api/projects?root=${encodeURIComponent(root)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, '注销项目失败')
}

/** G18：新建 change（POST /api/changes，pipeline init 的 HTTP 化）。 */
export async function createChange(input: { root: string; name: string; workflow?: string; track?: string }): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(input),
    })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, '新建 change 失败')
}

/** 自定义 workflow 名列表（GET /api/workflows?root=，排除 default——server 语义）。 */
export async function fetchWorkflowNames(root: string): Promise<string[]> {
  let res: Response
  try {
    res = await fetch(`/api/workflows?root=${encodeURIComponent(root)}`, { headers: { Accept: 'application/json' } })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, 'workflow 列表获取失败')
  return ((await res.json()) as { names: string[] }).names
}

/**
 * 订阅 SSE 快照流。返回退订函数。onSnapshot 每收到一帧 'snapshot' 事件即回调解析后的 Snapshot。
 * 走真 EventSource（测试用 test-setup 的可驱动 stub，组件真注册监听 + 真更新）。
 */
export function subscribeSnapshot(
  onSnapshot: (s: Snapshot) => void,
  onError?: () => void,
): () => void {
  const es = new EventSource('/api/stream')
  const handler = (e: MessageEvent): void => {
    try {
      onSnapshot(JSON.parse(e.data) as Snapshot)
    } catch {
      /* 坏帧忽略 */
    }
  }
  es.addEventListener('snapshot', handler as EventListener)
  if (onError) es.addEventListener('error', onError as EventListener)
  return () => {
    es.removeEventListener('snapshot', handler as EventListener)
    es.close()
  }
}
