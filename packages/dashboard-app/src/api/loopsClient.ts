import type { WbLoopsSnapshot } from './automationTypes'
import { decodeLoopsSnapshot } from './loopDecoder'
import { ApiError, getToken, readJson, throwListApiError, wrapNetwork } from './transport'

export async function fetchLoopsSnapshot(): Promise<WbLoopsSnapshot> {
  let response: Response
  try {
    response = await fetch('/api/loops/snapshot', { headers: { Accept: 'application/json' } })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) await throwListApiError(response, 'loop 快照获取失败')
  const snapshot = decodeLoopsSnapshot(await readJson(response))
  if (!snapshot) throw new ApiError('loop 快照响应形状无效', response.status)
  return snapshot
}

async function postLoop(path: string, input: Record<string, unknown>, fallback: string): Promise<void> {
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
  if (!response.ok) await throwListApiError(response, fallback)
}

export function postLoopUpdate(input: {
  root: string
  id: string
  patch: Record<string, unknown>
}): Promise<void> {
  return postLoop('/api/loops/update', input, '自动运行配置写回失败')
}

export function postLoopLevel(input: { root: string; id: string; target: string }): Promise<void> {
  return postLoop('/api/loops/level', input, '自主级别切换失败')
}
