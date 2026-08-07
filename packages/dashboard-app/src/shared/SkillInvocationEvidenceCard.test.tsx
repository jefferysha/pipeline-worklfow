import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
    input: { schema_id: 'input/v1', fields: [
      { name: 'requirements', classification: 'project-data' as const, validator: { id: 'input-schema', status: 'pass' as const } },
      { name: 'secret', classification: 'sensitive-redacted' as const, validator: { id: 'redaction', status: 'fail' as const, code: 'missing-redaction' } },
    ] },
    output: { schema_id: 'output/v1', fields: [
      { name: 'revision_id', classification: 'identifier' as const, validator: { id: 'output-schema', status: 'unknown' as const } },
    ] },
    questions: [{
      id: 'q-1', key: 'build.mode', schema_id: 'build-mode-question/v1',
      option_ids: ['direct', 'subagent'], requiredness: 'routine' as const, shown: false,
    }],
    decisions: [{
      id: 'd-1', question_id: 'q-1', mode: 'recommended-default' as const,
      selected_option_ids: ['direct'], policy: { id: 'policy', version: '2', rule_id: 'build-mode' },
      rationale_code: 'overlapping-files', free_text_classification: 'user-provided' as const,
    }],
    artifacts: [{
      binding_id: 'b-1', output_id: 'plan', kind: 'file' as const,
      ref: 'artifacts/plan.json', state: 'bound' as const, validators: [
        { id: 'digest', status: 'fail' as const, code: 'mismatch' },
        { id: 'schema', status: 'unknown' as const },
      ],
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
    expect(screen.getByText(/requirements.*项目数据.*input-schema.*通过/)).toBeInTheDocument()
    expect(screen.getByText(/secret.*敏感信息已脱敏.*redaction.*失败.*missing-redaction/)).toBeInTheDocument()
    expect(screen.getByText(/revision_id.*标识符.*output-schema.*未知/)).toBeInTheDocument()
    expect(screen.getByText(/自由文本存在.*用户提供/)).toBeInTheDocument()
    expect(screen.getByText(/plan.*已绑定/)).toBeInTheDocument()
    const artifactValidators = screen.getByRole('list', { name: '产物 validator' })
    expect(within(artifactValidators).getByText(/digest.*失败.*mismatch/)).toBeInTheDocument()
    expect(within(artifactValidators).getByText(/schema.*未知/)).toBeInTheDocument()
    expect(screen.queryByText('actual free text')).not.toBeInTheDocument()
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
    expect(screen.getByText(/requirements.*Project data.*input-schema.*Passed/)).toBeInTheDocument()
    expect(screen.getByText(/Free text present.*User provided/)).toBeInTheDocument()
    const artifactValidators = screen.getByRole('list', { name: 'Artifact validators' })
    expect(within(artifactValidators).getByText(/digest.*Failed.*mismatch/)).toBeInTheDocument()
    expect(within(artifactValidators).getByText(/schema.*Unknown/)).toBeInTheDocument()
  })
})
