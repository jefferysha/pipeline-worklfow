import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  it('Enter selects and focuses the only search result', async () => {
    fetchMock.mockResolvedValue(graph)
    renderCard()

    const search = await screen.findByRole('searchbox', { name: '搜索节点' })
    fireEvent.change(search, { target: { value: 'demo' } })
    fireEvent.keyDown(search, { key: 'Enter' })

    const node = screen.getByRole('button', { name: /demo/ })
    expect(node).toHaveFocus()
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('demo')
  })

  it('renders canonical phases as the only horizontal trunk and moves fallback and scope edges into relationships', async () => {
    const phaseIds = ['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'] as const
    const phaseNodes = phaseIds.map((phase, index) => ({
      id: `phase:${phase}`,
      kind: 'phase' as const,
      label: phase,
      status: phase === 'build' ? 'current' : index < 3 ? 'done' : 'pending',
      metadata: [{ key: 'phase_id', value: phase }, { key: 'order', value: String(index + 1) }],
    }))
    const forwardEdges = phaseIds.slice(0, -1).map((phase, index) => ({
      id: `transition:${phase}:${phaseIds[index + 1]}`,
      kind: 'transitions' as const,
      source: `phase:${phase}`,
      target: `phase:${phaseIds[index + 1]}`,
      label: `${phase}-complete`,
    }))
    fetchMock.mockResolvedValue({
      ...graph,
      nodes: [graph.nodes[0], graph.nodes[1], ...phaseNodes],
      edges: [
        { id: 'governs', kind: 'governs', source: 'workflow:default', target: 'change:demo', label: 'governs' },
        ...phaseNodes.map((phase) => ({
          id: `contains:${phase.id}`,
          kind: 'contains' as const,
          source: 'change:demo',
          target: phase.id,
          label: 'contains phase',
        })),
        ...forwardEdges,
        {
          id: 'fallback:requirements-changed',
          kind: 'transitions',
          source: 'phase:build',
          target: 'phase:spec',
          label: 'requirements-changed',
        },
      ],
    })
    render(
      <I18nProvider>
        <OrchestrationGraphCard root="/repo" change="demo" />
      </I18nProvider>,
    )

    const trunk = await screen.findByTestId('orchestration-phase-trunk')
    expect(within(trunk).getAllByRole('button').map((button) => button.textContent)).toEqual([
      expect.stringContaining('立项'),
      expect.stringContaining('调研'),
      expect.stringContaining('规格'),
      expect.stringContaining('实现'),
      expect.stringContaining('验证'),
      expect.stringContaining('交付'),
      expect.stringContaining('归档'),
    ])
    expect(trunk).toHaveClass('overflow-x-auto')
    expect(trunk.querySelectorAll('[data-phase-connector]')).toHaveLength(6)
    expect(screen.getByTestId('orchestration-scope')).toHaveTextContent('default')
    expect(screen.getByTestId('orchestration-scope')).toHaveTextContent('demo')

    const relationships = screen.getByTestId('orchestration-relationships')
    expect(relationships.querySelectorAll('[data-edge-kind="contains"]')).toHaveLength(7)
    expect(relationships).toHaveTextContent('需求变化')
    expect(relationships).toHaveTextContent('治理')
    expect(screen.getByTestId('orchestration-canvas').querySelector('svg')).not.toBeInTheDocument()
  })

  it('groups enabled resources below the phase trunk without removing selection or semantic edge facts', async () => {
    fetchMock.mockResolvedValue({
      ...graph,
      nodes: [
        ...graph.nodes,
        { id: 'task:1', kind: 'task', label: 'Task one', status: 'pending', metadata: [{ key: 'phase', value: 'build' }] },
        { id: 'document:1', kind: 'document', label: 'proposal', status: 'recorded', metadata: [{ key: 'required_read', value: 'true' }] },
        { id: 'review:1', kind: 'review', label: 'agent_review_result', status: 'pass', metadata: [{ key: 'field', value: 'agent_review_result' }] },
        { id: 'session:1', kind: 'session', label: 'Session abc', status: 'active', metadata: [{ key: 'heartbeat_at', value: '2026-08-03T00:00:00Z' }] },
      ],
      edges: [
        ...graph.edges,
        { id: 'task-edge', kind: 'contains', source: 'phase:build', target: 'task:1', label: 'contains task' },
        { id: 'document-edge', kind: 'produces', source: 'phase:build', target: 'document:1', label: 'produces document' },
        { id: 'review-edge', kind: 'reviews', source: 'review:1', target: 'phase:build', label: 'reviews' },
        { id: 'session-edge', kind: 'executes', source: 'session:1', target: 'phase:build', label: 'executes' },
      ],
    })
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: '全部' }))

    const resources = screen.getByTestId('orchestration-resources')
    expect(within(resources).getByTestId('orchestration-resource-task')).toHaveTextContent('Task one')
    expect(within(resources).getByTestId('orchestration-resource-document')).toHaveTextContent('提案')
    expect(within(resources).getByTestId('orchestration-resource-review')).toHaveTextContent('Agent 复核')
    expect(within(resources).getByTestId('orchestration-resource-session')).toHaveTextContent('活跃会话 abc')

    fireEvent.click(within(resources).getByRole('button', { name: /Task one/ }))
    expect(screen.getByTestId('orchestration-selection')).toHaveTextContent('Task one')
    fireEvent.click(screen.getByText('可访问节点与边列表'))
    expect(screen.getByTestId('orchestration-accessible-list')).toHaveTextContent('Task one')
    expect(screen.getByTestId('orchestration-accessible-list')).toHaveTextContent('产出')
  })

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

  it('moves a self-transition into the relationship region instead of drawing over its node', async () => {
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
    render(
      <I18nProvider>
        <OrchestrationGraphCard root="/repo" change="demo" />
      </I18nProvider>,
    )
    await screen.findByRole('button', { name: /实现/ })

    const relationship = screen.getByTestId('orchestration-relationships')
    expect(relationship.querySelectorAll('[data-edge-kind="transitions"]')).toHaveLength(1)
    expect(relationship).toHaveTextContent('归档')
    expect(screen.getByTestId('orchestration-canvas').querySelector('[data-edge-id]')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /实现/ }))
    expect(screen.getByTestId('orchestration-relationships')).toHaveTextContent('归档')
  })

  it('keeps the forward adjacent transition in the trunk and lists the reciprocal fallback separately', async () => {
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
    render(
      <I18nProvider>
        <OrchestrationGraphCard root="/repo" change="demo" />
      </I18nProvider>,
    )
    await screen.findByRole('button', { name: /实现/ })
    expect(screen.getByTestId('orchestration-phase-trunk').querySelector('[data-phase-connector="transition"]')).toBeInTheDocument()
    const relationships = screen.getByTestId('orchestration-relationships')
    expect(relationships).toHaveTextContent('需求变化')
    expect(relationships).not.toHaveTextContent('规格完成')
    expect(screen.getByTestId('orchestration-canvas').querySelector('svg')).not.toBeInTheDocument()

    const build = screen.getByRole('button', { name: /实现/ })
    const spec = screen.getByRole('button', { name: /规格/ })
    build.focus()
    fireEvent.keyDown(build, { key: 'Home' })
    expect(spec).toHaveFocus()
    fireEvent.keyDown(spec, { key: 'ArrowLeft' })
    expect(spec).toHaveFocus()
    fireEvent.keyDown(spec, { key: 'End' })
    expect(build).toHaveFocus()
  })

  it('lists multiple self-transitions separately and exposes equivalent node details in the accessible list', async () => {
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
    render(
      <I18nProvider>
        <OrchestrationGraphCard root="/repo" change="demo" />
      </I18nProvider>,
    )
    await screen.findByRole('button', { name: /实现/ })
    const relationships = screen.getByTestId('orchestration-relationships')
    const loops = relationships.querySelectorAll('[data-edge-kind="transitions"]')
    expect(loops).toHaveLength(2)
    expect(loops[0]?.textContent).not.toBe(loops[1]?.textContent)
    fireEvent.click(screen.getByRole('button', { name: /实现/ }))
    expect(screen.getByTestId('orchestration-relationships').querySelectorAll('[data-edge-kind="transitions"]')).toHaveLength(2)

    fireEvent.click(screen.getByText('可访问节点与边列表'))
    const list = screen.getByTestId('orchestration-accessible-list')
    expect(list).toHaveTextContent('当前阶段')
    expect(list).toHaveTextContent('阶段')
    expect(list).toHaveTextContent('传出关系')
    expect(list).toHaveTextContent('归档')
    expect(list).toHaveTextContent('任务')
  })

  it('大图只在画布渐进展示有限资源节点，完整匹配集仍保留在可访问列表', async () => {
    const tasks = Array.from({ length: 120 }, (_, index) => ({
      id: `task:${index + 1}`,
      kind: 'task' as const,
      label: `Task ${String(index + 1).padStart(3, '0')}`,
      status: 'pending',
      metadata: [{ key: 'phase_id', value: 'build' }],
    }))
    fetchMock.mockResolvedValue({
      ...graph,
      nodes: [...graph.nodes, ...tasks],
      edges: [
        ...graph.edges,
        ...tasks.map((task) => ({
          id: `contains:phase:build:${task.id}`,
          kind: 'contains' as const,
          source: 'phase:build',
          target: task.id,
          label: 'task',
        })),
      ],
    })
    const view = render(
      <I18nProvider>
        <OrchestrationGraphCard root="/repo" change="demo" />
      </I18nProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: '全部' }))
    expect(await screen.findByTestId('orchestration-canvas-limited')).toHaveTextContent('123')
    expect(screen.getByTestId('orchestration-canvas').querySelectorAll('button')).toHaveLength(21)
    fireEvent.click(screen.getByText('可访问节点与边列表'))
    expect(screen.getByTestId('orchestration-accessible-list')).toHaveTextContent('Task 120')
    expect(view.container.querySelector('[style*="3196px"]')).not.toBeInTheDocument()
  })
})
