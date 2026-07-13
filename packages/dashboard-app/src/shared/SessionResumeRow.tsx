/**
 * SessionResumeRow（v9-I）—— TaskDetail「自己上手修」命令卡首行：关联那次终端会话 + 恢复命令。
 * 自取数（挂载时 GET /api/mem/session-link，卸载中止 setState）；三态渲染：
 *   · loading 静默（渲染 null，不闪骨架——命令卡其余行不依赖本行）；
 *   · found:false / 请求失败 → 一行灰字「未找到可恢复会话」（诚实缺省：AFK 沙箱内 claude
 *     会话随容器 HOME=/tmp 销毁，宿主机本就查不到，不是故障）；
 *   · found:true + resumeCmd → mono 恢复命令可拷贝（复用 dt8-conn 行族样式 + dt-code-copy 钮），
 *     旁小字 platform+sessionId 短形；resumeCmd:null（opencode/pi 无把握拼法，后端不造假命令）
 *     → 只显示「会话 <sid 前 8 位> · <platform>」+ 目录拷贝。
 * 样式零新增：整行复用既有 .dt8-conn-row/-k/-v/-note 与 .dt-code-copy（不碰 styles.ts，
 * 避开 G/H 在途共享文件）。拷贝走宿主注入的 onCopy（toast 语义留在 TaskDetail，同 actions
 * 的 props 化纪律——本组件零业务、零剪贴板直连）。
 */
import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { fetchSessionLink, type SessionLink } from '../api/client'
import { Icon } from '../shell/Icon'
import { shellQuote } from './shellQuote'

export interface SessionResumeRowProps {
  root: string
  name: string
  /** 拷贝动作（宿主传 TaskDetail 的 copy，带 toast）；未传则拷贝钮静默无 toast。 */
  onCopy?: (value: string) => void
}

export function SessionResumeRow({ root, name, onCopy }: SessionResumeRowProps): JSX.Element | null {
  const { t } = useT()
  const [link, setLink] = useState<SessionLink | null>(null)

  useEffect(() => {
    let cancelled = false
    setLink(null)
    fetchSessionLink(root, name)
      .then((r) => {
        if (!cancelled) setLink(r)
      })
      .catch(() => {
        if (!cancelled) setLink({ found: false })
      })
    return () => {
      cancelled = true
    }
  }, [root, name])

  function copy(value: string): void {
    onCopy?.(value)
  }

  if (link === null) return null // loading 静默
  if (!link.found) {
    return (
      <div className="dt8-conn-row" data-testid="dt8-conn-resume-none">
        <span className="dt8-conn-k">{t('detail.conn_resume')}</span>
        <span className="dt8-conn-note">{t('detail.conn_resume_none')}</span>
      </div>
    )
  }

  const sid = link.sessionId ?? ''
  const sid8 = sid.slice(0, 8)
  const platform = link.platform ?? ''
  const cmd = link.resumeCmd ?? null

  if (cmd === null) {
    // 无把握拼法的平台：只给会话身份 + 目录拷贝（cd 命令），不给假恢复命令。
    // 目录段过 shellQuote（codex 终稿 P2 同族）：安全字符原样，特殊字符 POSIX 单引号转义。
    const dirCmd = link.dir ? `cd ${shellQuote(link.dir)}` : ''
    return (
      <div className="dt8-conn-row" data-testid="dt8-conn-resume">
        <span className="dt8-conn-k">{t('detail.conn_resume')}</span>
        <span className="dt8-conn-v">{t('detail.conn_resume_id', { sid: sid8, platform })}</span>
        {dirCmd !== '' && (
          <button
            type="button"
            className="dt-code-copy"
            data-copy={dirCmd}
            data-testid="dt8-conn-resume-copy"
            aria-label={t('detail.copy_cmd')}
            onClick={() => copy(dirCmd)}
          >
            <Icon name="copy" size={12} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="dt8-conn-row" data-testid="dt8-conn-resume">
      <span className="dt8-conn-k">{t('detail.conn_resume')}</span>
      <span className="dt8-conn-v">{cmd}</span>
      <span className="dt8-conn-note" data-testid="dt8-conn-resume-meta">
        {platform} · {sid8}
      </span>
      <button
        type="button"
        className="dt-code-copy"
        data-copy={cmd}
        data-testid="dt8-conn-resume-copy"
        aria-label={t('detail.copy_cmd')}
        onClick={() => copy(cmd)}
      >
        <Icon name="copy" size={12} />
      </button>
    </div>
  )
}
