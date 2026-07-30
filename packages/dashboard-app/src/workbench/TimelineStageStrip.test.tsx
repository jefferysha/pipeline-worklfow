import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { BoardLane } from './OrchestrationBoard'
import { TimelineStageStrip } from './TimelineStageStrip'

const LANES: BoardLane[] = [
  'open',
  'explore',
  'spec',
  'build',
  'verify',
  'ship',
  'archive',
].map((id) => ({
  id,
  name: id === 'archive' ? '归档' : id,
  gate: null,
  outputs: [],
  linkEvent: id === 'archive' ? null : `${id}-complete`,
  count: 0,
  running: false,
}))

function renderStrip() {
  const onSelect = vi.fn()
  render(
    <I18nProvider>
      <TimelineStageStrip
        workflowName="default"
        lanes={LANES}
        selectedId="open"
        readonly
        onSelect={onSelect}
      />
    </I18nProvider>,
  )
  return { onSelect }
}

function renderEditableStrip() {
  const onStageReorder = vi.fn()
  render(
    <I18nProvider>
      <TimelineStageStrip workflowName="custom" lanes={LANES} selectedId="spec" readonly={false} onSelect={vi.fn()} onStageReorder={onStageReorder} />
    </I18nProvider>,
  )
  return { onStageReorder }
}

describe('TimelineStageStrip 横向阶段导航', () => {
  it('为较窄桌面提供可发现的横向滚动提示，并建立无障碍说明关系', () => {
    renderStrip()

    const hint = screen.getByTestId('wb-stage-scroll-hint')
    expect(hint).toHaveTextContent('横向滚动查看全部阶段')
    expect(hint).toHaveClass('max-[1180px]:inline-flex')

    const scroll = screen.getByTestId('wb-stage-scroll')
    expect(scroll).toHaveAttribute('aria-describedby', hint.id)
    expect(scroll).toHaveClass('overflow-x-auto')
  })

  it('仍渲染并可选择末尾的归档阶段', () => {
    const { onSelect } = renderStrip()
    const archive = screen.getByTestId('wb-step-archive')
    expect(archive).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '选择阶段 归档' }))
    expect(onSelect).toHaveBeenCalledWith('archive')
  })

  it('阶段重排提供键盘可聚焦的前移和后移入口', () => {
    const { onStageReorder } = renderEditableStrip()
    fireEvent.click(screen.getByRole('button', { name: '将阶段 spec 向前移动' }))
    fireEvent.click(screen.getByRole('button', { name: '将阶段 spec 向后移动' }))
    expect(onStageReorder).toHaveBeenNthCalledWith(1, 'spec', 'explore', false)
    expect(onStageReorder).toHaveBeenNthCalledWith(2, 'spec', 'build', true)
  })
})
