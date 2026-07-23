import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { StepperRail, type StepperStep } from './StepperRail'

/**
 * StepperRail.test（v6 计划 T11：StepperRail → 流程带）—— 纯展示组件的独立单测，与
 * WorkbenchView.test.tsx 的集成测试互补：这里钉住 props→DOM 的渲染契约本身（门徽章 popover、
 * 真实计数气泡、running 脉冲、+ 添加阶段），WorkbenchView.test.tsx 钉住 stageCounts 投影
 * 与真实数据接线。首次建立本文件——计划书注明「StepperRail.test.tsx」为本任务产出文件。
 */

// 计数刻意避开 1/2/3（三张卡各自的序号数字），避免 getByText('2') 之类的断言同时命中
// 「序号」与「计数气泡」两处文本——序号与真实计数是两个独立概念，不用同一数值验证。
const STEPS: StepperStep[] = [
  { id: 'draft', name: '起草', gate: null, skills: ['superpowers:tdd', 'impeccable', 'browser-qa'], outputsCount: 1, hooksCount: 8, linkEvent: 'submitted', count: 0, running: false },
  { id: 'review', name: '人工复核', gate: 'review', skills: [], outputsCount: 0, hooksCount: 8, linkEvent: 'approved', count: 5, running: false },
  { id: 'ship', name: '发布', gate: null, skills: [], outputsCount: 2, hooksCount: 7, linkEvent: null, count: 4, running: true },
]

const GATE_HOOKS = [
  { id: 'gate', name: '门拦截', desc: '复核没过时，挡住技能调用与写文件' },
  { id: 'interactive-skill-gate', name: '技能解锁检查', desc: '依赖顺序没到的技能直接拦下' },
]

function renderRail(overrides: Partial<Parameters<typeof StepperRail>[0]> = {}) {
  const onSelect = vi.fn()
  render(
    <I18nProvider>
      <StepperRail
        steps={STEPS}
        selectedId="draft"
        onSelect={onSelect}
        label="release-train 阶段"
        gateHooks={GATE_HOOKS}
        {...overrides}
      />
    </I18nProvider>,
  )
  return { onSelect }
}

describe('StepperRail 基础渲染（节点数/名称/ID/选中态）', () => {
  it('节点数 = steps 数，aria-label 透传，序号/名称/ID 齐全', () => {
    renderRail()
    expect(screen.getByLabelText('release-train 阶段')).toBeInTheDocument()
    for (const s of STEPS) {
      const seg = screen.getByTestId(`wb-step-${s.id}`)
      expect(within(seg).getByText(s.name)).toBeInTheDocument()
      expect(within(seg).getByText(s.id)).toBeInTheDocument()
    }
    expect(within(screen.getByTestId('wb-step-draft')).getByText('1')).toBeInTheDocument()
    expect(within(screen.getByTestId('wb-step-review')).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByTestId('wb-step-ship')).getByText('3')).toBeInTheDocument()
  })

  it('selectedId 命中的节点 aria-current=step，其余不带该属性', () => {
    renderRail({ selectedId: 'review' })
    expect(screen.getByTestId('wb-step-review')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('wb-step-draft')).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('wb-step-ship')).not.toHaveAttribute('aria-current')
  })

  it('点击节点主体触发 onSelect(id)', () => {
    const { onSelect } = renderRail()
    fireEvent.click(within(screen.getByTestId('wb-step-ship')).getByText('发布'))
    expect(onSelect).toHaveBeenCalledWith('ship')
  })

  it('技能/产出/钩子计数与技能 chips 缩略（既有 T15/T12 消费方回归）', () => {
    renderRail()
    const draft = screen.getByTestId('wb-step-draft')
    expect(within(draft).getByText(/3 技能/)).toBeInTheDocument()
    expect(within(draft).getByText(/1 产出/)).toBeInTheDocument()
    expect(within(draft).getByText(/8 钩子/)).toBeInTheDocument()
    expect(within(draft).getByText('tdd')).toBeInTheDocument()
    expect(within(draft).getByText('impeccable')).toBeInTheDocument()
    expect(within(draft).getByText('+1')).toBeInTheDocument()

    const ship = screen.getByTestId('wb-step-ship')
    expect(within(ship).getByText(/0 技能/)).toBeInTheDocument()
    expect(within(ship).getByText(/2 产出/)).toBeInTheDocument()
    expect(within(ship).getByText(/7 钩子/)).toBeInTheDocument()
  })

  it('hooksCount 为 undefined 时该阶段不渲染钩子计数段（诚实占位，不谎报）', () => {
    renderRail({ steps: STEPS.map((s) => ({ ...s, hooksCount: undefined })) })
    expect(within(screen.getByTestId('wb-step-draft')).queryByText(/钩子/)).toBeNull()
  })
})

describe('StepperRail 段间连接件（#2：转换事件名小字退役）', () => {
  it('段间连接件不再渲染转换事件名小字（会被相邻卡挡住、非必要，2026-07-15 退役）', () => {
    renderRail()
    // 事件名（submitted/approved）作为可见文本已不渲染——连接件只留流动虚线+门菱形
    expect(screen.queryByText('submitted')).toBeNull()
    expect(screen.queryByText('approved')).toBeNull()
  })

  it('linkEvent 仍决定是否画连接件：非末尾且非空 → 画（门菱形在），末尾不画', () => {
    renderRail()
    // review→ship 是门后推进边，菱形门节点在连接件里（testid 无独立锚，验其存在靠 gate 段）
    expect(screen.getByTestId('wb-step-review')).toBeInTheDocument()
  })
})

describe('StepperRail 真实计数气泡（v6 T11）', () => {
  it('count>0 才渲染气泡，且数字精确等于 count；count=0 不渲染', () => {
    renderRail()
    expect(screen.queryByTestId('wb-flow-count-draft')).toBeNull()
    expect(screen.getByTestId('wb-flow-count-review')).toHaveTextContent('5')
    expect(screen.getByTestId('wb-flow-count-ship')).toHaveTextContent('4')
  })
})

describe('StepperRail running 脉冲（v6 T11）', () => {
  it('running=true 才渲染脉冲光泽元素', () => {
    renderRail()
    expect(screen.queryByTestId('wb-flow-gloss-draft')).toBeNull()
    expect(screen.queryByTestId('wb-flow-gloss-review')).toBeNull()
    expect(screen.getByTestId('wb-flow-gloss-ship')).toBeInTheDocument()
  })
})

describe('StepperRail 门徽章 popover（v6 T11，静态 hook 元数据）', () => {
  it('无 gate 的阶段不渲染门徽章', () => {
    renderRail()
    expect(screen.queryByTestId('wb-flow-gate-draft')).toBeNull()
  })

  it('gate=review 渲染「复核门」徽章；gate=confirm 渲染「确认门」徽章', () => {
    renderRail({ steps: [{ ...STEPS[1]!, id: 'confirm-step', gate: 'confirm' }] })
    expect(screen.getByTestId('wb-flow-gate-confirm-step')).toHaveTextContent('确认门')
  })

  it('默认不展示 popover；hover 门徽章展示，移出后收起', () => {
    renderRail()
    const gate = screen.getByTestId('wb-flow-gate-review')
    expect(screen.queryByTestId('wb-flow-gatepop-review')).toBeNull()

    fireEvent.mouseEnter(gate)
    const pop = screen.getByTestId('wb-flow-gatepop-review')
    expect(within(pop).getByText('门拦截')).toBeInTheDocument()
    expect(within(pop).getByText(/复核没过时，挡住技能调用与写文件/)).toBeInTheDocument()
    expect(within(pop).getByText('技能解锁检查')).toBeInTheDocument()
    expect(within(pop).getByText(/依赖顺序没到的技能直接拦下/)).toBeInTheDocument()

    fireEvent.mouseLeave(gate)
    expect(screen.queryByTestId('wb-flow-gatepop-review')).toBeNull()
  })

  it('点击门徽章钉住展示（不受 mouseLeave 影响）；再次点击收起', () => {
    renderRail()
    const gate = screen.getByTestId('wb-flow-gate-review')
    fireEvent.click(gate)
    expect(screen.getByTestId('wb-flow-gatepop-review')).toBeInTheDocument()
    fireEvent.mouseLeave(gate)
    expect(screen.getByTestId('wb-flow-gatepop-review')).toBeInTheDocument()

    fireEvent.click(gate)
    expect(screen.queryByTestId('wb-flow-gatepop-review')).toBeNull()
  })

  it('点击门徽章不触发 onSelect（不与「选中阶段」语义冲突）', () => {
    const { onSelect } = renderRail()
    fireEvent.click(screen.getByTestId('wb-flow-gate-review'))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('点击外部区域收起钉住的 popover', () => {
    renderRail()
    fireEvent.click(screen.getByTestId('wb-flow-gate-review'))
    expect(screen.getByTestId('wb-flow-gatepop-review')).toBeInTheDocument()
    fireEvent.click(document.body)
    expect(screen.queryByTestId('wb-flow-gatepop-review')).toBeNull()
  })
})

// v6 T13 断言迁移登记：预演点亮态(litCount/--live)随 GSAP 假预演一并退役——载体是
// WorkbenchView 的预演控制,新「最近流转」为静态真实事件列表,无点亮语义可迁移。
describe('StepperRail 「+ 添加阶段」（验收反馈#4 已落地交互，本任务回归）', () => {
  it('传入 onAddStage：按钮可点，点击调用回调', () => {
    const onAddStage = vi.fn()
    renderRail({ onAddStage })
    const btn = screen.getByRole('button', { name: '+ 添加阶段' })
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    expect(onAddStage).toHaveBeenCalledTimes(1)
  })

  it('未传 onAddStage：按钮禁用态占位 + title 提示', () => {
    renderRail({ onAddStage: undefined })
    const btn = screen.getByRole('button', { name: '+ 添加阶段' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'default 工作流只读，复制为自定义工作流后可编辑')
  })
})
