import { useState } from 'react'
import { useT } from '../i18n'
import type { WbStepDef } from './WorkbenchView'

/**
 * StepEditor（T13，计划 2026-07-11-v5-interaction-rebuild）—— 工作台阶段编辑卡的表单本体，
 * 挂在 WorkbenchView 的 .wb-editor 卡内（T12 预留挂载点）。交互真相源
 * design-demos/v5-progress-workbench.html 的 wb- 编辑区块（data-ed-* 段）。
 *
 * 受控组件：不持有 step 草稿——每次编辑把完整的新 WbStepDef 通过 onChange 交回
 * WorkbenchView（唯一的 def 草稿真相源，dirty/保存/切换守卫都在那边）。除本卡触碰的
 * label/gate/outputs/guards 四个面之外，其余字段（skills/transitions/inputs）一律展开
 * 透传（决议：Inputs UI 移除但 schema/serialize 保留兼容，保存不丢字段）。
 *
 * guards 语义（中文化口径）：
 *   · 「产出非空方可推进」开关 = guards 里是否存在 { type: 'nonempty-output' }；
 *     开=追加、关=只过滤掉这一种，其余 guard（tasks-at-least）原样保留；
 *   · tasks-at-least 若存在，以中文说明呈现（本编辑器不提供编辑，保存原样带回）。
 *
 * gate 开关语义：开=review、关=null。step.gate === 'confirm' 时开关同样显示为开
 * （badge 由 WorkbenchView 卡头区分「确认门/复核门」）；确认门被关掉再打开会落为
 * review——运行时语境里 confirm 门只出现在 default（只读态），自定义 workflow 的编辑
 * 语义按 demo 拍板为 review 单档。
 *
 * T14 挂载点：技能链（SkillChain，依赖链可视化 + 添加面板）在「基本」与「产出物」两区
 * 之间插入；T15 挂载点：Hook 会话时序线跟在技能区之后。两区都吃本组件同款
 * readonly/onChange 契约。
 */
export interface StepEditorProps {
  step: WbStepDef
  /** default workflow 只读镜像：全部控件禁用 + 顶部只读说明（server 端 400 已挡，此处前端预示）。 */
  readonly?: boolean
  onChange: (updated: WbStepDef) => void
}

// 同 kernel validate.ts 的 IDENT_RE / server 路由层 name 校验一条规则（G16：serialize 原样
// 写出、parse 用 (\S+) 读回，字符集越界=「保存成功、下次打不开」，客户端先挡一道）。
const FIELD_RE = /^[a-zA-Z0-9_-]+$/

export function StepEditor({ step, readonly = false, onChange }: StepEditorProps): JSX.Element {
  const { t } = useT()
  // 「+ 添加」就地输入态（demo commitChipInput 同款：Enter 提交 / Esc 取消 / 失焦有值即提交）。
  // 组件在 WorkbenchView 侧按 step.id 加 key 挂载——切阶段时输入态随卸载自然复位，不需手动清。
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const hasNonempty = step.guards.some((g) => g.type === 'nonempty-output')
  const tasksGuard = step.guards.find((g) => g.type === 'tasks-at-least')

  function toggleGate(): void {
    onChange({ ...step, gate: step.gate === null ? 'review' : null })
  }

  function toggleNonempty(): void {
    onChange({
      ...step,
      guards: hasNonempty
        ? step.guards.filter((g) => g.type !== 'nonempty-output')
        : [...step.guards, { type: 'nonempty-output' }],
    })
  }

  function removeOutput(field: string): void {
    onChange({ ...step, outputs: step.outputs.filter((o) => o.field !== field) })
  }

  function commitAdd(cancel: boolean): void {
    if (cancel) {
      setAdding(false)
      setDraft('')
      setAddError(null)
      return
    }
    const v = draft.trim()
    if (v === '') {
      // 空值提交视同取消（demo 同款：失焦无值即收起）
      setAdding(false)
      setAddError(null)
      return
    }
    if (!FIELD_RE.test(v)) {
      setAddError(t('workbench.ed_output_invalid'))
      return
    }
    if (step.outputs.some((o) => o.field === v)) {
      setAddError(t('workbench.ed_output_dup'))
      return
    }
    // 新产出物缺省 string 类型——kernel FieldRef 三型里最通用的一档；file_path/boolean 的
    // 类型编辑本轮不出 UI（demo 未定稿），serialize 兼容不受影响。
    onChange({ ...step, outputs: [...step.outputs, { field: v, type: 'string' }] })
    setAdding(false)
    setDraft('')
    setAddError(null)
  }

  return (
    <div className="wb-ed-body" data-testid="wb-step-editor">
      {readonly && (
        <p className="wb-note wb-ed-ro" data-testid="wb-ed-readonly">{t('workbench.ed_readonly_note')}</p>
      )}

      <div className="wb-ed-sec">
        <div className="wb-ed-sec-h">{t('workbench.ed_sec_basic')}</div>
        <div className="wb-basic">
          <div>
            <label className="wb-flabel" htmlFor={`wb-ed-label-${step.id}`}>{t('workbench.ed_label')}</label>
            <input
              className="wb-input"
              id={`wb-ed-label-${step.id}`}
              value={step.label}
              disabled={readonly}
              onChange={(e) => onChange({ ...step, label: e.target.value })}
              onKeyDown={(e) => {
                // Enter 守卫：单行输入回车不触发任何提交/切换（保存只走工具条保存钮）
                if (e.key === 'Enter') e.preventDefault()
              }}
            />
          </div>
          <div>
            <span className="wb-flabel">{t('workbench.ed_id')}</span>
            <div className="wb-input wb-input--ro" data-testid="wb-ed-id">{step.id}</div>
          </div>
          <div>
            <span className="wb-flabel">{t('workbench.ed_gate')}</span>
            <div className="wb-switchrow">
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={step.gate !== null}
                aria-label={t('workbench.ed_gate')}
                disabled={readonly}
                data-testid="wb-ed-gate-sw"
                onClick={toggleGate}
              />
              <span className="wb-note">{t('workbench.ed_gate_note')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* T14 挂载点：技能链区（SkillChain：依赖链可视化 + 移除 × + 添加面板）插在这里。 */}
      {/* T15 挂载点：Hook 会话时序线区（四时机人话卡 + 开关）跟在技能区之后。 */}

      <div className="wb-ed-sec">
        <div className="wb-ed-sec-h">
          {t('workbench.ed_sec_outputs')}
          <span className="hint">{t('workbench.ed_outputs_hint')}</span>
        </div>
        <div className="wb-chips" data-testid="wb-ed-outputs">
          {step.outputs.length === 0 && !adding && <span className="wb-empty">{t('workbench.ed_outputs_empty')}</span>}
          {step.outputs.map((o) => (
            <span key={o.field} className="wb-chip" title={`${o.field} · ${o.type}`}>
              {o.field}
              {!readonly && (
                <button
                  type="button"
                  className="wb-x"
                  aria-label={t('workbench.ed_output_remove', { field: o.field })}
                  onClick={() => removeOutput(o.field)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {!readonly && (adding ? (
            <input
              className="wb-input wb-chip-in"
              data-testid="wb-ed-output-input"
              placeholder={t('workbench.ed_output_placeholder')}
              value={draft}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- 用户刚点了「+ 添加」，焦点进输入框是这次点击的直接延续
              autoFocus
              onChange={(e) => {
                setDraft(e.target.value)
                setAddError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitAdd(false)
                } else if (e.key === 'Escape') {
                  commitAdd(true)
                }
              }}
              onBlur={() => commitAdd(draft.trim() === '')}
            />
          ) : (
            <button type="button" className="wb-addchip" onClick={() => { setAdding(true); setDraft(''); setAddError(null) }}>
              {t('workbench.ed_output_add')}
            </button>
          ))}
        </div>
        {addError && <p className="view__note view__note--error wb-ed-adderr">{addError}</p>}
        <div className="wb-switchrow wb-sec-note">
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={hasNonempty}
            aria-label={t('workbench.ed_nonempty')}
            disabled={readonly}
            data-testid="wb-ed-nonempty"
            onClick={toggleNonempty}
          />
          <span className="wb-swlabel">{t('workbench.ed_nonempty')}</span>
        </div>
        <p className="wb-note wb-sec-note">{t('workbench.ed_nonempty_note')}</p>
        {tasksGuard && tasksGuard.type === 'tasks-at-least' && (
          <p className="wb-note" data-testid="wb-ed-tasks-guard">{t('workbench.ed_tasks_guard_note', { n: tasksGuard.n })}</p>
        )}
        <p className="wb-note wb-tail-note">{t('workbench.ed_inputs_note')}</p>
      </div>
    </div>
  )
}
