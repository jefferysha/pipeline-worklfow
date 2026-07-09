import { useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useT } from '../i18n'
import { revealDialog, slideInPanel } from './motion'

gsap.registerPlugin(useGSAP)

/**
 * StepDetailPanel（GOAL E8 workflow 编辑器画布 Task 8）—— 单个 step 的 label/gate/guards/
 * inputs/outputs 侧栏表单。纯受控组件：不自己 fetch/save，`onChange(next)` 由调用方
 * （WorkflowCanvas 的 `WorkflowCanvasInner`）接管，直接落进它自己的 `wf` state（同 Task 6/7
 * 已有的 setWf 模式）。
 *
 * 这五个本地类型声明是本文件的单一真相源——WorkflowCanvas.tsx 不再自己声明一份，改成从这里
 * import 回去（Task 6 起草时两处各自声明过一份逐字相同的形状，Task 8 收拢成一份）。形状逐字
 * 对齐 kernel WorkflowDef/StepDef 的 JSON 形状（跨 HTTP 边界，不 import kernel 类型只为了编译期
 * 形状——同 WorkflowCanvas.tsx 文件头注释、LoopsPanel.tsx/AfkWorkbench.tsx 的既有惯例一致）。
 *
 * 范围明确收窄（设计文档 §2.3 "guards 是类型下拉+参数输入的简单列表编辑器"里，本任务只做其中
 * "移除"一半）：guards 只支持移除，不支持新增——Step 2 测试没有覆盖"新增 guard"这个场景，
 * 新增一个"选类型 + 条件渲染 n 参数"的迷你表单不在本任务范围内，留给后续任务（i18n 已经预留了
 * `detail_guard_add` 这个 key，当前未被任何 JSX 使用）。
 */
export interface FieldRef { field: string; type: 'string' | 'file_path' | 'boolean' }
export interface SkillRef { id: string; depends_on?: string[] }
export type GuardConfig = { type: 'tasks-at-least'; n: number } | { type: 'nonempty-output' }
export interface StepTransition { event: string; to: string }
export interface StepDef {
  id: string; label: string; gate: 'review' | 'confirm' | null
  skills: SkillRef[]; inputs: FieldRef[]; outputs: FieldRef[]
  guards: GuardConfig[]; transitions: StepTransition[]
}

export interface StepDetailPanelProps {
  step: StepDef
  onChange: (next: StepDef) => void
  onClose: () => void
}

export function StepDetailPanel({ step, onChange, onClose }: StepDetailPanelProps): JSX.Element {
  const { t } = useT()
  const [addingField, setAddingField] = useState<'inputs' | 'outputs' | null>(null)
  const [fieldName, setFieldName] = useState('')
  // whole-feature review Finding 1：字段名同 event 名一样最终写入 kernel parse.ts 用 `\S+`
  // 匹配的单行 YAML（`- field: <name>`），含空白字符会让该行匹配失败、最终在 parseWorkflow
  // 顶层抛出解析错误（同 WorkflowCanvas.tsx confirmConnect 的等价场景，见其注释）。字符集同
  // WorkflowCanvas.tsx confirmAddStep 已有的 step/skill id 校验一致（`^[a-zA-Z0-9_-]+$`）。
  const [fieldNameError, setFieldNameError] = useState<string | null>(null)
  // guard 新增表单（补齐历史缺口：Step 2 时代只做了移除；i18n detail_guard_add 预留至今终于接线）
  const [guardType, setGuardType] = useState<GuardConfig['type']>('tasks-at-least')
  const [guardN, setGuardN] = useState('1')
  const [guardNError, setGuardNError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const addFieldDialogRef = useRef<HTMLDivElement>(null)

  // 面板每次挂载（选中一个 step）滑入一次——dependencies: [] 只在挂载时播放一次；若用户
  // 不关闭面板直接点另一个 step 节点，父组件只换 `step` prop、面板不会被卸载重挂，因此不会
  // 重放滑入（内容瞬时更新，避免"来回切换 step 时面板反复抖动"这种装饰性噪音）。
  useGSAP(() => {
    slideInPanel(rootRef.current)
  }, { scope: rootRef, dependencies: [] })

  useGSAP(() => {
    if (addingField && addFieldDialogRef.current) {
      revealDialog(addFieldDialogRef.current, addFieldDialogRef.current.querySelector('.dialog'))
    }
  }, { scope: rootRef, dependencies: [addingField] })

  function removeGuard(index: number): void {
    onChange({ ...step, guards: step.guards.filter((_, i) => i !== index) })
  }

  function confirmAddGuard(): void {
    if (guardType === 'tasks-at-least') {
      const n = Number(guardN)
      if (!Number.isInteger(n) || n < 1) {
        setGuardNError(t('workflow_editor.invalid_guard_n'))
        return
      }
      setGuardNError(null)
      onChange({ ...step, guards: [...step.guards, { type: 'tasks-at-least', n }] })
      setGuardN('1')
      return
    }
    onChange({ ...step, guards: [...step.guards, { type: 'nonempty-output' }] })
  }

  function removeField(kind: 'inputs' | 'outputs', index: number): void {
    onChange({ ...step, [kind]: step[kind].filter((_, i) => i !== index) })
  }

  function confirmAddField(): void {
    if (!addingField || !fieldName) return
    if (!/^[a-zA-Z0-9_-]+$/.test(fieldName)) {
      setFieldNameError(t('workflow_editor.invalid_field_name'))
      return
    }
    const ref: FieldRef = { field: fieldName, type: 'string' }
    onChange({ ...step, [addingField]: [...step[addingField], ref] })
    setAddingField(null)
    setFieldName('')
    setFieldNameError(null)
  }

  function renderFieldList(kind: 'inputs' | 'outputs', title: string): JSX.Element {
    return (
      <div className="step-detail-panel__section">
        <h4>{title}</h4>
        <ul className="step-detail-panel__list">
          {step[kind].map((f, i) => (
            <li key={f.field} className="step-detail-panel__row">
              {/* 字段名单独包一层元素——testing-library 的 getByText 精确匹配只看元素自身直接
                  子 Text 节点的拼接结果，不看后代元素；字段名和" (type)"字面量若同处一个 <li>
                  的直接子节点，getByText('design_doc') 会因为拼接成"design_doc (file_path)"
                  而找不到精确匹配（已实测确认，不是纸面推演）。 */}
              <span><span className="step-detail-panel__row-name">{f.field}</span> ({f.type})</span>
              <button className="btn--icon" onClick={() => removeField(kind, i)}>{t('workflow_editor.detail_field_remove')}</button>
            </li>
          ))}
        </ul>
        <button className="btn btn--ghost" onClick={() => { setAddingField(kind); setFieldName(''); setFieldNameError(null) }}>{t('workflow_editor.detail_field_add')}</button>
      </div>
    )
  }

  return (
    <div className="step-detail-panel" role="complementary" ref={rootRef}>
      <div className="step-detail-panel__head">
        <h3 className="step-detail-panel__title">{step.label ? `${step.id} (${step.label})` : step.id}</h3>
        <button className="btn--icon" onClick={onClose}>{t('workflow_editor.detail_close')}</button>
      </div>

      <label className="field">
        {t('workflow_editor.detail_label')}
        <input className="input" value={step.label} onChange={(e) => onChange({ ...step, label: e.target.value })} />
      </label>
      <label className="field">
        {t('workflow_editor.detail_gate')}
        <select className="select" value={step.gate ?? ''} onChange={(e) => onChange({ ...step, gate: (e.target.value || null) as StepDef['gate'] })}>
          <option value="">{t('workflow_editor.detail_gate_none')}</option>
          <option value="review">review</option>
          <option value="confirm">confirm</option>
        </select>
      </label>

      <div className="step-detail-panel__section">
        <h4>{t('workflow_editor.detail_guards')}</h4>
        <ul className="step-detail-panel__list">
          {step.guards.map((g, i) => (
            <li key={i} className="step-detail-panel__row">
              <span>{g.type}{g.type === 'tasks-at-least' ? ` (n=${g.n})` : ''}</span>
              <button className="btn--icon" onClick={() => removeGuard(i)}>{t('workflow_editor.detail_guard_remove')}</button>
            </li>
          ))}
        </ul>
        <div className="gd-form">
          <select
            className="select"
            data-testid="guard-type"
            aria-label={t('workflow_editor.detail_guards')}
            value={guardType}
            onChange={(e) => {
              setGuardType(e.target.value as GuardConfig['type'])
              setGuardNError(null)
            }}
          >
            <option value="tasks-at-least">tasks-at-least</option>
            <option value="nonempty-output">nonempty-output</option>
          </select>
          {guardType === 'tasks-at-least' && (
            <input
              className={guardNError ? 'input input--error gd-n' : 'input gd-n'}
              data-testid="guard-n"
              type="number"
              min={1}
              aria-label="n"
              value={guardN}
              onChange={(e) => {
                setGuardN(e.target.value)
                setGuardNError(null)
              }}
            />
          )}
          <button type="button" className="btn" data-testid="guard-add" onClick={confirmAddGuard}>
            {t('workflow_editor.detail_guard_add')}
          </button>
        </div>
        {guardNError && <p className="field__error" data-testid="guard-n-error">{guardNError}</p>}
      </div>

      {renderFieldList('inputs', t('workflow_editor.detail_inputs'))}
      {renderFieldList('outputs', t('workflow_editor.detail_outputs'))}

      {addingField && (
        <div className="dialog__backdrop" ref={addFieldDialogRef}>
          <div role="dialog" className="dialog">
            <h3 className="dialog__title">{t('workflow_editor.detail_field_add')}</h3>
            <input
              className="input"
              placeholder={t('workflow_editor.detail_field_name_prompt')}
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
            />
            {fieldNameError && <p className="view__note view__note--error">{fieldNameError}</p>}
            <div className="dialog__actions">
              <button className="btn btn--ghost" onClick={() => setAddingField(null)}>{t('workflow_editor.cancel')}</button>
              <button className="btn" onClick={confirmAddField}>{t('workflow_editor.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
