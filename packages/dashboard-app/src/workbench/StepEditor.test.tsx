import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { StepEditor } from './StepEditor'
import type { WbStepDef } from './WorkbenchView'

// T13 fixture：带满全部可编辑面（label/gate/outputs/guards）+ 必须原样透传的兼容字段
// （inputs/skills/transitions/tasks-at-least guard）——每个 onChange 断言都用 toEqual 整对象
// 深比较，钉死「编辑一处不丢其余字段」这条 T13 验收①的核心契约。
const STEP: WbStepDef = {
  id: 'review',
  label: '人工复核',
  gate: 'review',
  skills: [{ id: 'superpowers:tdd' }, { id: 'impeccable', depends_on: ['superpowers:tdd'] }],
  inputs: [{ field: 'draft_doc', type: 'file_path' }],
  outputs: [{ field: 'review_note', type: 'string' }],
  guards: [{ type: 'tasks-at-least', n: 2 }],
  transitions: [{ event: 'approved', to: 'ship' }],
}

function renderEditor(overrides: Partial<WbStepDef> = {}, opts: { readonly?: boolean } = {}) {
  const onChange = vi.fn()
  const step = { ...STEP, ...overrides }
  render(
    <I18nProvider>
      <StepEditor step={step} readonly={opts.readonly} onChange={onChange} />
    </I18nProvider>,
  )
  return { onChange, step }
}

describe('StepEditor 基本区（名称/只读 ID/复核门）', () => {
  it('渲染阶段名称输入、只读 ID、复核门开关与人话说明', () => {
    renderEditor()
    expect(screen.getByLabelText('阶段名称')).toHaveValue('人工复核')
    expect(screen.getByTestId('wb-ed-id')).toHaveTextContent('review')
    expect(screen.getByRole('switch', { name: '复核门' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/打开后，change 会停在此阶段等人放行——在进度页亮起等你拍板/)).toBeInTheDocument()
  })

  it('改名 → onChange 收到仅 label 变化的完整 step（inputs/skills/transitions/guards 原样透传）', () => {
    const { onChange, step } = renderEditor()
    fireEvent.change(screen.getByLabelText('阶段名称'), { target: { value: '评审' } })
    expect(onChange).toHaveBeenCalledWith({ ...step, label: '评审' })
  })

  it('复核门开 → 关：gate 置 null；关 → 开：gate 置 review', () => {
    const { onChange, step } = renderEditor()
    fireEvent.click(screen.getByRole('switch', { name: '复核门' }))
    expect(onChange).toHaveBeenCalledWith({ ...step, gate: null })
  })

  it('gate 为 null 时开关 aria-checked=false，点开 → gate=review', () => {
    const { onChange, step } = renderEditor({ gate: null })
    const sw = screen.getByRole('switch', { name: '复核门' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith({ ...step, gate: 'review' })
  })
})

describe('StepEditor 产出物 chips', () => {
  it('渲染既有产出 chip；点 × 移除 → onChange 精确去掉该字段', () => {
    const { onChange, step } = renderEditor()
    expect(screen.getByText('review_note')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '移除 review_note' }))
    expect(onChange).toHaveBeenCalledWith({ ...step, outputs: [] })
  })

  it('outputs 为空时显示「无」', () => {
    renderEditor({ outputs: [] })
    expect(screen.getByText('无')).toBeInTheDocument()
  })

  it('「+ 添加」→ 就地输入，Enter 提交 → onChange 追加 { field, type: string }', () => {
    const { onChange, step } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: '+ 添加' }))
    const input = screen.getByTestId('wb-ed-output-input')
    fireEvent.change(input, { target: { value: 'sha' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith({ ...step, outputs: [...step.outputs, { field: 'sha', type: 'string' }] })
  })

  it('非法字段名（含空格）→ 行内错误、不触发 onChange', () => {
    const { onChange } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: '+ 添加' }))
    const input = screen.getByTestId('wb-ed-output-input')
    fireEvent.change(input, { target: { value: 'bad name' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText(/非法字段名（仅允许 a-z A-Z 0-9 - _）/)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('重复字段名 → 行内错误、不触发 onChange', () => {
    const { onChange } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: '+ 添加' }))
    const input = screen.getByTestId('wb-ed-output-input')
    fireEvent.change(input, { target: { value: 'review_note' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('字段已存在')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Esc 取消输入：输入框收起、不触发 onChange', () => {
    const { onChange } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: '+ 添加' }))
    const input = screen.getByTestId('wb-ed-output-input')
    fireEvent.change(input, { target: { value: 'sha' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByTestId('wb-ed-output-input')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('StepEditor 「产出非空方可推进」开关（nonempty-output guard 中文化）', () => {
  it('guards 无 nonempty-output → 关；点开 → 追加 guard 且保留既有 tasks-at-least', () => {
    const { onChange, step } = renderEditor()
    const sw = screen.getByRole('switch', { name: '产出非空方可推进' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith({
      ...step,
      guards: [{ type: 'tasks-at-least', n: 2 }, { type: 'nonempty-output' }],
    })
  })

  it('guards 已含 nonempty-output → 开；点关 → 只移除 nonempty-output，tasks-at-least 原样保留', () => {
    const { onChange, step } = renderEditor({
      guards: [{ type: 'nonempty-output' }, { type: 'tasks-at-least', n: 2 }],
    })
    const sw = screen.getByRole('switch', { name: '产出非空方可推进' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith({ ...step, guards: [{ type: 'tasks-at-least', n: 2 }] })
  })

  it('tasks-at-least guard 以中文说明呈现（不可编辑、保存原样保留）', () => {
    renderEditor()
    expect(screen.getByText(/任务清单至少完成 2 项方可推进/)).toBeInTheDocument()
  })

  it('inputs 兼容说明常驻（Inputs UI 移除但字段保留）', () => {
    renderEditor()
    expect(screen.getByText(/原 inputs 字段无运行时作用/)).toBeInTheDocument()
  })
})

describe('StepEditor 只读态（default workflow 镜像）', () => {
  it('全部控件禁用、无移除/添加入口、只读说明明示', () => {
    renderEditor({}, { readonly: true })
    expect(screen.getByTestId('wb-ed-readonly')).toHaveTextContent(/只读镜像/)
    expect(screen.getByLabelText('阶段名称')).toBeDisabled()
    expect(screen.getByRole('switch', { name: '复核门' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: '产出非空方可推进' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '移除 review_note' })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ 添加' })).toBeNull()
  })
})
