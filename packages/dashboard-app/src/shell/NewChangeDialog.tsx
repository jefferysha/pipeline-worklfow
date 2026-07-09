import { useEffect, useState } from 'react'
import { ApiError, createChange, fetchWorkflowNames } from '../api/client'
import { useT } from '../i18n'
import { TRACKS } from '../types'

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
    <div className="dialog__backdrop" data-testid="newchange-dialog">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={t('newchange.title')}>
        <h2 className="dialog__title">{t('newchange.title')}</h2>
        <p className="dialog__desc">{t('newchange.desc', { project: root.split('/').filter(Boolean).pop() ?? root })}</p>
        <div className="dialog__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field">
            <span className="field__label">{t('newchange.name_label')}</span>
            <input
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
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>
            {t('newchange.cancel')}
          </button>
          <button type="button" className="btn" data-testid="newchange-submit" disabled={!canSubmit} onClick={() => void submit()}>
            {t('newchange.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
