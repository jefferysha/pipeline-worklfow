import { useState } from 'react'
import { useT } from '../i18n'
import { Icon } from './Icon'

export interface OnboardingProps {
  kind: 'no-project' | 'no-change'
  /** no-change 形态：当前项目 root（拼 CLI 命令用）。 */
  root?: string
  /** no-change 形态主按钮 → 打开 NewChangeDialog。 */
  onNewChange?: () => void
}

/** 建 change 的教学命令（字面终端命令，非 i18n——命令本身不翻译）。 */
const INIT_CMD = 'pipeline init my-change --track chat'

/**
 * 单条可复制命令行（$ 提示符 + 命令 + 复制钮，自管 copied 态 2s 回落）。前端只读，唯一动作是
 * 把真命令拷进剪贴板导回终端——不做假注册/假安装（决议#7）。
 */
function CmdRow({ cmd, testid, copyTestid }: { cmd: string; testid: string; copyTestid: string }): JSX.Element {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  function copy(): void {
    void navigator.clipboard?.writeText(cmd).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="ob-cmd">
      <span className="ob-cmd__p" aria-hidden="true">$</span>
      <code className="ob-cmd__code" data-testid={testid}>{cmd}</code>
      <button type="button" className="ob-cmd__copy" data-testid={copyTestid} onClick={copy}>
        <Icon name="copy" size={12} />
        {copied ? t('onboard.copied') : t('onboard.copy')}
      </button>
    </div>
  )
}

/**
 * 教学式空状态（G18，spec §3.2；视觉真相源 demo all-views §6）：空状态不只说"没有数据"，而是
 * 教会界面怎么用。
 *
 * full-install W2（旅程 P0 断点）：纯 dashboard 新用户曾撞死胡同——无注册入口、切换器 >1 才现、
 * 空收件箱 CTA「去进度」也空成死循环。no-project 态从「单条 pipeline init」升级为「诚实三步
 * checklist」：dashboard 只读看进度，注册/装技能/跑流程都在终端，逐条给可复制真命令
 * （pipeline init → setup → doctor），做完刷新本页即可。决议#7 不反悔加注册 UI：不做假注册/假
 * 安装按钮，前端只把命令导回终端。
 *
 * T17（决议#7 + T2）：pipeline init best-effort 自动登记项目（kernel projectRegistry），注册表单
 * 与 POST /api/projects 调用退役（端点仅兼容保留），幽灵命令 `pipeline projects add` 一并清除。
 */
export function Onboarding({ kind, root, onNewChange }: OnboardingProps): JSX.Element {
  const { t } = useT()

  if (kind === 'no-change') {
    const cli = `cd ${root || '<project>'} && ${INIT_CMD}`
    return (
      <div className="empty" data-testid="onboard-no-change">
        <div className="empty__mark" aria-hidden="true">⧉</div>
        <h2 className="empty__title">{t('onboard.no_change_title')}</h2>
        <p className="empty__desc">{t('onboard.no_change_desc')}</p>
        <button type="button" className="btn" data-testid="onboard-new-change" style={{ marginBottom: 16 }} onClick={onNewChange}>
          ＋ {t('onboard.new_change')}
        </button>
        <div className="ob-or">
          <span className="ob-or__line" />
          {t('onboard.or_cli')}
          <span className="ob-or__line" />
        </div>
        <CmdRow cmd={cli} testid="onboard-cli" copyTestid="onboard-copy" />
      </div>
    )
  }

  // no-project：诚实三步 checklist——起步/装技能/跑流程都在终端，逐条可复制真命令导回终端。
  return (
    <div className="empty ob-wide" data-testid="onboard-no-project">
      <div className="empty__mark" aria-hidden="true">⧉</div>
      <h2 className="empty__title">{t('onboard.no_project_title')}</h2>
      <p className="empty__desc">{t('onboard.no_project_desc')}</p>
      <ol className="ob-steps">
        <li className="ob-step">
          <span className="ob-step__n" aria-hidden="true">1</span>
          <div className="ob-step__body">
            <div className="ob-step__label">{t('onboard.step_init')}</div>
            <CmdRow cmd={INIT_CMD} testid="onboard-cli" copyTestid="onboard-copy" />
          </div>
        </li>
        <li className="ob-step">
          <span className="ob-step__n" aria-hidden="true">2</span>
          <div className="ob-step__body">
            <div className="ob-step__label">{t('onboard.step_setup')}</div>
            <CmdRow cmd="pipeline setup" testid="onboard-cmd-setup" copyTestid="onboard-copy-setup" />
          </div>
        </li>
        <li className="ob-step">
          <span className="ob-step__n" aria-hidden="true">3</span>
          <div className="ob-step__body">
            <div className="ob-step__label">{t('onboard.step_doctor')}</div>
            <CmdRow cmd="pipeline doctor" testid="onboard-cmd-doctor" copyTestid="onboard-copy-doctor" />
          </div>
        </li>
      </ol>
    </div>
  )
}
