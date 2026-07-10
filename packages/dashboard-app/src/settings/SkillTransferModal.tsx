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

  // 点击与拖拽共用同一对纯函数（Task 16，评审 P1-10 后半）：点击即移动是主交互，HTML5 拖拽
  // 保留作为增强，onDragStart/onDrop 落到同一对 move 函数上，不是两套平行逻辑。两者对同一
  // skill 重复调用都是幂等的（moveToChosen 有 includes 去重、moveToAvailable 的 filter 对
  // 已不在列表里的项是安全 no-op），故不需要额外去重判断谁先触发。
  function moveToChosen(skill: string): void {
    if (!chosen.includes(skill)) setChosen([...chosen, skill])
  }
  function moveToAvailable(skill: string): void {
    setChosen(chosen.filter((s) => s !== skill))
  }
  function onDropToChosen(e: React.DragEvent): void {
    e.preventDefault()
    const skill = e.dataTransfer.getData(DND_MIME)
    if (skill) moveToChosen(skill)
  }
  function onDropToAvailable(e: React.DragEvent): void {
    e.preventDefault()
    const skill = e.dataTransfer.getData(DND_MIME)
    if (skill) moveToAvailable(skill)
  }

  return (
    // Task 4（评审 P0-5）：外层手写 `<div className="modal" role="dialog">` 换成共享 <Dialog>
    // （Esc/焦点管理/backdrop 点击关随之补齐）。当时只做壳迁移，内部条目交互与真实样式明确
    // 留给 Task 16。
    //
    // Task 16（评审 P1-10 后半）：`.modal`/`.split` 此前零 CSS 规则的裸渲染在此收口——`.split`
    // 更名 `.transfer`，styles.ts 补齐 `.transfer*` 全套真样式（双栏布局/条目 hover/选中态/
    // 搜索框，token 化、跟随深浅色主题）。交互补齐"点击即移动"：左栏条目点击 → moveToChosen，
    // 右栏条目点击 → moveToAvailable。条目元素从 <div> 换成 <button type="button">——对齐
    // 仓库既有"可点击列表项 = 原生 button"惯例（WorkflowCanvas.tsx 的 stage-card、
    // AfkWorkbench.tsx 的 afk-item 先例），顺带获得键盘 Enter/Space 可达性（此前纯 div 键盘
    // 完全不可达，仅能拖拽）。Save/Cancel 补 .btn/.btn--ghost（对齐其余全部 Dialog actions
    // 的既有用法，如 NewChangeDialog/BoardView 确认框），此前是零样式裸 <button>。
    <Dialog
      title={t('skill_transfer.title')}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="btn" onClick={() => onSave(chosen)}>{t('skill_transfer.save')}</button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>{t('skill_transfer.cancel')}</button>
        </>
      }
    >
      <input
        className="transfer__search"
        placeholder={t('skill_transfer.search_placeholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="transfer">
        <div className="transfer__col" data-testid="skill-available" onDragOver={(e) => e.preventDefault()} onDrop={onDropToAvailable}>
          {error && <div className="transfer__error" data-testid="skill-error">{error}</div>}
          {!error && available.map((s) => (
            <button
              key={s}
              type="button"
              className="transfer__item"
              title={s}
              draggable
              onDragStart={(e) => e.dataTransfer.setData(DND_MIME, s)}
              onClick={() => moveToChosen(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="transfer__col" data-testid="skill-chosen" onDragOver={(e) => e.preventDefault()} onDrop={onDropToChosen}>
          {chosen.map((s) => (
            <button
              key={s}
              type="button"
              className="transfer__item transfer__item--chosen"
              title={s}
              draggable
              onDragStart={(e) => e.dataTransfer.setData(DND_MIME, s)}
              onClick={() => moveToAvailable(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
