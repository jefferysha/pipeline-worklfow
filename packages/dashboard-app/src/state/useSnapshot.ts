import { useCallback, useEffect, useState } from 'react'
import { ApiError, fetchSnapshot, subscribeSnapshot } from '../api/client'
import type { Snapshot } from '../types'

export interface SnapshotState {
  snapshot: Snapshot | null
  loading: boolean
  error: string | null
  /** SSE 是否在线（在线 = 实时推送；离线时依赖手动 refresh）。 */
  connected: boolean
  refresh: () => void
}

/**
 * 整机快照状态：挂载时 GET /api/snapshot 拉初值 + 订阅 /api/stream SSE 实时更新。
 * SSE 帧到达即替换 snapshot（server 已按指纹去抖，见 snapshot.computeFingerprint）。
 */
export function useSnapshot(): SnapshotState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchSnapshot()
      .then((s) => {
        if (cancelled) return
        setSnapshot(s)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [nonce])

  useEffect(() => {
    const unsub = subscribeSnapshot(
      (s) => {
        setSnapshot(s)
        setError(null)
        setConnected(true)
      },
      () => setConnected(false),
    )
    setConnected(true)
    return () => {
      setConnected(false)
      unsub()
    }
  }, [])

  return { snapshot, loading, error, connected, refresh }
}
