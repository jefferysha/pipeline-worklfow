import { useEffect, useRef, useState } from 'react'
import { deleteSecret, fetchSecrets, postSecret, type WbSecretsKeys } from '../api/client'
import { useT } from '../i18n'

/**
 * SecretsCard(v6 T8)——独立「凭证」卡:机器级 ~/.claude/pipeline-secrets.json 的审阅/写入面,
 * 跟在 AFK 执行卡之后(决策 C.5:不并入 AutomationCard——那张卡是 per-root dirty→保存语义,
 * 凭证是机器级逐键即时写,两种保存语义混在一卡会互相污染)。
 *
 * 红线与语义:
 *   · write-only:编辑态输入框永远从空开始,绝不回填明文;已配态只显示 server 给的掩码。
 *   · per-runner:claude-code 用 CLAUDE_CODE_OAUTH_TOKEN;codex 用 OPENAI_API_KEY(+CODEX_HOME,
 *     后者是路径不是密钥,不进 secrets 存储,只作只读说明行——决策 C2b,不做假输入框)。
 *   · 优先级提示:宿主 env 显式非空 > 此处保存的文件值(C4,与 afk run 注入的真实合并序一致)。
 *   · 保存/删除成功 → 重拉本卡 + onChanged 通知宿主(AutomationCard 就绪三灯 refreshToken +1);
 *     显式动作触发,不轮询(G22 纪律)。
 */

const EDITABLE_KEYS = ['CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_API_KEY'] as const
type EditableKey = (typeof EDITABLE_KEYS)[number]

export interface SecretsCardProps {
  /** 保存/删除成功后的宿主通知(就绪三灯重拉)。 */
  onChanged?: () => void
}

export function SecretsCard({ onChanged }: SecretsCardProps): JSX.Element {
  const { t } = useT()
  const [keys, setKeys] = useState<WbSecretsKeys | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditableKey | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [opError, setOpError] = useState<string | null>(null)

  // Bug7：reload seq 守卫（参照 SkillChain/SkillHealthPanel）——挂载 + 每次保存/删除后都重拉，
  // 无守卫时慢响应会盖快响应（out-of-order），卸载后回来则 setState-after-unmount。每次 reload 递增
  // seq，仅最新一发的响应落态；卸载时再 +1 令全部在途失效。
  const seqRef = useRef(0)
  function reload(): void {
    const seq = ++seqRef.current
    fetchSecrets()
      .then((k) => {
        if (seqRef.current !== seq) return
        setKeys(k)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (seqRef.current !== seq) return
        setLoadError(t('workbench.sc_load_error', { msg: err instanceof Error ? err.message : t('workbench.lp_network_error') }))
      })
  }
  // 挂载拉一次(机器级资源,与 root 无关)；卸载令在途 reload 失效。
  useEffect(() => {
    reload()
    return () => {
      seqRef.current += 1
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit(key: EditableKey): void {
    setEditing(key)
    setDraft('') // write-only:永不回填明文
    setOpError(null)
  }

  async function save(): Promise<void> {
    if (editing === null || draft === '' || busy) return
    setBusy(true)
    setOpError(null)
    try {
      await postSecret(editing, draft)
      setEditing(null)
      setDraft('')
      reload()
      onChanged?.()
    } catch (err) {
      setOpError(err instanceof Error ? err.message : t('workbench.lp_network_error'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(key: EditableKey): Promise<void> {
    if (busy) return
    setBusy(true)
    setOpError(null)
    try {
      await deleteSecret(key)
      reload()
      onChanged?.()
    } catch (err) {
      setOpError(err instanceof Error ? err.message : t('workbench.lp_network_error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card wb-loop" data-testid="wb-secrets-card">
      <div className="wb-editor-head lp-head">
        <b>{t('workbench.sc_title')}</b>
        <span className="g-phase">{t('workbench.sc_scope')}</span>
        <span className="wb-spacer" />
        <span className="lp-head-sub">{t('workbench.sc_head_sub')}</span>
      </div>
      {loadError && <p className="view__note view__note--error" data-testid="sc-load-error">{loadError}</p>}
      {opError && <p className="view__note view__note--error" role="alert" data-testid="sc-op-error">{opError}</p>}
      {keys && (
        <div className="wb-ed-sec">
          {EDITABLE_KEYS.map((key) => {
            const light = keys[key]
            const isEditing = editing === key
            return (
              <div key={key} className="lp-policy sc-row" data-testid={`sc-row-${key}`}>
                <span className="wb-flabel lp-mono">{key}</span>
                <span className="wb-note">{t(`workbench.sc_runner_${key}`)}</span>
                {!isEditing && light.set && (
                  <span className="lp-mono sc-masked" data-testid={`sc-masked-${key}`}>{light.masked}</span>
                )}
                {!isEditing && !light.set && (
                  <span className="wb-note" data-testid={`sc-unset-${key}`}>{t('workbench.sc_unset')}</span>
                )}
                {!isEditing && (
                  <>
                    <button type="button" className="btn btn--ghost" data-testid={`sc-edit-${key}`} onClick={() => startEdit(key)}>
                      {light.set ? t('workbench.sc_update') : t('workbench.sc_set')}
                    </button>
                    {light.set && (
                      <button type="button" className="btn btn--ghost" data-testid={`sc-del-${key}`} disabled={busy} onClick={() => void remove(key)}>
                        {t('workbench.sc_delete')}
                      </button>
                    )}
                  </>
                )}
                {isEditing && (
                  <>
                    <input
                      className="wb-input lp-mono"
                      type="password"
                      data-testid={`sc-input-${key}`}
                      placeholder={t('workbench.sc_placeholder')}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void save()
                        }
                      }}
                    />
                    <button type="button" className="btn" data-testid={`sc-save-${key}`} disabled={draft === '' || busy} onClick={() => void save()}>
                      {t('workbench.sc_save')}
                    </button>
                    <button type="button" className="btn btn--ghost" data-testid={`sc-cancel-${key}`} onClick={() => { setEditing(null); setDraft('') }}>
                      {t('workbench.sc_cancel')}
                    </button>
                  </>
                )}
                {/* G2:前置缺失引导——不光报「未配置」,补一句「怎么拿」(已配态也常驻,兼作轮换指引)。
                    静态命令文本,不触碰凭证值,write-only 不受影响(单源见 kernel PREREQ_HINTS)。 */}
                <span className="wb-note sc-howto" data-testid={`sc-howto-${key}`}>{t(`workbench.sc_howto_${key}`)}</span>
              </div>
            )
          })}
          {/* CODEX_HOME:路径不是密钥,不进 secrets 存储(决策 C2b)——只读说明,不做假输入框。 */}
          <div className="lp-policy sc-row" data-testid="sc-row-CODEX_HOME">
            <span className="wb-flabel lp-mono">CODEX_HOME</span>
            <span className="wb-note">{t('workbench.sc_codex_home_note')}</span>
            {/* G2:即便是只读路径行,也顺手指一句怎么来的(codex login 自动设),闭合 codex 凭证获取故事。 */}
            <span className="wb-note sc-howto" data-testid="sc-howto-CODEX_HOME">{t('workbench.sc_howto_CODEX_HOME')}</span>
          </div>
          <p className="wb-note wb-sec-note">{t('workbench.sc_precedence_note')}</p>
        </div>
      )}
    </section>
  )
}
