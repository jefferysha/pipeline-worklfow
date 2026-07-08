import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { StepDetailPanel, type StepDef } from './StepDetailPanel'

const STEP: StepDef = {
  id: 'spec', label: '规格', gate: 'review',
  skills: [], inputs: [{ field: 'design_doc', type: 'file_path' }], outputs: [],
  guards: [{ type: 'tasks-at-least', n: 3 }], transitions: [],
}

function renderPanel(step = STEP, onChange = vi.fn(), onClose = vi.fn()) {
  render(
    <I18nProvider>
      <StepDetailPanel step={step} onChange={onChange} onClose={onClose} />
    </I18nProvider>,
  )
  return { onChange, onClose }
}

describe('StepDetailPanel', () => {
  it('渲染现有 label/gate/guards/inputs 的值', () => {
    renderPanel()
    expect(screen.getByDisplayValue('规格')).toBeInTheDocument()
    expect(screen.getByDisplayValue('review')).toBeInTheDocument()
    expect(screen.getByText(/tasks-at-least/)).toBeInTheDocument()
    expect(screen.getByText('design_doc')).toBeInTheDocument()
  })

  it('改 label → 真触发 onChange(带新 label 的完整 StepDef)', () => {
    const { onChange } = renderPanel()
    fireEvent.change(screen.getByDisplayValue('规格'), { target: { value: '新标签' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ label: '新标签' }))
  })

  it('改 gate 下拉 → onChange 带新 gate 值', () => {
    const { onChange } = renderPanel()
    fireEvent.change(screen.getByDisplayValue('review'), { target: { value: 'confirm' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ gate: 'confirm' }))
  })

  it('移除一个 guard → onChange 带移除后的 guards 数组', () => {
    const { onChange } = renderPanel()
    // detail_guard_remove 和 detail_field_remove 两个 i18n key 文案恰好都是"移除"（en 都是
    // "Remove"——现实中常见的通用动词复用）。STEP fixture 同时有 1 个 guard + 1 个 input 字段，
    // DOM 里会渲染出两个同名"移除"按钮——用 getByRole 要求唯一匹配会因为"找到多个元素"抛错
    // （已实测确认，不是凭空假设）。改用 getAllByRole 按渲染顺序取第 0 个——组件 JSX 里 guards
    // 列表在 inputs/outputs 之前渲染，第一个"移除"按钮就是 guard 那个。
    fireEvent.click(screen.getAllByRole('button', { name: '移除' })[0]!)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ guards: [] }))
  })

  it('新增一个 output 字段 → onChange 带追加后的 outputs 数组', () => {
    const { onChange } = renderPanel()
    // inputs 和 outputs 两个字段列表的"+ 字段"按钮用的是同一个 i18n key，DOM 里会有两个同名
    // 按钮。按钮的可访问名只取自身文字内容，不包含相邻 <h4> 标题（"Outputs"不会出现在按钮的
    // accessible name 里），所以不存在一个"名字里同时含 Outputs 和 + 字段"的按钮可匹配——按
    // 渲染顺序（inputs 先、outputs 后）取索引 1 才是 outputs 的"+ 字段"按钮。
    fireEvent.click(screen.getAllByRole('button', { name: '+ 字段' })[1]!)
    fireEvent.change(screen.getByPlaceholderText('字段名'), { target: { value: 'build_sha' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ outputs: [{ field: 'build_sha', type: 'string' }] }))
  })

  // whole-feature review Finding 1：kernel parse.ts 的 parseFieldRefBlock 用
  // `field:\s*(\S+)\s*$` 匹配字段名——只要求非空白，不校验字符集。含空格的字段名（如这里的
  // 'design doc'）此前能被这个对话框直接接受、写进 step.outputs，POST 保存成功，但下次任何人
  // GET 这个 workflow 时 parseWorkflow 会在这一行匹配失败、最终整体抛错（同 event 名那条
  // 回归——见 WorkflowCanvas.test.tsx"Finding 1 闭环回归"describe 块的往返证据，字段名会走
  // 同一条 parseStep 主循环 break→顶层 '- id:' 前缀不匹配→throw 的链路）。字符集校验同
  // WorkflowCanvas.tsx confirmAddStep 已有的 step/skill id 校验一致（`^[a-zA-Z0-9_-]+$`）。
  it('字段名含空格 → 拒绝新增，不触发 onChange', () => {
    const { onChange } = renderPanel()
    fireEvent.click(screen.getAllByRole('button', { name: '+ 字段' })[1]!) // outputs
    fireEvent.change(screen.getByPlaceholderText('字段名'), { target: { value: 'design doc' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(screen.getByText(/非法字段名/)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    // 对话框仍在（没有被当成提交成功而关闭）——输入框依然可见，且仍是刚才输入的值。
    expect(screen.getByPlaceholderText('字段名')).toHaveValue('design doc')
  })

  it('点关闭 → 调用 onClose', () => {
    const { onClose } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalled()
  })
})
