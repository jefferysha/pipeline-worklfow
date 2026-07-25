import type { Snapshot } from '../types'
import { decodeSnapshot } from './snapshotDecoder'
import { ApiError, getToken, isRecord, readJson, throwDetailedApiError, wrapNetwork } from './transport'

export async function fetchSnapshot(): Promise<Snapshot> {
  let response: Response
  try {
    response = await fetch('/api/snapshot', { headers: { Accept: 'application/json' } })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) throw new ApiError(`快照获取失败（${response.status}）`, response.status)
  const snapshot = decodeSnapshot(await readJson(response))
  if (!snapshot) throw new ApiError('快照响应形状无效', response.status)
  return snapshot
}

export async function postTransition(name: string, root: string, event: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(`/api/change/${encodeURIComponent(name)}/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ root, event }),
    })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) await throwDetailedApiError(response, '转换失败')
}

export function subscribeSnapshot(
  onSnapshot: (snapshot: Snapshot) => void,
  onError?: () => void,
): () => void {
  const source = new EventSource('/api/stream')
  const handleSnapshot = (event: Event): void => {
    if (!isRecord(event) || typeof event.data !== 'string') return
    try {
      const snapshot = decodeSnapshot(JSON.parse(event.data))
      if (snapshot) onSnapshot(snapshot)
    } catch {
      // Malformed or truncated SSE frames are ignored; the next snapshot is authoritative.
    }
  }
  const handleError = (): void => onError?.()
  source.addEventListener('snapshot', handleSnapshot)
  if (onError) source.addEventListener('error', handleError)
  return () => {
    source.removeEventListener('snapshot', handleSnapshot)
    if (onError) source.removeEventListener('error', handleError)
    source.close()
  }
}
