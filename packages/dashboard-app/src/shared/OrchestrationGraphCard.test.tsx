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
    { id: 'workflow:default', kind: 'workflow', label: 'default', status: 'changed', metadata: [{ key: 'execution_model', value: 'phase-manifest' }] },
    {
      id: 'change:demo',
      kind: 'change',
      label: 'demo',
      status: 'in_progress',
      metadata: [{ key: 'track', value: 'chat' }, { key: 'preset', value: 'security audit/v2' }],
    },
    { id: 'phase:build', kind: 'phase', label: '实现', status: 'current', metadata: [{ key: 'phase_id', value: 'build' }] },
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
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('阶段清单')
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('传出关系')
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('治理')

    expect(screen.getByRole('heading', { name: '编排图' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /demo · 变更/ }))
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('轨道')
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('对话')
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('预设')
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('security audit/v2')

    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    fireEvent.click(screen.getByRole('button', { name: '阶段' }))
    expect(screen.queryByRole('button', { name: /default/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /实现/ })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no match' } })
    expect(screen.getByText(/没有匹配的节点/)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    fireEvent.click(screen.getByText('可访问节点与边列表'))
    expect(screen.getByText(/default.*工作流/)).toBeInTheDocument()
    expect(screen.getByText(/治理.*default.*demo/)).toBeInTheDocument()
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
    expect(await screen.findByText(/当前 Server 不提供编排图/)).toHaveAttribute('role', 'status')

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
    expect(await screen.findByText(/这个 Change 暂无可展示的编排节点/)).toHaveAttribute('role', 'status')
  })

  it('localizes canonical labels and tokens, and exposes non-color pressed/selected cues', async () => {
    fetchMock.mockResolvedValue({
      ...graph,
      coverage: { ...graph.coverage, deferred: ['agent', 'historical-session-turn'] },
      nodes: [
        ...graph.nodes,
        {
          id: 'review:agent_review_result',
          kind: 'review',
          label: 'agent_review_result',
          status: 'failed',
          metadata: [{ key: 'field', value: 'agent_review_result' }],
        },
      ],
    })
    renderCard('en')

    expect(await screen.findByRole('button', { name: /Build · Phase/ })).toBeInTheDocument()
    expect(screen.queryByText('实现')).not.toBeInTheDocument()
    expect(screen.getByText(/Agent identity/)).toBeInTheDocument()
    expect(screen.getByText(/Historical session turns/)).toBeInTheDocument()
    const all = screen.getByRole('button', { name: 'All' })
    fireEvent.click(all)
    expect(all).toHaveTextContent('✓')
    fireEvent.click(screen.getByRole('button', { name: /Agent review/ }))
    const selected = screen.getByRole('button', { name: /Agent review.*Failed/ })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(selected).toHaveTextContent('✓')
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('Review field')
  })

  it('localizes the canonical explore event and preserves custom labels even for standard phase ids', async () => {
    fetchMock.mockResolvedValue({
      ...graph,
      nodes: [
        {
          ...graph.nodes[0],
          id: 'workflow:custom',
          label: 'custom',
          metadata: [{ key: 'execution_model', value: 'step-graph' }],
        },
        graph.nodes[1],
        {
          ...graph.nodes[2],
          label: 'Security hardening',
        },
        {
          id: 'phase:security_review',
          kind: 'phase',
          label: 'Security review',
          status: 'handled',
          metadata: [{ key: 'phase_id', value: 'security_review' }],
        },
      ],
      edges: [{
        id: 'transition',
        kind: 'transitions',
        source: 'phase:build',
        target: 'phase:security_review',
        label: 'explore-complete',
      }],
    })
    renderCard('en')

    expect(await screen.findByRole('button', { name: /Security hardening · Phase · Current/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Build · Phase · Current/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Security review · Phase · Handled/ })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Accessible node and edge list'))
    expect(screen.getByText(/Transitions · Explore complete.*Security hardening.*Security review/)).toBeInTheDocument()
    expect(screen.queryByText(/explore-complete/)).not.toBeInTheDocument()
  })

  it('localizes closed document kinds and the simple built-in track', async () => {
    fetchMock.mockResolvedValue({
      ...graph,
      nodes: [
        graph.nodes[0],
        {
          ...graph.nodes[1],
          metadata: [{ key: 'track', value: 'simple' }],
        },
        graph.nodes[2],
        {
          id: 'document:delta-spec',
          kind: 'document',
          label: 'delta-spec',
          status: 'recorded',
          metadata: [{ key: 'required_read', value: 'true' }],
        },
      ],
      edges: [],
    })
    renderCard('en')

    await screen.findByRole('button', { name: /demo · Change/ })
    fireEvent.click(screen.getByRole('button', { name: /demo · Change/ }))
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('Simple task')
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByRole('button', { name: /Delta specification · Document/ })).toBeInTheDocument()
    expect(screen.queryByText('delta-spec')).not.toBeInTheDocument()
  })

  it('keeps all adjacent edge details when a selected node is the only visible kind', async () => {
    fetchMock.mockResolvedValue(graph)
    renderCard()
    const all = await screen.findByRole('button', { name: '全部' })
    fireEvent.click(all)
    fireEvent.click(screen.getByRole('button', { name: '阶段' }))
    fireEvent.click(screen.getByRole('button', { name: /实现/ }))

    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('传入关系')
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('包含')
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('demo')
  })

  it('renders a self-transition as a visible curved loop outside the node', async () => {
    fetchMock.mockResolvedValue({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: 'task:1',
          kind: 'task',
          label: '受隐藏筛选的任务',
          status: 'pending',
          metadata: [{ key: 'phase_id', value: 'build' }],
        },
      ],
      edges: [
        ...graph.edges,
        {
          id: 'contains:phase:build:task:1',
          kind: 'contains',
          source: 'phase:build',
          target: 'task:1',
          label: 'task',
        },
        {
          id: 'transitions:phase:build:phase:build:archived',
          kind: 'transitions',
          source: 'phase:build',
          target: 'phase:build',
          label: 'archived',
        },
      ],
    })
    const view = render(
      <I18nProvider>
        <OrchestrationGraphCard root="/repo" change="demo" />
      </I18nProvider>,
    )
    await screen.findByRole('button', { name: /实现/ })

    const loop = view.container.querySelector('[data-self-loop="true"]')
    expect(loop?.tagName.toLowerCase()).toBe('path')
    expect(loop).toHaveAttribute('d', expect.stringContaining(' C '))
    const labelSelector =
      '[data-edge-id="transitions:phase:build:phase:build:archived"] text'
    expect(view.container.querySelector(labelSelector)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /实现/ }))
    const label = view.container.querySelector(labelSelector)
    expect(label).toHaveAttribute('text-anchor', 'end')
  })

  it('routes reciprocal transitions through deterministic separate lanes', async () => {
    fetchMock.mockResolvedValue({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: 'phase:spec',
          kind: 'phase',
          label: '规格',
          status: 'handled',
          metadata: [{ key: 'phase_id', value: 'spec' }, { key: 'order', value: '3' }],
        },
      ],
      edges: [
        ...graph.edges,
        {
          id: 'transitions:phase:spec:phase:build:spec-complete',
          kind: 'transitions',
          source: 'phase:spec',
          target: 'phase:build',
          label: 'spec-complete',
        },
        {
          id: 'transitions:phase:build:phase:spec:requirements-changed',
          kind: 'transitions',
          source: 'phase:build',
          target: 'phase:spec',
          label: 'requirements-changed',
        },
      ],
    })
    const view = render(
      <I18nProvider>
        <OrchestrationGraphCard root="/repo" change="demo" />
      </I18nProvider>,
    )
    await screen.findByRole('button', { name: /实现/ })
    expect(view.container.querySelectorAll('[data-edge-id] text')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /实现/ }))

    const forward = view.container.querySelector(
      '[data-edge-id="transitions:phase:spec:phase:build:spec-complete"] [data-transition-route]',
    )
    const reverse = view.container.querySelector(
      '[data-edge-id="transitions:phase:build:phase:spec:requirements-changed"] [data-transition-route]',
    )
    expect(forward).toHaveAttribute('d', expect.stringContaining(' C '))
    expect(reverse).toHaveAttribute('d', expect.stringContaining(' C '))
    expect(forward?.getAttribute('d')).not.toBe(reverse?.getAttribute('d'))

    const labels = [
      view.container.querySelector(
        '[data-edge-id="transitions:phase:spec:phase:build:spec-complete"] text',
      ),
      view.container.querySelector(
        '[data-edge-id="transitions:phase:build:phase:spec:requirements-changed"] text',
      ),
    ]
    expect(labels[0]?.getAttribute('y')).not.toBe(labels[1]?.getAttribute('y'))
  })

  it('separates self-transition routes and exposes equivalent node details in the list', async () => {
    fetchMock.mockResolvedValue({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: 'task:hidden',
          kind: 'task',
          label: '受隐藏筛选的任务',
          status: 'pending',
          metadata: [{ key: 'phase_id', value: 'build' }],
        },
      ],
      edges: [
        ...graph.edges,
        {
          id: 'contains:phase:build:task:hidden',
          kind: 'contains',
          source: 'phase:build',
          target: 'task:hidden',
          label: 'task',
        },
        {
          id: 'transitions:phase:build:phase:build:archived',
          kind: 'transitions',
          source: 'phase:build',
          target: 'phase:build',
          label: 'archived',
        },
        {
          id: 'transitions:phase:build:phase:build:retry',
          kind: 'transitions',
          source: 'phase:build',
          target: 'phase:build',
          label: 'retry',
        },
      ],
    })
    const view = render(
      <I18nProvider>
        <OrchestrationGraphCard root="/repo" change="demo" />
      </I18nProvider>,
    )
    await screen.findByRole('button', { name: /实现/ })
    const loops = view.container.querySelectorAll('[data-self-loop="true"]')
    expect(loops).toHaveLength(2)
    expect(loops[0]?.getAttribute('d')).not.toBe(loops[1]?.getAttribute('d'))
    fireEvent.click(screen.getByRole('button', { name: /实现/ }))
    const loopLabels = view.container.querySelectorAll(
      '[data-edge-id^="transitions:phase:build:phase:build:"] text',
    )
    expect(loopLabels).toHaveLength(2)
    const labelYs = [...loopLabels].map((label) => Number(label.getAttribute('y')))
    expect(Math.abs((labelYs[1] ?? 0) - (labelYs[0] ?? 0))).toBeGreaterThanOrEqual(12)

    fireEvent.click(screen.getByText('可访问节点与边列表'))
    const list = screen.getByTestId('orchestration-accessible-list')
    expect(list).toHaveTextContent('当前阶段')
    expect(list).toHaveTextContent('阶段')
    expect(list).toHaveTextContent('传出关系')
    expect(list).toHaveTextContent('归档')
    expect(list).toHaveTextContent('任务')
  })
})
