/**
 * TaskDetail（T8 共享任务详情组件）—— 阶段区双形态（计划 T8 原文 + demo v5 六轮定稿 3fdb36c）：
 *   · 形态 A（variant='timeline'，缺省）：dtl- 垂直时间线，收件箱右栏（T9 宿主），视觉基准
 *     design-demos/v5-progress-workbench.html 收件箱右卡；
 *   · 形态 B（variant='tabs'）：dt-tabs 阶段 sheet，进度行内展开（T11 宿主复用），视觉基准
 *     同 demo 进度视图 prg-detail 内 dt-tabs/dt-pane（role=tablist）。
 *
 * 意图迁移表（旧 ChangeDetailCard.test.tsx 断言 → 新归属；旧文件与组件暂留给 InboxView
 * 现行实现消费，T9 换宿主后由 T18 退役清理）：
 *   · verify 三轨证据格语义色 pass/fail/pending    → 当前行 dtl-box 内 dt-field--pass/--fail/
 *     --miss 三态（本文件「默认 workflow 时间线」组）
 *   · 产物拷贝钮写剪贴板 + toast                   → done 行产物 chip data-copy 拷贝（本文件）
 *   · whyText 未过项判据（评审 Important-1）        → 当前行 dtl-box 结论行（本文件，判据仍走
 *     VERIFY_STATUS_FIELDS 白名单，verification_report 未设不算未过项）
 *   · 「→ 放行」「↩ 打回」全边渲染 + 二次确认       → 动作条 props 化后归宿主（T9 收件箱 /
 *     T11 进度各自实现与测试；本文件只钉「宿主传入的按钮被渲染、不传则无动作条」）
 *   · 非 gate 不渲染「等你复核」徽章（不说谎）      → 徽章 props 化归宿主（badge 由宿主传入，
 *     组件自身零业务判定，本文件钉「未传 badge 则头部无徽章」）
 *   · ✕ 关闭回调                                   → 本文件（onClose 可选，未传不渲染关闭钮）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { zh } from '../i18n/translations'
import { TaskDetail } from './TaskDetail'
import { DEFAULT_RULES, rulesFromDef } from '../model/workflowModel'
import { makeChange } from '../testkit'
import type { ChangeHistoryEntry } from '../api/client'

/** 可控 matchMedia 桩（同 WorkbenchView.test.tsx 既有先例）：驱动 gsap.matchMedia 的 reduced-motion 分支。 */
function stubMatchMedia(reduceMatches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce')
        ? reduceMatches
        : query.includes('no-preference') && !reduceMatches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  )
}

/** 每用例可改写的 history 端点返回（缺省空 = 「早期记录不可用」路径）。 */
let histEntries: ChangeHistoryEntry[] = []

beforeEach(() => {
  histEntries = []
  global.fetch = vi.fn(async (url: string) => {
    if (/\/api\/change\/[^/]+\/history\?root=/.test(url)) {
      return new Response(JSON.stringify({ entries: histEntries }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** 三阶段自定义 workflow（demo changelog-cn 对位）：draft 声明产出 design_doc，review 是复核门。 */
const CN_RULES = rulesFromDef({
  name: 'release-train',
  steps: [
    {
      id: 'draft', label: '', gate: null, skills: [], inputs: [],
      outputs: [{ field: 'design_doc', type: 'file_path' as const }], guards: [],
      transitions: [{ event: 'draft-done', to: 'review' }],
    },
    {
      id: 'review', label: '', gate: 'review', skills: [], inputs: [], outputs: [], guards: [],
      transitions: [{ event: 'approved', to: 'ship' }],
    },
    { id: 'ship', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
})

async function renderDetail(over: Partial<Parameters<typeof TaskDetail>[0]> = {}) {
  const props = {
    root: '/repo',
    change: makeChange('c1', 'verify', {
      fields: {
        design_doc: 'docs/design.md',
        plan: 'docs/plan.md',
        branch: 'feat/c1',
        build_sha: 'a1b2c3d',
        verify_result: 'pass',
        agent_review_result: 'pass',
        codex_review_result: 'pass',
        verification_report: 'docs/verify.md',
      },
    }),
    rules: DEFAULT_RULES,
    onToast: vi.fn(),
    ...over,
  }
  const { container, rerender } = render(
    <I18nProvider>
      <TaskDetail {...props} />
    </I18nProvider>,
  )
  // 等 history 拉取落定（组件挂 data-settled）——不等的话异步 setEntries 落在用例结束后，
  // 会刷一屏「not wrapped in act」告警且历史区断言时机不稳。
  await waitFor(() => expect(screen.getByTestId('dt-hist-sec').getAttribute('data-settled')).toBe('true'))
  return { ...props, container, rerender }
}

describe('TaskDetail 垂直时间线（默认 workflow 七阶段）', () => {
  it('按 stageArtifacts 渲染 7 个阶段行，节点语义：✓done ×4 / ●cur(verify) / 空心 todo ×2', async () => {
    const { container } = await renderDetail()
    const items = container.querySelectorAll('.dtl-it')
    expect(items).toHaveLength(7)
    for (const step of ['open', 'explore', 'spec', 'build']) {
      expect(screen.getByTestId(`dtl-${step}`).querySelector('.dtl-node')?.className).toContain('dtl-node--done')
    }
    expect(screen.getByTestId('dtl-verify').querySelector('.dtl-node')?.className).toContain('dtl-node--cur')
    for (const step of ['ship', 'archive']) {
      expect(screen.getByTestId(`dtl-${step}`).querySelector('.dtl-node')?.className).toContain('dtl-node--todo')
    }
  })

  it('当前行（verify）高亮框：三轨字段语义色 + 全过结论；未开始行显示「未开始」，无产物 done 行显示「无产物」', async () => {
    await renderDetail()
    const box = screen.getByTestId('dtl-verify').querySelector('.dtl-box')
    expect(box).not.toBeNull()
    expect(screen.getByTestId('dt-field-verify_result').className).toContain('dt-field--pass')
    expect(box?.querySelector('.dt-verdict')?.textContent).toContain('三轨全过')
    expect(screen.getByTestId('dtl-ship').textContent).toContain('未开始')
    expect(screen.getByTestId('dtl-open').textContent).toContain('无产物')
  })

  it('三轨有 fail → 结论列出未过项；verification_report 未设不算未过项（Important-1 判据迁移）且落 dt-field--miss 占位', async () => {
    await renderDetail({
      change: makeChange('c1', 'verify', {
        fields: {
          verify_result: 'pass',
          agent_review_result: 'pass',
          codex_review_result: 'fail',
          verification_report: '',
        },
      }),
    })
    const verdict = screen.getByTestId('dtl-verify').querySelector('.dt-verdict')
    expect(verdict?.textContent).toContain('codex_review')
    expect(verdict?.textContent).not.toContain('verification_report')
    const miss = screen.getByTestId('dt-field-verification_report')
    expect(miss.className).toContain('dt-field--miss')
    expect(miss.textContent).toContain('未产出')
    expect(screen.getByTestId('dt-field-codex_review_result').className).toContain('dt-field--fail')
  })

  it('done 行产物 chip 带 data-copy，点击写剪贴板 + toast（意图迁移：旧产物区拷贝钮）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const props = await renderDetail()
    const chip = screen.getByTestId('dtl-chip-design_doc')
    expect(chip.getAttribute('data-copy')).toBe('docs/design.md')
    fireEvent.click(chip)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('docs/design.md'))
    expect(props.onToast).toHaveBeenCalled()
  })
})

describe('TaskDetail 自定义 workflow（三阶段）与 rules 缺失回落', () => {
  it('三阶段 rules → 3 行；当前 review 门行有高亮框与「本阶段无产物登记」；draft done 行出 design_doc chip', async () => {
    const { container } = await renderDetail({
      change: makeChange('cn1', 'review', { fields: { workflow: 'release-train', design_doc: 'docs/draft.md' } }),
      rules: CN_RULES,
    })
    expect(container.querySelectorAll('.dtl-it')).toHaveLength(3)
    expect(screen.getByTestId('dtl-review').querySelector('.dtl-node')?.className).toContain('dtl-node--cur')
    expect(screen.getByTestId('dtl-review').querySelector('.dtl-box')).not.toBeNull()
    expect(screen.getByTestId('dtl-review').textContent).toContain('本阶段无产物登记')
    expect(screen.getByTestId('dtl-chip-design_doc').getAttribute('data-copy')).toBe('docs/draft.md')
  })

  it('rules 缺失（定义拉取失败）→ 时间线留白但卡不消失（G17 底线）：回落产物正门 chips', async () => {
    const { container } = await renderDetail({
      change: makeChange('c1', 'verify', { fields: { design_doc: 'docs/design.md', pr_url: 'https://x/pr/1' } }),
      rules: undefined,
    })
    expect(container.querySelectorAll('.dtl-it')).toHaveLength(0)
    expect(screen.getByTestId('task-detail')).toBeInTheDocument()
    expect(screen.getByTestId('dtl-chip-design_doc')).toBeInTheDocument()
    expect(screen.getByTestId('dtl-chip-pr_url')).toBeInTheDocument()
  })

  it('rules 存在但 change.phase 不在 steps（workflow 字段错位）→ 同 G17 兜底，不渲染全 todo 假时间线', async () => {
    const { container } = await renderDetail({
      change: makeChange('odd', 'nonexistent-step', {
        fields: { workflow: 'release-train', design_doc: 'docs/d.md' },
      }),
      rules: CN_RULES,
    })
    expect(container.querySelectorAll('.dtl-it')).toHaveLength(0)
    expect(screen.getByText('工作流定义不可用，暂无法展示阶段——先列已产出的产物')).toBeInTheDocument()
    expect(screen.getByTestId('dtl-chip-design_doc')).toBeInTheDocument()
  })

  it('phase 错位 + automation failed → 失败信息不静默丢：兜底区渲染 last_error 与 attempts', async () => {
    await renderDetail({
      change: makeChange('odd', 'nonexistent-step', {
        fields: {
          workflow: 'release-train',
          automation: 'failed',
          automation_last_error: 'boom: sandbox exploded',
          automation_attempts: '2',
        },
      }),
      rules: CN_RULES,
    })
    expect(screen.getByTestId('dt-field-last_error').textContent).toContain('boom: sandbox exploded')
    expect(screen.getByTestId('dt-field-attempts').textContent).toContain('2')
  })
})

describe('TaskDetail 形态 B（dt-tabs 阶段 sheet，variant="tabs"，T11 进度行内展开复用）', () => {
  it('role=tablist 渲染 7 个 tab：当前 verify tab aria-selected + dt-tab--cur，done tab 带 ✓；不渲染时间线', async () => {
    const { container } = await renderDetail({ variant: 'tabs' })
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(7)
    expect(container.querySelectorAll('.dtl-it')).toHaveLength(0)
    const cur = screen.getByTestId('dt-tab-verify')
    expect(cur.getAttribute('aria-selected')).toBe('true')
    expect(cur.className).toContain('dt-tab--cur')
    const done = screen.getByTestId('dt-tab-open')
    expect(done.className).toContain('dt-tab--done')
    expect(done.getAttribute('aria-selected')).toBe('false')
    expect(done.textContent).toContain('✓')
  })

  it('默认展示当前阶段 pane（三轨语义色 + 结论），其余 pane hidden', async () => {
    await renderDetail({ variant: 'tabs' })
    const pane = screen.getByTestId('dt-pane-verify')
    expect(pane.hidden).toBe(false)
    expect(pane.textContent).toContain('三轨全过')
    expect(screen.getByTestId('dt-field-verify_result').className).toContain('dt-field--pass')
    expect(screen.getByTestId('dt-pane-ship').hidden).toBe(true)
    expect(screen.getByTestId('dt-pane-open').hidden).toBe(true)
  })

  it('点 tab 切换 pane：未开始 tab pane 出「未开始」占位；done tab pane 出产物字段且可拷贝', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await renderDetail({ variant: 'tabs' })
    fireEvent.click(screen.getByTestId('dt-tab-ship'))
    expect(screen.getByTestId('dt-tab-ship').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('dt-tab-verify').getAttribute('aria-selected')).toBe('false')
    expect(screen.getByTestId('dt-pane-ship').hidden).toBe(false)
    expect(screen.getByTestId('dt-pane-ship').textContent).toContain('未开始')
    expect(screen.getByTestId('dt-pane-verify').hidden).toBe(true)
    fireEvent.click(screen.getByTestId('dt-tab-explore'))
    const explorePane = screen.getByTestId('dt-pane-explore')
    expect(explorePane.hidden).toBe(false)
    const field = screen.getByTestId('dt-field-design_doc')
    expect(explorePane.contains(field)).toBe(true)
    const copyBtn = field.querySelector('[data-copy]')
    expect(copyBtn?.getAttribute('data-copy')).toBe('docs/design.md')
    fireEvent.click(copyBtn as Element)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('docs/design.md'))
  })

  it('失败态 → 当前 tab dt-tab--fail 带 ×，pane 内 last_error/attempts/缺产出 miss/重试放弃说明', async () => {
    await renderDetail({
      variant: 'tabs',
      change: makeChange('hotfix', 'build', {
        fields: {
          automation: 'failed',
          automation_last_error: 'verify: 2 failed · auth.test.ts',
          automation_attempts: '3',
        },
      }),
    })
    const tab = screen.getByTestId('dt-tab-build')
    expect(tab.className).toContain('dt-tab--fail')
    expect(tab.textContent).toContain('×')
    const pane = screen.getByTestId('dt-pane-build')
    expect(pane.hidden).toBe(false)
    expect(screen.getByTestId('dt-field-last_error').textContent).toContain('verify: 2 failed · auth.test.ts')
    expect(screen.getByTestId('dt-field-attempts').textContent).toContain('3')
    expect(screen.getByTestId('dt-field-missing').textContent).toContain('branch')
    expect(pane.textContent).toContain('重试会清零计数重新挂队')
  })

  it('三阶段自定义 workflow → 3 个 tab；无产物 done 阶段 pane 出「本阶段无产物登记」', async () => {
    await renderDetail({
      variant: 'tabs',
      change: makeChange('cn1', 'ship', { fields: { workflow: 'release-train', design_doc: 'docs/draft.md' } }),
      rules: CN_RULES,
    })
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    fireEvent.click(screen.getByTestId('dt-tab-review'))
    expect(screen.getByTestId('dt-pane-review').textContent).toContain('本阶段无产物登记')
  })

  it('curStageExtra 插槽（T11）：渲染在当前阶段 pane 内容体尾部，其余 pane 不渲染', async () => {
    await renderDetail({
      variant: 'tabs',
      curStageExtra: <div data-testid="extra-slot">log tail here</div>,
    })
    const pane = screen.getByTestId('dt-pane-verify')
    expect(pane.contains(screen.getByTestId('extra-slot'))).toBe(true)
    expect(screen.getByTestId('dt-pane-build').textContent).not.toContain('log tail here')
    expect(screen.getAllByTestId('extra-slot')).toHaveLength(1)
  })

  it('切换 change 后选中 tab 重置回新 change 的当前阶段（不残留上一张卡的手动选择）', async () => {
    const props = await renderDetail({ variant: 'tabs' })
    fireEvent.click(screen.getByTestId('dt-tab-open'))
    expect(screen.getByTestId('dt-tab-open').getAttribute('aria-selected')).toBe('true')
    const { rerender } = props
    rerender(
      <I18nProvider>
        <TaskDetail {...props} change={makeChange('c2', 'spec', { fields: {} })} />
      </I18nProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('dt-tab-spec').getAttribute('aria-selected')).toBe('true'))
    expect(screen.getByTestId('dt-tab-open').getAttribute('aria-selected')).toBe('false')
  })
})

describe('TaskDetail 失败态（automation failed）', () => {
  const failedChange = makeChange('hotfix', 'build', {
    fields: {
      design_doc: 'docs/design.md',
      plan: 'docs/plan.md',
      automation: 'failed',
      automation_last_error: 'verify: 2 failed · auth.test.ts',
      automation_attempts: '3',
    },
  })

  it('当前行 × 红节点 + dtl-box--bad：last_error、attempts、缺产出合并 dt-field--miss、重试/放弃说明', async () => {
    await renderDetail({ change: failedChange })
    const row = screen.getByTestId('dtl-build')
    expect(row.querySelector('.dtl-node')?.className).toContain('dtl-node--fail')
    const box = row.querySelector('.dtl-box')
    expect(box?.className).toContain('dtl-box--bad')
    expect(screen.getByTestId('dt-field-last_error').textContent).toContain('verify: 2 failed · auth.test.ts')
    expect(screen.getByTestId('dt-field-attempts').textContent).toContain('3')
    // build 阶段声明产出 branch/build_sha 均未设 → 合并为一条 miss 占位
    const miss = screen.getByTestId('dt-field-missing')
    expect(miss.className).toContain('dt-field--miss')
    expect(miss.textContent).toContain('branch')
    expect(miss.textContent).toContain('build_sha')
    expect(row.textContent).toContain('自动重试 3 次后停在这')
    expect(box?.textContent).toContain('重试会清零计数重新挂队')
  })

  it('失败态不渲染「在终端继续」命令区（demo 定稿：失败卡无命令区），动作条左标签是 automation 语境', async () => {
    await renderDetail({ change: failedChange, actions: <button type="button">重试</button> })
    expect(screen.queryByTestId('detail-cmd')).toBeNull()
    expect(screen.getByTestId('dt-foot-label').textContent).toBe('automation · failed')
  })
})

describe('TaskDetail 失败诊断（W3：成因徽章 + 可复制修复命令）', () => {
  /** zh.failure 命名空间取值（Dict 联合收窄为字符串表，供断言证明成因人话走 i18n 非硬编码）。 */
  const fz = zh.failure as Record<string, string>

  it('②凭证类失败 → 成因徽章（经 i18n）+ 可复制修复命令 pipeline setup；last_error 原文仍在', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await renderDetail({
      change: makeChange('hotfix', 'build', {
        fields: {
          automation: 'failed',
          automation_last_error: 'codex 认证失败：请设置 OPENAI_API_KEY 后重试',
          automation_attempts: '2',
        },
      }),
    })
    // ⑤成因徽章文案取自 zh.failure（组件走 t('failure.cause_*')，不硬编码）
    expect(screen.getByTestId('dt-diag-cause').textContent).toBe(fz['cause_missing-credential'])
    // 可复制修复命令
    expect(screen.getByTestId('detail-fix-cmd').textContent).toBe('pipeline setup')
    const copyBtn = screen.getByTestId('detail-fix-copy')
    expect(copyBtn.getAttribute('data-copy')).toBe('pipeline setup')
    fireEvent.click(copyBtn)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('pipeline setup'))
    // 原文保留（成因徽章是补充不是替换）
    expect(screen.getByTestId('dt-field-last_error').textContent).toContain('OPENAI_API_KEY')
    // 前进转换命令区（detail-cmd）失败态仍不渲染——与修复命令区（detail-fix-cmd）互不相干
    expect(screen.queryByTestId('detail-cmd')).toBeNull()
  })

  it('②agent 非零退出：lifecycle 落盘的真实改写句（含「凭证」）→ 成因徽章 missing-credential + 修复命令 pipeline setup（生产主路径，非 agent-nonzero）', async () => {
    await renderDetail({
      change: makeChange('hotfix', 'build', {
        fields: {
          automation: 'failed',
          // 真实落盘串：lifecycle.ts:211 createAgentExitWatch 把 [AGENT_EXIT] 标记改写成含「凭证」的中文句。
          // 生产不落裸标记——含「凭证」故归 missing-credential（非 agent-nonzero）；此前 fixture 喂裸标记=假信心。
          automation_last_error: 'codex agent 非零退出（exit 96）：可能凭证失效或 codex 自身报错，详见 agent 日志',
        },
      }),
    })
    expect(screen.getByTestId('dt-diag-cause').textContent).toBe(fz['cause_missing-credential'])
    expect(screen.getByTestId('detail-fix-cmd').textContent).toBe('pipeline setup')
  })

  it('②null fixCommand 成因（docker daemon 未起，真实落盘串）→ 成因徽章在，但无 fixCommand → 不渲染修复命令区', async () => {
    await renderDetail({
      change: makeChange('hotfix', 'build', {
        fields: {
          automation: 'failed',
          automation_last_error:
            'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
        },
      }),
    })
    expect(screen.getByTestId('dt-diag-cause').textContent).toBe(fz['cause_missing-docker'])
    expect(screen.queryByTestId('detail-fix-cmd')).toBeNull()
  })

  it('③非失败态（当前 verify 门行）不渲染诊断区（回归：成因区只在 failed 出）', async () => {
    await renderDetail()
    expect(screen.queryByTestId('dt-diag')).toBeNull()
  })

  it('形态 B（tabs）失败 pane 内同样出成因徽章 + 修复命令（镜像类 → build.sh）', async () => {
    await renderDetail({
      variant: 'tabs',
      change: makeChange('hotfix', 'build', {
        fields: { automation: 'failed', automation_last_error: 'AFK 镜像 sandcastle:local 不在本机' },
      }),
    })
    const pane = screen.getByTestId('dt-pane-build')
    expect(within(pane).getByTestId('dt-diag-cause').textContent).toBe(fz['cause_missing-image'])
    expect(within(pane).getByTestId('detail-fix-cmd').textContent).toBe('bash tools/sandcastle/build.sh')
  })
})

/**
 * F-b 成因结构化（读取端）：失败诊断优先用结构化 automation_cause 直判
 * （diagnoseFailureWithCause），空串/缺失/未识别回落 last_error regex——上个 describe（无
 * automation_cause 的 fixture）原样通过即 fallback 路径不回归的证明。
 */
describe('TaskDetail F-b：automation_cause 直判优先，空串回落 regex', () => {
  const fz = zh.failure as Record<string, string>

  it('cause=cancelled（原文 regex 只能 unknown→误建议 doctor）→ 徽章「已被取消…」+ 不渲染修复命令区；原文仍保留', async () => {
    await renderDetail({
      change: makeChange('hotfix', 'build', {
        fields: {
          automation: 'failed',
          automation_cause: 'cancelled',
          automation_last_error: '任务被人工终止',
          automation_attempts: '1',
        },
      }),
    })
    expect(screen.getByTestId('dt-diag-cause').textContent).toBe(fz.cause_cancelled)
    // cancelled 非故障：无修复命令区（尤其不再建议 pipeline doctor）
    expect(screen.queryByTestId('detail-fix-cmd')).toBeNull()
    // last_error 原文照渲染（成因徽章是补充不是替换，与 W3 既有口径一致）
    expect(screen.getByTestId('dt-field-last_error').textContent).toContain('任务被人工终止')
  })

  it('cause=verify-fail → 徽章「验证未通过…」（regex 对 verify 原文只能 unknown 的钉死反例）', async () => {
    await renderDetail({
      change: makeChange('hotfix', 'build', {
        fields: {
          automation: 'failed',
          automation_cause: 'verify-fail',
          automation_last_error: 'verify: 2 failed · auth.test.ts',
        },
      }),
    })
    expect(screen.getByTestId('dt-diag-cause').textContent).toBe(fz['cause_verify-fail'])
    expect(screen.queryByTestId('detail-fix-cmd')).toBeNull()
  })

  it('cause 空串（老数据/写入端未落）→ 回落 regex：凭证原文仍判 missing-credential + pipeline setup', async () => {
    await renderDetail({
      change: makeChange('hotfix', 'build', {
        fields: {
          automation: 'failed',
          automation_cause: '',
          automation_last_error: '未检测到 codex 凭证：宿主机需设 OPENAI_API_KEY',
        },
      }),
    })
    expect(screen.getByTestId('dt-diag-cause').textContent).toBe(fz['cause_missing-credential'])
    expect(screen.getByTestId('detail-fix-cmd').textContent).toBe('pipeline setup')
  })
})

describe('TaskDetail 「在终端继续」命令区', () => {
  it('命令文案与第一条前进 transition 事件一致（verify → verify-pass），拷贝钮带 data-copy 且写剪贴板', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await renderDetail()
    expect(screen.getByTestId('detail-cmd').textContent).toBe('pipeline transition c1 verify-pass')
    const btn = screen.getByTestId('detail-cmd-copy')
    expect(btn.getAttribute('data-copy')).toBe('pipeline transition c1 verify-pass')
    fireEvent.click(btn)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('pipeline transition c1 verify-pass'))
  })

  it('自定义 workflow 用它自己的 event 名（review → approved）', async () => {
    await renderDetail({
      change: makeChange('cn1', 'review', { fields: { workflow: 'release-train' } }),
      rules: CN_RULES,
    })
    expect(screen.getByTestId('detail-cmd').textContent).toBe('pipeline transition cn1 approved')
  })
})

describe('TaskDetail history 区（T1 端点接入）', () => {
  it('有记录 → 逐行渲染 from → to · event（raw 字段）', async () => {
    histEntries = [
      { ts: '2026-07-09T08:00:00Z', kind: 'init' },
      { ts: '2026-07-09T09:00:00Z', kind: 'transition', from: 'open', to: 'explore', raw: 'open-complete' },
      { ts: '2026-07-10T09:00:00Z', kind: 'transition', from: 'explore', to: 'spec', raw: 'explore-complete' },
    ]
    await renderDetail()
    await waitFor(() => expect(screen.getByTestId('dt-hist')).toBeInTheDocument())
    const rows = screen.getAllByTestId(/^dt-hist-\d+$/)
    expect(rows).toHaveLength(3)
    expect(rows[1]?.textContent).toContain('open → explore · open-complete')
    expect(screen.queryByText('早期记录不可用')).toBeNull()
  })

  it('无记录（老 change 只有 legacy 历史）→ 显示「早期记录不可用」（决议 #10）', async () => {
    histEntries = []
    await renderDetail()
    await waitFor(() => expect(screen.getByText('早期记录不可用')).toBeInTheDocument())
  })

  it('端点报错 → 同「早期记录不可用」降级，不崩卡', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'x' }), { status: 404 })) as unknown as typeof fetch
    await renderDetail()
    await waitFor(() => expect(screen.getByText('早期记录不可用')).toBeInTheDocument())
    expect(screen.getByTestId('task-detail')).toBeInTheDocument()
  })

  it('同一 change 阶段推进（SSE 快照更新 phase）→ history 重取，不等宿主重挂载（T9/T11 前置）', async () => {
    histEntries = [{ ts: '2026-07-09T09:00:00Z', kind: 'transition', from: 'open', to: 'explore', raw: 'open-complete' }]
    const props = await renderDetail({ change: makeChange('c1', 'explore', { fields: {} }) })
    await waitFor(() => expect(screen.getAllByTestId(/^dt-hist-\d+$/)).toHaveLength(1))
    histEntries = [
      { ts: '2026-07-09T09:00:00Z', kind: 'transition', from: 'open', to: 'explore', raw: 'open-complete' },
      { ts: '2026-07-10T09:00:00Z', kind: 'transition', from: 'explore', to: 'spec', raw: 'explore-complete' },
    ]
    props.rerender(
      <I18nProvider>
        <TaskDetail {...props} change={makeChange('c1', 'spec', { fields: {} })} />
      </I18nProvider>,
    )
    await waitFor(() => expect(screen.getAllByTestId(/^dt-hist-\d+$/)).toHaveLength(2))
    expect(screen.getByTestId('dt-hist-1').textContent).toContain('explore → spec · explore-complete')
  })
})

describe('TaskDetail 动作条 props 化 + 任务一句话 + 头部', () => {
  it('宿主传入 actions → 渲染在动作条并可点；不传 → 无动作条（组件不绑任何业务端点）', async () => {
    const onRetry = vi.fn()
    const { container } = await renderDetail({
      actions: (
        <button type="button" data-testid="host-retry" onClick={onRetry}>
          ↻ 重试
        </button>
      ),
    })
    fireEvent.click(screen.getByTestId('host-retry'))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(container.querySelector('.dt-foot')).not.toBeNull()
    expect(screen.getByTestId('dt-foot-label').textContent).toBe('verify → ship')
  })

  it('不传 actions → 无动作条；不传 badge → 头部无徽章；不传 onClose → 无关闭钮', async () => {
    const { container } = await renderDetail()
    expect(container.querySelector('.dt-foot')).toBeNull()
    expect(container.querySelector('.dt-head .badge')).toBeNull()
    expect(screen.queryByTestId('detail-close')).toBeNull()
  })

  it('requirement 一句话渲染在「任务」区；badge/onClose 传入即生效', async () => {
    const onClose = vi.fn()
    await renderDetail({
      requirement: '修复登录 token 过期后静默失效',
      badge: <span className="badge badge--green">✓ 可以放行</span>,
      onClose,
    })
    expect(screen.getByText('修复登录 token 过期后静默失效')).toBeInTheDocument()
    expect(screen.getByText('✓ 可以放行')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('detail-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('TaskDetail GSAP 入场（reduced-motion 降级）', () => {
  it('prefers-reduced-motion: reduce → 直达终态（opacity 1），且真消费了 gsap.matchMedia 的媒体查询', async () => {
    stubMatchMedia(true)
    await renderDetail()
    const mmCalls = (window.matchMedia as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]))
    expect(mmCalls.some((q) => q.includes('prefers-reduced-motion: reduce'))).toBe(true)
    const item = screen.getByTestId('dtl-open')
    expect(item.style.opacity).toBe('1')
  })
})
