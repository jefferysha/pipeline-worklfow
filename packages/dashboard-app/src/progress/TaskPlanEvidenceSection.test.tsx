import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskPlanEvidenceSection } from './TaskPlanEvidenceSection'

interface ScopeProps {
  readonly root: string
  readonly change: string
}

interface TaskPlanPanelMockProps extends ScopeProps {
  readonly onSelectedWorkItemChange?: (id: string | undefined) => void
}

interface SkillInvocationEvidenceCardMockProps extends ScopeProps {
  readonly workItemId?: string
}

interface TaskRunPanelMockProps extends ScopeProps {
  readonly readOnly?: boolean
}

const mocks = vi.hoisted(() => ({
  taskPlanPanel: vi.fn(),
  skillInvocationEvidenceCard: vi.fn(),
  taskRunPanel: vi.fn(),
}))

vi.mock('../taskPlan/TaskPlanPanel', () => ({
  TaskPlanPanel: (props: TaskPlanPanelMockProps): JSX.Element => {
    mocks.taskPlanPanel(props)
    return (
      <div data-testid="task-plan-panel">
        <button type="button" data-testid="select-work-item" onClick={() => props.onSelectedWorkItemChange?.('work-item-1')}>
          select
        </button>
        <button type="button" data-testid="clear-work-item" onClick={() => props.onSelectedWorkItemChange?.(undefined)}>
          clear
        </button>
      </div>
    )
  },
}))

vi.mock('../shared/SkillInvocationEvidenceCard', () => ({
  SkillInvocationEvidenceCard: (props: SkillInvocationEvidenceCardMockProps): JSX.Element => {
    mocks.skillInvocationEvidenceCard(props)
    return <div data-testid="skill-invocation-evidence" />
  },
}))

vi.mock('../afk/TaskRunPanel', () => ({
  TaskRunPanel: (props: TaskRunPanelMockProps): JSX.Element => {
    mocks.taskRunPanel(props)
    return <div data-testid="task-run-panel" data-read-only={String(props.readOnly)} />
  },
}))

function renderSection(root = '/repo', change = 'change-a') {
  return render(<TaskPlanEvidenceSection root={root} change={change} />)
}

function latestProps<T>(mock: { mock: { calls: unknown[][] } }): T {
  const calls = mock.mock.calls
  return calls[calls.length - 1]?.[0] as T
}

beforeEach(() => {
  mocks.taskPlanPanel.mockClear()
  mocks.skillInvocationEvidenceCard.mockClear()
  mocks.taskRunPanel.mockClear()
})

describe('TaskPlanEvidenceSection', () => {
  it('renders task plan, skill evidence, and read-only task run in order', () => {
    renderSection()

    const section = screen.getByTestId('task-plan-panel').parentElement
    expect(section).not.toBeNull()
    expect(within(section as HTMLElement).getAllByTestId(/task-plan-panel|skill-invocation-evidence|task-run-panel/).map((node) => node.getAttribute('data-testid'))).toEqual([
      'task-plan-panel',
      'skill-invocation-evidence',
      'task-run-panel',
    ])
    expect(screen.getByTestId('task-run-panel')).toHaveAttribute('data-read-only', 'true')
  })

  it('passes the selected work item to skill evidence and restores Change-wide evidence when cleared', async () => {
    renderSection()

    expect(latestProps<SkillInvocationEvidenceCardMockProps>(mocks.skillInvocationEvidenceCard).workItemId).toBeUndefined()
    await userEvent.click(screen.getByTestId('select-work-item'))
    expect(latestProps<SkillInvocationEvidenceCardMockProps>(mocks.skillInvocationEvidenceCard)).toMatchObject({
      root: '/repo',
      change: 'change-a',
      workItemId: 'work-item-1',
    })

    await userEvent.click(screen.getByTestId('clear-work-item'))
    expect(latestProps<SkillInvocationEvidenceCardMockProps>(mocks.skillInvocationEvidenceCard)).toMatchObject({
      root: '/repo',
      change: 'change-a',
    })
    expect(latestProps<SkillInvocationEvidenceCardMockProps>(mocks.skillInvocationEvidenceCard).workItemId).toBeUndefined()
  })

  it('clears the old selection before passing a changed root or Change to children', async () => {
    const view = renderSection('/repo-a', 'change-a')
    await userEvent.click(screen.getByTestId('select-work-item'))
    expect(latestProps<SkillInvocationEvidenceCardMockProps>(mocks.skillInvocationEvidenceCard).workItemId).toBe('work-item-1')

    const skillCallCount = mocks.skillInvocationEvidenceCard.mock.calls.length
    view.rerender(<TaskPlanEvidenceSection root="/repo-b" change="change-b" />)

    const scopeCalls = mocks.skillInvocationEvidenceCard.mock.calls.slice(skillCallCount)
    expect(scopeCalls.length).toBeGreaterThan(0)
    expect(scopeCalls.every(([props]) => (props as SkillInvocationEvidenceCardMockProps).workItemId === undefined)).toBe(true)
    expect(latestProps<TaskPlanPanelMockProps>(mocks.taskPlanPanel)).toMatchObject({ root: '/repo-b', change: 'change-b' })
    expect(latestProps<SkillInvocationEvidenceCardMockProps>(mocks.skillInvocationEvidenceCard)).toMatchObject({
      root: '/repo-b',
      change: 'change-b',
    })
    expect(latestProps<TaskRunPanelMockProps>(mocks.taskRunPanel)).toMatchObject({
      root: '/repo-b',
      change: 'change-b',
      readOnly: true,
    })
  })
})
