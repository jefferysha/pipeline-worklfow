import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SkillInvocationEvidenceCard } from './SkillInvocationEvidenceCard'
import { fetchSkillInvocations } from '../api/skillInvocationClient'

vi.mock('../api/skillInvocationClient', async () => {
  const actual = await vi.importActual<typeof import('../api/skillInvocationClient')>('../api/skillInvocationClient')
  return { ...actual, fetchSkillInvocations: vi.fn() }
})

const fetchMock = vi.mocked(fetchSkillInvocations)
const ready = {
  schema_version: 'skill-invocation-list/v1' as const,
  state: 'ready' as const,
  items: [{
    schema_version: 'skill-invocation-read/v1' as const,
    invocation_id: 'inv-1', status: 'completed' as const,
    skill: { id: 'task-planner', version: '1' },
    subject: {
      workflow_definition_id: 'default', workflow_run_id: 'run-1', step_id: 'build',
      step_visit: { run_id: 'run-1', transition_sequence: 3 }, work_item_id: 'item-1',
    },
    started_at: '2026-08-03T00:00:00Z', finished_at: '2026-08-03T00:00:01Z',
    input: { schema_id: 'input/v1', fields: [] }, output: { schema_id: 'output/v1', fields: [] },
    questions: [{
      id: 'q-1', key: 'build.mode', schema_id: 'build-mode-question/v1',
      option_ids: ['direct', 'subagent'], requiredness: 'routine' as const, shown: false,
    }],
    decisions: [{
      id: 'd-1', question_id: 'q-1', mode: 'recommended-default' as const,
      selected_option_ids: ['direct'], policy: { id: 'policy', version: '2', rule_id: 'build-mode' },
      rationale_code: 'overlapping-files',
    }],
    artifacts: [{
      binding_id: 'b-1', output_id: 'plan', kind: 'file' as const,
      ref: 'artifacts/plan.json', state: 'bound' as const, validators: [{ id: 'digest', status: 'pass' as const }],
    }],
  }],
}

function renderCard(): void {
  render(<I18nProvider><SkillInvocationEvidenceCard root="/repo" change="demo" /></I18nProvider>)
}

afterEach(() => {
  fetchMock.mockReset()
  localStorage.clear()
})

describe('SkillInvocationEvidenceCard', () => {
  it('shows loading then actual question/default/artifact evidence with a keyboard-native disclosure', async () => {
    let resolveRequest: ((value: typeof ready) => void) | undefined
    fetchMock.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve }))
    renderCard()
    expect(screen.getByRole('status')).toHaveTextContent('正在读取 Skill 调用证据')
    await act(async () => resolveRequest?.(ready))
    fireEvent.click(await screen.findByText('task-planner'))
    expect(screen.getByText('build.mode')).toBeInTheDocument()
    expect(screen.getByText(/未展示/)).toBeInTheDocument()
    expect(screen.getByText(/direct.*build-mode.*overlapping-files/)).toBeInTheDocument()
    expect(screen.getByText(/plan.*已绑定/)).toBeInTheDocument()
  })

  it('renders empty and error states and retries', async () => {
    fetchMock.mockResolvedValueOnce({ schema_version: 'skill-invocation-list/v1', state: 'empty', items: [] })
    renderCard()
    expect(await screen.findByText('这个 Change 暂无结构化 Skill 调用证据。')).toHaveAttribute('role', 'status')

    fetchMock.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(ready)
    const view = render(<I18nProvider><SkillInvocationEvidenceCard root="/repo" change="other" /></I18nProvider>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Skill 调用证据读取失败')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('task-planner')).toBeInTheDocument()
    view.unmount()
  })

  it('renders English copy without changing protocol identifiers', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    fetchMock.mockResolvedValue(ready)
    renderCard()
    fireEvent.click(await screen.findByText('task-planner'))
    expect(screen.getByText(/Not shown/)).toBeInTheDocument()
    expect(screen.getByText('build.mode')).toBeInTheDocument()
  })
})
