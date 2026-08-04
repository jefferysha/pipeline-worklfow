import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { TaskRunPanel } from './TaskRunPanel'
import { fetchTaskRun, postTaskRunOperation, type TaskRunDto } from '../api/taskRunClient'

vi.mock('../api/taskRunClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/taskRunClient')>()
  return { ...actual, fetchTaskRun: vi.fn(), postTaskRunOperation: vi.fn() }
})

const run: TaskRunDto = {
  schema_version: 'task-run/v1',
  plan: { plan_id: 'plan-1', revision_id: 'revision-1', revision_number: 1, fingerprint: 'sha256:plan' },
  run_revision: 2,
  state: 'blocked',
  admission: { status: 'blocked', blockers: [{ code: 'EVIDENCE_MISSING', detail: 'Evidence missing', remediation: 'RECHECK_EVIDENCE' }] },
  waves: [{ index: 0, work_item_ids: ['wi-1'], parallelism: 1 }],
  parallelism: 1,
  serialized_resource_conflicts: [{
    resource: 'file:packages/server', before_work_item_id: 'wi-1', after_work_item_id: 'wi-2',
  }],
  items: [{
    work_item_id: 'wi-1', title: 'Build API', state: 'failed', depends_on: [],
    resource_claims: [{ kind: 'file', access: 'write', key: 'packages/server' }],
    latest_attempt: {
      attempt_id: 'attempt-1', work_item_id: 'wi-1', attempt_number: 1, status: 'failed',
      recorded_at: '2026-08-04T00:00:00.000Z', input_digests: {}, error_code: 'TEST_FAILED',
    },
  }],
  attempts: [{
    attempt_id: 'attempt-1', work_item_id: 'wi-1', attempt_number: 1, status: 'failed',
    recorded_at: '2026-08-04T00:00:00.000Z', input_digests: {}, error_code: 'TEST_FAILED',
  }], operations: [], blockers: [{ code: 'EVIDENCE_MISSING', detail: 'Evidence missing', remediation: 'RECHECK_EVIDENCE' }],
  invalidations: [], validator_verdicts: [], groups: [],
  allowed_operations: [{ operation: 'retry', work_item_id: 'wi-1', expected_run_revision: 2, expected_state: 'failed' }],
}

function renderPanel(): void {
  render(<I18nProvider><TaskRunPanel root="/repo" change="demo" /></I18nProvider>)
}

beforeEach(() => {
  localStorage.setItem('tenon-dashboard-lang', 'en')
  vi.mocked(fetchTaskRun).mockReset()
  vi.mocked(postTaskRunOperation).mockReset()
})

describe('TaskRunPanel', () => {
  it('renders loading, explainable blockers, waves, and server-authorized operations', async () => {
    const updated = { ...run, run_revision: 3, state: 'running' as const }
    vi.mocked(fetchTaskRun).mockResolvedValueOnce(run).mockResolvedValueOnce(updated)
    vi.mocked(postTaskRunOperation).mockResolvedValue(updated)
    renderPanel()
    expect(screen.getByRole('status')).toHaveTextContent('Loading task run')
    expect(await screen.findByText('EVIDENCE_MISSING')).toBeVisible()
    expect(screen.getAllByText('Build API')).toHaveLength(2)
    expect(screen.getByText('Wave 1')).toBeVisible()
    expect(screen.getByText('wi-1 writes file:packages/server before wi-2')).toBeVisible()
    expect(screen.getByText('Resource claims: write file:packages/server')).toBeVisible()
    expect(screen.getByText('1 attempts')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Retry Build API' }))
    expect(postTaskRunOperation).toHaveBeenCalledWith('/repo', 'demo', run.allowed_operations[0])
    await waitFor(() => expect(screen.getByTestId('task-run-panel')).toHaveAttribute('data-state', 'running'))
  })

  it('refreshes the server truth after a stale operation failure', async () => {
    const refreshed = { ...run, run_revision: 3, allowed_operations: [] }
    vi.mocked(fetchTaskRun).mockResolvedValueOnce(run).mockResolvedValueOnce(refreshed)
    vi.mocked(postTaskRunOperation).mockRejectedValueOnce(new Error('stale'))
    renderPanel()
    await screen.findByText('EVIDENCE_MISSING')
    await userEvent.click(screen.getByRole('button', { name: 'Retry Build API' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The operation failed')
    await waitFor(() => expect(fetchTaskRun).toHaveBeenCalledTimes(2))
    expect(screen.getByText('Run revision 3')).toBeVisible()
  })

  it('offers predictable keyboard retry after a fetch failure', async () => {
    vi.mocked(fetchTaskRun).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(run)
    renderPanel()
    expect(await screen.findByText('The task run could not be loaded.')).toBeVisible()
    const retry = screen.getByRole('button', { name: 'Retry loading task run' })
    retry.focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByText('EVIDENCE_MISSING')).toBeVisible()
  })

  it('renders an intentional empty state', async () => {
    vi.mocked(fetchTaskRun).mockResolvedValue({ ...run, items: [], waves: [], blockers: [], allowed_operations: [] })
    renderPanel()
    expect(await screen.findByText('No work items are available for this task run.')).toBeVisible()
  })
})
