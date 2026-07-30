import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { fetchOrchestrationGraph, type OrchestrationGraph } from '../api/orchestrationGraphClient'
import { ApiError } from '../api/transport'
import { OrchestrationGraphCard } from './OrchestrationGraphCard'

vi.mock('../api/orchestrationGraphClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/orchestrationGraphClient')>()
  return { ...actual, fetchOrchestrationGraph: vi.fn() }
})
const fetchMock = vi.mocked(fetchOrchestrationGraph)

const graph: OrchestrationGraph = {
  schema: 'tenon-orchestration-graph/v1',
  scope: { root: '/repo', change: 'demo' },
  coverage: {
    implemented: ['workflow', 'change', 'phase'],
    deferred: ['agent', 'live-refresh'],
  },
  nodes: [
    { id: 'workflow:default', kind: 'workflow', label: 'default', status: 'changed', metadata: [{ key: 'execution_model', value: 'step-graph' }] },
    { id: 'change:demo', kind: 'change', label: 'demo', status: 'build', metadata: [] },
    { id: 'phase:build', kind: 'phase', label: 'Build', status: 'current', metadata: [] },
  ],
  edges: [
    { id: 'e1', kind: 'governs', source: 'workflow:default', target: 'change:demo', label: 'governs' },
    { id: 'e2', kind: 'contains', source: 'change:demo', target: 'phase:build', label: 'contains phase' },
  ],
}

function renderCard(locale: 'zh-CN' | 'en' = 'zh-CN'): void {
  localStorage.setItem('tenon-dashboard-lang', locale === 'en' ? 'en' : 'zh')
  render(
    <I18nProvider>
      <OrchestrationGraphCard root="/repo" change="demo" />
    </I18nProvider>,
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  localStorage.clear()
})

describe('OrchestrationGraphCard', () => {
  it('shows loading, renders the graph, filters, searches, selects, and exposes an equivalent list', async () => {
    let resolveRequest: ((value: OrchestrationGraph) => void) | undefined
    fetchMock.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve }))
    renderCard()
    expect(screen.getByRole('status')).toHaveTextContent('正在读取编排图')
    await act(async () => resolveRequest?.(graph))
    await screen.findByRole('button', { name: /default/ })

    fireEvent.click(screen.getByRole('button', { name: /default/ }))
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('step-graph')

    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    fireEvent.click(screen.getByRole('button', { name: '阶段' }))
    expect(screen.queryByRole('button', { name: /default/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Build/ })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no match' } })
    expect(screen.getByText(/没有匹配的节点/)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    fireEvent.click(screen.getByText('可访问节点与边列表'))
    expect(screen.getByText(/default.*Workflow/)).toBeInTheDocument()
    expect(screen.getByText(/治理/)).toBeInTheDocument()
  })

  it('supports keyboard focus order and Escape clearing selection', async () => {
    fetchMock.mockResolvedValue(graph)
    localStorage.setItem('tenon-dashboard-lang', 'en')
    const parentKeyDown = vi.fn()
    render(
      <I18nProvider>
        <div onKeyDown={parentKeyDown}>
          <OrchestrationGraphCard root="/repo" change="demo" />
        </div>
      </I18nProvider>,
    )
    const first = await screen.findByRole('button', { name: /default/ })
    first.focus()
    fireEvent.keyDown(first, { key: 'End' })
    const last = screen.getByRole('button', { name: /Build/ })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'Enter' })
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('Build')
    parentKeyDown.mockClear()
    fireEvent.keyDown(last, { key: 'Escape' })
    expect(screen.queryByTestId('orchestration-selection')).not.toBeInTheDocument()
    expect(parentKeyDown).not.toHaveBeenCalled()
  })

  it('ignores a late response after the root/change scope changes', async () => {
    let resolveOld: ((value: OrchestrationGraph) => void) | undefined
    fetchMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      .mockResolvedValueOnce({
        ...graph,
        scope: { root: '/repo-b', change: 'second' },
        nodes: [{ id: 'change:second', kind: 'change', label: 'second', status: 'build', metadata: [] }],
        edges: [],
      })
    const view = render(
      <I18nProvider>
        <OrchestrationGraphCard root="/repo-a" change="first" />
      </I18nProvider>,
    )
    view.rerender(
      <I18nProvider>
        <OrchestrationGraphCard root="/repo-b" change="second" />
      </I18nProvider>,
    )
    await screen.findByRole('button', { name: /second/ })
    await act(async () => resolveOld?.(graph))
    expect(screen.getByRole('button', { name: /second/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /default/ })).not.toBeInTheDocument()
  })

  it('distinguishes old-server unavailable, errors with retry, and true empty', async () => {
    fetchMock.mockRejectedValueOnce(new ApiError('old', 404))
    renderCard()
    expect(await screen.findByText(/当前 Server 不提供编排图/)).toBeInTheDocument()

    fetchMock.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(graph)
    const { unmount } = render(
      <I18nProvider>
        <OrchestrationGraphCard root="/repo" change="other" />
      </I18nProvider>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('编排图读取失败')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    unmount()

    fetchMock.mockResolvedValue({ ...graph, nodes: [], edges: [] })
    render(
      <I18nProvider>
        <OrchestrationGraphCard root="/repo" change="empty" />
      </I18nProvider>,
    )
    expect(await screen.findByText(/这个 Change 暂无可展示的编排节点/)).toBeInTheDocument()
  })
})
