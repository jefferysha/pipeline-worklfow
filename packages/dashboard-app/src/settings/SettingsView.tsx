import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { getToken } from '../api/client'
import { PHASES, TRANSITIONS } from '../types'
import { MANDATORY_SKILLS, MATRIX_TRACKS, isReviewGate } from './data'
import { SkillTransferModal } from './SkillTransferModal'

type Tab = 'axis' | 'matrix'

/** POST /api/config/mandatory-skills 的成功响应体形状（server/src/server.ts 镜像）。 */
interface MandatorySkillsPostResponse {
  ok?: boolean
  error?: string
  skills?: string[]
}

/**
 * 设置 —— 病灶①解法：配置矩阵 + 相位轴编辑器从看板搬到独立视图。
 * 相位轴：7 相位 + 转换边 + 复核门标记（manifest 单源镜像，只读——状态机图不经本端点改）。
 * 技能矩阵：相位 × 轨道强制 skill。M3 config 写端点收编：真 fetch GET /api/config 探测能力
 * （capabilities.config，同 B6/B8 能力声明驱动渲染的既定模式）——探测到真数据端则矩阵单元
 * 可编辑（真 POST /api/config/mandatory-skills，同 B5 token 鉴权模式）；未探测到（旧 server /
 * 网络失败）则保持既有只读预览，不谎报能力。
 *
 * 注：本文件按任务的文件所有权边界自包含（未引入 packages/dashboard-app/src/i18n/translations.ts
 * 新键、未新增旁置文件），因此新增的编辑态文案（编辑/错误提示，以及 SkillTransferModal 内部的
 * 保存/取消）是直接字面量，暂未接入 useT() 的 en/zh 切换——与本视图既有的 t() 驱动文案共存，
 * 是本轮收编的已知取舍。
 *
 * M4：矩阵单元的编辑交互从"原地文本框（逗号分隔 skill token）"换成弹窗双栏穿梭框——见
 * SkillTransferModal（真 fetch GET /api/skills/registry 取全部已注册 skill 供左栏搜索/拖拽，
 * 右栏为当前已选、可拖拽增删）。保存仍归口同一个 POST /api/config/mandatory-skills（见
 * saveCellWith），契约不变，只是调用来源从"解析 draft 文本框"变成"直接收 modal 传回的数组"。
 *
 * 评审修复：换成弹窗后一度丢失了原 input/Save/Cancel 共用的 `disabled={saving}` 在途保护
 * （SkillTransferModal 不支持外部 disable，且已冻结不改）。改在调用点用 savingKeyRef +
 * requestSave/requestCancel 补回等价守卫：同一 cell 保存在途时，重复"保存"整体 no-op（不
 * 并发发第二个请求），"取消"也整体 no-op（不会把仍在等结果的 cell 提前踢回只读态、导致
 * 之后到达的错误无处渲染）。
 */
export function SettingsView(): JSX.Element {
  const { t } = useT()
  const [tab, setTab] = useState<Tab>('axis')

  // ── M3 config 写端点接线 ──
  const [liveSkills, setLiveSkills] = useState<Record<string, string[]> | null>(null)
  const [configCapable, setConfigCapable] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const fetchedConfigRef = useRef(false)
  // M4 评审修复（见 task-4-report.md「Fix: in-flight save guard」）：同一 cell 在途保存时的
  // 守卫，等价于本任务重构前 input/Save/Cancel 三者共用的 `disabled={saving}`。用 ref 而非
  // state——守卫只在 onSave/onCancel 回调里同步读取判断，不参与渲染，ref 保证判断即时生效，
  // 不依赖父组件重渲染的时序。
  const savingKeyRef = useRef<string | null>(null)

  // 懒加载：只在用户真正切到矩阵 tab 时才探测/拉取 config（而非每次挂载 SettingsView 就打一发
  // 请求）——用户可能整场只看相位轴，没必要为没打开过的 tab 发请求；fetchedConfigRef 保证只探测一次。
  useEffect(() => {
    if (tab !== 'matrix' || fetchedConfigRef.current) return
    fetchedConfigRef.current = true
    let cancelled = false
    fetch('/api/config', { headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          setConfigCapable(false)
          return
        }
        const body = (await res.json()) as { mandatory_skills?: Record<string, string[]> }
        if (cancelled) return
        setLiveSkills(body.mandatory_skills ?? {})
        setConfigCapable(true)
      })
      .catch(() => {
        if (!cancelled) setConfigCapable(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab])

  function effectiveSkills(phase: string, track: string): string[] {
    const table = liveSkills ?? MANDATORY_SKILLS
    return table[`${phase}.${track}`] ?? table[`${phase}._all`] ?? []
  }

  function cancelEdit(): void {
    setEditingKey(null)
    setSaveError(null)
  }

  /**
   * M4：镜像原 saveCell 的 POST 逻辑一比一（url/method/headers/body 形状/响应处理/错误处理
   * 全部不变）——唯一区别是 skills 直接由 SkillTransferModal 的 onSave 传回数组，不必再从
   * draft 文本框 split(',') 解析。
   *
   * 评审修复：函数首尾维护 savingKeyRef，供 requestSave/requestCancel 判断"这个 cell 现在是否
   * 有一个在途保存"。
   */
  async function saveCellWith(phase: string, track: string, skills: string[]): Promise<void> {
    const cellKey = `${phase}.${track}`
    savingKeyRef.current = cellKey
    setSaveError(null)
    try {
      const res = await fetch('/api/config/mandatory-skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ phase, track, skills }),
      })
      let body: MandatorySkillsPostResponse = {}
      try {
        body = (await res.json()) as MandatorySkillsPostResponse
      } catch {
        /* 无 JSON 体：保留空对象，走下方通用错误文案 */
      }
      if (!res.ok) {
        throw new Error(body.error || `保存失败（${res.status}）`)
      }
      const saved = Array.isArray(body.skills) ? body.skills : skills
      setLiveSkills((prev) => ({ ...(prev ?? {}), [`${phase}.${track}`]: saved }))
      setEditingKey(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      // 只清自己写入的标记——避免清掉"取消时又切到另一 cell 编辑、那个 cell 也开始保存"这种
      // 边界场景下别的 cell 刚写入的 savingKeyRef（该场景本身是 M3 起就有的"单 editingKey/
      // 单 saveError 全局态"既有限制，非本次修复范围，见 task-4-report.md 的关注点说明）。
      if (savingKeyRef.current === cellKey) savingKeyRef.current = null
    }
  }

  /**
   * 评审修复：cell 在途保存时，重复触发"保存"必须 no-op——本任务重构前 Save 按钮的
   * `disabled={saving}` 本来就阻止了这种并发重复请求；SkillTransferModal（Task 3 已冻结）
   * 不支持外部 disable，故在这一层（调用点）拦截，而非改 SkillTransferModal.tsx。
   */
  function requestSave(phase: string, track: string, skills: string[]): void {
    if (savingKeyRef.current === `${phase}.${track}`) return
    void saveCellWith(phase, track, skills)
  }

  /**
   * 评审修复：cell 在途保存时，点击"取消"必须 no-op（同旧 `disabled={saving}` 行为一致）。
   * 若不守卫，cancelEdit() 会先把 editingKey 清空，该 cell 立刻切回只读分支；随后在途请求
   * 结算失败时 setSaveError(...) 无处渲染（错误 <p> 只挂在 isEditing 分支里），被静默吞掉。
   */
  function requestCancel(phase: string, track: string): void {
    if (savingKeyRef.current === `${phase}.${track}`) return
    cancelEdit()
  }

  return (
    <section className="view settings" data-testid="settings-view">
      <header className="view__head">
        <div>
          <h1 className="view__title">{t('settings.title')}</h1>
        </div>
        <div className="tabs" role="tablist" data-testid="settings-tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'axis'}
            className={tab === 'axis' ? 'tab tab--active' : 'tab'}
            data-testid="settings-tab-axis"
            onClick={() => setTab('axis')}
          >
            {t('settings.tab_axis')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'matrix'}
            className={tab === 'matrix' ? 'tab tab--active' : 'tab'}
            data-testid="settings-tab-matrix"
            onClick={() => setTab('matrix')}
          >
            {t('settings.tab_matrix')}
          </button>
        </div>
      </header>

      {tab === 'axis' && (
        <div className="settings__panel" data-testid="settings-axis">
          <h2 className="settings__h2">{t('settings.axis_title')}</h2>
          <p className="settings__desc">{t('settings.axis_desc')}</p>
          <ol className="axis" data-testid="axis-list">
            {PHASES.map((phase) => (
              <li key={phase} className="axis__row" data-testid={`axis-${phase}`}>
                <span className="axis__phase">{t(`phases.${phase}`)}</span>
                {isReviewGate(phase) && (
                  <span className="badge badge--gate" data-testid={`axis-gate-${phase}`}>
                    {t('settings.review_gate')}
                  </span>
                )}
                <span className="axis__arrow" aria-hidden="true">→</span>
                <span className="axis__targets">
                  {TRANSITIONS[phase].map((to) => t(`phases.${to}`)).join(' / ')}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {tab === 'matrix' && (
        <div className="settings__panel" data-testid="settings-matrix">
          <h2 className="settings__h2">{t('settings.matrix_title')}</h2>
          <p className="settings__desc">{t('settings.matrix_desc')}</p>
          {configCapable ? (
            <p className="settings__note" data-testid="matrix-editable-note">
              （可编辑：改动经 token 鉴权真写入本机 templates/manifest.yaml；逗号分隔多个 skill）
            </p>
          ) : (
            <p className="settings__note" data-testid="matrix-readonly-note">{t('settings.no_config_endpoint')}</p>
          )}
          <div className="matrix__scroll">
            <table className="matrix" data-testid="matrix-table">
              <thead>
                <tr>
                  <th>{t('settings.phase')}</th>
                  {MATRIX_TRACKS.map((track) => (
                    <th key={track}>{track}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PHASES.filter((p) => p !== 'archive').map((phase) => (
                  <tr key={phase} data-testid={`matrix-row-${phase}`}>
                    <td className="matrix__phase">{t(`phases.${phase}`)}</td>
                    {MATRIX_TRACKS.map((track) => {
                      const skills = effectiveSkills(phase, track)
                      const cellKey = `${phase}.${track}`
                      const isEditing = editingKey === cellKey
                      return (
                        <td key={track} data-testid={`matrix-cell-${phase}-${track}`}>
                          {isEditing ? (
                            <div className="matrix__edit">
                              <SkillTransferModal
                                selected={skills}
                                onSave={(chosen) => requestSave(phase, track, chosen)}
                                onCancel={() => requestCancel(phase, track)}
                              />
                              {saveError && (
                                <p className="matrix__save-error" data-testid={`matrix-save-error-${phase}-${track}`}>
                                  {saveError}
                                </p>
                              )}
                            </div>
                          ) : (
                            <>
                              {skills.length === 0 ? (
                                <span className="matrix__none">—</span>
                              ) : (
                                <ul className="matrix__skills">
                                  {skills.map((s) => (
                                    <li key={s}>{s}</li>
                                  ))}
                                </ul>
                              )}
                              {configCapable && (
                                <button
                                  type="button"
                                  className="btn btn--ghost matrix__edit-btn"
                                  data-testid={`matrix-edit-${phase}-${track}`}
                                  onClick={() => {
                                    setEditingKey(cellKey)
                                    setSaveError(null)
                                  }}
                                >
                                  编辑
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
