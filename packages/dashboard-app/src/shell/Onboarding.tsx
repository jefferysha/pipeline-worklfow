import { useState } from 'react'
import { ApiError, registerProject } from '../api/client'
import { useT } from '../i18n'

export interface OnboardingProps {
  kind: 'no-project' | 'no-change'
  /** no-change 形态：当前项目 root（拼 CLI 命令用）。 */
  root?: string
  /** 注册成功 → App refresh。 */
  onRegistered?: () => void
  /** no-change 形态主按钮 → 打开 NewChangeDialog。 */
  onNewChange?: () => void
}

/**
 * 教学式空状态（G18，spec §3.2；视觉真相源 demo all-views §6）：
 * 空状态不只说"没有数据"，而是教会界面怎么用——表单直连新端点 + CLI 等价命令双路径。
 */
export function Onboarding({ kind, root, onRegistered, onNewChange }: OnboardingProps): JSX.Element {
  const { t } = useT()
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const cli = kind === 'no-project'
    ? `pipeline projects add ${path || '~/code/my-project'}`
    : `cd ${root || '<project>'} && pipeline init my-change --track chat --preset full`

  async function submit(): Promise<void> {
    if (!path || busy) return
    setBusy(true)
    setError(null)
    try {
      await registerProject(path)
      onRegistered?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function copy(): void {
    void navigator.clipboard?.writeText(cli).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="empty" data-testid={`onboard-${kind}`}>
      <div className="empty__mark" aria-hidden="true">⧉</div>
      {kind === 'no-project' ? (
        <>
          <h2 className="empty__title">{t('onboard.no_project_title')}</h2>
          <p className="empty__desc">{t('onboard.no_project_desc')}</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              className="input"
              style={{ flex: 1, textAlign: 'left' }}
              data-testid="onboard-path"
              placeholder={t('onboard.path_placeholder')}
              value={path}
              onChange={(e) => {
                setPath(e.target.value)
                setError(null)
              }}
            />
            <button type="button" className="btn" data-testid="onboard-register" disabled={busy || !path} onClick={() => void submit()}>
              {t('onboard.register')}
            </button>
          </div>
          {error && <p className="field__error" data-testid="onboard-error" style={{ marginBottom: 12 }}>{error}</p>}
        </>
      ) : (
        <>
          <h2 className="empty__title">{t('onboard.no_change_title')}</h2>
          <p className="empty__desc">{t('onboard.no_change_desc')}</p>
          <button type="button" className="btn" data-testid="onboard-new-change" style={{ marginBottom: 16 }} onClick={onNewChange}>
            ＋ {t('onboard.new_change')}
          </button>
        </>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-mute)', fontSize: 11, marginBottom: 10 }}>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        {t('onboard.or_cli')}
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </div>
      <div className="dlg-cli" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left' }}>
        <span data-testid="onboard-cli" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cli}</span>
        <button
          type="button"
          data-testid="onboard-copy"
          onClick={copy}
          style={{ border: 0, background: 'transparent', color: 'var(--green)', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {copied ? t('onboard.copied') : t('onboard.copy')}
        </button>
      </div>
    </div>
  )
}
