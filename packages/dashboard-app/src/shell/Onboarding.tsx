import { useState } from 'react'
import { Check } from 'lucide-react'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { CreateChangeDialog } from '../progress/CreateChangeDialog'

export interface OnboardingProps {
  kind: 'no-project' | 'no-change'
  /** no-change 形态：当前项目 root（拼 CLI 命令用）。 */
  root?: string
  onCreated?: (name: string) => void | Promise<void>
  onToast?: (message: string) => void
}

/** 建 change 的教学命令（字面终端命令，非 i18n——命令本身不翻译）。 */
const INIT_CMD = 'tenon init my-change --track chat'

// ── tailwind 类串（v10b 迁移：.empty/.ob-* 全局类退役，样式全由原子类承载）──
/** 教学空态卡片基底（max-width 按形态各自补：no-change 460px / no-project 520px）。 */
const EMPTY_CLS = 'mx-auto my-[8vh] rounded-lg border border-border bg-card px-8 py-[30px] text-center'
const EMPTY_MARK_CLS = 'mx-auto mb-3.5 grid h-[42px] w-[42px] place-items-center rounded-lg bg-ink text-ink-fg'
const EMPTY_TITLE_CLS = 'mb-2 text-[17px] font-bold text-text'
const EMPTY_DESC_CLS = 'mb-[18px] text-[12.5px] leading-[1.7] text-text-3'
const STEP_LABEL_CLS = 'text-[12.5px] leading-[1.6] text-text-2'
const STEP_N_CLS = 'h-[22px] w-[22px] flex-none rounded-full bg-ink text-center text-xs font-bold leading-[22px] text-ink-fg'

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
    <div className="flex items-center gap-2 rounded-md border border-code-border bg-code-bg px-[11px] py-[7px] font-mono text-xs">
      <span className="flex-none text-text-3" aria-hidden="true">$</span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-text" data-testid={testid}>{cmd}</code>
      <button
        type="button"
        className="inline-flex min-h-6 flex-none cursor-pointer items-center gap-1 rounded-md px-2 whitespace-nowrap text-[11px] font-bold text-accent-d transition-colors motion-reduce:transition-none hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
        data-testid={copyTestid}
        aria-label={t('onboard.copy_command', { command: cmd })}
        onClick={copy}
      >
        {copied ? <Check size={12} strokeWidth={1.75} aria-hidden="true" /> : <Icon name="copy" size={12} />}
        {copied ? t('onboard.copied') : t('onboard.copy')}
      </button>
      {copied && <span className="sr-only" role="status" aria-live="polite">{t('onboard.copied')}</span>}
    </div>
  )
}

/**
 * 教学式空状态（G18，spec §3.2；视觉真相源 demo all-views §6）：空状态不只说"没有数据"，而是
 * 教会界面怎么用。
 *
 * full-install W2（旅程 P0 断点）：纯 dashboard 新用户曾撞死胡同——无注册入口、切换器 >1 才现、
 * 空收件箱 CTA「去进度」也空成死循环。no-project 态从「单条 tenon init」升级为「诚实两步
 * checklist」：能看到 Dashboard 说明 setup 已完成，这里只引导创建 Change 并运行 doctor 校验
 * （tenon init → doctor），做完刷新本页即可。决议#7 不反悔加注册 UI：不做假注册/假安装
 * 按钮，前端只把命令导回终端，也不猜测宿主是 Codex 还是 Claude。
 *
 * T17（决议#7 + T2）：tenon init best-effort 自动登记项目（kernel projectRegistry），注册表单
 * 与 POST /api/projects 调用退役（端点仅兼容保留），幽灵命令 `pipeline projects add` 一并清除。
 */
export function Onboarding({ kind, root, onCreated, onToast }: OnboardingProps): JSX.Element {
  const { t } = useT()
  const [createOpen, setCreateOpen] = useState(false)

  if (kind === 'no-change') {
    const cli = `cd ${root || '<project>'} && ${INIT_CMD}`
    return (
      <div className={`${EMPTY_CLS} max-w-[460px]`} data-testid="onboard-no-change">
        <div className={EMPTY_MARK_CLS} aria-hidden="true"><Icon name="flow" size={20} /></div>
        <h1 className={EMPTY_TITLE_CLS}>{t('onboard.no_change_title')}</h1>
        <p className={EMPTY_DESC_CLS}>{t('onboard.no_change_desc')}</p>
        <button
          type="button"
          className="mb-4 inline-flex items-center justify-center rounded-lg bg-btn-bg px-4 py-2 text-xs font-bold text-btn-fg transition-colors motion-reduce:transition-none hover:bg-btn-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
          data-testid="onboard-new-change"
          onClick={() => setCreateOpen(true)}
        >
          {t('change_create.create')}
        </button>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-text-3">{t('onboard.cli_fallback')}</div>
        <CmdRow cmd={cli} testid="onboard-cli" copyTestid="onboard-copy" />
        {createOpen && root && (
          <CreateChangeDialog
            root={root}
            onClose={() => setCreateOpen(false)}
            onCreated={onCreated ?? (() => undefined)}
            onToast={onToast}
          />
        )}
      </div>
    )
  }

  // no-project：tenon init 会自动登记项目；界面只保留可复制的真实终端步骤，不再要求用户
  // 暴露本机绝对路径或理解项目注册表。
  return (
    <div className={`${EMPTY_CLS} max-w-[620px]`} data-testid="onboard-no-project">
      <div className={EMPTY_MARK_CLS} aria-hidden="true"><Icon name="folder" size={20} /></div>
      <h1 className={EMPTY_TITLE_CLS}>{t('onboard.no_project_title')}</h1>
      <p className={EMPTY_DESC_CLS}>{t('onboard.no_project_desc')}</p>
      <ol className="mt-1 flex list-none flex-col gap-3.5 p-0 text-left">
        <li className="flex gap-3">
          <span className={STEP_N_CLS} aria-hidden="true">1</span>
          <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
            <div className={STEP_LABEL_CLS}>{t('onboard.step_init')}</div>
            <CmdRow cmd={INIT_CMD} testid="onboard-cli" copyTestid="onboard-copy" />
          </div>
        </li>
        <li className="flex gap-3">
          <span className={STEP_N_CLS} aria-hidden="true">2</span>
          <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
            <div className={STEP_LABEL_CLS}>{t('onboard.step_doctor')}</div>
            <CmdRow cmd="tenon doctor" testid="onboard-cmd-doctor" copyTestid="onboard-copy-doctor" />
          </div>
        </li>
      </ol>
    </div>
  )
}
