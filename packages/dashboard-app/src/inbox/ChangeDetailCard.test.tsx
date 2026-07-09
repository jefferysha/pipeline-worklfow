/**
 * ChangeDetailCard（评审 P0-1 核心交付件，Task 7）—— 收件箱行点开后的详情卡：证据格
 * （复用 gateEvidence）+ 产物 + 语境 + 底部放行/打回动作条。接口见
 * `.superpowers/sdd/task-7-brief.md`（Task 9 看板会逐字复用同一组件，props 不含任何
 * InboxView 私有状态——回退确认走组件自己的本地 pending/busy/Dialog，不依赖父级传入
 * 确认管线，与 InboxView 的既有 pending 流是"同构复用"而非"共享同一份 state"）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { ChangeDetailCard } from './ChangeDetailCard'
import { DEFAULT_RULES, rulesFromDef } from '../model/workflowModel'
import { makeChange } from '../testkit'

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderCard(over: Partial<Parameters<typeof ChangeDetailCard>[0]> = {}) {
  const props = {
    root: '/repo',
    change: makeChange('c1', 'verify', {
      fields: {
        verify_result: 'pass',
        agent_review_result: 'fail',
        codex_review_result: 'pending',
        verification_report: '/repo/openspec/changes/c1/reports/verify.md',
        build_sha: 'a1b2c3d',
      },
    }),
    rules: DEFAULT_RULES,
    onTransition: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    onToast: vi.fn(),
    onError: vi.fn(),
    ...over,
  }
  const { container } = render(
    <I18nProvider>
      <ChangeDetailCard {...props} />
    </I18nProvider>,
  )
  // container 一并返回（评审修复轮新增）：whyText 断言需要精确定位 `.detail__why` 段落——
  // 直接在全文档搜索"未过项"字段名会撞上证据格里恒定渲染的 FieldBox key（如
  // `<span class="detail__field-key">verification_report</span>`），跟 whyText 是否误判
  // 这个未过项是两回事，必须把查询范围收窄到 why 段落本身。
  return { ...props, container }
}

describe('ChangeDetailCard（change 详情卡，评审 P0-1 核心交付件）', () => {
  it('verify 门：三轨证据格逐一映射语义色（pass/fail/pending 三态齐全，一次断言覆盖三态）', () => {
    renderCard()
    expect(screen.getByTestId('change-detail')).toBeInTheDocument()
    expect(screen.getByTestId('detail-evidence-verify_result').className).toContain('detail__field--pass')
    expect(screen.getByTestId('detail-evidence-agent_review_result').className).toContain('detail__field--fail')
    expect(screen.getByTestId('detail-evidence-codex_review_result').className).toContain('detail__field--pending')
  })

  it('产物：非空路径字段（pr_url）可拷贝——点拷贝钮写剪贴板 + toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const props = renderCard({
      change: makeChange('c1', 'verify', {
        fields: {
          verify_result: 'pass',
          agent_review_result: 'pass',
          codex_review_result: 'pass',
          verification_report: '/repo/report.md',
          build_sha: 'sha1',
          pr_url: 'https://github.com/org/repo/pull/9',
        },
      }),
    })
    fireEvent.click(screen.getByTestId('detail-artifact-pr_url-copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://github.com/org/repo/pull/9'))
    expect(props.onToast).toHaveBeenCalled()
  })

  it('「→ 放行」触发 onTransition(name, root, 正确 event)（verify→ship = verify-pass）', async () => {
    const props = renderCard()
    fireEvent.click(screen.getByTestId('detail-approve'))
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('c1', '/repo', 'verify-pass'))
  })

  it('「↩ 打回」先弹二次确认（复用既有 pending 管线语义），确认后才 onTransition(verify-fail)', async () => {
    const props = renderCard()
    fireEvent.click(screen.getByTestId('detail-reject'))
    expect(props.onTransition).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('detail-confirm-yes'))
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('c1', '/repo', 'verify-fail'))
  })

  it('✕ 关闭 → 调 onClose', () => {
    const props = renderCard()
    fireEvent.click(screen.getByTestId('detail-close'))
    expect(props.onClose).toHaveBeenCalledOnce()
  })
})

/**
 * whyText 未过项判据（评审 Important-1 修复）—— 旧判据 `!chip.copyable && tone !== 'pass'` 把
 * "该字段没有 copyable:true"错当成"是三轨字段"的替身信号：verification_report/build_sha
 * 未设时同样落在 unsetPlaceholder()（无 copyable、tone pending），会被误判成"未过项"混进
 * 三轨列表（如「build_sha 未过」的假警报）——产物没产出不等于验证没过。新判据改用
 * evidence.ts 导出的 VERIFY_STATUS_FIELDS 白名单精确圈定"三轨字段"。
 */
describe('ChangeDetailCard whyText 未过项判据（评审 Important-1 修复）', () => {
  it('verification_report 未设不算"未过项"；三轨真 fail（codex_review_result）仍如实列出', () => {
    const { container } = renderCard({
      change: makeChange('c1', 'verify', {
        fields: {
          verify_result: 'pass',
          agent_review_result: 'pass',
          codex_review_result: 'fail',
          verification_report: '', // 未设——修复前会被误判成"未过项"混进三轨列表
          build_sha: 'sha1',
        },
      }),
    })
    const why = container.querySelector('.detail__why')
    expect(why?.textContent).not.toContain('verification_report')
    expect(why?.textContent).toBe('codex_review 未过——需要你看完证据后决定放行或打回')
  })

  it('三轨全过 + verification_report/build_sha 均未设 → 不误判"未过"，显示全过文案', () => {
    const { container } = renderCard({
      change: makeChange('c1', 'verify', {
        fields: {
          verify_result: 'pass',
          agent_review_result: 'pass',
          codex_review_result: 'pass',
          verification_report: 'null',
          build_sha: '',
        },
      }),
    })
    const why = container.querySelector('.detail__why')
    expect(why?.textContent).toBe('三轨全过，等你最终放行')
  })
})

/**
 * 详情卡动作条：全边渲染 + 相位感知文案（评审 Important-2 修复）—— 旧实现只取"第一个前进边"
 * +"第一个回退边"，自定义 workflow 声明 2+ 条同向出边时其余边不可达（Task 7 报告"担忧"一节
 * 已知缺口）。新实现用 legalTargets+plannedTransition 逐出边渲染，review 门文案带
 * "· 放行"/"· 打回"缀语，非 review 门（含 confirm/无门）用通用的"→ {to}"/"↩ {to}"。
 */
describe('ChangeDetailCard 动作条：全边渲染 + 相位感知文案（评审 Important-2 修复）', () => {
  const TWO_FORWARD_RULES = rulesFromDef({
    name: 'release-train',
    steps: [
      {
        id: 'review', label: '', gate: 'review', skills: [], inputs: [], outputs: [], guards: [],
        transitions: [
          { event: 'ship-now', to: 'ship' },
          { event: 'ship-later', to: 'later' },
        ],
      },
      { id: 'ship', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      { id: 'later', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
    ],
  })

  const NONGATE_RULES = rulesFromDef({
    name: 'release-train',
    steps: [
      { id: 'draft', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      {
        id: 'mid', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [],
        transitions: [
          { event: 'go', to: 'ship' },
          { event: 'back', to: 'draft' },
        ],
      },
      { id: 'ship', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
    ],
  })

  it('自定义 rules 两条前进边 → 两个前进钮都在，各自触发正确 event', async () => {
    const props = renderCard({
      change: makeChange('c1', 'review', { fields: { workflow: 'release-train' } }),
      rules: TWO_FORWARD_RULES,
    })
    expect(screen.getByTestId('detail-approve')).toBeInTheDocument()
    expect(screen.getByTestId('detail-forward-ship-later')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('detail-approve'))
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('c1', '/repo', 'ship-now'))

    fireEvent.click(screen.getByTestId('detail-forward-ship-later'))
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('c1', '/repo', 'ship-later'))
  })

  it('非 gate 相位（gate=null）→ 按钮文案是通用「→ {to}」/「↩ {to}」，不含「放行」/「打回」字样', () => {
    renderCard({
      change: makeChange('c1', 'mid', { fields: { workflow: 'release-train' } }),
      rules: NONGATE_RULES,
    })
    const approve = screen.getByTestId('detail-approve')
    const reject = screen.getByTestId('detail-reject')
    expect(approve.textContent).toBe('→ ship')
    expect(reject.textContent).toBe('↩ draft')
    expect(approve.textContent).not.toContain('放行')
    expect(reject.textContent).not.toContain('打回')
  })
})
