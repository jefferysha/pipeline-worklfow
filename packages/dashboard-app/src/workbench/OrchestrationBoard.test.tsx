import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WbHookEvent, WbHookMeta } from '../api/client'
import { I18nProvider } from '../i18n'
import { LOCKED_IDS, type HooksConfigState } from './HookTimeline'
import { OrchestrationBoard, type BoardLane, type LanePatch } from './OrchestrationBoard'
import type { GateHookInfo } from './StepperRail'

afterEach(() => {
  window.localStorage.removeItem('tenon-dashboard-lang')
})

/**
 * OrchestrationBoard.test（P0：编排画布只读泳道骨架）—— 纯展示组件的独立单测，钉住
 * props→DOM 的渲染契约本身（泳道 data-* 状态、连接件 data-forward、门/计数/脉冲徽章、
 * 技能卡零截断、hook 段诚实占位、产出空态、选中回调）。契约见 p0-contract.md §1/§4。
 *
 * 本文件最高优先的守门项是「名称零截断」（契约 §0.1）：技能全名含命名空间前缀必须以
 * 完整文本落在 DOM 上，且名字节点不得带 truncate/text-ellipsis。fixture 刻意用长技能名
 * （superpowers:test-driven-development 等），P1-P4 任何人手滑加回截断都会在这里红。
 */

// fixture 覆盖矩阵（一条 lane 顶一组边界，避免用例间互相污染）：
//   plan   → count=0（无计数气泡）/ 有 forward / 无 gate / 有 hooks 段 / 长技能名 ×3 / 有产出
//            （3 个技能是刻意的：旧 StepperRail 只显 2 个 chip + 「+1」截断计数，本轮要消灭该反例，
//             技能数 >2 才能让「无 +N 截断计数」的反向断言真的有牙）
//   review → running=true（有脉冲）/ gate='review' / 有 forward / outputs 空（空态） / 长技能名
//   ship   → linkEvent=null（末列不画连接件）/ hooksCount=undefined（整段不渲染）/ skills 空
// 计数（5/4）刻意避开技能卡序号（1/2），避免同一数字断言同时命中两个概念。
const LANES: BoardLane[] = [
  {
    id: 'plan',
    name: '规划',
    gate: null,
    skills: [
      'superpowers:test-driven-development',
      'improve-codebase-architecture',
      'superpowers:brainstorming',
    ],
    outputs: ['plan_md', 'spec_md'],
    hooksCount: 8,
    hooksLocked: 2,
    linkEvent: 'submitted',
    count: 0,
    running: false,
  },
  {
    id: 'review',
    name: '人工复核',
    gate: 'review',
    skills: ['web-design-guidelines'],
    outputs: [],
    hooksCount: 8,
    hooksLocked: 2,
    linkEvent: 'approved',
    count: 5,
    running: true,
  },
  {
    id: 'ship',
    name: '发布',
    gate: null,
    skills: [],
    outputs: ['release_url'],
    hooksCount: undefined,
    hooksLocked: undefined,
    linkEvent: null,
    count: 4,
    running: false,
  },
]

// 门 popover 内容（静态 hook 元数据，行为自 StepperRail 移植）。
const GATE_HOOKS: GateHookInfo[] = [
  { id: 'gate', name: '门拦截', desc: '复核没过时，挡住技能调用与写文件' },
  { id: 'interactive-skill-gate', name: '技能解锁检查', desc: '依赖顺序没到的技能直接拦下' },
]

function renderBoard(overrides: Partial<Parameters<typeof OrchestrationBoard>[0]> = {}) {
  const onSelect = vi.fn()
  render(
    <I18nProvider>
      <OrchestrationBoard
        lanes={LANES}
        readonly={false}
        selectedId="plan"
        onSelect={onSelect}
        label="release-train 阶段"
        gateHooks={GATE_HOOKS}
        {...overrides}
      />
    </I18nProvider>,
  )
  return { onSelect }
}

/**
 * 取「名字节点」：卡内 textContent 恰好等于全名的最深一层元素。
 * 用 textContent 全等而非 getByText，是为了不对组件的包裹层级做多余假设——只要全名以
 * 完整、未被切断的文本存在，就必然有这样一个节点（其祖先因含序号等兄弟文本而不等）。
 */
function nameNodeOf(card: HTMLElement, fullName: string): HTMLElement {
  const hits = Array.from(card.querySelectorAll<HTMLElement>('*')).filter(
    (el) => el.textContent === fullName,
  )
  expect(hits.length, `技能全名「${fullName}」未以完整文本出现在卡内`).toBeGreaterThan(0)
  return hits[hits.length - 1]! // 文档序：祖先在前、后代在后 → 末项即最深的名字节点
}

describe('OrchestrationBoard 基础渲染（泳道数/名称/序号/aria）', () => {
  it('泳道数 = lanes 数，aria-label 透传到看板 grid，滚动容器在', () => {
    renderBoard()
    expect(screen.getByTestId('wb-board-scroll')).toBeInTheDocument()

    const stages = screen.getByTestId('wb-stages')
    expect(stages).toHaveAttribute('aria-label', 'release-train 阶段')
    expect(stages).toHaveAttribute('role', 'list')
    expect(within(stages).getAllByRole('listitem')).toHaveLength(LANES.length)
    expect(screen.getByLabelText('release-train 阶段')).toBe(stages)
  })

  it('每条泳道渲染其展示名（投影层算好的 name，组件零业务判断）', () => {
    renderBoard()
    for (const lane of LANES) {
      const el = screen.getByTestId(`wb-step-${lane.id}`)
      expect(el).toHaveAttribute('role', 'listitem')
      expect(within(el).getByText(lane.name)).toBeInTheDocument()
    }
  })

  it('技能卡按 skills 序渲染，卡内带 1..n 序号，一个不少', () => {
    renderBoard()
    const zone = screen.getByTestId('wb-lane-skills-plan')
    const a = within(zone).getByTestId('wb-lane-sk-plan-superpowers:test-driven-development')
    const b = within(zone).getByTestId('wb-lane-sk-plan-improve-codebase-architecture')
    const c = within(zone).getByTestId('wb-lane-sk-plan-superpowers:brainstorming')
    expect(within(a).getByText('1')).toBeInTheDocument()
    expect(within(b).getByText('2')).toBeInTheDocument()
    expect(within(c).getByText('3')).toBeInTheDocument()
    // 顺序 = skills 数组序
    expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(b.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('OrchestrationBoard 名称零截断（契约 §0.1 硬约束，本轮最高优先）', () => {
  it('技能全名含 superpowers: 命名空间前缀，以完整文本落在 DOM（textContent 全等）', () => {
    renderBoard()
    const card = screen.getByTestId('wb-lane-sk-plan-superpowers:test-driven-development')
    // 命名空间前缀是弱化的独立 span，但拼起来必须一字不差、无省略号
    expect(nameNodeOf(card, 'superpowers:test-driven-development').textContent).toBe(
      'superpowers:test-driven-development',
    )
    expect(card.textContent).toContain('superpowers:test-driven-development')
    expect(card.textContent).not.toContain('…')
    expect(card.textContent).not.toContain('...')
  })

  it('长技能名（无命名空间）同样全名直出，不做短名化/省略', () => {
    renderBoard()
    const long = screen.getByTestId('wb-lane-sk-plan-improve-codebase-architecture')
    expect(nameNodeOf(long, 'improve-codebase-architecture').textContent).toBe(
      'improve-codebase-architecture',
    )
    const wdg = screen.getByTestId('wb-lane-sk-review-web-design-guidelines')
    expect(nameNodeOf(wdg, 'web-design-guidelines').textContent).toBe('web-design-guidelines')
  })

  it('名字节点不带 truncate / text-ellipsis（反向断言：守产品硬约束，非视觉细节）', () => {
    renderBoard()
    const cases: Array<[string, string]> = [
      ['wb-lane-sk-plan-superpowers:test-driven-development', 'superpowers:test-driven-development'],
      ['wb-lane-sk-plan-improve-codebase-architecture', 'improve-codebase-architecture'],
      ['wb-lane-sk-review-web-design-guidelines', 'web-design-guidelines'],
    ]
    for (const [testid, fullName] of cases) {
      const node = nameNodeOf(screen.getByTestId(testid), fullName)
      expect(node.className).not.toContain('truncate')
      expect(node.className).not.toContain('text-ellipsis')
    }
  })

  it('整个看板不存在 truncate / text-ellipsis 节点（阶段名、产出名一并守住）', () => {
    renderBoard()
    const board = screen.getByTestId('wb-board-scroll')
    expect(board.querySelectorAll('.truncate, .text-ellipsis')).toHaveLength(0)
  })

  it('技能全列出，不出现旧 StepperRail 的「+N」截断计数（plan 有 3 个技能就渲 3 张卡）', () => {
    renderBoard()
    const zone = screen.getByTestId('wb-lane-skills-plan')
    // 旧板只显 2 个 chip + 「+1」；新板必须 3 张卡全在
    for (const sk of LANES[0]!.skills ?? []) {
      expect(within(zone).getByTestId(`wb-lane-sk-plan-${sk}`)).toBeInTheDocument()
    }
    expect(screen.queryByText('+1')).toBeNull()
    // 兜底：整板不得出现 +N 形态的「还有几个没显示」计数
    expect(screen.getByTestId('wb-board-scroll').textContent).not.toMatch(/\+\d+/)
  })

  it('阶段名与产出的中文业务名完整渲染，无省略号或技术字段', () => {
    renderBoard()
    expect(within(screen.getByTestId('wb-step-review')).getByText('人工复核')).toBeInTheDocument()
    const outs = screen.getByTestId('wb-lane-outs-plan')
    expect(within(outs).getByText('阶段计划')).toBeInTheDocument()
    expect(within(outs).getByText('需求规格')).toBeInTheDocument()
    expect(outs).not.toHaveTextContent('plan_md')
    expect(outs).not.toHaveTextContent('spec_md')
  })
})

describe('OrchestrationBoard 连接件（data-forward：边不存在就不画）', () => {
  it('有 linkEvent 的列 data-forward = 事件名', () => {
    renderBoard()
    expect(screen.getByTestId('wb-step-plan')).toHaveAttribute('data-forward', 'submitted')
    expect(screen.getByTestId('wb-step-review')).toHaveAttribute('data-forward', 'approved')
  })

  it('linkEvent=null 的末列没有 data-forward 属性（无 forward 边 = 不画连接件）', () => {
    renderBoard()
    expect(screen.getByTestId('wb-step-ship')).not.toHaveAttribute('data-forward')
  })
})

describe('OrchestrationBoard 门徽章（data-gated）', () => {
  it('gate=null 的列不渲染门徽章、不带 data-gated', () => {
    renderBoard()
    expect(screen.queryByTestId('wb-flow-gate-plan')).toBeNull()
    expect(screen.getByTestId('wb-step-plan')).not.toHaveAttribute('data-gated')
    expect(screen.queryByTestId('wb-flow-gate-ship')).toBeNull()
    expect(screen.getByTestId('wb-step-ship')).not.toHaveAttribute('data-gated')
  })

  it("gate='review' 的列渲染“离开前复核”且泳道带 data-gated", () => {
    renderBoard()
    expect(screen.getByTestId('wb-flow-gate-review')).toHaveTextContent('离开前复核')
    expect(screen.getByTestId('wb-step-review')).toHaveAttribute('data-gated')
    // 无门的列不得出现门文案
    expect(within(screen.getByTestId('wb-step-plan')).queryByText('离开前复核')).toBeNull()
  })

  it("gate='confirm' 渲染「需要确认」徽章", () => {
    renderBoard({ lanes: [{ ...LANES[1]!, id: 'confirm-lane', gate: 'confirm' }] })
    expect(screen.getByTestId('wb-flow-gate-confirm-lane')).toHaveTextContent('需要确认')
    expect(screen.getByTestId('wb-step-confirm-lane')).toHaveAttribute('data-gated')
  })
})

describe('OrchestrationBoard 门徽章 popover（行为自 StepperRail 移植）', () => {
  it('English locale covers the gate badge and its hidden popover explanation', () => {
    window.localStorage.setItem('tenon-dashboard-lang', 'en')
    renderBoard()
    const gate = screen.getByTestId('wb-flow-gate-review')
    expect(gate).toHaveTextContent('Review before leaving')
    fireEvent.mouseEnter(gate)
    expect(screen.getByTestId('wb-flow-gatepop-review')).toHaveTextContent(
      'Before leaving this phase, the system runs the built-in checks below.',
    )
  })

  it('默认不展示 popover；hover 门徽章展示 gateHooks 内容，移出后收起', () => {
    renderBoard()
    const gate = screen.getByTestId('wb-flow-gate-review')
    expect(screen.queryByTestId('wb-flow-gatepop-review')).toBeNull()

    fireEvent.mouseEnter(gate)
    const pop = screen.getByTestId('wb-flow-gatepop-review')
    expect(within(pop).getByText('门拦截')).toBeInTheDocument()
    expect(within(pop).getByText('技能解锁检查')).toBeInTheDocument()

    fireEvent.mouseLeave(gate)
    expect(screen.queryByTestId('wb-flow-gatepop-review')).toBeNull()
  })

  it('点击门徽章钉住展示（不受 mouseLeave 影响），且不触发 onSelect（与「选中阶段」语义不冲突）', () => {
    const { onSelect } = renderBoard()
    const gate = screen.getByTestId('wb-flow-gate-review')
    fireEvent.click(gate)
    expect(screen.getByTestId('wb-flow-gatepop-review')).toBeInTheDocument()
    fireEvent.mouseLeave(gate)
    expect(screen.getByTestId('wb-flow-gatepop-review')).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('OrchestrationBoard 「+ 添加阶段」（P0 只读骨架里的编辑入口占位）', () => {
  it('传入 onAddStage：按钮可点，点击调用回调', () => {
    const onAddStage = vi.fn()
    renderBoard({ onAddStage })
    const btn = screen.getByRole('button', { name: '+ 添加阶段' })
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    expect(onAddStage).toHaveBeenCalledTimes(1)
  })

  it('未传 onAddStage：不渲染假按钮（default 只读语境）', () => {
    renderBoard({ onAddStage: undefined })
    expect(screen.queryByRole('button', { name: '+ 添加阶段' })).toBeNull()
  })
})

describe('OrchestrationBoard Hook 摘要段（诚实占位，不谎报数字）', () => {
  it('hooksCount 为 undefined → 整个 wb-lane-hooks-* 段不渲染', () => {
    renderBoard()
    expect(screen.queryByTestId('wb-lane-hooks-ship')).toBeNull()
  })

  it('hooksCount 就绪 → 用人话渲染总数，不展示“开/锁”术语', () => {
    renderBoard()
    const row = screen.getByTestId('wb-lane-hooks-plan')
    expect(row).toHaveTextContent('自动检查')
    expect(row).toHaveTextContent('10 项')
    expect(row).not.toHaveTextContent('开')
    expect(row).not.toHaveTextContent('锁')
  })
})

describe('OrchestrationBoard 运行信号', () => {
  it('工作流编辑器不混入实时任务计数', () => {
    renderBoard()
    expect(screen.queryByTestId('wb-flow-count-plan')).toBeNull()
    expect(screen.queryByTestId('wb-flow-count-review')).toBeNull()
    expect(screen.queryByTestId('wb-flow-count-ship')).toBeNull()
  })

  it('running=true 才渲染脉冲承载元素，且带 data-anim="wb-gloss" 供 GSAP 选中', () => {
    renderBoard()
    expect(screen.queryByTestId('wb-flow-gloss-plan')).toBeNull()
    expect(screen.queryByTestId('wb-flow-gloss-ship')).toBeNull()
    const gloss = screen.getByTestId('wb-flow-gloss-review')
    expect(gloss).toHaveAttribute('data-anim', 'wb-gloss')
    expect(gloss).not.toHaveClass('opacity-0')
  })
})

describe('OrchestrationBoard 技能区诚实占位（skills undefined ≠ 空）', () => {
  /**
   * 诚实门回归守门：default 的 workflow 定义里 skills 恒为空数组，但它真实的强制技能在
   * manifest 的 phase.track 矩阵（GET /api/config）里——若把 [] 喂进来渲染「（空）」，
   * 界面就在谎报「该阶段无技能」。故约定 undefined = 本数据源不描述技能 → 整段不渲染
   * （与 hooksCount 同款纪律）。P1 接入 manifest 矩阵后改喂真集合。
   */
  it('skills=undefined → 整个 wb-lane-skills-* 段不渲染（不谎报「（空）」）', () => {
    renderBoard({ lanes: LANES.map((l) => ({ ...l, skills: undefined })) })
    for (const lane of LANES) {
      expect(screen.queryByTestId(`wb-lane-skills-${lane.id}`)).toBeNull()
    }
    expect(screen.queryByText('（空）')).toBeNull()
  })

  it('skills=[] → 渲染「（空）」（自定义 workflow 的真实空态，与 undefined 区分）', () => {
    renderBoard({ lanes: LANES.map((l) => ({ ...l, skills: [] })) })
    const zone = screen.getByTestId(`wb-lane-skills-${LANES[0]!.id}`)
    expect(zone).toHaveTextContent('（空）')
  })
})

describe('OrchestrationBoard 只读态（readonly = default workflow 满屏 🔒）', () => {
  it('readonly=true → 每列都有锁徽章且泳道带 data-locked', () => {
    renderBoard({ readonly: true })
    for (const lane of LANES) {
      const lock = screen.getByTestId(`wb-lane-lock-${lane.id}`)
      expect(lock).toHaveTextContent('固定')
      expect(lock).not.toHaveTextContent('🔒')
      expect(lock.querySelector('svg')).not.toBeNull()
      expect(screen.getByTestId(`wb-step-${lane.id}`)).toHaveAttribute('data-locked')
    }
  })

  it('readonly=false → 无锁徽章、无 data-locked', () => {
    renderBoard()
    for (const lane of LANES) {
      expect(screen.queryByTestId(`wb-lane-lock-${lane.id}`)).toBeNull()
      expect(screen.getByTestId(`wb-step-${lane.id}`)).not.toHaveAttribute('data-locked')
    }
  })
})

describe('OrchestrationBoard 选中（aria-current / data-state 与 onSelect）', () => {
  it('选中列 aria-current="step" + data-state="current"；未选中列不带 aria-current', () => {
    renderBoard()
    const plan = screen.getByTestId('wb-step-plan')
    expect(plan).toHaveAttribute('aria-current', 'step')
    expect(plan).toHaveAttribute('data-state', 'current')
    // 反例：未选中列一律不得有 aria-current（含 running 列）
    expect(screen.getByTestId('wb-step-review')).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('wb-step-review')).toHaveAttribute('data-state', 'running')
    expect(screen.getByTestId('wb-step-ship')).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('wb-step-ship')).toHaveAttribute('data-state', 'idle')
  })

  it('running 且被选中 → aria-current="step" + data-state="current"（多态时 selected 优先）', () => {
    renderBoard({ selectedId: 'review' })
    const review = screen.getByTestId('wb-step-review')
    expect(review).toHaveAttribute('aria-current', 'step')
    expect(review).toHaveAttribute('data-state', 'current')
    expect(screen.getByTestId('wb-step-plan')).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('wb-step-plan')).toHaveAttribute('data-state', 'idle')
  })

  it('selectedId=null → 无列带 aria-current，无 current 态', () => {
    renderBoard({ selectedId: null })
    for (const lane of LANES) {
      expect(screen.getByTestId(`wb-step-${lane.id}`)).not.toHaveAttribute('aria-current')
    }
    expect(screen.getByTestId('wb-step-plan')).toHaveAttribute('data-state', 'idle')
    expect(screen.getByTestId('wb-step-review')).toHaveAttribute('data-state', 'running')
  })

  it('点击泳道头 → onSelect 收到该 lane id', () => {
    const { onSelect } = renderBoard()
    fireEvent.click(within(screen.getByTestId('wb-step-ship')).getByText('发布'))
    expect(onSelect).toHaveBeenCalledWith('ship')
  })

  it('泳道头是真 <button>（键盘可达，非 div+onClick）', () => {
    renderBoard()
    const head = within(screen.getByTestId('wb-step-review')).getByText('人工复核').closest('button')
    expect(head).not.toBeNull()
    fireEvent.click(head!)
    // 键盘可达性由原生 button 语义保证：回车/空格 → click
    expect(head!.tagName).toBe('BUTTON')
  })
})

describe('OrchestrationBoard 产出区（空态诚实占位）', () => {
  it('默认契约字段只展示中文业务名，技术字段仅保留在 hover 说明中', () => {
    renderBoard({
      readonly: true,
      lanes: [{ ...LANES[0]!, outputs: ['design_doc', 'plan', 'build_sha', 'verification_report'] }],
    })
    const zone = screen.getByTestId('wb-lane-outs-plan')
    for (const label of ['调研文档', '实施计划', '构建基线', '验证报告']) {
      expect(within(zone).getByText(label)).toBeInTheDocument()
    }
    expect(zone).not.toHaveTextContent('design_doc')
    expect(zone).not.toHaveTextContent('verification_report')
    expect(within(zone).getByText('调研文档')).toHaveAttribute('title', '记录调研结论、约束与设计依据。')
    expect(within(zone).getByText('调研文档')).not.toHaveAttribute('title', expect.stringContaining('design_doc'))
  })

  it('outputs 非空 → 产出区列出全部中文业务名，无空态占位', () => {
    renderBoard()
    const outs = screen.getByTestId('wb-lane-outs-plan')
    expect(within(outs).getByText('阶段计划')).toBeInTheDocument()
    expect(within(outs).getByText('需求规格')).toBeInTheDocument()
    expect(screen.queryByTestId('wb-lane-outs-empty-plan')).toBeNull()
  })

  it('outputs 为空 → 渲染 wb-lane-outs-empty-*', () => {
    renderBoard()
    expect(screen.getByTestId('wb-lane-outs-empty-review')).toBeInTheDocument()
    expect(screen.queryByTestId('wb-lane-outs-empty-plan')).toBeNull()
    expect(screen.queryByTestId('wb-lane-outs-empty-ship')).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════
// P1（契约 p1-contract.md §2 + §4.1~§4.6）：阶段名 / 门 / 产出真可编 + 删阶段入口
// ══════════════════════════════════════════════════════════════════════════

/**
 * P1 编辑面 fixture（**刻意与 P0 的 LANES 分开**）：
 *   ① P0 的 LANES 被上面 33 条既有断言按名字/字段逐字钉着，改它等于同时改 P0 的契约；
 *   ② 零截断断言要有牙，就得让阶段名与产出名**真的长**——P0 的「规划」「plan_md」再怎么
 *      truncate 也切不掉，测不出东西。故这里的阶段名/产出名一律取真实工程里那种长度。
 * 覆盖矩阵（一列顶一组边界）：
 *   plan         → gate=null（二态的「开门」侧）/ 长阶段名 / 长产出名 ×2
 *   review       → gate='review'（二态的「关门」侧）/ outputs 空
 *   confirm-lane → gate='confirm'（default 读回来的第三个值：只读显示，编辑时只能关，永不发出）
 */
const EDIT_LANES: BoardLane[] = [
  {
    id: 'plan',
    name: '需求澄清与技术方案评审',
    gate: null,
    skills: ['superpowers:test-driven-development'],
    outputs: ['architecture_decision_record_md', 'spec_md'],
    hooksCount: 8,
    hooksLocked: 2,
    linkEvent: 'submitted',
    count: 0,
    running: false,
  },
  {
    id: 'review',
    name: '人工复核',
    gate: 'review',
    skills: [],
    outputs: [],
    hooksCount: 8,
    hooksLocked: 2,
    linkEvent: 'approved',
    count: 5,
    running: true,
  },
  {
    id: 'confirm-lane',
    name: '上线确认',
    gate: 'confirm',
    skills: [],
    outputs: ['release_url'],
    hooksCount: undefined,
    hooksLocked: undefined,
    linkEvent: null,
    count: 0,
    running: false,
  },
]

/** 可编态渲染（宿主真给了 onLaneEdit/onRemoveStage 且 readonly=false）。 */
function renderEditable(overrides: Partial<Parameters<typeof OrchestrationBoard>[0]> = {}) {
  const onSelect = vi.fn()
  const onLaneEdit = vi.fn()
  const onRemoveStage = vi.fn()
  render(
    <I18nProvider>
      <OrchestrationBoard
        lanes={EDIT_LANES}
        readonly={false}
        selectedId="plan"
        onSelect={onSelect}
        label="release-train 阶段"
        gateHooks={GATE_HOOKS}
        onLaneEdit={onLaneEdit}
        onRemoveStage={onRemoveStage}
        {...overrides}
      />
    </I18nProvider>,
  )
  return { onSelect, onLaneEdit, onRemoveStage }
}

describe('OrchestrationBoard P1 §4.1 诚实门：不给回调 = 一个编辑入口都不长', () => {
  it('onLaneEdit / onRemoveStage 不传（default 语境）→ 名字不可编、无产出 ×/+、无删阶段入口', () => {
    renderEditable({ onLaneEdit: undefined, onRemoveStage: undefined, readonly: true })
    for (const lane of EDIT_LANES) {
      expect(screen.queryByTestId(`wb-lane-name-${lane.id}`)).toBeNull()
      expect(screen.queryByTestId(`wb-lane-name-input-${lane.id}`)).toBeNull()
      expect(screen.queryByTestId(`wb-lane-out-add-${lane.id}`)).toBeNull()
      expect(screen.queryByTestId(`wb-lane-rm-${lane.id}`)).toBeNull()
      for (const o of lane.outputs) {
        expect(screen.queryByTestId(`wb-lane-out-rm-${lane.id}-${o}`)).toBeNull()
      }
    }
    // 产出区徽章如实标「固定」，锁状态由矢量图标辅助表达。
    expect(screen.getByTestId('wb-lane-outs-plan')).toHaveTextContent('固定')
  })

  it('onLaneEdit 不传 → 点阶段名不进编辑态（名字仍是纯显示节点，点它只选中该列）', () => {
    const { onSelect } = renderEditable({ onLaneEdit: undefined, onRemoveStage: undefined, readonly: true })
    fireEvent.click(within(screen.getByTestId('wb-step-plan')).getByText('需求澄清与技术方案评审'))
    expect(screen.queryByTestId('wb-lane-name-input-plan')).toBeNull()
    expect(onSelect).toHaveBeenCalledWith('plan')
  })

  /**
   * ⚠️ 与契约 §2/§4.2 的字面口径有出入，**以代码为准**（OrchestrationBoard.tsx:41-52，
   * 2026-07-15「真机截图复核后的收口」，注释里明写「别再改回去」）：契约说只读态门开关
   * 「disabled + 解释」，实现改成**只读态一个开关都不渲染**。契约 §0.6 的「禁用 + 解释」
   * 是**允许**写法而非**要求**——该列已有「复核门」徽章（状态读数）+「🔒 固定」徽章
   * （为什么不能改）+ hover popover（为什么这门必然在），禁用开关不提供任何新信息。
   * 故本组用例钉的是「只读 = 零控件 + 解释信息一个不丢」，而不是「禁用控件在场」。
   */
  it('onLaneEdit 不传 → 一列都不长门开关（含已有门的列），但门徽章/锁徽章/popover 一个不丢', () => {
    renderEditable({ onLaneEdit: undefined, onRemoveStage: undefined, readonly: true })
    for (const lane of EDIT_LANES) {
      expect(screen.queryByTestId(`wb-lane-gate-sw-${lane.id}`)).toBeNull()
    }
    expect(screen.queryByRole('switch')).toBeNull()
    // 「有没有门」「为什么不能改」「这门是什么」三件事仍被说全（v6 T11 的 popover 原样保留）
    expect(screen.getByTestId('wb-flow-gate-review')).toHaveTextContent('离开前复核')
    expect(screen.getByTestId('wb-lane-lock-review')).toHaveTextContent('固定')
    fireEvent.mouseEnter(screen.getByTestId('wb-flow-gate-review'))
    expect(within(screen.getByTestId('wb-flow-gatepop-review')).getByText('门拦截')).toBeInTheDocument()
    // 没门的只读列：既无开关也无门徽章、也不出「未设复核门」读数（不谎报，也不留假入口）
    expect(screen.queryByTestId('wb-flow-gate-plan')).toBeNull()
    expect(within(screen.getByTestId('wb-step-plan')).queryByText('未设复核门')).toBeNull()
  })

  it('readonly=true 但宿主误传了 onLaneEdit/onRemoveStage → 仍全锁（两条件任一不成立即锁死）', () => {
    const { onLaneEdit, onRemoveStage } = renderEditable({ readonly: true })
    expect(screen.queryByTestId('wb-lane-name-plan')).toBeNull()
    expect(screen.queryByTestId('wb-lane-out-add-plan')).toBeNull()
    expect(screen.queryByTestId('wb-lane-out-rm-plan-spec_md')).toBeNull()
    expect(screen.queryByTestId('wb-lane-rm-plan')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
    // 只读态还剩的可点节点（泳道根 / 门徽章）逐个点过，一发编辑补丁都不许漏出去
    fireEvent.click(screen.getByTestId('wb-step-plan'))
    fireEvent.click(screen.getByTestId('wb-flow-gate-review'))
    expect(onLaneEdit).not.toHaveBeenCalled()
    expect(onRemoveStage).not.toHaveBeenCalled()
  })
})

describe('OrchestrationBoard P1 §4.2 门二态（null ↔ review，绝不长第三态）', () => {
  it('门开关是 role="switch" + aria-checked 承载状态（同 wb-ed-gate-sw 控件词汇）', () => {
    renderEditable()
    const off = screen.getByTestId('wb-lane-gate-sw-plan')
    expect(off).toHaveAttribute('role', 'switch')
    expect(off).toHaveAttribute('aria-checked', 'false')
    expect(off).toBeEnabled()
    expect(screen.getByTestId('wb-lane-gate-sw-review')).toHaveAttribute('aria-checked', 'true')
    // 关门态补一个状态读数，且刻意不写「复核门」（没门的列写「复核门」= 谎报有门）
    expect(within(screen.getByTestId('wb-step-plan')).getByText('未设复核门')).toBeInTheDocument()
    expect(screen.queryByTestId('wb-flow-gate-plan')).toBeNull()
  })

  it('gate=null → 点开关 → patch { gate: "review" }（开门）', () => {
    const { onLaneEdit } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-gate-sw-plan'))
    expect(onLaneEdit).toHaveBeenCalledTimes(1)
    expect(onLaneEdit).toHaveBeenCalledWith('plan', { gate: 'review' })
  })

  it("gate='review' → 点开关 → patch { gate: null }（关门）", () => {
    const { onLaneEdit } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-gate-sw-review'))
    expect(onLaneEdit).toHaveBeenCalledWith('review', { gate: null })
  })

  it("二态不是三态：逐列点开关，发出的 gate 只有 'review' / null，绝无 'confirm'", () => {
    const { onLaneEdit } = renderEditable()
    for (const lane of EDIT_LANES) fireEvent.click(screen.getByTestId(`wb-lane-gate-sw-${lane.id}`))
    const gates = onLaneEdit.mock.calls.map((c) => (c[1] as LanePatch).gate)
    // plan(null→review) / review(review→null) / confirm-lane(confirm→null，读回来的 confirm 只能被关掉)
    expect(gates).toEqual(['review', null, null])
    expect(gates).not.toContain('confirm')
  })

  it('patch 只含被改字段（gate 单键，不夹带 label/outputs）', () => {
    const { onLaneEdit } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-gate-sw-plan'))
    expect(Object.keys(onLaneEdit.mock.calls[0]![1] as object)).toEqual(['gate'])
  })

  it('点门开关不触发 onSelect（stopPropagation 后不与「点泳道 = 选中」互相误触）', () => {
    const { onSelect } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-gate-sw-review'))
    expect(onSelect).not.toHaveBeenCalled()
  })

  /**
   * 契约 §4.2 后半句原文是「default 的 'confirm' 只读显示「确认门」徽章且开关 disabled」——
   * 实现按 2026-07-15 的收口改为「只读态不渲染开关」（理由见上一组 describe 的注释）。
   * 被守的产品事实不变：confirm 只读可见、且没有任何能改它的控件。
   */
  it("default 只读：'confirm' 只读显示「需要确认」徽章 + 🔒 固定，且不渲染门开关（不做假控件）", () => {
    const { onLaneEdit } = renderEditable({ readonly: true })
    expect(screen.getByTestId('wb-flow-gate-confirm-lane')).toHaveTextContent('需要确认')
    expect(screen.getByTestId('wb-step-confirm-lane')).toHaveAttribute('data-gated')
    expect(screen.getByTestId('wb-lane-lock-confirm-lane')).toHaveTextContent('固定')
    expect(screen.queryByTestId('wb-lane-gate-sw-confirm-lane')).toBeNull()
    // 徽章 popover 仍可用（只读不等于哑巴），且点它不会漏出编辑补丁
    fireEvent.click(screen.getByTestId('wb-flow-gate-confirm-lane'))
    expect(screen.getByTestId('wb-flow-gatepop-confirm-lane')).toBeInTheDocument()
    expect(onLaneEdit).not.toHaveBeenCalled()
  })

  it("可编态：读回来的 'confirm' 门开关是开的（aria-checked=true）+ 徽章仍显示「需要确认」", () => {
    renderEditable()
    const sw = screen.getByTestId('wb-lane-gate-sw-confirm-lane')
    expect(sw).toBeEnabled()
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('wb-flow-gate-confirm-lane')).toHaveTextContent('需要确认')
  })
})

describe('OrchestrationBoard P1 §4.3 产出增删（校验规则与 StepEditor 同源，不许分叉）', () => {
  it('产出 chip × → patch outputs = 剩余字段（其余原序保留）', () => {
    const { onLaneEdit } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-out-rm-plan-architecture_decision_record_md'))
    expect(onLaneEdit).toHaveBeenCalledWith('plan', { outputs: ['spec_md'] })
    expect(Object.keys(onLaneEdit.mock.calls[0]![1] as object)).toEqual(['outputs'])
  })

  it('「+ 产出」→ 输入 → Enter → patch outputs 追加在末尾，输入框收起', () => {
    const { onLaneEdit } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-out-add-plan'))
    const input = screen.getByTestId('wb-lane-out-input-plan')
    expect(input).toHaveAttribute('placeholder', '字段名')
    fireEvent.change(input, { target: { value: 'review_notes_md' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onLaneEdit).toHaveBeenCalledWith('plan', {
      outputs: ['architecture_decision_record_md', 'spec_md', 'review_notes_md'],
    })
    expect(screen.queryByTestId('wb-lane-out-input-plan')).toBeNull()
    expect(screen.getByTestId('wb-lane-out-add-plan')).toBeInTheDocument()
  })

  it('空产出列（outputs=[]）也能加：patch 为单元素数组', () => {
    const { onLaneEdit } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-out-add-review'))
    const input = screen.getByTestId('wb-lane-out-input-review')
    fireEvent.change(input, { target: { value: 'A-b_9' } }) // 合法字符集全谱：大小写 + 数字 + - + _
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onLaneEdit).toHaveBeenCalledWith('review', { outputs: ['A-b_9'] })
    expect(screen.queryByTestId('wb-lane-out-err-review')).toBeNull()
  })

  it('非法字符（FIELD_RE=/^[a-zA-Z0-9_-]+$/）→ 拒 + 错误提示，输入框保持打开且 aria-invalid', () => {
    const { onLaneEdit } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-out-add-plan'))
    const input = screen.getByTestId('wb-lane-out-input-plan')
    fireEvent.change(input, { target: { value: 'bad field!' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onLaneEdit).not.toHaveBeenCalled()
    // 错误文案 = StepEditor 的既有 i18n key（workbench.ed_output_invalid），不自造
    expect(screen.getByTestId('wb-lane-out-err-plan')).toHaveTextContent('非法字段名（仅允许 a-z A-Z 0-9 - _）')
    expect(screen.getByTestId('wb-lane-out-input-plan')).toHaveAttribute('aria-invalid', 'true')
  })

  it('重名 → 拒 + 「字段已存在」（workbench.ed_output_dup），不发 patch', () => {
    const { onLaneEdit } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-out-add-plan'))
    const input = screen.getByTestId('wb-lane-out-input-plan')
    fireEvent.change(input, { target: { value: 'spec_md' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onLaneEdit).not.toHaveBeenCalled()
    expect(screen.getByTestId('wb-lane-out-err-plan')).toHaveTextContent('字段已存在')
  })

  it('改一个字即清错（重新输入合法值可再提交）', () => {
    const { onLaneEdit } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-out-add-plan'))
    const input = screen.getByTestId('wb-lane-out-input-plan')
    fireEvent.change(input, { target: { value: 'spec_md' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByTestId('wb-lane-out-err-plan')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'spec_v2_md' } })
    expect(screen.queryByTestId('wb-lane-out-err-plan')).toBeNull()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onLaneEdit).toHaveBeenCalledWith('plan', {
      outputs: ['architecture_decision_record_md', 'spec_md', 'spec_v2_md'],
    })
  })

  it('Esc 取消 / 空值提交视同取消 → 都不发 patch 且收起输入框（同 StepEditor commitAdd 口径）', () => {
    const { onLaneEdit } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-out-add-plan'))
    fireEvent.change(screen.getByTestId('wb-lane-out-input-plan'), { target: { value: 'notes' } })
    fireEvent.keyDown(screen.getByTestId('wb-lane-out-input-plan'), { key: 'Escape' })
    expect(onLaneEdit).not.toHaveBeenCalled()
    expect(screen.queryByTestId('wb-lane-out-input-plan')).toBeNull()

    fireEvent.click(screen.getByTestId('wb-lane-out-add-plan'))
    fireEvent.change(screen.getByTestId('wb-lane-out-input-plan'), { target: { value: '   ' } })
    fireEvent.keyDown(screen.getByTestId('wb-lane-out-input-plan'), { key: 'Enter' })
    expect(onLaneEdit).not.toHaveBeenCalled()
    expect(screen.queryByTestId('wb-lane-out-input-plan')).toBeNull()
  })
})

describe('OrchestrationBoard P1 §4.4 阶段名就地编辑（Enter 提交 / Esc 取消 / 空名不提交）', () => {
  it('点名字 → 输入框带原值出现（显示态收起）', () => {
    renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-name-plan'))
    const input = screen.getByTestId('wb-lane-name-input-plan')
    expect(input).toHaveValue('需求澄清与技术方案评审')
    expect(screen.queryByTestId('wb-lane-name-plan')).toBeNull()
  })

  it('Enter 提交 → patch { label } 单键，收起输入框', () => {
    const { onLaneEdit } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-name-plan'))
    const input = screen.getByTestId('wb-lane-name-input-plan')
    fireEvent.change(input, { target: { value: '需求澄清与架构决策评审' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onLaneEdit).toHaveBeenCalledWith('plan', { label: '需求澄清与架构决策评审' })
    expect(Object.keys(onLaneEdit.mock.calls[0]![1] as object)).toEqual(['label'])
    expect(screen.queryByTestId('wb-lane-name-input-plan')).toBeNull()
    expect(screen.getByTestId('wb-lane-name-plan')).toBeInTheDocument()
  })

  it('Esc 取消 → 不发 patch，草稿丢弃（显示态回落原值）', () => {
    const { onLaneEdit } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-name-plan'))
    const input = screen.getByTestId('wb-lane-name-input-plan')
    fireEvent.change(input, { target: { value: '改了一半就反悔' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onLaneEdit).not.toHaveBeenCalled()
    expect(screen.queryByTestId('wb-lane-name-input-plan')).toBeNull()
    expect(screen.getByTestId('wb-lane-name-plan')).toHaveTextContent('需求澄清与技术方案评审')
  })

  it('空名 / 纯空白不提交（回落原值），输入框收起', () => {
    const { onLaneEdit } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-name-plan'))
    fireEvent.change(screen.getByTestId('wb-lane-name-input-plan'), { target: { value: '' } })
    fireEvent.keyDown(screen.getByTestId('wb-lane-name-input-plan'), { key: 'Enter' })
    expect(onLaneEdit).not.toHaveBeenCalled()
    expect(screen.getByTestId('wb-lane-name-plan')).toHaveTextContent('需求澄清与技术方案评审')

    fireEvent.click(screen.getByTestId('wb-lane-name-plan'))
    fireEvent.change(screen.getByTestId('wb-lane-name-input-plan'), { target: { value: '   ' } })
    fireEvent.keyDown(screen.getByTestId('wb-lane-name-input-plan'), { key: 'Enter' })
    expect(onLaneEdit).not.toHaveBeenCalled()
  })

  it('失焦 = 提交（有改动才发；原样点开再失焦不发 patch，否则点一下名字就把 workflow 标脏）', () => {
    const { onLaneEdit } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-name-plan'))
    fireEvent.blur(screen.getByTestId('wb-lane-name-input-plan'))
    expect(onLaneEdit).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('wb-lane-name-plan'))
    fireEvent.change(screen.getByTestId('wb-lane-name-input-plan'), { target: { value: '技术方案评审' } })
    fireEvent.blur(screen.getByTestId('wb-lane-name-input-plan'))
    expect(onLaneEdit).toHaveBeenCalledWith('plan', { label: '技术方案评审' })
  })
})

describe('OrchestrationBoard P1 §4.5 删阶段（先确认 Dialog，确认后才回调）', () => {
  it('点删除入口 → 先出确认 Dialog（含阶段名与副作用说明），此时不触发 onRemoveStage', () => {
    const { onRemoveStage } = renderEditable()
    expect(screen.queryByTestId('wb-lane-rm-confirm')).toBeNull()
    fireEvent.click(screen.getByTestId('wb-lane-rm-plan'))
    const dlg = screen.getByTestId('wb-lane-rm-confirm')
    expect(within(dlg).getByRole('dialog')).toHaveAttribute('aria-label', '删除阶段「需求澄清与技术方案评审」？')
    expect(dlg).toHaveTextContent('指向它的转换边会重连到它的下一阶段')
    expect(onRemoveStage).not.toHaveBeenCalled()
  })

  it('Dialog 确认 → onRemoveStage 收到 lane id，弹窗收起', () => {
    const { onRemoveStage } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-rm-plan'))
    fireEvent.click(screen.getByTestId('wb-lane-rm-ok'))
    expect(onRemoveStage).toHaveBeenCalledTimes(1)
    expect(onRemoveStage).toHaveBeenCalledWith('plan')
    expect(screen.queryByTestId('wb-lane-rm-confirm')).toBeNull()
  })

  it('Dialog 取消 → 不触发 onRemoveStage，弹窗收起', () => {
    const { onRemoveStage } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-rm-plan'))
    fireEvent.click(within(screen.getByTestId('wb-lane-rm-confirm')).getByRole('button', { name: '取消' }))
    expect(onRemoveStage).not.toHaveBeenCalled()
    expect(screen.queryByTestId('wb-lane-rm-confirm')).toBeNull()
    // 取消后再删别的列，弹窗认的是新的那列
    fireEvent.click(screen.getByTestId('wb-lane-rm-review'))
    fireEvent.click(screen.getByTestId('wb-lane-rm-ok'))
    expect(onRemoveStage).toHaveBeenCalledWith('review')
  })

  it('走共享 <Dialog>（role=dialog + Esc 可退）而非原生 confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const { onRemoveStage } = renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-rm-plan'))
    expect(confirmSpy).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('wb-lane-rm-confirm')).toBeNull()
    expect(onRemoveStage).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('删除入口不触发 onSelect（stopPropagation），且 aria-label 带阶段归属（N 列间唯一）', () => {
    const { onSelect } = renderEditable()
    const rm = screen.getByTestId('wb-lane-rm-plan')
    expect(rm).toHaveAttribute('aria-label', '删除阶段 · 需求澄清与技术方案评审')
    fireEvent.click(rm)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('OrchestrationBoard P1 §4.6 零截断回归（编辑态输入框，契约 §0.1 延续到编辑面）', () => {
  it('阶段名输入框：长名完整可编、无 truncate/text-ellipsis、宽度随内容自适应（原生 size）', () => {
    renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-name-plan'))
    const input = screen.getByTestId<HTMLInputElement>('wb-lane-name-input-plan')
    expect(input.value).toBe('需求澄清与技术方案评审')
    // 反向断言（契约明许的唯一视觉类名例外）：守的是「名称零截断」这条产品硬约束
    expect(input.className).not.toContain('truncate')
    expect(input.className).not.toContain('text-ellipsis')
    // 定宽 + overflow 也是同一条约束的破法：宽度必须由内容长度算出来
    expect(input.size).toBeGreaterThanOrEqual(input.value.length)
  })

  it('产出输入框：长字段名输入到底不被切，无 truncate，size 跟着草稿长', () => {
    renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-out-add-plan'))
    const input = screen.getByTestId<HTMLInputElement>('wb-lane-out-input-plan')
    fireEvent.change(input, { target: { value: 'architecture_decision_record_v2_md' } })
    expect(input.value).toBe('architecture_decision_record_v2_md')
    expect(input.className).not.toContain('truncate')
    expect(input.className).not.toContain('text-ellipsis')
    expect(input.size).toBeGreaterThanOrEqual('architecture_decision_record_v2_md'.length)
  })

  it('编辑态整板仍无 truncate / text-ellipsis 节点，长产出名 chip 与长技能名全名直出', () => {
    renderEditable()
    fireEvent.click(screen.getByTestId('wb-lane-name-plan'))
    fireEvent.click(screen.getByTestId('wb-lane-out-add-plan'))
    const board = screen.getByTestId('wb-board-scroll')
    expect(board.querySelectorAll('.truncate, .text-ellipsis')).toHaveLength(0)
    expect(board.textContent).not.toContain('…')
    expect(board.textContent).not.toContain('...')
    // 长技术字段只以中文业务名展示；× 钮长出来后仍是直接文本子节点。
    const outs = screen.getByTestId('wb-lane-outs-plan')
    expect(within(outs).getByText('技术决策记录')).toBeInTheDocument()
    expect(outs).not.toHaveTextContent('architecture_decision_record_md')
    // 长技能名（含命名空间）在编辑态一并守住
    const sk = screen.getByTestId('wb-lane-sk-plan-superpowers:test-driven-development')
    expect(nameNodeOf(sk, 'superpowers:test-driven-development').textContent).toBe(
      'superpowers:test-driven-development',
    )
  })
})

describe('OrchestrationBoard P1 宿主插槽（renderSkillZone / toolbarSlot：数据面归宿主）', () => {
  it('toolbarSlot 不传 → 整条工具条不渲染', () => {
    renderEditable()
    expect(screen.queryByTestId('wb-board-toolbar')).toBeNull()
  })

  it('toolbarSlot 传入 → 渲染在 wb-board-toolbar 里，且在横向滚动容器**外**（看板级镜头不该被滚出视野）', () => {
    renderEditable({ toolbarSlot: <button type="button">track 选择器</button> })
    const bar = screen.getByTestId('wb-board-toolbar')
    expect(within(bar).getByRole('button', { name: 'track 选择器' })).toBeInTheDocument()
    expect(screen.getByTestId('wb-board-scroll').contains(bar)).toBe(false)
  })

  it('renderSkillZone 提供 → 逐列取代默认技能区（画布本身不必认识 /api/config）', () => {
    renderEditable({
      lanes: EDIT_LANES.map((l) => ({ ...l, skills: undefined })),
      renderSkillZone: (laneId: string) => <div data-testid={`host-zone-${laneId}`}>宿主技能区 {laneId}</div>,
    })
    for (const lane of EDIT_LANES) {
      expect(screen.getByTestId(`host-zone-${lane.id}`)).toBeInTheDocument()
      expect(screen.queryByTestId(`wb-lane-skills-${lane.id}`)).toBeNull()
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════
// P2（契约 p2-contract.md §2 能力边界 / §3 props / §4 清单，含补丁 P2-v2）：
// 约束式拖拽——技能序列拖排 + 跨列搬 + depends_on + 阶段列重排
// ══════════════════════════════════════════════════════════════════════════

/**
 * P2 fixture（**第三份独立 fixture**，理由同 EDIT_LANES：P0/P1 的两份被上面 68 条断言逐字
 * 钉着，往里塞 skillDeps 等于同时改它们的契约）。覆盖矩阵（一列顶一组边界）：
 *   plan   → 4 个技能，撑起依赖面的全部分支：
 *            · superpowers:test-driven-development —— 无依赖（链头 / 候选池成员）
 *            · superpowers:brainstorming          —— 1 条依赖（单 chip：改/清的落点）
 *            · improve-codebase-architecture      —— **2 条依赖**（补丁 P2-v2 ② 的守门位：
 *              「只显一条再允许覆写 = 静默丢数据」）
 *            · web-design-guidelines              —— 无依赖但本列 >1 → 露「设依赖」钮
 *   review → skills=[]（空列：跨列搬的目标 + 技能区 data-drop="into" 的落点）
 *   ship   → 1 个技能（§4.6：本列只有 1 个 = 没有可依赖的对象 → 不给设依赖入口）
 *            且**刻意与 plan 同名**（superpowers:test-driven-development）→ 撑起 §3 的
 *            「目标列已有同名技能 → 不搬 + 提示」（技能在阶段内唯一）
 * 技能名一律取真实工程里那种长度且带命名空间——§4.8 零截断断言才有牙。
 */
const SK_TDD = 'superpowers:test-driven-development'
const SK_BRAIN = 'superpowers:brainstorming'
const SK_ARCH = 'improve-codebase-architecture'
const SK_WDG = 'web-design-guidelines'

const DND_LANES: BoardLane[] = [
  {
    id: 'plan',
    name: '需求澄清与技术方案评审',
    gate: null,
    skills: [SK_TDD, SK_BRAIN, SK_ARCH, SK_WDG],
    // 补丁 P2-v2 ①：depends_on 数据面。键 = 技能 id，值 = **同列内**被依赖的技能 id 序。
    // 缺键 = 无依赖；整字段 undefined = 不渲染任何依赖 chip（同 skills 的诚实占位纪律）。
    skillDeps: {
      [SK_BRAIN]: [SK_TDD],
      [SK_ARCH]: [SK_TDD, SK_BRAIN],
    },
    outputs: ['spec_md'],
    hooksCount: 8,
    hooksLocked: 2,
    linkEvent: 'submitted',
    count: 0,
    running: false,
  },
  {
    id: 'review',
    name: '人工复核',
    gate: 'review',
    skills: [],
    outputs: [],
    hooksCount: 8,
    hooksLocked: 2,
    linkEvent: 'approved',
    count: 5,
    running: true,
  },
  {
    id: 'ship',
    name: '发布',
    gate: null,
    skills: [SK_TDD],
    outputs: ['release_url'],
    hooksCount: undefined,
    hooksLocked: undefined,
    linkEvent: null,
    count: 4,
    running: false,
  },
]

/**
 * DataTransfer 替身（SkillTransferModal.test.tsx:18-24 的既有先例，按 P2 用量补两笔）：
 * jsdom 不实现 DataTransfer，而组件的 primeDrag 会写 effectAllowed、调 setData/setDragImage
 * （OrchestrationBoard.tsx:334-344）。那里对缺失做了防御，但替身给全才测得到真实路径。
 */
function dt(): DataTransfer {
  const data: Record<string, string> = {}
  return {
    setData: (k: string, v: string) => {
      data[k] = v
    },
    getData: (k: string) => data[k] ?? '',
    setDragImage: () => {},
    effectAllowed: 'none',
  } as unknown as DataTransfer
}

/**
 * 给元素装真实 rect。jsdom 无排版引擎，getBoundingClientRect 恒返回全 0，而组件的落点二分是
 * 「过中线即 after」（isAfterY/isAfterX，OrchestrationBoard.tsx:316-323）——rect 全 0 时它退化成
 * 「clientY>0 即 after」：before 分支只有在坐标恰为 0 时才成立，用例测的就成了 jsdom 的空 rect
 * 而不是组件的落点逻辑。故显式装 rect，再按上/下（左/右）半区取坐标。
 */
function stubRect(
  el: HTMLElement,
  rect: { top?: number; height?: number; left?: number; width?: number },
): void {
  const { top = 0, height = 40, left = 0, width = 340 } = rect
  el.getBoundingClientRect = () =>
    ({
      top,
      height,
      bottom: top + height,
      left,
      width,
      right: left + width,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
}

/**
 * 造一发**带坐标**的拖拽事件并派发。
 *
 * 为什么不能直接 `fireEvent.dragOver(el, { clientY })`：**jsdom 没有实现 DragEvent**
 * （实测 `typeof window.DragEvent === 'undefined'`），testing-library 于是退回 `window.Event`
 * 构造事件——而 Event 构造器不认 clientX/clientY，坐标被**静默丢掉**（它只对 dataTransfer/
 * clipboardData 做 defineProperty 补挂）。结果 `e.clientY === undefined`，组件里
 * `undefined > 中线` 恒为 false → 落点**恒判 before**：那样写出来的用例，"before" 分支会
 * **假绿**（不是因为坐标对，是因为坐标没了），"after" 分支必红。
 *
 * 真浏览器里 `DragEvent extends MouseEvent`，坐标本就在事件上。故这里用 MouseEvent 造事件
 * （它认坐标）再把 dataTransfer 挂上去——最贴近真实事件的形状，测的才是组件的落点二分逻辑。
 */
function fireDrag(
  el: HTMLElement,
  type: 'dragover' | 'drop',
  init: { dataTransfer: DataTransfer; clientX?: number; clientY?: number },
): void {
  const ev = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
  })
  Object.defineProperty(ev, 'dataTransfer', { value: init.dataTransfer })
  fireEvent(el, ev)
}

/**
 * 技能卡拖起：dragStart 打在**拖手柄**上。手柄是 draggable 的那个元素，而 dragstart 处理挂在
 * 卡根上靠冒泡接住（组件注释：currentTarget 要是整卡才能 setDragImage(整卡)）——故这里打手柄
 * 最接近真实用户路径，且手柄/卡谁挂 draggable 都成立。
 * dragStart/dragEnd/dragLeave 不吃坐标，走 fireEvent 即可（dataTransfer 会被补挂上去）。
 */
function startSkillDrag(stage: string, skill: string): DataTransfer {
  const transfer = dt()
  fireEvent.dragStart(screen.getByTestId(`wb-lane-sk-grip-${stage}-${skill}`), { dataTransfer: transfer })
  return transfer
}

/** 落在目标技能卡的上半区（before）或下半区（after）。中线由 stubRect 定在 y=120。 */
function dropOnSkill(transfer: DataTransfer, stage: string, skill: string, half: 'top' | 'bottom'): void {
  const card = screen.getByTestId(`wb-lane-sk-${stage}-${skill}`)
  stubRect(card, { top: 100, height: 40 })
  const clientY = half === 'top' ? 105 : 135
  fireDrag(card, 'dragover', { dataTransfer: transfer, clientY })
  fireDrag(card, 'drop', { dataTransfer: transfer, clientY })
}

/** 阶段列拖起：dragStart 打在列头拖手柄上（同上，靠冒泡到泳道根）。 */
function startStageDrag(stage: string): DataTransfer {
  const transfer = dt()
  fireEvent.dragStart(screen.getByTestId(`wb-lane-grip-${stage}`), { dataTransfer: transfer })
  return transfer
}

/** 列是横排的，故落点二分走 clientX（isAfterX）。中线由 stubRect 定在 x=170。 */
function dropOnStage(transfer: DataTransfer, stage: string, half: 'left' | 'right'): void {
  const lane = screen.getByTestId(`wb-step-${stage}`)
  stubRect(lane, { left: 0, width: 340 })
  const clientX = half === 'left' ? 40 : 300
  fireDrag(lane, 'dragover', { dataTransfer: transfer, clientX })
  fireDrag(lane, 'drop', { dataTransfer: transfer, clientX })
}

/** 可拖态渲染（宿主真给了三个回调 且 readonly=false）。 */
function renderDnd(overrides: Partial<Parameters<typeof OrchestrationBoard>[0]> = {}) {
  const onSelect = vi.fn()
  const onSkillMove = vi.fn()
  const onSkillDep = vi.fn()
  const onStageReorder = vi.fn()
  render(
    <I18nProvider>
      <OrchestrationBoard
        lanes={DND_LANES}
        readonly={false}
        selectedId="plan"
        onSelect={onSelect}
        label="release-train 阶段"
        gateHooks={GATE_HOOKS}
        onSkillMove={onSkillMove}
        onSkillDep={onSkillDep}
        onStageReorder={onStageReorder}
        {...overrides}
      />
    </I18nProvider>,
  )
  return { onSelect, onSkillMove, onSkillDep, onStageReorder }
}

/** 全列全技能扫一遍：一个拖手柄 / 一个依赖入口都不许长出来。 */
function expectNoDragAffordance(): void {
  const allSkills = DND_LANES.flatMap((l) => l.skills ?? [])
  for (const lane of DND_LANES) {
    expect(screen.queryByTestId(`wb-lane-grip-${lane.id}`)).toBeNull()
    for (const sk of lane.skills ?? []) {
      expect(screen.queryByTestId(`wb-lane-sk-grip-${lane.id}-${sk}`)).toBeNull()
      // 「设依赖」钮（testid 无 depId）与依赖 chip（testid 带 depId）两种入口都不许在
      expect(screen.queryByTestId(`wb-lane-dep-${lane.id}-${sk}`)).toBeNull()
      for (const dep of allSkills) {
        expect(screen.queryByTestId(`wb-lane-dep-${lane.id}-${sk}-${dep}`)).toBeNull()
      }
    }
  }
  // 兜底：整板不存在任何 draggable 节点（testid 万一被改名，这条仍扣得住）
  expect(screen.getByTestId('wb-board-scroll').querySelectorAll('[draggable="true"]')).toHaveLength(0)
}

describe('OrchestrationBoard P2 §4.1 诚实门：不给回调 / readonly → 一个拖手柄都不长', () => {
  /**
   * 本组是 P2 最高优先的守门项（契约 §2 一句话口径：**P2 的所有拖拽只对自定义 workflow 开放**）。
   * default 的强制技能是 manifest 的扁平 token 列表，**没有排序语义**——给拖手柄 = 谎报存在执行
   * 顺序（P1 已因此不编号、挂「🔒 无序」徽章，见 mandatorySkills.tsx:33/351）；default 的阶段结构
   * 同理由 kernel/manifest 硬编码，无写端点。故这里断的不是「拖了没反应」，而是 **affordance 根本
   * 不存在**：契约 §0.6 明禁「给了再弹『去终端改』」。
   */
  it('三个回调全不传（default 语境）→ 无列拖手柄 / 无技能拖手柄 / 无依赖 chip 与设依赖钮', () => {
    renderDnd({ onSkillMove: undefined, onSkillDep: undefined, onStageReorder: undefined, readonly: true })
    expectNoDragAffordance()
  })

  it('readonly=true 但宿主误传了三个回调 → 仍全锁（两条件任一不成立即锁死，同 P1 canEdit 口径）', () => {
    const { onSkillMove, onSkillDep, onStageReorder } = renderDnd({ readonly: true })
    expectNoDragAffordance()
    // 只读态还剩的可点/可拖节点逐个试过，一发回调都不许漏出去
    fireEvent.click(screen.getByTestId('wb-step-plan'))
    fireEvent.dragStart(screen.getByTestId(`wb-lane-sk-plan-${SK_TDD}`), { dataTransfer: dt() })
    fireEvent.drop(screen.getByTestId('wb-lane-sklist-review'), { dataTransfer: dt() })
    expect(onSkillMove).not.toHaveBeenCalled()
    expect(onSkillDep).not.toHaveBeenCalled()
    expect(onStageReorder).not.toHaveBeenCalled()
  })

  /**
   * 正向对照（**不可省**）：上面两条全是 queryBy→Null 的反向断言，若 testid 被改名或组件压根
   * 没实现 P2，它们会**全部假绿**。这条钉住「可编态确实长得出这些 affordance」，反向断言才有牙。
   */
  it('三个回调都传 + readonly=false → 列拖手柄 / 技能拖手柄 / 依赖入口都在（反向断言的对照组）', () => {
    renderDnd()
    expect(screen.getByTestId('wb-lane-grip-plan')).toBeInTheDocument()
    expect(screen.getByTestId(`wb-lane-sk-grip-plan-${SK_TDD}`)).toBeInTheDocument()
    // 有依赖 → chip（testid 带 depId）；无依赖且有候选 → 设依赖钮（testid 无 depId）
    expect(screen.getByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`)).toBeInTheDocument()
    expect(screen.getByTestId(`wb-lane-dep-plan-${SK_WDG}`)).toBeInTheDocument()
  })

  /** 三个回调是**各自**把关的，不是一个总开关：只给 onSkillMove 时不许长出依赖入口。 */
  it('只传 onSkillMove → 有技能拖手柄，但无依赖入口、无列拖手柄', () => {
    renderDnd({ onSkillDep: undefined, onStageReorder: undefined })
    expect(screen.getByTestId(`wb-lane-sk-grip-plan-${SK_TDD}`)).toBeInTheDocument()
    expect(screen.queryByTestId('wb-lane-grip-plan')).toBeNull()
    expect(screen.queryByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`)).toBeNull()
    expect(screen.queryByTestId(`wb-lane-dep-plan-${SK_WDG}`)).toBeNull()
  })

  it('只传 onSkillDep → 有依赖入口，但一个拖手柄都没有', () => {
    renderDnd({ onSkillMove: undefined, onStageReorder: undefined })
    expect(screen.getByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`wb-lane-sk-grip-plan-${SK_TDD}`)).toBeNull()
    expect(screen.queryByTestId('wb-lane-grip-plan')).toBeNull()
    expect(screen.getByTestId('wb-board-scroll').querySelectorAll('[draggable="true"]')).toHaveLength(0)
  })
})

describe('OrchestrationBoard P2 §4.2 技能卡列内排序（onSkillMove：toStage === fromStage）', () => {
  it('拖到同列某卡的**上**半区 → after=false，refSkillId = 该卡', () => {
    const { onSkillMove } = renderDnd()
    const transfer = startSkillDrag('plan', SK_ARCH)
    dropOnSkill(transfer, 'plan', SK_TDD, 'top')
    expect(onSkillMove).toHaveBeenCalledTimes(1)
    expect(onSkillMove).toHaveBeenCalledWith({
      skillId: SK_ARCH,
      fromStage: 'plan',
      toStage: 'plan',
      refSkillId: SK_TDD,
      after: false,
    })
  })

  it('拖到同列某卡的**下**半区 → after=true', () => {
    const { onSkillMove } = renderDnd()
    const transfer = startSkillDrag('plan', SK_TDD)
    dropOnSkill(transfer, 'plan', SK_WDG, 'bottom')
    expect(onSkillMove).toHaveBeenCalledWith({
      skillId: SK_TDD,
      fromStage: 'plan',
      toStage: 'plan',
      refSkillId: SK_WDG,
      after: true,
    })
  })

  /** 落到卡列容器的空白（非卡片上）= 落到该列末尾：refSkillId=null（契约 §3「null = 落到该列末尾」）。 */
  it('落到卡列容器空白处 → refSkillId=null（落到该列末尾）', () => {
    const { onSkillMove } = renderDnd()
    const transfer = startSkillDrag('plan', SK_TDD)
    const list = screen.getByTestId('wb-lane-sklist-plan')
    fireEvent.dragOver(list, { dataTransfer: transfer })
    fireEvent.drop(list, { dataTransfer: transfer })
    expect(onSkillMove).toHaveBeenCalledWith({
      skillId: SK_TDD,
      fromStage: 'plan',
      toStage: 'plan',
      refSkillId: null,
      after: true,
    })
  })

  it('拖到自己身上 → 不发 onSkillMove（原地不动不是一次移动，别把 workflow 标脏）', () => {
    const { onSkillMove } = renderDnd()
    const transfer = startSkillDrag('plan', SK_TDD)
    dropOnSkill(transfer, 'plan', SK_TDD, 'bottom')
    expect(onSkillMove).not.toHaveBeenCalled()
  })
})

describe('OrchestrationBoard P2 §4.3 技能卡跨列搬（onSkillMove：toStage = 目标列）', () => {
  it('拖到别列的技能卡上 → toStage 是目标列，fromStage 仍是原列', () => {
    const { onSkillMove } = renderDnd()
    const transfer = startSkillDrag('plan', SK_BRAIN)
    dropOnSkill(transfer, 'ship', SK_TDD, 'top')
    expect(onSkillMove).toHaveBeenCalledWith({
      skillId: SK_BRAIN,
      fromStage: 'plan',
      toStage: 'ship',
      refSkillId: SK_TDD,
      after: false,
    })
  })

  it('拖到空列（review skills=[]）的卡列容器 → toStage=review，refSkillId=null', () => {
    const { onSkillMove } = renderDnd()
    const transfer = startSkillDrag('plan', SK_BRAIN)
    const list = screen.getByTestId('wb-lane-sklist-review')
    fireEvent.dragOver(list, { dataTransfer: transfer })
    fireEvent.drop(list, { dataTransfer: transfer })
    expect(onSkillMove).toHaveBeenCalledWith({
      skillId: SK_BRAIN,
      fromStage: 'plan',
      toStage: 'review',
      refSkillId: null,
      after: true,
    })
  })

  /**
   * 契约 §3：「目标列已有同名技能 → 不搬 + 提示（技能在阶段内唯一）」。
   * ship 与 plan 都有 SK_TDD，故把 plan 的 SK_TDD 拖去 ship 必须被拒——放行会造出
   * 「一个阶段里两张同 id 技能卡」。提示是诚实门要件：静默 no-op 会被读作「搬成功了」。
   */
  it('目标列已有同名技能 → 不发 onSkillMove，且长出撞名提示（不静默 no-op）', () => {
    const { onSkillMove } = renderDnd()
    expect(screen.queryByTestId('wb-lane-sk-dup-ship')).toBeNull()
    const transfer = startSkillDrag('plan', SK_TDD)
    dropOnSkill(transfer, 'ship', SK_TDD, 'bottom')
    expect(onSkillMove).not.toHaveBeenCalled()
    expect(screen.getByTestId('wb-lane-sk-dup-ship')).toHaveTextContent('技能在阶段内唯一')
  })

  it('撞名提示在下一次 dragstart 时清掉（不粘在板上）', () => {
    renderDnd()
    dropOnSkill(startSkillDrag('plan', SK_TDD), 'ship', SK_TDD, 'bottom')
    expect(screen.getByTestId('wb-lane-sk-dup-ship')).toBeInTheDocument()
    startSkillDrag('plan', SK_BRAIN)
    expect(screen.queryByTestId('wb-lane-sk-dup-ship')).toBeNull()
  })
})

describe('OrchestrationBoard P2 §4.4 依赖 chip 与 popover（onSkillDep 四参：stage/skill/dep/prevDep）', () => {
  it('有依赖 → chip 显示被依赖技能的全名（含命名空间）', () => {
    renderDnd()
    const chip = screen.getByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`)
    expect(chip.textContent).toContain(SK_TDD)
    expect(chip.textContent).not.toContain('…')
  })

  it('无依赖且本列有可依赖对象 → 露「设依赖」钮（testid 不带 depId）', () => {
    renderDnd()
    expect(screen.getByTestId(`wb-lane-dep-plan-${SK_WDG}`)).toBeInTheDocument()
  })

  /**
   * 候选池 = **同列其他技能** − 已有依赖（组件 :931）。跨 step 引用是 kernel 校验期错误
   * （契约 §3），故别列技能一个都不许出现在池子里——给了就是引导用户存不进去。
   */
  it('点开 popover：只列同列其他技能，排除自己；别列技能一个不列', () => {
    renderDnd()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_WDG}`))
    const pop = screen.getByTestId(`wb-lane-dep-pop-plan-${SK_WDG}`)
    expect(within(pop).getByTestId(`wb-lane-dep-opt-plan-${SK_WDG}-${SK_TDD}`)).toBeInTheDocument()
    expect(within(pop).getByTestId(`wb-lane-dep-opt-plan-${SK_WDG}-${SK_BRAIN}`)).toBeInTheDocument()
    expect(within(pop).getByTestId(`wb-lane-dep-opt-plan-${SK_WDG}-${SK_ARCH}`)).toBeInTheDocument()
    // 自己不在池子里（自依赖是环），且候选恰好 3 个 → 别列技能没混进来
    expect(within(pop).queryByTestId(`wb-lane-dep-opt-plan-${SK_WDG}-${SK_WDG}`)).toBeNull()
    expect(pop.querySelectorAll('[data-testid^="wb-lane-dep-opt-"]')).toHaveLength(3)
  })

  it('已是依赖的技能不再进候选池（改依赖时不列出当前那条）', () => {
    renderDnd()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`))
    const pop = screen.getByTestId(`wb-lane-dep-pop-plan-${SK_BRAIN}`)
    expect(within(pop).queryByTestId(`wb-lane-dep-opt-plan-${SK_BRAIN}-${SK_TDD}`)).toBeNull()
    expect(within(pop).getByTestId(`wb-lane-dep-opt-plan-${SK_BRAIN}-${SK_ARCH}`)).toBeInTheDocument()
    expect(within(pop).getByTestId(`wb-lane-dep-opt-plan-${SK_BRAIN}-${SK_WDG}`)).toBeInTheDocument()
  })

  it('从「设依赖」钮选一个 → onSkillDep(stage, skill, dep, prevDep=null)（加：prevDep 为 null）', () => {
    const { onSkillDep } = renderDnd()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_WDG}`))
    fireEvent.click(screen.getByTestId(`wb-lane-dep-opt-plan-${SK_WDG}-${SK_TDD}`))
    expect(onSkillDep).toHaveBeenCalledTimes(1)
    expect(onSkillDep).toHaveBeenCalledWith('plan', SK_WDG, SK_TDD, null)
  })

  it('点已有 chip 改依赖 → onSkillDep(stage, skill, 新 dep, prevDep=被改的那条)', () => {
    const { onSkillDep } = renderDnd()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`))
    fireEvent.click(screen.getByTestId(`wb-lane-dep-opt-plan-${SK_BRAIN}-${SK_ARCH}`))
    expect(onSkillDep).toHaveBeenCalledTimes(1)
    expect(onSkillDep).toHaveBeenCalledWith('plan', SK_BRAIN, SK_ARCH, SK_TDD)
  })

  it('选完即收起 popover；再点同一个 chip 可重新开合（toggle）', () => {
    renderDnd()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`))
    expect(screen.getByTestId(`wb-lane-dep-pop-plan-${SK_BRAIN}`)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-opt-plan-${SK_BRAIN}-${SK_ARCH}`))
    expect(screen.queryByTestId(`wb-lane-dep-pop-plan-${SK_BRAIN}`)).toBeNull()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`))
    expect(screen.getByTestId(`wb-lane-dep-pop-plan-${SK_BRAIN}`)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`))
    expect(screen.queryByTestId(`wb-lane-dep-pop-plan-${SK_BRAIN}`)).toBeNull()
  })

  it('依赖入口不触发 onSelect（stopPropagation，同 P1 门开关/删除入口口径）', () => {
    const { onSelect } = renderDnd()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`))
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-opt-plan-${SK_BRAIN}-${SK_ARCH}`))
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('OrchestrationBoard P2 §4.5 清依赖（dep=null，prevDep=被清那条）', () => {
  it('popover 里点「清除」→ onSkillDep(stage, skill, null, prevDep)', () => {
    const { onSkillDep } = renderDnd()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`))
    fireEvent.click(screen.getByTestId(`wb-lane-dep-clear-plan-${SK_BRAIN}`))
    expect(onSkillDep).toHaveBeenCalledTimes(1)
    expect(onSkillDep).toHaveBeenCalledWith('plan', SK_BRAIN, null, SK_TDD)
  })

  /** 从「+ 设依赖」开的新增流程里没有可清的东西（prevDep===null → 不渲染清除项）。 */
  it('无依赖的技能：popover 里没有清除入口（没东西可清）', () => {
    renderDnd()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_WDG}`))
    expect(screen.getByTestId(`wb-lane-dep-pop-plan-${SK_WDG}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`wb-lane-dep-clear-plan-${SK_WDG}`)).toBeNull()
  })
})

describe('OrchestrationBoard P2 §4.6 本列只有 1 个技能 → 不给设依赖入口', () => {
  /** 没有可依赖的对象时给入口 = 点开是个空池子，等于谎报「这里能设依赖」。 */
  it('ship 只有 1 个技能 → 无设依赖钮、无依赖 chip、无 popover', () => {
    renderDnd()
    expect(screen.getByTestId(`wb-lane-sk-ship-${SK_TDD}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`wb-lane-dep-ship-${SK_TDD}`)).toBeNull()
    expect(screen.queryByTestId(`wb-lane-dep-pop-ship-${SK_TDD}`)).toBeNull()
  })

  it('但拖手柄照常在（1 个技能仍可跨列搬走，与「无依赖可设」是两件事）', () => {
    renderDnd()
    expect(screen.getByTestId(`wb-lane-sk-grip-ship-${SK_TDD}`)).toBeInTheDocument()
  })
})

describe('OrchestrationBoard P2 §4.7 阶段列重排（onStageReorder(fromId, toId, after)）', () => {
  it('拖列头手柄到目标列**右**半区 → after=true', () => {
    const { onStageReorder } = renderDnd()
    const transfer = startStageDrag('plan')
    dropOnStage(transfer, 'ship', 'right')
    expect(onStageReorder).toHaveBeenCalledTimes(1)
    expect(onStageReorder).toHaveBeenCalledWith('plan', 'ship', true)
  })

  it('拖到目标列**左**半区 → after=false', () => {
    const { onStageReorder } = renderDnd()
    const transfer = startStageDrag('ship')
    dropOnStage(transfer, 'plan', 'left')
    expect(onStageReorder).toHaveBeenCalledWith('ship', 'plan', false)
  })

  it('拖到自己身上 → 不发 onStageReorder（原地不动不是一次重排）', () => {
    const { onStageReorder } = renderDnd()
    const transfer = startStageDrag('plan')
    dropOnStage(transfer, 'plan', 'right')
    expect(onStageReorder).not.toHaveBeenCalled()
  })

  /** 拖技能卡时泳道根不该把它当成「拖列」——两条拖拽线不许互相误触发。 */
  it('拖技能卡落到别列的卡上 → 只发 onSkillMove，不发 onStageReorder', () => {
    const { onSkillMove, onStageReorder } = renderDnd()
    const transfer = startSkillDrag('plan', SK_BRAIN)
    dropOnSkill(transfer, 'ship', SK_TDD, 'top')
    expect(onSkillMove).toHaveBeenCalledTimes(1)
    expect(onStageReorder).not.toHaveBeenCalled()
  })
})

describe('OrchestrationBoard P2 §4.8 零截断回归（依赖 chip 的全名，契约 §0.1，本轮最高优先）', () => {
  /**
   * 依赖 chip 是 P2 唯一新增的「装技能全名」的位置，故它是本轮零截断的新战场：chip 天然窄
   * （第二行、虚线钮形态），最容易被顺手加 truncate。组件把被依赖技能名包在自己的 span 里
   * （:1044-1047，ns 弱化 + base），故 nameNodeOf 的「textContent 全等」落点在这里同样成立。
   */
  it('依赖 chip 的被依赖技能全名含命名空间，以完整文本落在 DOM（textContent 全等）', () => {
    renderDnd()
    const chip = screen.getByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`)
    expect(nameNodeOf(chip, SK_TDD).textContent).toBe(SK_TDD)
    expect(chip.textContent).not.toContain('…')
    expect(chip.textContent).not.toContain('...')
  })

  it('依赖 chip 的名字节点不带 truncate / text-ellipsis（反向断言：契约明许的唯一视觉类名例外）', () => {
    renderDnd()
    for (const [skill, dep] of [
      [SK_BRAIN, SK_TDD],
      [SK_ARCH, SK_TDD],
      [SK_ARCH, SK_BRAIN],
    ] as const) {
      const chip = screen.getByTestId(`wb-lane-dep-plan-${skill}-${dep}`)
      const node = nameNodeOf(chip, dep)
      expect(node.className).not.toContain('truncate')
      expect(node.className).not.toContain('text-ellipsis')
      expect(chip.querySelectorAll('.truncate, .text-ellipsis')).toHaveLength(0)
    }
  })

  it('popover 里的候选项也是全名直出，不短名化', () => {
    renderDnd()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_WDG}`))
    const opt = screen.getByTestId(`wb-lane-dep-opt-plan-${SK_WDG}-${SK_TDD}`)
    expect(nameNodeOf(opt, SK_TDD).textContent).toBe(SK_TDD)
    const pop = screen.getByTestId(`wb-lane-dep-pop-plan-${SK_WDG}`)
    expect(pop.querySelectorAll('.truncate, .text-ellipsis')).toHaveLength(0)
    expect(pop.textContent).not.toContain('…')
  })

  it('长出依赖面之后，整板仍无 truncate / text-ellipsis 节点、无 +N 截断计数', () => {
    renderDnd()
    const board = screen.getByTestId('wb-board-scroll')
    expect(board.querySelectorAll('.truncate, .text-ellipsis')).toHaveLength(0)
    expect(board.textContent).not.toContain('…')
    expect(board.textContent).not.toMatch(/\+\d+/)
  })

  /** 契约 §0.1「**拖拽态同样受管**：拖影/占位不得把名字压窄或切断」。 */
  it('拖拽态（data-dragging 挂着时）技能全名与依赖 chip 全名仍完整、无 truncate', () => {
    renderDnd()
    startSkillDrag('plan', SK_BRAIN)
    const card = screen.getByTestId(`wb-lane-sk-plan-${SK_BRAIN}`)
    expect(card).toHaveAttribute('data-dragging')
    expect(nameNodeOf(card, SK_BRAIN).textContent).toBe(SK_BRAIN)
    expect(nameNodeOf(screen.getByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`), SK_TDD).textContent).toBe(SK_TDD)
    expect(screen.getByTestId('wb-board-scroll').querySelectorAll('.truncate, .text-ellipsis')).toHaveLength(0)
  })
})

describe('OrchestrationBoard P2 §4.9 拖拽态 data-dragging / 落点 data-drop（断 data-*，不断视觉类名）', () => {
  /**
   * 契约 §3 规定拖拽态走 data-dragging、落点提示走 data-drop="before"|"after"|"into"
   * ——CSS（workbench.css P2 段）认这些属性画顶/底线与插入位游标，故属性正确 = 提示正确。
   * 刻意**不**断 box-shadow / 类名：那是视觉实现，会随设计微调而碎，且契约 §0 禁断视觉类名。
   */
  it('dragStart → 被拖卡带 data-dragging；dragEnd → 清干净（不留幽灵半透明卡）', () => {
    renderDnd()
    const card = screen.getByTestId(`wb-lane-sk-plan-${SK_TDD}`)
    expect(card).not.toHaveAttribute('data-dragging')
    const transfer = startSkillDrag('plan', SK_TDD)
    expect(card).toHaveAttribute('data-dragging')
    // 别的卡不许跟着变拖拽态
    expect(screen.getByTestId(`wb-lane-sk-plan-${SK_BRAIN}`)).not.toHaveAttribute('data-dragging')
    fireEvent.dragEnd(screen.getByTestId(`wb-lane-sk-grip-plan-${SK_TDD}`), { dataTransfer: transfer })
    expect(card).not.toHaveAttribute('data-dragging')
  })

  it('dragOver 目标卡上半区 → data-drop="before"；下半区 → "after"', () => {
    renderDnd()
    const transfer = startSkillDrag('plan', SK_ARCH)
    const target = screen.getByTestId(`wb-lane-sk-plan-${SK_TDD}`)
    stubRect(target, { top: 100, height: 40 })
    fireDrag(target, 'dragover', { dataTransfer: transfer, clientY: 105 })
    expect(target).toHaveAttribute('data-drop', 'before')
    fireDrag(target, 'dragover', { dataTransfer: transfer, clientY: 135 })
    expect(target).toHaveAttribute('data-drop', 'after')
  })

  it('落点提示同一时刻只在一张卡上（拖过 B 再拖过 C，B 的 data-drop 要清掉）', () => {
    renderDnd()
    const transfer = startSkillDrag('plan', SK_ARCH)
    const b = screen.getByTestId(`wb-lane-sk-plan-${SK_TDD}`)
    const c = screen.getByTestId(`wb-lane-sk-plan-${SK_WDG}`)
    stubRect(b, { top: 100, height: 40 })
    stubRect(c, { top: 200, height: 40 })
    fireDrag(b, 'dragover', { dataTransfer: transfer, clientY: 105 })
    expect(b).toHaveAttribute('data-drop', 'before')
    fireDrag(c, 'dragover', { dataTransfer: transfer, clientY: 205 })
    expect(c).toHaveAttribute('data-drop', 'before')
    expect(b).not.toHaveAttribute('data-drop')
  })

  it('悬在自己身上 → 不给落点提示（原地不动没有「落在自己前/后」这回事）', () => {
    renderDnd()
    const transfer = startSkillDrag('plan', SK_TDD)
    const self = screen.getByTestId(`wb-lane-sk-plan-${SK_TDD}`)
    stubRect(self, { top: 100, height: 40 })
    fireDrag(self, 'dragover', { dataTransfer: transfer, clientY: 135 })
    expect(self).not.toHaveAttribute('data-drop')
    // 且不许漏给容器变成 into 落点（松手会把卡甩到列尾——用户没打算移动它）
    expect(screen.getByTestId('wb-lane-sklist-plan')).not.toHaveAttribute('data-drop')
  })

  it('drop 后 data-drop / data-dragging 全清（提示不许粘在板上）', () => {
    renderDnd()
    const transfer = startSkillDrag('plan', SK_ARCH)
    dropOnSkill(transfer, 'plan', SK_TDD, 'top')
    expect(screen.getByTestId(`wb-lane-sk-plan-${SK_TDD}`)).not.toHaveAttribute('data-drop')
    expect(screen.getByTestId(`wb-lane-sk-plan-${SK_ARCH}`)).not.toHaveAttribute('data-dragging')
  })

  it('拖到空列的卡列容器 → 容器 data-drop="into"（契约 §3：空列/末尾落点）；dragLeave 后清', () => {
    renderDnd()
    const transfer = startSkillDrag('plan', SK_TDD)
    const list = screen.getByTestId('wb-lane-sklist-review')
    fireEvent.dragOver(list, { dataTransfer: transfer })
    expect(list).toHaveAttribute('data-drop', 'into')
    fireEvent.dragLeave(list, { dataTransfer: transfer })
    expect(list).not.toHaveAttribute('data-drop')
  })

  it('阶段列拖拽：dragStart → 列带 data-dragging；dragOver 右/左半区 → 目标列 data-drop="after"/"before"', () => {
    renderDnd()
    const transfer = startStageDrag('plan')
    expect(screen.getByTestId('wb-step-plan')).toHaveAttribute('data-dragging')
    const target = screen.getByTestId('wb-step-ship')
    stubRect(target, { left: 0, width: 340 })
    fireDrag(target, 'dragover', { dataTransfer: transfer, clientX: 300 })
    expect(target).toHaveAttribute('data-drop', 'after')
    fireDrag(target, 'dragover', { dataTransfer: transfer, clientX: 40 })
    expect(target).toHaveAttribute('data-drop', 'before')
  })
})

describe('OrchestrationBoard P2 §4.10 多依赖不被静默丢弃（补丁 P2-v2 ②）', () => {
  /**
   * kernel 的 depends_on 是 `string[]`（可多依赖，见 WorkbenchView.tsx:65 WbSkillRef）。
   * 只渲染第一条再允许覆写 = **用户看不见的那条被静默改掉**——这正是补丁 P2-v2 要堵的洞。
   * 故：N 条依赖必须 N 个 chip，且改/清一条只影响那一条（prevDep 精确定位）。
   */
  it('某技能有 2 条依赖 → 渲染 2 个 chip，两个全名都完整可见（零截断）', () => {
    renderDnd()
    const a = screen.getByTestId(`wb-lane-dep-plan-${SK_ARCH}-${SK_TDD}`)
    const b = screen.getByTestId(`wb-lane-dep-plan-${SK_ARCH}-${SK_BRAIN}`)
    expect(nameNodeOf(a, SK_TDD).textContent).toBe(SK_TDD)
    expect(nameNodeOf(b, SK_BRAIN).textContent).toBe(SK_BRAIN)
    // 卡内恰好 2 个依赖 chip（带 depId 的那种），一条都没被折叠掉
    const card = screen.getByTestId(`wb-lane-sk-plan-${SK_ARCH}`)
    expect(card.querySelectorAll(`[data-testid^="wb-lane-dep-plan-${SK_ARCH}-"]`)).toHaveLength(2)
  })

  it('改其中一条 → prevDep 精确指向被点的那条（不是数组第一条），另一条不受影响', () => {
    const { onSkillDep } = renderDnd()
    // 点第 2 条（依赖 SK_BRAIN）的 chip，改成 SK_WDG
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_ARCH}-${SK_BRAIN}`))
    fireEvent.click(screen.getByTestId(`wb-lane-dep-opt-plan-${SK_ARCH}-${SK_WDG}`))
    expect(onSkillDep).toHaveBeenCalledTimes(1)
    expect(onSkillDep).toHaveBeenCalledWith('plan', SK_ARCH, SK_WDG, SK_BRAIN)
    // 另一条 chip 原样还在（本组件受控纯展示：lanes 没变 → DOM 不该自作主张动）
    expect(screen.getByTestId(`wb-lane-dep-plan-${SK_ARCH}-${SK_TDD}`)).toBeInTheDocument()
  })

  it('清其中一条 → onSkillDep(stage, skill, null, 被清那条)，另一条不受影响', () => {
    const { onSkillDep } = renderDnd()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_ARCH}-${SK_TDD}`))
    fireEvent.click(screen.getByTestId(`wb-lane-dep-clear-plan-${SK_ARCH}`))
    expect(onSkillDep).toHaveBeenCalledTimes(1)
    expect(onSkillDep).toHaveBeenCalledWith('plan', SK_ARCH, null, SK_TDD)
    expect(screen.getByTestId(`wb-lane-dep-plan-${SK_ARCH}-${SK_BRAIN}`)).toBeInTheDocument()
  })

  /**
   * 两个 chip 共用一个按 (列,技能) 定位的 popover，靠 **prevDep** 区分是哪一条——故必须验证
   * 「从哪个 chip 开的，清除项就清哪一条」。串了的话用户点 A 的清除会把 B 抹掉（静默丢数据）。
   */
  it('两个 chip 共用的 popover 靠 prevDep 区分：从哪条 chip 开的就清哪条', () => {
    const { onSkillDep } = renderDnd()
    // 从第 1 条（SK_TDD）开 → 清除项清的是 SK_TDD
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_ARCH}-${SK_TDD}`))
    const popA = screen.getByTestId(`wb-lane-dep-pop-plan-${SK_ARCH}`)
    // 候选池 = 同列其他 − 已有两条 → 只剩 SK_WDG
    expect(popA.querySelectorAll('[data-testid^="wb-lane-dep-opt-"]')).toHaveLength(1)
    expect(within(popA).getByTestId(`wb-lane-dep-opt-plan-${SK_ARCH}-${SK_WDG}`)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-clear-plan-${SK_ARCH}`))
    expect(onSkillDep).toHaveBeenLastCalledWith('plan', SK_ARCH, null, SK_TDD)

    // 从第 2 条（SK_BRAIN）开 → 同一个 popover testid，但清除项清的是 SK_BRAIN
    fireEvent.click(screen.getByTestId(`wb-lane-dep-plan-${SK_ARCH}-${SK_BRAIN}`))
    fireEvent.click(screen.getByTestId(`wb-lane-dep-clear-plan-${SK_ARCH}`))
    expect(onSkillDep).toHaveBeenLastCalledWith('plan', SK_ARCH, null, SK_BRAIN)
    expect(onSkillDep).toHaveBeenCalledTimes(2)
  })

  /**
   * ⚠️ 与契约 §3 字面有出入，**以代码为准**（组件 :934 `showDepAdd = canDep && candidates.length > 0`）：
   * 契约 §3 写「**无依赖**且本列技能数 >1 → 露『⟼ 设依赖』钮」，实现改成「**只要还有候选**就露」。
   * 判为「代码有意改口径」而非 bug：补丁 P2-v2 把 depends_on 明确为**可多条**，若照契约字面只在
   * 无依赖时给入口，用户**永远加不出第二条依赖**——那才是真 bug。契约 §3 那句写在补丁之前。
   */
  it('已有依赖但仍有候选 → 「设依赖」钮照样在（否则第二条依赖永远加不进来）', () => {
    const { onSkillDep } = renderDnd()
    const add = screen.getByTestId(`wb-lane-dep-plan-${SK_ARCH}`)
    expect(add).toBeInTheDocument()
    fireEvent.click(add)
    // 新增流程：prevDep=null，且没有清除项
    expect(screen.queryByTestId(`wb-lane-dep-clear-plan-${SK_ARCH}`)).toBeNull()
    fireEvent.click(screen.getByTestId(`wb-lane-dep-opt-plan-${SK_ARCH}-${SK_WDG}`))
    expect(onSkillDep).toHaveBeenCalledWith('plan', SK_ARCH, SK_WDG, null)
  })

  it('候选池空（本列技能全被依赖完）→ 不露设依赖钮，chip 仍在（诚实：没得选就没这个动作）', () => {
    renderDnd({
      lanes: DND_LANES.map((l) =>
        l.id !== 'plan' ? l : { ...l, skills: [SK_TDD, SK_BRAIN], skillDeps: { [SK_BRAIN]: [SK_TDD] } },
      ),
    })
    expect(screen.queryByTestId(`wb-lane-dep-plan-${SK_BRAIN}`)).toBeNull()
    expect(screen.getByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`)).toBeInTheDocument()
  })

  it('skillDeps 整字段 undefined → 一个依赖 chip 都不渲染（诚实占位，同 skills 纪律）', () => {
    renderDnd({ lanes: DND_LANES.map((l) => ({ ...l, skillDeps: undefined })) })
    expect(screen.queryByTestId(`wb-lane-dep-plan-${SK_BRAIN}-${SK_TDD}`)).toBeNull()
    expect(screen.queryByTestId(`wb-lane-dep-plan-${SK_ARCH}-${SK_TDD}`)).toBeNull()
    // 但「设依赖」钮仍在（无依赖 + 有候选 = 可以设第一条）
    expect(screen.getByTestId(`wb-lane-dep-plan-${SK_BRAIN}`)).toBeInTheDocument()
  })
})

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * P3 —— Hook 卡片化展开（契约 scratchpad/p3-contract.md §4 第 1~8 条）
 * ══════════════════════════════════════════════════════════════════════════════════════
 * 本段最高优先的守门项是 §4.1 **零拖手柄**（契约 §1，本期诚实门核心）：hook 的执行顺序 /
 * 新增 hook / 改时机注册**全都没有 app 写端点**（能力矩阵 spec §1.1），定稿 demo 的「可拖 +
 * 拖完弹『去终端改』toast」在生产版是假交互。故这里断的不是「拖了没反应」，而是 **affordance
 * 根本不存在**——与 P2 §4.1 对 default 技能卡的判断逐字同一条逻辑。
 *
 * 第二优先是 §4.4/§4.5 的三档态：locked/pending **不渲染开关**（比 HookTimeline 更进一步，
 * 那边给的是 checked+disabled 的恒开开关）。判定同源（LOCKED_IDS 从 HookTimeline import，
 * 本文件绝不重抄 id 字符串），呈现从 OrchestrationBoard 的既定纪律（组件 :98-100）。
 */

/**
 * 四时机固定序。组件的 EVENT_ORDER（OrchestrationBoard.tsx:280）与 HookTimeline.tsx:33 都没
 * export，故本地镜像第三份——§4.2 的 DOM 顺序断言就是「三处同序」这条口径的守门。
 */
const HK_EVENTS: readonly WbHookEvent[] = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse']

/**
 * hook 元数据 fixture —— 逐条照抄 HookTimeline.test.tsx:12-21（= server hooksConfig.ts::HOOK_METAS
 * 同形）。刻意不精简：8 条恰好覆盖三档态的全部分支（4 可配 / 2 强制常开 / 2 暂不可配），且时机
 * 归类以 plugin 注册为准而非凭名字猜（interactive-skill-gate 挂 PostToolUse，不是 Pre）。
 */
const HOOK_METAS: WbHookMeta[] = [
  { id: 'session-start', event: 'SessionStart', matcher: '*', script: 'hooks/session-start.sh', configurable: true },
  { id: 'breadcrumb', event: 'UserPromptSubmit', matcher: '*', script: 'hooks/breadcrumb.sh', configurable: true },
  { id: 'router', event: 'UserPromptSubmit', matcher: '*', script: 'hooks/router.sh', configurable: true },
  { id: 'gate', event: 'PreToolUse', matcher: 'Skill|Bash|Edit|Write|MultiEdit', script: 'hooks/gate.sh', configurable: false },
  { id: 'confirm-clear', event: 'PostToolUse', matcher: 'AskUserQuestion', script: 'hooks/confirm-clear.sh', configurable: false },
  { id: 'decision-recorder', event: 'PostToolUse', matcher: 'AskUserQuestion', script: 'hooks/decision-recorder.sh', configurable: false },
  { id: 'skill-tracker', event: 'PostToolUse', matcher: 'Skill', script: 'hooks/skill-tracker.sh', configurable: true },
  { id: 'interactive-skill-gate', event: 'PostToolUse', matcher: 'Skill', script: 'hooks/interactive-skill-gate.sh', configurable: false },
]

// 三档态的 id 分组**从 fixture + LOCKED_IDS 推导**，不在本文件重抄 id 字符串——组件的判定
// （`locked = !configurable && LOCKED_IDS.has(id)`）与这里吃的是同一个真相源，改了 LOCKED_IDS
// 两边一起动。推导本身有没有跑偏，由下面第一条用例正面钉住。
const HK_CONFIGURABLE = HOOK_METAS.filter((h) => h.configurable).map((h) => h.id)
const HK_LOCKED = HOOK_METAS.filter((h) => !h.configurable && LOCKED_IDS.has(h.id)).map((h) => h.id)
const HK_PENDING = HOOK_METAS.filter((h) => !h.configurable && !LOCKED_IDS.has(h.id)).map((h) => h.id)

/**
 * P3 fixture（**第四份独立 fixture**，理由同 EDIT_LANES/DND_LANES：前三份被上面 116 条断言逐字
 * 钉着，往里改 running/skills 等于同时改它们的契约）。覆盖矩阵（一列顶一组边界）：
 *   plan   → running=false → **默认折叠**（定稿口径的反面）；2 个技能撑起 §4.1 的正向对照组
 *   review → running=true  → **默认展开**（定稿口径：当前在跑的阶段列展开）；同一批 hook 的
 *            第二个阶段维度——§4.3 的写键断言靠它区分 `<hook>.<阶段>` 有没有串列
 *   ship   → hooksCount=undefined → 整段不渲染（P0 诚实占位：hooks 传了也不许长出来）
 */
const HK_LANES: BoardLane[] = [
  {
    id: 'plan',
    name: '需求澄清与技术方案评审',
    gate: null,
    skills: [SK_TDD, SK_BRAIN],
    outputs: ['spec_md'],
    hooksCount: 8,
    hooksLocked: 2,
    linkEvent: 'submitted',
    count: 0,
    running: false,
  },
  {
    id: 'review',
    name: '人工复核',
    gate: 'review',
    skills: [],
    outputs: [],
    hooksCount: 8,
    hooksLocked: 2,
    linkEvent: 'approved',
    count: 5,
    running: true,
  },
  {
    id: 'ship',
    name: '发布',
    gate: null,
    skills: [],
    outputs: ['release_url'],
    hooksCount: undefined,
    hooksLocked: undefined,
    linkEvent: null,
    count: 4,
    running: false,
  },
]

/**
 * 渲染带 hook 数据面的看板。hooks 是**宿主 useHooksConfig 的返回值原样透传**（组件 :267），
 * 故这里造的替身按 HooksConfigState 逐字段给全——组件只读 hooks/matrix/busyKeys/toggle 四项，
 * 但类型要求的 loadError/toggleError/enabledCount 一并给，免得未来组件开始读时替身悄悄漏项。
 */
function renderHk(
  hooksOver: Partial<HooksConfigState> = {},
  boardOver: Partial<Parameters<typeof OrchestrationBoard>[0]> = {},
) {
  const toggle = vi.fn()
  const hooks: HooksConfigState = {
    hooks: HOOK_METAS,
    matrix: {},
    loadError: null,
    toggleError: null,
    promptSkipKeyword: 'no-tenon',
    promptSkipBusy: false,
    promptSkipError: null,
    busyKeys: new Set<string>(),
    toggle,
    savePromptSkipKeyword: vi.fn(async () => true),
    enabledCount: () => 8,
    ...hooksOver,
  }
  render(
    <I18nProvider>
      <OrchestrationBoard
        lanes={HK_LANES}
        readonly={false}
        selectedId="plan"
        onSelect={vi.fn()}
        label="release-train 阶段"
        gateHooks={GATE_HOOKS}
        hooks={hooks}
        {...boardOver}
      />
    </I18nProvider>,
  )
  return { toggle }
}

/** 展开某列的 hook 区（幂等：已展开就不点，免得把默认展开的 running 列反手收起）。 */
function expandHk(stage: string): HTMLElement {
  const btn = screen.getByTestId(`wb-lane-hk-toggle-${stage}`)
  if (btn.getAttribute('aria-expanded') !== 'true') fireEvent.click(btn)
  return screen.getByTestId(`wb-lane-hooks-${stage}`)
}

describe('OrchestrationBoard P3 §4.1 诚实门：Hook 卡零拖手柄（本期最重要的一条）', () => {
  /**
   * 契约 §1：hooks.json 的执行序 / 新增 hook / 改时机注册**无 app 写端点**——能拖但拖了不落盘
   * = 假交互。这条**刻意在「整板拖拽全开」的语境下**断言（三个拖拽回调全传 + readonly=false）：
   * 那正是最容易手滑把 P2 的技能卡拖拽词汇复制到 hook 卡上的场景。
   */
  it('三个拖拽回调全传 + 展开 hook 区 → 该区一个 draggable / 一个 ⠿ 手柄都没有', () => {
    renderHk({}, { onSkillMove: vi.fn(), onSkillDep: vi.fn(), onStageReorder: vi.fn() })
    const zone = expandHk('plan')
    // 任何形态的 draggable 都不许有（含 draggable="false"——那也意味着有人在这里想过拖拽）
    expect(zone.querySelectorAll('[draggable]')).toHaveLength(0)
    // testid 万一被改名，这两条仍扣得住：手柄字形与 grip 命名一个都不许出现在本区
    expect(zone.textContent).not.toContain('⠿')
    expect(zone.querySelectorAll('[data-testid*="grip"]')).toHaveLength(0)
    // 逐张 hook 卡再扫一遍（区级断言若因容器选错而落空，这条会真红）
    for (const h of HOOK_METAS) {
      const card = screen.getByTestId(`wb-lane-hk-plan-${h.id}`)
      expect(card).not.toHaveAttribute('draggable')
      expect(card.querySelectorAll('[draggable]')).toHaveLength(0)
    }
  })

  /**
   * 正向对照（**不可省**）：上一条全是「查不到就绿」的反向断言——hook 区若压根没渲染出来，
   * 它同样会绿。这条钉住「同一块板、同一时刻，技能卡与阶段列确实长得出拖手柄」，
   * 证明 zone 里查不到 draggable 是**组件的选择**，不是查询选择器写瞎了。
   */
  it('对照组：同一块板上技能卡与阶段列的拖手柄都在（证明 draggable 选择器有牙）', () => {
    renderHk({}, { onSkillMove: vi.fn(), onSkillDep: vi.fn(), onStageReorder: vi.fn() })
    expandHk('plan')
    expect(screen.getByTestId('wb-lane-grip-plan')).toHaveAttribute('draggable')
    expect(screen.getByTestId(`wb-lane-sk-grip-plan-${SK_TDD}`)).toHaveAttribute('draggable')
    // 整板确有 draggable 节点（列 1 + 技能 2）——「zone 里 0 个」因此是真实的局部为零
    expect(screen.getByTestId('wb-board-scroll').querySelectorAll('[draggable]').length).toBeGreaterThan(0)
  })

  it('展开后直接展示检查项，不再加一行系统实现说明', () => {
    renderHk()
    const zone = expandHk('plan')
    expect(within(zone).queryByTestId('wb-lane-hk-note-plan')).toBeNull()
    expect(within(zone).getByText('注入工作流上下文')).toBeInTheDocument()
  })
})

describe('OrchestrationBoard P3 §4.2 四时机分组（顺序固定，空组也画节点）', () => {
  it('English locale covers hidden Hook event metadata and built-in state badges', () => {
    window.localStorage.setItem('tenon-dashboard-lang', 'en')
    renderHk()
    const zone = expandHk('plan')
    expect(within(zone).getByTitle('Technical event: SessionStart')).toBeInTheDocument()
    expect(within(zone).getAllByText('Built-in Hook').length).toBeGreaterThan(0)
    expect(zone).not.toHaveTextContent('内置 Hook')
  })

  it('展开后四组齐全，DOM 顺序 = 会话生命周期序（不随数据顺序漂）', () => {
    // hooks 数组刻意打乱：分组顺序若来自数据而非 EVENT_ORDER，这条就红
    renderHk({ hooks: [...HOOK_METAS].reverse() })
    const zone = expandHk('plan')
    const groups = Array.from(zone.querySelectorAll('[data-testid^="wb-lane-hk-group-plan-"]'))
    expect(groups.map((g) => g.getAttribute('data-testid'))).toEqual(
      HK_EVENTS.map((ev) => `wb-lane-hk-group-plan-${ev}`),
    )
  })

  it('每组主界面只标人话名、技术事件放 hover；8 个 hook 卡仍按 plugin 注册时机归类', () => {
    renderHk()
    const zone = expandHk('plan')
    const groupOf = (ev: string) => within(zone).getByTestId(`wb-lane-hk-group-plan-${ev}`)
    for (const [ev, title] of [
      ['SessionStart', '会话开始'],
      ['UserPromptSubmit', '你发消息'],
      ['PreToolUse', 'agent 调工具'],
      ['PostToolUse', '工具完成'],
    ] as const) {
      expect(groupOf(ev)).toHaveTextContent(title)
      expect(groupOf(ev)).not.toHaveTextContent(ev)
      expect(within(groupOf(ev)).getByTitle(`技术事件：${ev}`)).toBeInTheDocument()
    }
    expect(within(groupOf('SessionStart')).getByTestId('wb-lane-hk-plan-session-start')).toBeInTheDocument()
    expect(within(groupOf('UserPromptSubmit')).getByTestId('wb-lane-hk-plan-breadcrumb')).toBeInTheDocument()
    expect(within(groupOf('UserPromptSubmit')).getByTestId('wb-lane-hk-plan-router')).toBeInTheDocument()
    expect(within(groupOf('PreToolUse')).getByTestId('wb-lane-hk-plan-gate')).toBeInTheDocument()
    // interactive-skill-gate 挂 PostToolUse（名字像 Pre，但注册在 Post）
    for (const id of ['confirm-clear', 'decision-recorder', 'skill-tracker', 'interactive-skill-gate']) {
      expect(within(groupOf('PostToolUse')).getByTestId(`wb-lane-hk-plan-${id}`)).toBeInTheDocument()
    }
  })

  /**
   * 时序线是**解释模型**，不随数据缺列（契约 §2 / 组件 :273-275）：某时机一个 hook 都没有时，
   * 那个节点照画 + 明说「该时机无 hook」——把节点删掉会让用户以为生命周期里根本没这一档。
   */
  it('某时机 0 个 hook → 该组仍渲染 + 明说「（该时机无 hook）」，其余三组照常', () => {
    renderHk({ hooks: HOOK_METAS.filter((h) => h.event !== 'PreToolUse') })
    const zone = expandHk('plan')
    const empty = within(zone).getByTestId('wb-lane-hk-group-plan-PreToolUse')
    expect(empty).toHaveTextContent('agent 调工具')
    expect(empty).toHaveTextContent('（该时机无 hook）')
    expect(empty.querySelectorAll('[data-testid^="wb-lane-hk-plan-"]')).toHaveLength(0)
    for (const ev of HK_EVENTS) {
      expect(within(zone).getByTestId(`wb-lane-hk-group-plan-${ev}`)).toBeInTheDocument()
    }
  })

  it('hooks 全空数组 → 四组全空但全在（极端缺数据也不塌成一片白）', () => {
    renderHk({ hooks: [] })
    const zone = expandHk('plan')
    for (const ev of HK_EVENTS) {
      expect(within(zone).getByTestId(`wb-lane-hk-group-plan-${ev}`)).toHaveTextContent('（该时机无 hook）')
    }
  })

  /** 「每轮」chip 只挂 UserPromptSubmit：一轮对话 = 一次 UserPromptSubmit，Pre/PostToolUse 在这轮里重复。 */
  it('「每轮」chip 只在 UserPromptSubmit 组，别的时机不长', () => {
    renderHk()
    const zone = expandHk('plan')
    expect(within(within(zone).getByTestId('wb-lane-hk-group-plan-UserPromptSubmit')).getByText('每轮')).toBeInTheDocument()
    for (const ev of ['SessionStart', 'PreToolUse', 'PostToolUse']) {
      expect(within(within(zone).getByTestId(`wb-lane-hk-group-plan-${ev}`)).queryByText('每轮')).toBeNull()
    }
  })
})

describe('OrchestrationBoard P3 §4.3 configurable → 真开关（toggle 三参精确）', () => {
  /** 分档推导本身的守门：LOCKED_IDS 与 fixture 一旦漂，下面几组「谁该有开关」就全失准。 */
  it('三档 id 分组以 LOCKED_IDS 为唯一真相源（本文件不重抄 id 串）', () => {
    expect(HK_CONFIGURABLE).toEqual(['session-start', 'breadcrumb', 'router', 'skill-tracker'])
    expect(HK_LOCKED).toEqual(['gate', 'interactive-skill-gate'])
    expect(HK_PENDING).toEqual(['confirm-clear', 'decision-recorder'])
  })

  it('4 个可配 hook 各出一个 role=switch；矩阵缺键 = 启用（fail-open）→ aria-checked=true', () => {
    renderHk()
    expandHk('plan')
    for (const id of HK_CONFIGURABLE) {
      const sw = screen.getByTestId(`wb-lane-hk-sw-plan-${id}`)
      expect(sw).toHaveAttribute('role', 'switch')
      expect(sw).toHaveAttribute('aria-checked', 'true')
      expect(sw).toBeEnabled()
    }
  })

  it('点开着的开关 → toggle(hook, 本列阶段, false)（不是 selectedId，也不是 true）', () => {
    const { toggle } = renderHk()
    expandHk('plan')
    fireEvent.click(screen.getByTestId('wb-lane-hk-sw-plan-router'))
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(toggle).toHaveBeenCalledWith('router', 'plan', false)
  })

  it('矩阵里有禁用键 → aria-checked=false，点它 → toggle(..., true)（开回来）', () => {
    const { toggle } = renderHk({ matrix: { 'router.plan': false } })
    expandHk('plan')
    expect(screen.getByTestId('wb-lane-hk-sw-plan-router')).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByTestId('wb-lane-hk-sw-plan-router'))
    expect(toggle).toHaveBeenCalledWith('router', 'plan', true)
  })

  /**
   * **卡片化相对 sheet 时序线的真正增量**：一屏 N 列各读写各自那一列的 `<hook>.<阶段>` 键。
   * 键串了列的话，用户在 plan 上点开关会把 review 的配置改掉——静默改错阶段，比不实现更坏。
   */
  it('阶段维度不串列：同一 hook 在 review 列点 → phase="review"；矩阵禁用键只作用在自己那列', () => {
    const { toggle } = renderHk({ matrix: { 'router.plan': false } })
    expandHk('plan')
    expandHk('review')
    expect(screen.getByTestId('wb-lane-hk-sw-plan-router')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByTestId('wb-lane-hk-sw-review-router')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByTestId('wb-lane-hk-sw-review-router'))
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(toggle).toHaveBeenCalledWith('router', 'review', false)
  })

  /** 开关的可访问名带阶段归属：一屏 N 列 × 同一批 hook，光「按轨道路由提示」会撞一片。 */
  it('开关可访问名 = 「hook 人话名 · 阶段名」（多列同名控件靠它区分）', () => {
    renderHk()
    expandHk('plan')
    expandHk('review')
    expect(screen.getByTestId('wb-lane-hk-sw-plan-router')).toHaveAttribute('aria-label', '按轨道路由提示 · 需求澄清与技术方案评审')
    expect(screen.getByTestId('wb-lane-hk-sw-review-router')).toHaveAttribute('aria-label', '按轨道路由提示 · 人工复核')
  })

  /**
   * hooks.json 是 per-root 运行时配置、**不属于 def 草稿**（组件 :255-257 / HookTimeline.tsx:28-29）
   * ——故 default 的 readonly 只读态下本区照常可切，与 canEdit 全线无关。
   * 这条**与 P1/P2 的「readonly → 一个控件都不长」刻意相反**，是有意的口径分叉，别顺手统一了。
   */
  it('readonly=true（default 语境）→ hook 开关照常出、照常发 toggle（per-root 配置与 def 无关）', () => {
    const { toggle } = renderHk({}, { readonly: true, lanes: HK_LANES.map((l) => ({ ...l, skills: undefined })) })
    expandHk('plan')
    const sw = screen.getByTestId('wb-lane-hk-sw-plan-router')
    expect(sw).toBeEnabled()
    fireEvent.click(sw)
    expect(toggle).toHaveBeenCalledWith('router', 'plan', false)
  })
})

describe('OrchestrationBoard P3 §4.4 locked（gate / interactive-skill-gate）→ 徽章 + 无开关', () => {
  /**
   * 契约 §1 能力矩阵：这两个是安全门/交互门，**脚本不读开关、server 写端点直接 400**。
   * 组件比 HookTimeline 更进一步——那边给 checked+disabled 的恒开开关，这里**只留徽章**
   * （组件 :96-100：徽章已把「状态」与「为什么不能改」说全，禁用开关不提供新信息却仍读作可拨控件）。
   */
  it('「强制常开」徽章 + data-state="locked" + **一个开关都不渲染**', () => {
    renderHk()
    expandHk('plan')
    for (const id of HK_LOCKED) {
      const card = screen.getByTestId(`wb-lane-hk-plan-${id}`)
      expect(card).toHaveAttribute('data-state', 'locked')
      expect(within(card).getByTestId(`wb-lane-hk-badge-plan-${id}`)).toHaveTextContent('强制常开')
      // 反向断言 ×2：testid 寻址与 role 寻址都查不到，才算真没有开关
      expect(screen.queryByTestId(`wb-lane-hk-sw-plan-${id}`)).toBeNull()
      expect(within(card).queryByRole('switch')).toBeNull()
      // 也不是「渲染了个禁用的」——整张卡零 button
      expect(within(card).queryByRole('button')).toBeNull()
    }
  })

  /**
   * 正向对照（**不可省**）：上一条的 queryBy→Null 在「hook 卡压根没实现」时同样会绿。
   * 这条钉住同一次渲染里可配 hook 确实长得出开关 → 「locked 卡上没有」才是组件的选择。
   */
  it('对照组：同一次渲染里可配 hook 确实长得出 role=switch（反向断言才有牙）', () => {
    renderHk()
    expandHk('plan')
    const ok = screen.getByTestId('wb-lane-hk-plan-session-start')
    expect(within(ok).getByRole('switch')).toBeInTheDocument()
    expect(screen.getByTestId('wb-lane-hk-sw-plan-session-start')).toBeInTheDocument()
  })
})

describe('OrchestrationBoard P3 §4.5 pending（confirm-clear / decision-recorder）→ 灰态 + 无开关', () => {
  /** 脚本未接开关矩阵 → 开放开关就是「设置不起效」（交付门槛②）。同样只留徽章，不留禁用控件。 */
  it('「暂不可配」徽章 + data-state="pending" + 一个开关都不渲染', () => {
    renderHk()
    expandHk('plan')
    for (const id of HK_PENDING) {
      const card = screen.getByTestId(`wb-lane-hk-plan-${id}`)
      expect(card).toHaveAttribute('data-state', 'pending')
      expect(within(card).getByTestId(`wb-lane-hk-badge-plan-${id}`)).toHaveTextContent('暂不可配')
      expect(screen.queryByTestId(`wb-lane-hk-sw-plan-${id}`)).toBeNull()
      expect(within(card).queryByRole('switch')).toBeNull()
    }
  })

  it('三档态在 data-state 上互斥且齐全：4 configurable / 2 locked / 2 pending', () => {
    renderHk()
    const zone = expandHk('plan')
    const stateOf = (id: string) => screen.getByTestId(`wb-lane-hk-plan-${id}`).getAttribute('data-state')
    for (const id of HK_CONFIGURABLE) expect(stateOf(id)).toBe('configurable')
    for (const id of HK_LOCKED) expect(stateOf(id)).toBe('locked')
    for (const id of HK_PENDING) expect(stateOf(id)).toBe('pending')
    // 开关总数 = 可配数（locked/pending 一个都没漏出来）
    expect(within(zone).getAllByRole('switch')).toHaveLength(HK_CONFIGURABLE.length)
    // 徽章总数 = locked + pending（可配卡上不挂态徽章——它有开关，开关自己就是状态读数）
    expect(zone.querySelectorAll('[data-testid^="wb-lane-hk-badge-plan-"]')).toHaveLength(
      HK_LOCKED.length + HK_PENDING.length,
    )
  })
})

describe('OrchestrationBoard P3 §4.6 busyKeys 在途 → 该开关禁用', () => {
  /** useHooksConfig 的 busyKeys 契约：在途写回的 `<hook>.<阶段>` 键禁用，防同键乱序竞态。 */
  it('busyKeys 含 router.plan → plan 的 router 开关禁用，点了也不发 toggle', () => {
    const { toggle } = renderHk({ busyKeys: new Set(['router.plan']) })
    expandHk('plan')
    const sw = screen.getByTestId('wb-lane-hk-sw-plan-router')
    expect(sw).toBeDisabled()
    fireEvent.click(sw)
    expect(toggle).not.toHaveBeenCalled()
  })

  it('禁用**只**落在那一个键上：同列其他 hook、同 hook 的其他列都照常可点', () => {
    const { toggle } = renderHk({ busyKeys: new Set(['router.plan']) })
    expandHk('plan')
    expandHk('review')
    // 同列另一个 hook
    expect(screen.getByTestId('wb-lane-hk-sw-plan-breadcrumb')).toBeEnabled()
    // 同 hook 的另一列（键是 router.review，不在 busyKeys 里）
    const other = screen.getByTestId('wb-lane-hk-sw-review-router')
    expect(other).toBeEnabled()
    fireEvent.click(other)
    expect(toggle).toHaveBeenCalledWith('router', 'review', false)
  })
})

describe('OrchestrationBoard P3 §4.7 hooks 未传/未就绪 → Hook 区不可展开（保持 P0 摘要）', () => {
  /**
   * 诚实占位（组件 :258-259）：没有 hook 元数据就没有卡可画，展开一个空壳 = 谎报「本阶段没有
   * hook」。故摘要行退回 P0 的**死行**——连 hover 描边都不给（一个点了没反应的行比不可点更坏）。
   */
  it('hooks 整个 prop 不传 → 摘要行还在（自动检查 10 项）但不是按钮、无展开体', () => {
    renderBoard({ lanes: HK_LANES })
    const zone = screen.getByTestId('wb-lane-hooks-plan')
    expect(zone).toHaveTextContent('自动检查')
    expect(zone).toHaveTextContent('10 项')
    expect(screen.queryByTestId('wb-lane-hk-toggle-plan')).toBeNull()
    expect(within(zone).queryByRole('button')).toBeNull()
    for (const ev of HK_EVENTS) {
      expect(screen.queryByTestId(`wb-lane-hk-group-plan-${ev}`)).toBeNull()
    }
    expect(screen.queryByTestId('wb-lane-hk-note-plan')).toBeNull()
  })

  /** running 列默认展开的口径**盖不过**「没数据」：review 在跑，但 hooks 没传 → 照样不展开。 */
  it('running 列也一样：hooks 未传 → review 列不展开（默认展开口径不许压过诚实占位）', () => {
    renderBoard({ lanes: HK_LANES })
    expect(screen.queryByTestId('wb-lane-hk-toggle-review')).toBeNull()
    expect(screen.queryByTestId('wb-lane-hk-group-review-SessionStart')).toBeNull()
  })

  /** hooks.hooks === null = 加载中/加载失败（HookTimeline.tsx:43-44 的既定语义）→ 同样不可展开。 */
  it('hooks 传了但 hooks.hooks === null（加载中/失败）→ 仍是死摘要行，不展开空壳', () => {
    renderHk({ hooks: null })
    expect(screen.getByTestId('wb-lane-hooks-plan')).toHaveTextContent('自动检查')
    expect(screen.getByTestId('wb-lane-hooks-plan')).toHaveTextContent('10 项')
    expect(screen.queryByTestId('wb-lane-hk-toggle-plan')).toBeNull()
    expect(screen.queryByTestId('wb-lane-hk-group-plan-SessionStart')).toBeNull()
  })

  /**
   * 正向对照（**不可省**）：上面三条都是 queryBy→Null。这条钉住「传了 hooks 就真长得出可展开的
   * 卡片体」——否则组件压根没实现 P3，上面也会全绿。
   */
  it('对照组：传了 hooks → 摘要行变成 aria-expanded 的按钮，点开真有卡片体', () => {
    renderHk()
    const btn = screen.getByTestId('wb-lane-hk-toggle-plan')
    expect(btn.tagName).toBe('BUTTON')
    // plan 不 running → 默认折叠：aria-controls 一并撤掉（收起时展开体不在 DOM，指过去是坏关联）
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(btn).not.toHaveAttribute('aria-controls')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(btn).toHaveAttribute('aria-controls', 'wb-lane-hk-body-plan')
    expect(document.getElementById('wb-lane-hk-body-plan')).not.toBeNull()
    expect(screen.getByTestId('wb-lane-hk-plan-router')).toBeInTheDocument()
  })

  /** P0 纪律回归：hooksCount 未就绪的列，hooks 传了也不许把整段长出来（数字都没有，卡从哪来）。 */
  it('hooksCount=undefined 的列（ship）→ 传了 hooks 也整段不渲染', () => {
    renderHk()
    expect(screen.queryByTestId('wb-lane-hooks-ship')).toBeNull()
    expect(screen.queryByTestId('wb-lane-hk-toggle-ship')).toBeNull()
    expect(screen.queryByTestId('wb-lane-hk-group-ship-SessionStart')).toBeNull()
  })

  /** 定稿口径：默认开合 = 该列 running；用户手动开合后以自己的选择为准（组件 :814-816）。 */
  it('默认开合 = 该列 running（review 展开 / plan 折叠），手动开合后覆盖默认', () => {
    renderHk()
    expect(screen.getByTestId('wb-lane-hk-toggle-review')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('wb-lane-hk-toggle-plan')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('wb-lane-hk-review-router')).toBeInTheDocument()
    expect(screen.queryByTestId('wb-lane-hk-plan-router')).toBeNull()

    // 手动收起在跑的那列 → 覆盖默认
    fireEvent.click(screen.getByTestId('wb-lane-hk-toggle-review'))
    expect(screen.getByTestId('wb-lane-hk-toggle-review')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('wb-lane-hk-review-router')).toBeNull()
    // 手动展开没在跑的那列 → 同上，且两列各记各的
    fireEvent.click(screen.getByTestId('wb-lane-hk-toggle-plan'))
    expect(screen.getByTestId('wb-lane-hk-plan-router')).toBeInTheDocument()
    expect(screen.queryByTestId('wb-lane-hk-review-router')).toBeNull()
  })
})

describe('OrchestrationBoard P3 §4.8 零截断（契约 §0.1 延续到 hook 卡，本轮最高优先）', () => {
  /**
   * HookTimeline 那边给 hook 名挂了 truncate（HookTimeline.tsx:186 一带），那正是本轮要消灭的
   * 写法——移植卡片语言时刻意不带过来。这里三层守：名字全文在 DOM / 名字节点无 truncate /
   * 整个 hook 区无 truncate 节点。
   */
  it('hook 人话名以完整文本落在卡内，名字节点不带 truncate / text-ellipsis', () => {
    renderHk()
    expandHk('plan')
    for (const [id, name] of [
      ['session-start', '注入工作流上下文'],
      ['router', '按轨道路由提示'],
      ['gate', '门拦截'],
      ['interactive-skill-gate', '技能解锁检查'],
      ['decision-recorder', '记录你的决策'],
    ] as const) {
      const card = screen.getByTestId(`wb-lane-hk-plan-${id}`)
      const node = nameNodeOf(card, name)
      expect(node.textContent).toBe(name)
      expect(node.className).not.toContain('truncate')
      expect(node.className).not.toContain('text-ellipsis')
    }
  })

  it('展开态的整个 hook 区不存在 truncate / text-ellipsis 节点（描述与 ⌘ 提示一并守住）', () => {
    renderHk()
    const zone = expandHk('plan')
    expect(zone.querySelectorAll('.truncate, .text-ellipsis')).toHaveLength(0)
  })

  it('两列同时展开后，整板仍无 truncate / text-ellipsis 节点', () => {
    renderHk({}, { onSkillMove: vi.fn(), onSkillDep: vi.fn(), onStageReorder: vi.fn() })
    expandHk('plan')
    expandHk('review')
    expect(screen.getByTestId('wb-board-scroll').querySelectorAll('.truncate, .text-ellipsis')).toHaveLength(0)
  })

  /**
   * server 新加了 hook 而前端词典没跟上（未知 id）：**名称回落 id、描述留白**——同
   * HookTimeline.tsx:184-192 的既有兜底，别自造占位文案。这里顺带把零截断压到最长的一种名字上：
   * 回落出来的 id 比任何人话名都长，truncate 若还在，这条第一个红。
   */
  it('未知 hook（词典无人话名）→ 名称回落 id 且全名完整无截断，描述留白（不把 key 漏到界面上）', () => {
    const unknown = 'superpowers-workflow-context-injector-v2'
    renderHk({
      hooks: [...HOOK_METAS, { id: unknown, event: 'SessionStart', matcher: '*', script: 'hooks/x.sh', configurable: true }],
    })
    expandHk('plan')
    const card = screen.getByTestId(`wb-lane-hk-plan-${unknown}`)
    expect(nameNodeOf(card, unknown).textContent).toBe(unknown)
    expect(card.querySelectorAll('.truncate, .text-ellipsis')).toHaveLength(0)
    // 描述留白：i18n key 原文一个字都不许漏到界面上（同 board_gate_off 溜进真机截图的陷阱）
    expect(card.textContent).not.toContain('workbench.hk_desc_')
    expect(card.textContent).not.toContain('workbench.hk_name_')
    // 未知 hook 仍是 configurable → 真开关照给（回落的是文案，不是能力）
    expect(screen.getByTestId(`wb-lane-hk-sw-plan-${unknown}`)).toHaveAttribute('aria-checked', 'true')
  })

  /** 有词典的 hook 描述照常渲染（上一条「描述留白」的正向对照：留白是缺翻译，不是从来不渲染）。 */
  it('对照组：有词典的 hook 描述真渲染出来（留白只发生在缺翻译时）', () => {
    renderHk()
    expandHk('plan')
    expect(screen.getByTestId('wb-lane-hk-plan-router')).toHaveTextContent('运行时启用路由的轨道各给对的方法论')
    expect(screen.getByTestId('wb-lane-hk-plan-gate')).toHaveTextContent('复核没过时，挡住技能调用与写文件')
  })
})
