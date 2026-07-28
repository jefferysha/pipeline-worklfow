import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('提供统一 H1、说明、上下文、状态和动作层级', () => {
    render(
      <PageHeader
        eyebrow="项目 · demo"
        title="进度"
        description="查看每个任务的当前状态"
        status={<span>实时同步</span>}
        actions={<button type="button">新建</button>}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: '进度' })).toBeInTheDocument()
    expect(screen.getByText('项目 · demo')).toHaveAttribute('data-slot', 'page-eyebrow')
    expect(screen.getByText('查看每个任务的当前状态')).toHaveAttribute('data-slot', 'page-description')
    expect(screen.getByText('实时同步').closest('[data-slot="page-status"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: '新建' })).toBeInTheDocument()
    const description = screen.getByText('查看每个任务的当前状态')
    const status = screen.getByText('实时同步').closest('[data-slot="page-status"]')
    expect(description.compareDocumentPosition(status!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('省略可选区域时不渲染空容器', () => {
    const { container } = render(<PageHeader title="机器" />)
    expect(container.querySelector('[data-slot="page-eyebrow"]')).toBeNull()
    expect(container.querySelector('[data-slot="page-description"]')).toBeNull()
    expect(container.querySelector('[data-slot="page-status"]')).toBeNull()
    expect(container.querySelector('[data-slot="page-actions"]')).toBeNull()
  })
})
