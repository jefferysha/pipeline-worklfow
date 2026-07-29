import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { WbStepDef } from './WorkbenchView'
import { StepPolicyEditor } from './StepPolicyEditor'

afterEach(() => {
  window.localStorage.removeItem('tenon-dashboard-lang')
})

const STEP: WbStepDef = {
  id: 'verify', label: '验证', gate: 'review', prompt: 'Run API checks.',
  skills: [],
  inputs: [{ field: 'build_sha', type: 'string' }],
  outputs: [{ field: 'verification_report', type: 'file_path' }],
  artifacts: [{ field: 'verification_report', type: 'file_path', producerPolicy: 'effective-step-skills' }],
  guards: [{ type: 'field-nonempty', field: 'build_sha' }],
  transitions: [{ event: 'verify-pass', to: 'ship', guards: [], actions: [{ type: 'mark-verification-passed' }] }],
}

function setup(): ReturnType<typeof vi.fn> {
  const onChange = vi.fn()
  render(<I18nProvider><StepPolicyEditor step={STEP} allStepIds={['build', 'verify', 'ship']} onChange={onChange} /></I18nProvider>)
  return onChange
}

describe('StepPolicyEditor · 完整 Workflow Step IR', () => {
  it('English locale covers the full policy editor, including collapsed sections', () => {
    window.localStorage.setItem('tenon-dashboard-lang', 'en')
    setup()
    const editor = screen.getByTestId('step-policy-editor')
    for (const label of [
      'Phase settings',
      'Required inputs',
      'Phase outputs',
      'Persisted artifacts',
      'Event',
      'Edge guards',
      'Actions',
    ]) {
      expect(editor).toHaveTextContent(label)
    }
    expect(editor).not.toHaveTextContent('阶段设置')
    expect(editor).not.toHaveTextContent('必需输入')
    expect(editor).not.toHaveTextContent('持久化产物')
  })

  it('标题说明设置用于自动运行，不重复展示内部 step id 或“高级编排”', () => {
    setup()
    const editor = screen.getByTestId('step-policy-editor')
    expect(editor).toHaveTextContent('阶段设置')
    expect(editor).toHaveTextContent('自动运行进入本阶段时生效')
    expect(editor).not.toHaveTextContent('高级编排')
    expect(within(editor).queryByText('verify', { selector: 'span' })).toBeNull()
  })
  it('编辑 prompt 时返回完整 step，既有 contracts/guards/transitions 不丢', () => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText('Codex 阶段指令'), { target: { value: 'Run API and browser E2E.' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...STEP, prompt: 'Run API and browser E2E.' })
  })

  it('可新增 8 变体中的 typed guard，并保留既有 guard', () => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText('添加阶段守卫'), { target: { value: 'field-equals' } })
    expect(onChange).toHaveBeenLastCalledWith({
      ...STEP,
      guards: [...STEP.guards, { type: 'field-equals', field: 'branch_status', value: 'pending' }],
    })
  })

  it('transition 的 event/target、edge guards 与 4 类 action 都是可达写面', () => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText('verify-pass 目标阶段'), { target: { value: 'build' } })
    expect(onChange).toHaveBeenLastCalledWith({
      ...STEP,
      transitions: [{ ...STEP.transitions[0]!, to: 'build' }],
    })
    fireEvent.change(screen.getByLabelText('verify-pass 添加动作'), { target: { value: 'archive-run' } })
    expect(onChange).toHaveBeenLastCalledWith({
      ...STEP,
      transitions: [{ ...STEP.transitions[0]!, actions: [{ type: 'mark-verification-passed' }, { type: 'archive-run' }] }],
    })
  })

  it('inputs/outputs 类型与 artifact producer policy 可编辑', () => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText('verification_report 字段类型'), { target: { value: 'string' } })
    expect(onChange).toHaveBeenLastCalledWith({
      ...STEP,
      outputs: [{ field: 'verification_report', type: 'string' }],
      artifacts: [],
    })
  })
})
