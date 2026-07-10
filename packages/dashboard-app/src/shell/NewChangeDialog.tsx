import { useEffect, useRef, useState } from 'react'
import { ApiError, createChange, fetchWorkflowNames } from '../api/client'
import { useT } from '../i18n'
import { TRACKS } from '../types'
import { Dialog } from './Dialog'

export interface NewChangeDialogProps {
  root: string
  onClose: () => void
  /** 创建成功，回传新 change 名（App：refresh + toast + 关闭）。 */
  onCreated: (name: string) => void
}

const NAME_RE = /^[a-zA-Z0-9_-]+$/

/**
 * 新建 change 对话框（G18 主入口，spec §3.2；视觉真相源 demo forms-motion §1）。
 * 名字实时校验对齐 kernel 单行 YAML 约束；底部灰票块给出等价 CLI 命令（教学延续，
 * 与空态 onboarding 的双路径理念一致）。
 */
export function NewChangeDialog({ root, onClose, onCreated }: NewChangeDialogProps): JSX.Element {
  const { t } = useT()
  const [name, setName] = useState('')
  const [workflow, setWorkflow] = useState('default')
  const [track, setTrack] = useState('chat')
  const [wfNames, setWfNames] = useState<string[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    fetchWorkflowNames(root)
      .then((names) => {
        if (!cancelled) setWfNames(names)
      })
      .catch(() => {
        /* 列表拉不到只影响下拉可选项（保底 default），不阻塞对话框 */
      })
    return () => {
      cancelled = true
    }
  }, [root])

  const nameInvalid = name.length > 0 && !NAME_RE.test(name)
  const canSubmit = name.length > 0 && !nameInvalid && !busy

  // busy 守卫（评审修复）：迁移到共享 Dialog 后 Esc/backdrop 都会调传入的 onClose，
  // 迁移前的手写 backdrop 是死 div、busy 期间点它没有任何效果——这里补回等价语义。
  // busy 态是本组件内部状态，App 拿不到，故守卫包在这里而非调用方。取消钮也复用
  // 同一个函数（本来就该和 Esc/backdrop 一致，不必各写一份）。
  // 禁止用 useCallback 包裹本函数——会冻结 busy 快照，连取消钮的 busy 语义一起假死，且 exhaustive-deps 拦不住。
  function guardedClose(): void {
    if (!busy) onClose()
  }

  async function submit(): Promise<void> {
    if (!canSubmit) return
    setBusy(true)
    setServerError(null)
    try {
      await createChange({ root, name, workflow, track })
      onCreated(name)
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={t('newchange.title')} onClose={guardedClose} testid="newchange-dialog" initialFocusRef={nameInputRef}>
      <p className="dialog__desc">{t('newchange.desc', { project: root.split('/').filter(Boolean).pop() ?? root })}</p>
      {/* <form>+onSubmit：名字输入框回车即提交（评审 P0-5 随迁 P3-16），提交按钮用
          type="submit" 而非手写 onClick，避免"Enter 走 user-event 的隐式提交"和"点击按钮"
          两条路径各自触发一次 submit() 而重复提交——两条路径现在都收敛到同一个 onSubmit。 */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="dialog__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field">
            <span className="field__label">{t('newchange.name_label')}</span>
            <input
              ref={nameInputRef}
              className={nameInvalid ? 'input input--error' : 'input'}
              style={{ fontFamily: 'var(--mono)' }}
              data-testid="newchange-name"
              placeholder="fix-login"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setServerError(null)
              }}
            />
            {nameInvalid && <span className="field__error" data-testid="newchange-name-error">{t('newchange.name_error')}</span>}
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <label className="field" style={{ flex: 1 }}>
              <span className="field__label">{t('newchange.workflow_label')}</span>
              <select className="select" data-testid="newchange-workflow" value={workflow} onChange={(e) => setWorkflow(e.target.value)}>
                <option value="default">default</option>
                {wfNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span className="field__label">{t('newchange.track_label')}</span>
              <select className="select" data-testid="newchange-track" value={track} onChange={(e) => setTrack(e.target.value)}>
                {TRACKS.map((tr) => (
                  <option key={tr} value={tr}>{tr}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="dlg-cli" data-testid="newchange-cli">
            $ pipeline init {name || '<name>'} --workflow {workflow} --track {track}
          </div>
          {serverError && <p className="field__error" data-testid="newchange-server-error">{serverError}</p>}
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={guardedClose}>
            {t('newchange.cancel')}
          </button>
          <button type="submit" className="btn" data-testid="newchange-submit" disabled={!canSubmit}>
            {t('newchange.create')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
