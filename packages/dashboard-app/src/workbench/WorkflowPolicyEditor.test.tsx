import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { WbWorkflowDef } from './workbenchDefinition'
import { WorkflowPolicyEditor } from './WorkflowPolicyEditor'

const DEFINITION: WbWorkflowDef = {
  name: 'release-train',
  decomposition: {
    version: 'v1',
    mode: 'auto-safe',
    target: 'child-pipelines',
    strategy: 'depth-first',
    max_items: 7,
    max_depth: 3,
    auto_when: ['context-budget-risk'],
    ask_when: ['hard-boundary'],
  },
  interaction: { version: 'v1', mode: 'interactive' },
  reviewBudget: { version: 'v1', max_attempts: 3 },
  steps: [],
}

function Harness(props: {
  readonly?: boolean
  loading?: boolean
  error?: string | null
  saving?: boolean
  success?: boolean
  empty?: boolean
  onSave?: () => void
  onCancel?: () => void
  onRetry?: () => void
}): JSX.Element {
  const [definition, setDefinition] = useState<WbWorkflowDef | null>(props.empty ? null : DEFINITION)
  return (
    <I18nProvider>
      <WorkflowPolicyEditor
        definition={definition}
        readonly={props.readonly ?? false}
        loading={props.loading ?? false}
        error={props.error ?? null}
        dirty={!props.success}
        saving={props.saving ?? false}
        saveStatus={props.success ? 'success' : 'idle'}
        onChange={setDefinition}
        onSave={props.onSave ?? vi.fn()}
        onCancel={props.onCancel ?? vi.fn()}
        onRetry={props.onRetry ?? vi.fn()}
      />
    </I18nProvider>
  )
}

describe('WorkflowPolicyEditor', () => {
  it('keeps decomposition and interaction independent and preserves subordinate values when mode is off', () => {
    render(<Harness />)

    fireEvent.change(screen.getByLabelText('拆分模式'), { target: { value: 'off' } })
    expect(screen.getByLabelText('拆分目标')).toHaveValue('child-pipelines')
    expect(screen.getByLabelText('拆分策略')).toHaveValue('depth-first')
    expect(screen.getByLabelText('最大项目数')).toHaveValue(7)
    expect(screen.getByLabelText('互动模式')).toHaveValue('interactive')

    fireEvent.change(screen.getByLabelText('互动模式'), { target: { value: 'afk' } })
    expect(screen.getByLabelText('拆分模式')).toHaveValue('off')
    expect(screen.getByLabelText('拆分目标')).toHaveValue('child-pipelines')
    expect(screen.getByLabelText('上下文预算风险')).toBeChecked()
    expect(screen.getByLabelText('硬边界')).toBeChecked()
    expect(screen.getByLabelText('最大 Review 次数')).toHaveValue(3)

    fireEvent.change(screen.getByLabelText('最大 Review 次数'), { target: { value: '4' } })
    expect(screen.getByLabelText('最大 Review 次数')).toHaveValue(4)
  })

  it('supports condition toggles, bounded limits, Enter save, and Escape cancel with focus recovery', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render(<Harness onSave={onSave} onCancel={onCancel} />)

    const mode = screen.getByLabelText('拆分模式')
    mode.focus()
    fireEvent.click(screen.getByLabelText('跨组件边界'))
    expect(screen.getByLabelText('跨组件边界')).toBeChecked()
    expect(screen.getByLabelText('最大项目数')).toHaveAttribute('min', '1')
    expect(screen.getByLabelText('最大项目数')).toHaveAttribute('max', '32')
    expect(screen.getByLabelText('最大深度')).toHaveAttribute('min', '0')
    expect(screen.getByLabelText('最大深度')).toHaveAttribute('max', '4')
    expect(screen.getByLabelText('最大 Review 次数')).toHaveAttribute('min', '1')
    expect(screen.getByLabelText('最大 Review 次数')).toHaveAttribute('max', '20')

    fireEvent.keyDown(mode, { key: 'Enter' })
    expect(onSave).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByTestId('workflow-policy-form'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(mode).toHaveFocus()
  })

  it('renders honest loading, empty, retryable error, saving, success, and default read-only states', () => {
    const retry = vi.fn()
    const { rerender } = render(<Harness loading />)
    expect(screen.getByRole('status')).toHaveTextContent('正在加载 Workflow 策略')

    rerender(<Harness key="error" error="读取失败" onRetry={retry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('读取失败')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(retry).toHaveBeenCalledTimes(1)

    rerender(<Harness key="empty" empty />)
    expect(screen.getByRole('status')).toHaveTextContent('当前 Workflow 没有可编辑策略')

    rerender(<Harness key="saving" saving />)
    expect(screen.getByRole('status')).toHaveTextContent('正在保存策略')
    expect(screen.getByRole('button', { name: '保存策略' })).toBeDisabled()

    rerender(<Harness key="success" success />)
    expect(screen.getByRole('status')).toHaveTextContent('策略已保存')

    rerender(<Harness key="readonly" readonly />)
    expect(screen.getByText(/内置 default 策略为只读镜像/)).toBeInTheDocument()
    expect(screen.getByLabelText('拆分模式')).toBeDisabled()
    expect(screen.getByLabelText('互动模式')).toBeDisabled()
    expect(screen.getByLabelText('最大 Review 次数')).toBeDisabled()
    expect(screen.queryByRole('button', { name: '保存策略' })).toBeNull()
  })
})
