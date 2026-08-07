import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import {
  fetchTaskPlan,
  TaskPlanApiError,
  type CanonicalTaskPlanReadModelV1,
  type LegacyTaskPlanReadModelV1,
} from '../api/taskPlanClient'
import { TaskPlanPanel } from './TaskPlanPanel'

vi.mock('../api/taskPlanClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/taskPlanClient')>()
  return { ...actual, fetchTaskPlan: vi.fn() }
})

const fingerprint = `sha256:${'a'.repeat(64)}` as `sha256:${string}`
const coverage = {
  complete: false,
  requirements: [
    { id: 'req-covered', work_item_ids: ['wi-1'] },
    { id: 'req-uncovered', work_item_ids: [] },
  ],
  acceptance_criteria: [
    { id: 'acc-covered', work_item_ids: ['wi-1'] },
    { id: 'acc-uncovered', work_item_ids: [] },
  ],
  uncovered_requirement_ids: ['req-uncovered'],
  uncovered_acceptance_ids: ['acc-uncovered'],
}
const dependencies = {
  edges: [{ from_work_item_id: 'wi-1', to_work_item_id: 'wi-2' }],
  cyclic_work_item_ids: ['wi-2'],
}
const resources = {
  conflicts: [{ resource: 'path:packages/dashboard.tsx', work_item_ids: ['wi-1', 'wi-2'] }],
  serialized: [{ resource: 'path:packages/dashboard.tsx', before_work_item_id: 'wi-1', after_work_item_id: 'wi-2' }],
}

const canonical: CanonicalTaskPlanReadModelV1 = {
  schema_version: 'task-plan-read/v1',
  source: 'canonical',
  schedulable: false,
  plan_id: 'plan-dashboard',
  revision_id: 'revision-dashboard-1',
  revision_number: 7,
  fingerprint,
  revision_status: 'draft',
  validation: {
    valid: false,
    freezable: false,
    truncated: true,
    issues: [{
      severity: 'error',
      code: 'dependency-cycle',
      path: '$.items[1].depends_on',
      related_ids: ['wi-2', 'wi-1'],
    }],
    coverage,
    dependencies,
    resources,
  },
  completeness: { state: 'incomplete' },
  requirements: [
    { id: 'req-covered', title: 'Read-only task inspection' },
    { id: 'req-uncovered', title: 'Keyboard focus recovery' },
  ],
  acceptance_criteria: [
    { id: 'acc-covered', title: 'The plan is searchable' },
    { id: 'acc-uncovered', title: 'The detail closes to its trigger' },
  ],
  groups: [{ id: 'group-dashboard', title: 'Dashboard surface', parent_id: null, work_item_ids: ['wi-1', 'wi-2'] }],
  items: [
    {
      id: 'wi-1',
      identity_quality: 'canonical',
      title: 'Render task plan summary',
      description: 'A long description that remains readable at the desktop boundary.',
      group_id: 'group-dashboard',
      requirement_refs: ['req-covered'],
      acceptance_refs: ['acc-covered'],
      depends_on: [],
      resource_claims: [{ kind: 'path', access: 'write', key: 'packages/dashboard.tsx' }],
      expected_outputs: [{ id: 'output-1', kind: 'file', ref: 'packages/dashboard.tsx' }],
      validators: [{ id: 'validator-1', kind: 'file-exists', version: 1, output_ids: ['output-1'] }],
    },
    {
      id: 'wi-2',
      identity_quality: 'canonical',
      title: 'Verify keyboard focus recovery',
      group_id: 'group-dashboard',
      requirement_refs: ['req-uncovered'],
      acceptance_refs: ['acc-uncovered'],
      depends_on: ['wi-1'],
      resource_claims: [],
      expected_outputs: [],
      validators: [],
    },
  ],
  coverage,
  dependencies,
  resources,
  projection: { state: 'drift', reason: 'The Markdown projection is newer than the frozen revision.' },
}

const legacy: LegacyTaskPlanReadModelV1 = {
  schema_version: 'task-plan-read/v1',
  source: 'legacy',
  schedulable: false,
  groups: [],
  items: [{
    id: 'legacy-derived-1',
    identity_quality: 'legacy-derived',
    title: 'Read legacy checklist',
    stage: 'Explore',
    completed: true,
    order: 0,
    depends_on: [],
    requirement_refs: [],
    acceptance_refs: [],
    resource_claims: [],
    expected_outputs: [],
    validators: [],
  }],
  completeness: { state: 'unknown', reason: 'legacy-semantics-unproven' },
  projection: { state: 'legacy' },
}

function renderPanel(props: { root?: string; change?: string; onSelectedWorkItemChange?: (id: string | undefined) => void } = {}): void {
  render(
    <I18nProvider>
      <TaskPlanPanel
        root={props.root ?? '/repo'}
        change={props.change ?? 'dashboard-task-plan'}
        onSelectedWorkItemChange={props.onSelectedWorkItemChange}
      />
    </I18nProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('tenon-dashboard-lang', 'en')
  vi.mocked(fetchTaskPlan).mockReset()
})

describe('TaskPlanPanel', () => {
  it('renders canonical summary, diagnostics, and detail from server DTO fields', async () => {
    vi.mocked(fetchTaskPlan).mockResolvedValue(canonical)
    renderPanel()

    expect(screen.getByRole('status')).toHaveTextContent('Loading task plan')
    expect(await screen.findByText('plan-dashboard')).toBeVisible()
    expect(screen.getByText('revision-dashboard-1')).toBeVisible()
    expect(screen.getByText(fingerprint)).toBeVisible()
    expect(screen.getByText('Projection drift')).toBeVisible()
    expect(screen.getByTestId('task-plan-panel')).toHaveTextContent('The Markdown projection is newer than the frozen revision.')
    expect(screen.getAllByText('req-uncovered').length).toBeGreaterThan(0)
    expect(screen.getByTestId('task-plan-diagnostics')).toHaveTextContent('wi-1 → wi-2')
    expect(screen.getAllByText('path:packages/dashboard.tsx').length).toBeGreaterThan(0)
    expect(screen.getByText('dependency-cycle')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: /Render task plan summary/ }))
    expect(await screen.findByTestId('work-item-detail')).toHaveTextContent('output-1')
    expect(screen.getByTestId('work-item-detail')).toHaveTextContent('validator-1')
    expect(screen.getByTestId('work-item-detail')).toHaveTextContent('group-dashboard')
  })

  it('filters 120 items by server item ID/title/group/requirement/acceptance and exposes filtered-empty', async () => {
    const items = Array.from({ length: 120 }, (_, index) => ({
      ...canonical.items[0],
      id: `wi-${String(index + 1).padStart(3, '0')}`,
      title: index === 119 ? 'Needle keyboard path' : `Item ${index + 1}`,
      requirement_refs: index === 119 ? ['req-uncovered'] : ['req-covered'],
      acceptance_refs: index === 119 ? ['acc-uncovered'] : ['acc-covered'],
    }))
    const large = { ...canonical, items, groups: [{ ...canonical.groups[0], work_item_ids: items.map((item) => item.id) }] }
    vi.mocked(fetchTaskPlan).mockResolvedValue(large)
    renderPanel()

    expect(await screen.findByText('Showing 120 of 120 work items')).toBeVisible()
    const filter = screen.getByRole('textbox', { name: 'Filter work items' })
    await userEvent.type(filter, 'keyboard path')
    expect(screen.getByText('Showing 1 of 120 work items')).toBeVisible()
    expect(screen.getByRole('button', { name: /Needle keyboard path/ })).toBeVisible()
    await userEvent.clear(filter)
    await userEvent.type(filter, 'no-such-work-item')
    expect(screen.getByText('No work items match the current filter.')).toBeVisible()
  })

  it('returns focus to the trigger and emits selection callbacks when detail closes', async () => {
    vi.mocked(fetchTaskPlan).mockResolvedValue(canonical)
    const onSelected = vi.fn()
    renderPanel({ onSelectedWorkItemChange: onSelected })
    const trigger = await screen.findByRole('button', { name: /Render task plan summary/ })
    await userEvent.click(trigger)
    expect(onSelected).toHaveBeenLastCalledWith('wi-1')
    await userEvent.click(screen.getByRole('button', { name: 'Close work item detail' }))
    expect(trigger).toHaveFocus()
    expect(onSelected).toHaveBeenLastCalledWith(undefined)
  })

  it('describes legacy source and unknown relationships without inventing canonical fields', async () => {
    vi.mocked(fetchTaskPlan).mockResolvedValue(legacy)
    renderPanel()
    expect(await screen.findByText('legacy')).toBeVisible()
    const content = screen.getByTestId('task-plan-content')
    expect(content).toHaveTextContent('Source')
    expect(content).toHaveTextContent('Schedulable')
    expect(content).toHaveTextContent('Completeness')
    expect(content).toHaveTextContent('Relationships: unknown')
    expect(content).toHaveTextContent('Explore')
    expect(content).toHaveTextContent('Order')
    expect(screen.queryByText('Stable plan ID')).not.toBeInTheDocument()
    expect(screen.queryByText('Dependency edges')).not.toBeInTheDocument()
  })

  it('supports not-found empty, initial error retry, and malformed 200 unknown states', async () => {
    vi.mocked(fetchTaskPlan).mockRejectedValueOnce(new TaskPlanApiError('not found', 404, 'TASK_PLAN_NOT_FOUND'))
    renderPanel()
    expect(await screen.findByText('No task plan is available for this Change.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Retry loading task plan' })).not.toBeInTheDocument()

    vi.mocked(fetchTaskPlan).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(canonical)
    renderPanel({ change: 'retry-change' })
    expect(await screen.findByText('The task plan could not be loaded.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading task plan' }))
    expect(await screen.findByText('plan-dashboard')).toBeVisible()

    vi.mocked(fetchTaskPlan).mockRejectedValueOnce(new TaskPlanApiError('invalid', 200))
    renderPanel({ change: 'unknown-change' })
    expect(await screen.findByText('The task plan response was unknown or malformed.')).toBeVisible()
  })

  it('keeps cached data visible with stale retry after refresh failure', async () => {
    vi.mocked(fetchTaskPlan).mockResolvedValueOnce(canonical).mockRejectedValueOnce(new Error('offline'))
    renderPanel()
    expect(await screen.findByText('plan-dashboard')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh task plan' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Showing stale task plan data while the latest refresh is unavailable.')
    expect(screen.getByText('plan-dashboard')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry refreshing task plan' })).toBeVisible()
  })

  it('ignores an older response after root changes', async () => {
    let resolveFirst: ((plan: CanonicalTaskPlanReadModelV1) => void) | undefined
    let resolveSecond: ((plan: CanonicalTaskPlanReadModelV1) => void) | undefined
    vi.mocked(fetchTaskPlan)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))
    const view = render(
      <I18nProvider><TaskPlanPanel root="/first" change="change" /></I18nProvider>,
    )
    view.rerender(<I18nProvider><TaskPlanPanel root="/second" change="change" /></I18nProvider>)
    resolveSecond?.({ ...canonical, plan_id: 'new-plan' })
    expect(await screen.findByText('new-plan')).toBeVisible()
    resolveFirst?.({ ...canonical, plan_id: 'old-plan' })
    await waitFor(() => expect(screen.queryByText('old-plan')).not.toBeInTheDocument())
  })

  it('renders pending projection and switches all visible copy with the language', async () => {
    const pending = { ...canonical, projection: { state: 'pending' as const, reason: 'Projection awaits publication.' } }
    vi.mocked(fetchTaskPlan).mockResolvedValue(pending)
    renderPanel()
    expect(await screen.findByText('Projection pending')).toBeVisible()
    expect(screen.getByTestId('task-plan-panel')).toHaveTextContent('Projection awaits publication.')

    localStorage.setItem('tenon-dashboard-lang', 'en')
    vi.mocked(fetchTaskPlan).mockResolvedValue(pending)
    renderPanel({ change: 'english-change' })
    expect(await screen.findByText('Task plan')).toBeVisible()
    expect(screen.getAllByText('Projection pending').length).toBeGreaterThan(0)
    expect(screen.queryByText('任务计划')).not.toBeInTheDocument()

    localStorage.setItem('tenon-dashboard-lang', 'zh')
    vi.mocked(fetchTaskPlan).mockResolvedValue(pending)
    renderPanel({ change: 'chinese-change' })
    expect(await screen.findByText('任务计划')).toBeVisible()
    expect(screen.getByRole('button', { name: '刷新任务计划' })).toBeVisible()
  })
})
