import { useState } from 'react'
import { useT } from '../i18n'

export interface OnboardingProps {
  kind: 'no-project' | 'no-change'
  /** no-change 形态：当前项目 root（拼 CLI 命令用）。 */
  root?: string
  /** no-change 形态主按钮 → 打开 NewChangeDialog。 */
  onNewChange?: () => void
}

/**
 * 教学式空状态（G18，spec §3.2；视觉真相源 demo all-views §6）：空状态不只说"没有数据"，
 * 而是教会界面怎么用。
 *
 * T17（决议#7 + T2）：no-project 改纯教学态——pipeline init 会 best-effort 自动登记项目
 * （kernel projectRegistry，T2 已落地），注册表单与 POST /api/projects 调用从这里退役
 * （端点仅兼容保留），幽灵命令 `pipeline projects add`（CLI 从未实现）一并清除。
 * 唯一路径 = 在项目里跑一次 pipeline init，项目自动出现。
 */
export function Onboarding({ kind, root, onNewChange }: OnboardingProps): JSX.Element {
  const { t } = useT()
  const [copied, setCopied] = useState(false)

  const cli = kind === 'no-project'
    ? 'cd ~/code/my-project && pipeline init my-change --track chat --preset full'
    : `cd ${root || '<project>'} && pipeline init my-change --track chat --preset full`

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
        </>
      ) : (
        <>
          <h2 className="empty__title">{t('onboard.no_change_title')}</h2>
          <p className="empty__desc">{t('onboard.no_change_desc')}</p>
          <button type="button" className="btn" data-testid="onboard-new-change" style={{ marginBottom: 16 }} onClick={onNewChange}>
            ＋ {t('onboard.new_change')}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-3)', fontSize: 11, marginBottom: 10 }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            {t('onboard.or_cli')}
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
        </>
      )}
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
