import { useEffect, useState } from 'react'
import { type WbSkillEntry } from '../api/client'
import { useT } from '../i18n'

/**
 * SkillHealthPanel（full-install W4，计划 2026-07-12-full-install-experience 批 2 Wave B，
 * 闭 P1-F3/BF10）—— dashboard 右栏只读「技能齐全度」面：消费既有 GET /api/skills/registry
 * （v6 T6，返回 {skills: WbSkillEntry[]}，每条含 installed 布尔）→ 展示「已装 N / 未装 M」计数
 * + 未装技能名 +「去终端跑 pipeline setup 装齐」可复制引导。
 *
 * 边界纪律（决议边界）：前端只读不装——装技能是终端 pipeline setup 的事，本面只做齐全度呈现
 * + 引导回终端，不提供任何前端安装按钮。命令真实（pipeline setup / pipeline doctor 都是仓库
 * 真命令，非 i18n 文案，硬编码为常量避免翻译层漂移），与终端同源（BF11：文案/命令与 setup/
 * doctor 一致）。
 *
 * fail-soft（不谎报全绿）：
 *   · registry fetch 失败 → 行内错误提示，不阻塞、不崩、绝不落「已装齐」；
 *   · registry 空/未就绪（skills 长度 0）→「未就绪，跑 pipeline doctor 查」，不谎报全绿——
 *     对齐 cli doctor.ts「registry 未就绪…不误报 green」的既有口径。
 *
 * 照 SkillChain.tsx 内联 fetch（不动共享 client.ts）：只借 WbSkillEntry 类型。
 */

// 真命令常量（BF11 与终端同源，不进 i18n——命令本体不随语言变，翻译层不得改写）。
const SETUP_CMD = 'pipeline setup'
const DOCTOR_CMD = 'pipeline doctor'

interface ErrorBody {
  error?: string
}

/** 非 2xx 响应尽量读出 server 的 { error } 文案（同 SkillChain.readErrorDetail 的既有模式）。 */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorBody
    if (typeof body?.error === 'string') return body.error
  } catch {
    /* 无 JSON 体 */
  }
  return ''
}

export function SkillHealthPanel(): JSX.Element {
  const { t } = useT()
  const [registry, setRegistry] = useState<WbSkillEntry[] | null>(null)
  const [regError, setRegError] = useState<string | null>(null)

  // 挂载拉一次（机器级技能库，与 root/workflow 无关；G22 纪律：不轮询）。失败 fail-soft。
  useEffect(() => {
    let cancelled = false
    fetch('/api/skills/registry', { headers: { Accept: 'application/json' } })
      .then(async (r) => {
        if (!r.ok) throw new Error((await readErrorDetail(r)) || `(${r.status})`)
        return r.json() as Promise<{ skills: WbSkillEntry[] }>
      })
      .then((body) => {
        if (!cancelled) setRegistry(body.skills)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRegError(
            t('workbench.skh_error', { msg: err instanceof Error ? err.message : t('workbench.network_error') }),
          )
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载只拉一次；t 变化不重拉
  }, [])

  const cmdButton = (cmd: string, testid: string): JSX.Element => (
    <button
      type="button"
      className="skh-cmd"
      data-testid={testid}
      title={t('workbench.skh_copy_hint')}
      onClick={() => void navigator.clipboard?.writeText(cmd)}
    >
      <code>{cmd}</code>
    </button>
  )

  const installed = registry?.filter((e) => e.installed) ?? []
  const missing = registry?.filter((e) => !e.installed) ?? []

  return (
    <div className="side-card" data-testid="wb-side-skillhealth">
      <div className="side-card__head">
        <b>{t('workbench.skh_title')}</b>
      </div>
      <div className="side-card__body">
        {/* fail-soft：fetch 失败——行内错误，不谎报全绿。 */}
        {regError && (
          <p className="view__note view__note--error" data-testid="skh-error">
            {regError}
          </p>
        )}

        {!regError && registry === null && <p className="wb-note">{t('common.loading')}</p>}

        {/* registry 空/未就绪：不谎报「已装齐」，导向终端 doctor（对齐 doctor「不误报 green」）。 */}
        {!regError && registry !== null && registry.length === 0 && (
          <div data-testid="skh-unready">
            <p className="wb-note">{t('workbench.skh_unready')}</p>
            {cmdButton(DOCTOR_CMD, 'skh-copy-doctor')}
          </div>
        )}

        {!regError && registry !== null && registry.length > 0 && (
          <div data-testid="skh-ready">
            <div className="side-card__row">
              <span className="side-card__row-label">{t('workbench.skh_installed')}</span>
              <span className="side-card__row-value" data-testid="skh-installed-n">
                {installed.length}
              </span>
            </div>
            <div className="side-card__row">
              <span className="side-card__row-label">{t('workbench.skh_missing')}</span>
              <span
                className={`side-card__row-value${missing.length > 0 ? ' skh-n-warn' : ''}`}
                data-testid="skh-missing-n"
              >
                {missing.length}
              </span>
            </div>
            {missing.length === 0 ? (
              <p className="wb-note" data-testid="skh-all-good">
                {t('workbench.skh_all_installed')}
              </p>
            ) : (
              <>
                <p className="wb-note skh-miss-names" data-testid="skh-missing-names">
                  {t('workbench.skh_missing_names', { names: missing.map((e) => e.name).join('、') })}
                </p>
                <div className="skh-guide">
                  <p className="wb-note">{t('workbench.skh_guide')}</p>
                  {cmdButton(SETUP_CMD, 'skh-copy-setup')}
                </div>
              </>
            )}
          </div>
        )}

        {/* 只读边界（始终在场）：装技能在终端，本面只呈现齐全度 + 引导，不提供前端安装按钮。 */}
        <p className="wb-note wb-sec-note">{t('workbench.skh_readonly_note')}</p>
      </div>
    </div>
  )
}
