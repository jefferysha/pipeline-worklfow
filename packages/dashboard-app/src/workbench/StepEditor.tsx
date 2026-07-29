import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useT } from '../i18n'
import type { WbStepDef } from './WorkbenchView'

/**
 * StepEditor（T13，计划 2026-07-11-v5-interaction-rebuild）—— 工作台阶段编辑卡的表单本体，
 * 挂在 WorkbenchView 的编辑卡内（T12 预留挂载点）。交互真相源
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
 * IA 精简（2026-07-14）：技能链 <SkillChain> 与 Hook 会话时序线不再平铺在本卡内——两者都是
 * 低频/解释性内容，已上移至 WorkbenchView 阶段页签的「▸ 高级设置」折叠区渲染（SkillChain 由
 * WorkbenchView 直接以 step/workflow/readonly/onChange 消费，语义与数据面全不变）。本卡收敛为
 * 「阶段核心」：基本（阶段名/复核门）+ 产出物（产出 chips/产出非空守卫/兼容说明）。
 *
 * v10b 全量迁移（2026-07-14）：手写全局 CSS 类（wb- 前缀 + .switch）→ tailwind v4 原子类。
 * 开关状态由 aria-checked 承载（tailwind aria-checked: 变体挂样式）；错误/禁用走原生
 * disabled 与行内条件渲染；颜色只走 token 语义类，零硬编码色值；DOM 结构与行为契约不变。
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

// ── tailwind 原子类合集（原 styles.ts .wb-*/.switch 区块的等值搬运；颜色全走 token 语义类）──
const NOTE = 'text-xs leading-[1.55] text-text-3'
const FLABEL = 'mb-[5px] block text-xs font-semibold text-text-3'
const INPUT =
  'h-[34px] w-full rounded-[9px] border border-border bg-card px-[11px] text-[13.5px] text-text transition-[border-color,box-shadow] hover:border-border-2 focus:border-(--accent) focus:ring-[3px] focus:ring-(--ring-blue) focus:outline-none disabled:cursor-not-allowed disabled:bg-fill disabled:text-text-3'
// 开关（demo .switch 同款，34×20 胶囊 + 位移圆钮；开=accent，状态由 aria-checked 承载）
const SWITCH =
  "relative h-5 w-[34px] flex-none cursor-pointer rounded-full border border-border-2 bg-fill-2 transition-colors after:absolute after:top-0.5 after:left-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-card after:shadow-md after:transition-transform after:content-[''] aria-checked:border-(--accent) aria-checked:bg-(--accent) aria-checked:after:translate-x-3.5 disabled:cursor-not-allowed disabled:opacity-55"
const SEC_H = 'mb-2.5 flex items-center gap-1.5 text-[13px] font-bold'
const SWITCHROW = 'flex items-center gap-[9px]'

export function StepEditor({ step, readonly = false, onChange }: StepEditorProps): JSX.Element {
  const { t, lang } = useT()
  // 「+ 添加」就地输入态（demo commitChipInput 同款：Enter 提交 / Esc 取消 / 失焦有值即提交）。
  // 组件在 WorkbenchView 侧按 step.id 加 key 挂载——切阶段时输入态随卸载自然复位，不需手动清。
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  useEffect(() => setAddError(null), [lang])

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
    <div data-testid="wb-step-editor">
      {readonly && (
        <p className={`${NOTE} mt-2.5 rounded-md bg-fill px-[11px] py-2`} data-testid="wb-ed-readonly">
          {t('workbench.ed_readonly_note')}
        </p>
      )}

      <div className="pt-3.5 pb-1">
        <div className={SEC_H}>{t('workbench.ed_sec_basic')}</div>
        <div className="grid grid-cols-[230px_170px_minmax(0,1fr)] gap-3.5 mobile:grid-cols-1">
          <div>
            <label className={FLABEL} htmlFor={`wb-ed-label-${step.id}`}>{t('workbench.ed_label')}</label>
            <input
              className={INPUT}
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
            <span className={FLABEL}>{t('workbench.ed_id')}</span>
            <div
              className="flex h-[34px] w-full items-center rounded-[9px] border border-border bg-fill px-[11px] font-mono text-[13.5px] text-text-2"
              data-testid="wb-ed-id"
            >
              {step.id}
            </div>
          </div>
          <div>
            <span className={FLABEL}>{t('workbench.ed_gate')}</span>
            <div className={SWITCHROW}>
              <button
                type="button"
                className={SWITCH}
                role="switch"
                aria-checked={step.gate !== null}
                aria-label={t('workbench.ed_gate')}
                disabled={readonly}
                data-testid="wb-ed-gate-sw"
                onClick={toggleGate}
              />
              <span className={NOTE}>{t('workbench.ed_gate_note')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-border pt-3.5 pb-1">
        <div className={SEC_H}>
          {t('workbench.ed_sec_outputs')}
          <span className="text-xs font-normal text-text-3">{t('workbench.ed_outputs_hint')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-testid="wb-ed-outputs">
          {step.outputs.length === 0 && !adding && (
            <span className="text-[12.5px] text-text-3" role="status" aria-live="polite">{t('workbench.ed_outputs_empty')}</span>
          )}
          {step.outputs.map((o) => (
            <span
              key={o.field}
              className="inline-flex h-6 items-center gap-1 rounded-[7px] border border-border bg-fill px-[9px] font-mono text-xs text-text-2"
              title={`${o.field} · ${o.type}`}
            >
              {o.field}
              {!readonly && (
                <button
                  type="button"
                  className="-mr-[3px] inline-grid h-4 w-4 cursor-pointer place-items-center rounded-[5px] p-0 text-[13px] leading-none text-text-3 transition-colors hover:bg-red-t hover:text-red-d"
                  aria-label={t('workbench.ed_output_remove', { field: o.field })}
                  onClick={() => removeOutput(o.field)}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
          {!readonly && (adding ? (
            <input
              className="h-[26px] w-[180px] rounded-[9px] border border-border bg-card px-[11px] font-mono text-xs text-text transition-[border-color,box-shadow] hover:border-border-2 focus:border-(--accent) focus:ring-[3px] focus:ring-(--ring-blue) focus:outline-none"
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
            <button
              type="button"
              className="h-6 cursor-pointer rounded-[7px] border border-dashed border-border-2 px-[9px] text-xs font-semibold text-text-3 transition-colors hover:bg-fill hover:text-text-2"
              onClick={() => { setAdding(true); setDraft(''); setAddError(null) }}
            >
              {t('workbench.ed_output_add')}
            </button>
          ))}
        </div>
        {addError && <p className="mt-1.5 p-5 text-[13px] text-red" role="alert">{addError}</p>}
        <div className={`${SWITCHROW} mt-2.5`}>
          <button
            type="button"
            className={SWITCH}
            role="switch"
            aria-checked={hasNonempty}
            aria-label={t('workbench.ed_nonempty')}
            disabled={readonly}
            data-testid="wb-ed-nonempty"
            onClick={toggleNonempty}
          />
          <span className="text-[13px] font-semibold">{t('workbench.ed_nonempty')}</span>
        </div>
        <p className={`${NOTE} mt-2.5`}>{t('workbench.ed_nonempty_note')}</p>
        {tasksGuard && tasksGuard.type === 'tasks-at-least' && (
          <p className={NOTE} data-testid="wb-ed-tasks-guard">{t('workbench.ed_tasks_guard_note', { n: tasksGuard.n })}</p>
        )}
        <p className={`${NOTE} mt-2.5 border-t border-dashed border-border pt-2.5`}>{t('workbench.ed_inputs_note')}</p>
      </div>
    </div>
  )
}
