import { useEffect, useState } from 'react'
import { fetchLoopsSnapshot, type WbLoopRow } from '../api/client'
import { useT } from '../i18n'
import { formatApiError } from '../api/transport'

export interface LoopsState {
  /** 当前 root 的 loop 行；null = 加载中/加载失败（loadError 区分）。 */
  rows: WbLoopRow[] | null
  loadError: string | null
  selected: WbLoopRow | null
  select: (id: string) => void
  reload: () => void
}

export function useLoops(root: string): LoopsState {
  const { t, lang } = useT()
  const [rows, setRows] = useState<WbLoopRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // 换 root：立刻清行——上一项目的 loop 不能在新项目语境下多渲染一拍。
  useEffect(() => {
    setRows(null)
    setSelectedId(null)
    setLoadError(null)
  }, [root])

  useEffect(() => {
    let cancelled = false
    fetchLoopsSnapshot()
      .then((snap) => {
        if (cancelled) return
        const mine = snap.rows.filter((r) => r.root === root)
        setRows(mine)
        setLoadError(null)
        setSelectedId((cur) => (cur !== null && mine.some((r) => r.id === cur) ? cur : mine[0]?.id ?? null))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // 加载失败不挡工作台其余区块：卡内行内报错、摘要行回落 '—'。
        setLoadError(t('workbench.lp_load_error', {
          msg: formatApiError(err, t, { exposeServerDetail: lang === 'zh' }),
        }))
      })
    return () => {
      cancelled = true
    }
  }, [root, tick, t, lang])

  return {
    rows,
    loadError,
    selected: rows?.find((r) => r.id === selectedId) ?? null,
    select: setSelectedId,
    reload: () => setTick((n) => n + 1),
  }
}

// ── 滑杆刻度（demo 口径：推荐值 = 2h / 24 / 1 / 100k / skip）──
/** 节奏离散档（demo CADS 原样）；推荐 2h = 下标 4。 */
