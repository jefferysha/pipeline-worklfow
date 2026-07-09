import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { Dialog } from '../shell/Dialog'

export interface SkillTransferModalProps {
  selected: string[]
  onSave: (skills: string[]) => Promise<void> | void
  onCancel: () => void
}

const DND_MIME = 'application/x-pipeline-skill'

interface ErrorBody {
  error?: string
}

/** 非 2xx 响应尽量读出 server 的 { error } 文案；没有 JSON 体就吞掉，回落调用方的通用文案。 */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorBody
    if (typeof body?.error === 'string') return body.error
  } catch {
    /* 无 JSON 体 */
  }
  return ''
}

export function SkillTransferModal({ selected, onSave, onCancel }: SkillTransferModalProps): JSX.Element {
  const { t } = useT()
  const [all, setAll] = useState<string[]>([])
  const [chosen, setChosen] = useState<string[]>(selected)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/skills/registry', { headers: { Accept: 'application/json' } })
      .then(async (r) => {
        // r.ok 检查必须在 r.json() 之前（whole-branch review 抓出的真实回归）：server 对错误
        // 统一返回 JSON 信封（{ok:false,error}），非 2xx 时 r.json() 依然会成功 resolve 而不是
        // reject，若不先查 r.ok，.catch() 永远不会触发，本组件会静默拿到 undefined 的 skills
        // 字段，随后 `all.filter(...)` 在下一次 render 直接抛错——无 ErrorBoundary 兜底会白屏。
        if (!r.ok) throw new Error((await readErrorDetail(r)) || t('skill_transfer.load_error_status', { status: r.status }))
        return r.json() as Promise<{ skills: string[] }>
      })
      .then((body) => setAll(body.skills))
      .catch((err: unknown) =>
        setError(t('skill_transfer.load_error', { msg: err instanceof Error ? err.message : t('skill_transfer.network_error') })),
      )
  }, [t])

  const available = all.filter((s) => !chosen.includes(s) && s.toLowerCase().includes(query.toLowerCase()))

  function onDropToChosen(e: React.DragEvent): void {
    e.preventDefault()
    const skill = e.dataTransfer.getData(DND_MIME)
    if (skill && !chosen.includes(skill)) setChosen([...chosen, skill])
  }
  function onDropToAvailable(e: React.DragEvent): void {
    e.preventDefault()
    const skill = e.dataTransfer.getData(DND_MIME)
    setChosen(chosen.filter((s) => s !== skill))
  }

  return (
    // Task 4（评审 P0-5）：只做壳迁移——外层手写 `<div className="modal" role="dialog">` 换成
    // 共享 <Dialog>（Esc/焦点管理/backdrop 点击关随之补齐）。`.modal`/`.split` 此前就没有任何
    // CSS 规则（真实样式是评审 P1-10 后半，留给 Task 16），内部条目的拖拽/搜索/保存/取消交互
    // 逐字不动——"点击即移动"是 Task 16 的范围，这里不碰。
    <Dialog
      title={t('skill_transfer.title')}
      onClose={onCancel}
      actions={
        <>
          <button onClick={() => onSave(chosen)}>{t('skill_transfer.save')}</button>
          <button onClick={onCancel}>{t('skill_transfer.cancel')}</button>
        </>
      }
    >
      <input placeholder={t('skill_transfer.search_placeholder')} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="split">
        <div data-testid="skill-available" onDragOver={(e) => e.preventDefault()} onDrop={onDropToAvailable}>
          {error && <div data-testid="skill-error" style={{ color: 'red' }}>{error}</div>}
          {!error && available.map((s) => (
            <div key={s} draggable onDragStart={(e) => e.dataTransfer.setData(DND_MIME, s)}>
              {s}
            </div>
          ))}
        </div>
        <div data-testid="skill-chosen" onDragOver={(e) => e.preventDefault()} onDrop={onDropToChosen}>
          {chosen.map((s) => (
            <div key={s} draggable onDragStart={(e) => e.dataTransfer.setData(DND_MIME, s)}>
              {s}
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
