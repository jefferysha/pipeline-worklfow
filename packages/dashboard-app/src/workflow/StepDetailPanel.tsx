import { useState } from 'react'
import { useT } from '../i18n'

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

  function removeGuard(index: number): void {
    onChange({ ...step, guards: step.guards.filter((_, i) => i !== index) })
  }

  function removeField(kind: 'inputs' | 'outputs', index: number): void {
    onChange({ ...step, [kind]: step[kind].filter((_, i) => i !== index) })
  }

  function confirmAddField(): void {
    if (!addingField || !fieldName) return
    const ref: FieldRef = { field: fieldName, type: 'string' }
    onChange({ ...step, [addingField]: [...step[addingField], ref] })
    setAddingField(null)
    setFieldName('')
  }

  function renderFieldList(kind: 'inputs' | 'outputs', title: string): JSX.Element {
    return (
      <div>
        <h4>{title}</h4>
        <ul>
          {step[kind].map((f, i) => (
            <li key={f.field}>
              {/* 字段名单独包一层元素——testing-library 的 getByText 精确匹配只看元素自身直接
                  子 Text 节点的拼接结果，不看后代元素；字段名和" (type)"字面量若同处一个 <li>
                  的直接子节点，getByText('design_doc') 会因为拼接成"design_doc (file_path)"
                  而找不到精确匹配（已实测确认，不是纸面推演）。 */}
              <span>{f.field}</span> ({f.type})
              <button onClick={() => removeField(kind, i)}>{t('workflow_editor.detail_field_remove')}</button>
            </li>
          ))}
        </ul>
        <button onClick={() => { setAddingField(kind); setFieldName('') }}>{t('workflow_editor.detail_field_add')}</button>
      </div>
    )
  }

  return (
    <div className="step-detail-panel" role="complementary">
      <label>
        {t('workflow_editor.detail_label')}
        <input value={step.label} onChange={(e) => onChange({ ...step, label: e.target.value })} />
      </label>
      <label>
        {t('workflow_editor.detail_gate')}
        <select value={step.gate ?? ''} onChange={(e) => onChange({ ...step, gate: (e.target.value || null) as StepDef['gate'] })}>
          <option value="">{t('workflow_editor.detail_gate_none')}</option>
          <option value="review">review</option>
          <option value="confirm">confirm</option>
        </select>
      </label>
      <div>
        <h4>{t('workflow_editor.detail_guards')}</h4>
        <ul>
          {step.guards.map((g, i) => (
            <li key={i}>
              {g.type}{g.type === 'tasks-at-least' ? ` (n=${g.n})` : ''}
              <button onClick={() => removeGuard(i)}>{t('workflow_editor.detail_guard_remove')}</button>
            </li>
          ))}
        </ul>
      </div>
      {renderFieldList('inputs', t('workflow_editor.detail_inputs'))}
      {renderFieldList('outputs', t('workflow_editor.detail_outputs'))}
      {addingField && (
        <div role="dialog">
          <input placeholder={t('workflow_editor.detail_field_name_prompt')} value={fieldName} onChange={(e) => setFieldName(e.target.value)} />
          <button onClick={confirmAddField}>{t('workflow_editor.confirm')}</button>
          <button onClick={() => setAddingField(null)}>{t('workflow_editor.cancel')}</button>
        </div>
      )}
      <button onClick={onClose}>{t('workflow_editor.detail_close')}</button>
    </div>
  )
}
