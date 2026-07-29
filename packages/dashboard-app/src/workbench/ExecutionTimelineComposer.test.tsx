import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WbHookMeta, WbSkillEntry } from '../api/client'
import { I18nProvider } from '../i18n'
import type { HooksConfigState } from './HookTimeline'
import { ExecutionTimelineComposer } from './ExecutionTimelineComposer'
import type { BoardLane } from './OrchestrationBoard'

const LANES: BoardLane[] = [
  {
    id: 'draft',
    name: '立项',
    gate: null,
    skills: ['outline'],
    skillDeps: { outline: [] },
    outputs: ['brief'],
    nonemptyGuard: true,
    hooksCount: 2,
    hooksLocked: 1,
    linkEvent: 'ready',
    count: 2,
    running: false,
  },
  {
    id: 'verify',
    name: '验证',
    gate: 'review',
    skills: ['test-runner', 'evidence-reviewer'],
    skillDeps: { 'test-runner': [], 'evidence-reviewer': ['test-runner'] },
    outputs: ['verification_report', 'evidence'],
    nonemptyGuard: true,
    hooksCount: 3,
    hooksLocked: 1,
    linkEvent: 'passed',
    count: 4,
    running: true,
  },
  {
    id: 'ship',
    name: '交付',
    gate: null,
    skills: [],
    skillDeps: {},
    outputs: [],
    nonemptyGuard: false,
    hooksCount: 1,
    hooksLocked: 1,
    linkEvent: null,
    count: 0,
    running: false,
  },
]

const HOOKS: WbHookMeta[] = [
  { id: 'load-context', event: 'SessionStart', matcher: '*', script: 'load-context.sh', configurable: false },
  { id: 'guard-write-scope', event: 'PreToolUse', matcher: 'Write|Edit', script: 'guard-write-scope.sh', configurable: true },
  { id: 'collect-evidence', event: 'PostToolUse', matcher: '*', script: 'collect-evidence.sh', configurable: true },
]

const REGISTRY: WbSkillEntry[] = [
  { name: 'test-runner', installed: true, source: 'builtin' },
  { name: 'evidence-reviewer', installed: false, source: 'user' },
]

function hooks(toggle = vi.fn()): HooksConfigState {
  return {
    hooks: HOOKS,
    matrix: {},
    loadError: null,
    toggleError: null,
    promptSkipKeyword: 'no-tenon',
    promptSkipBusy: false,
    promptSkipError: null,
    busyKeys: new Set(),
    toggle,
    savePromptSkipKeyword: vi.fn(async () => true),
    enabledCount: () => 3,
  }
}

function renderComposer(overrides: Partial<React.ComponentProps<typeof ExecutionTimelineComposer>> = {}): void {
  render(
    <I18nProvider>
      <ExecutionTimelineComposer
        workflowName="release"
        lanes={LANES}
        selectedId="verify"
        readonly={false}
        hooks={hooks()}
        skillRegistry={REGISTRY}
        onSelect={vi.fn()}
        {...overrides}
      />
    </I18nProvider>,
  )
}

describe('ExecutionTimelineComposer', () => {
  it('阶段总览完整展示名称，并把复核状态留在阶段设置而不是轨道连接线上', () => {
    const lanes: BoardLane[] = [
      { ...LANES[0], id: 'start', name: 'Start' },
      { ...LANES[1], id: 'research', name: '需求澄清与技术方案确认' },
    ]
    renderComposer({ lanes, selectedId: 'research' })

    const startName = within(screen.getByRole('button', { name: '选择阶段 Start' })).getByText('Start')
    const longName = within(screen.getByRole('button', { name: '选择阶段 需求澄清与技术方案确认' })).getByText('需求澄清与技术方案确认')
    expect(startName).toHaveTextContent('Start')
    expect(startName).not.toHaveClass('truncate')
    expect(longName).toHaveTextContent('需求澄清与技术方案确认')
    expect(longName).not.toHaveClass('truncate')
    expect(screen.queryByTestId('wb-flow-gate-research')).toBeNull()
    expect(screen.getByTestId('wb-selected-gate')).toHaveTextContent('复核门')
  })

  it('把阶段、执行时点、Skill 依赖与真实解析摘要放在同一条动线上', () => {
    renderComposer()

    expect(screen.getByRole('button', { name: '选择阶段 验证' })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('wb-timeline-node-codex')).toHaveTextContent('test-runner')
    expect(screen.getByTestId('wb-timeline-node-codex')).toHaveTextContent('evidence-reviewer')
    expect(screen.getByTestId('wb-timeline-node-codex')).toHaveTextContent('等待 test-runner')
    const topology = screen.getByTestId('wb-skill-topology-inline')
    expect(topology).toHaveTextContent('第 1 批')
    expect(topology).toHaveTextContent('第 2 批')
    expect(topology).toHaveTextContent('test-runner')
    expect(topology).toHaveTextContent('evidence-reviewer')
    expect(topology).toHaveTextContent('串行进入')
    expect(screen.getByTestId('wb-timeline-preview')).toHaveTextContent('2 个 Skill')
    expect(screen.getByTestId('wb-timeline-preview')).toHaveTextContent('3 个 Hook')
    expect(screen.getByTestId('wb-timeline-preview')).toHaveTextContent('1')
    expect(screen.getByTestId('wb-timeline-preview')).toHaveTextContent('执行时冻结')
    expect(screen.queryByText('快照已验证')).not.toBeInTheDocument()
  })

  it('点阶段直接切换当前执行契约', () => {
    const onSelect = vi.fn()
    renderComposer({ onSelect })

    fireEvent.click(screen.getByRole('button', { name: /交付/ }))
    expect(onSelect).toHaveBeenCalledWith('ship')
  })

  it('Hook 开关写回当前阶段的真实矩阵键', () => {
    const toggle = vi.fn()
    renderComposer({ hooks: hooks(toggle) })

    fireEvent.click(screen.getByRole('switch', { name: /guard-write-scope/ }))
    expect(toggle).toHaveBeenCalledWith('guard-write-scope', 'verify', false)
  })

  it('同阶段拖动 Skill 会发出真实顺序变更', () => {
    const onSkillMove = vi.fn()
    renderComposer({ onSkillMove })

    fireEvent.dragStart(screen.getByTestId('wb-timeline-skill-evidence-reviewer'))
    fireEvent.dragOver(screen.getByTestId('wb-timeline-skill-test-runner'))
    fireEvent.drop(screen.getByTestId('wb-timeline-skill-test-runner'), { clientY: 0 })

    expect(onSkillMove).toHaveBeenCalledWith({
      skillId: 'evidence-reviewer',
      fromStage: 'verify',
      toStage: 'verify',
      refSkillId: 'test-runner',
      after: false,
    })
  })

  it('执行指令页签编辑真实阶段 prompt', () => {
    const onPromptChange = vi.fn()
    renderComposer({ prompt: '先读取变更上下文', onPromptChange })

    fireEvent.click(screen.getByRole('button', { name: '执行指令' }))
    expect(screen.queryByRole('button', { name: '添加 Skill' })).toBeNull()
    const prompt = screen.getByLabelText('Codex 阶段指令')
    expect(prompt).toHaveValue('先读取变更上下文')
    fireEvent.change(prompt, { target: { value: '执行并验证真实结果' } })
    expect(onPromptChange).toHaveBeenCalledWith('执行并验证真实结果')
  })

  it('主流程不重复提供“查看完整契约”入口', () => {
    const onOpenAdvanced = vi.fn()
    renderComposer({ onOpenAdvanced })

    expect(screen.queryByRole('button', { name: '查看完整契约' })).toBeNull()
    expect(onOpenAdvanced).not.toHaveBeenCalled()
  })

  it('Hook 只展示用户用途与一句话说明，技术 id 和脚本退到 hover 详情', () => {
    renderComposer()

    const hook = screen.getByTestId('wb-timeline-hook-guard-write-scope')
    expect(hook).toHaveTextContent('写入范围保护')
    expect(hook).toHaveTextContent('在工具执行前检查写入是否越界')
    expect(hook).toHaveTextContent('内置 Hook')
    expect(hook).not.toHaveTextContent('guard-write-scope.sh')
    expect(hook).toHaveAttribute('title', expect.stringContaining('guard-write-scope.sh'))
  })

  it('运行前事实只陈述配置状态，不用“越多越好”的分数或雷达图', () => {
    renderComposer()

    const preview = screen.getByTestId('wb-timeline-preview')
    expect(preview).toHaveTextContent('运行前事实')
    expect(preview).toHaveTextContent('技能编排')
    expect(preview).toHaveTextContent('Hook 覆盖')
    expect(preview).toHaveTextContent('运行时产出')
    expect(preview).toHaveTextContent('依赖关系')
    expect(preview).not.toHaveTextContent('配置完整度')
    expect(screen.queryByTestId('wb-config-depth-chart')).toBeNull()
    expect(screen.getByTestId('wb-runtime-facts')).toBeInTheDocument()
  })

  it('守卫区只读说明真实状态，不重复提供配置按钮', () => {
    const onOpenAdvanced = vi.fn()
    renderComposer({ onOpenAdvanced })

    const guard = screen.getByTestId('wb-timeline-node-guard')
    expect(guard).toHaveTextContent('安全边界')
    expect(guard).toHaveTextContent('产出检查')
    expect(screen.queryByRole('button', { name: '配置守卫' })).toBeNull()
    expect(onOpenAdvanced).not.toHaveBeenCalled()
  })

  it('添加 Skill 从当前阶段直接打开依赖编排浮层', () => {
    const onOpenSkillEditor = vi.fn()
    renderComposer({ onOpenSkillEditor })

    fireEvent.click(screen.getByRole('button', { name: '添加 Skill' }))
    expect(onOpenSkillEditor).toHaveBeenCalledTimes(1)
  })

  it('只读流程锁住 Hook、Skill、阶段和产出，不暴露技术阶段 id', () => {
    renderComposer({ readonly: true, onOpenSkillEditor: vi.fn(), onLaneEdit: vi.fn() })

    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: '添加 Skill' })).toBeNull()
    expect(screen.queryByRole('button', { name: '添加产出' })).toBeNull()
    expect(screen.queryByText('verify', { selector: 'span.rounded-full' })).toBeNull()
  })

  it('产出由运行时自动识别与登记，页面只显示中文事实、不提供人工增删', () => {
    const onLaneEdit = vi.fn()
    renderComposer({ onLaneEdit })

    const outputs = screen.getByTestId('wb-lane-outs-verify')
    expect(outputs).toHaveTextContent('运行时产出')
    expect(outputs).toHaveTextContent('运行 Agent 显式登记，系统校验后展示')
    expect(outputs).toHaveTextContent('验证报告')
    expect(outputs).not.toHaveTextContent('verification_report')
    expect(screen.queryByRole('button', { name: '添加产出' })).toBeNull()
    expect(screen.queryByRole('button', { name: /移除验证报告/ })).toBeNull()
    expect(onLaneEdit).not.toHaveBeenCalled()
  })
})
