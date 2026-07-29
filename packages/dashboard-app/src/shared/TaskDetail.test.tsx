/**
 * TaskDetail（T8 共享任务详情组件）—— 阶段区：dtl- 垂直时间线，收件箱右栏（T9 宿主），视觉基准
 * design-demos/v5-progress-workbench.html 收件箱右卡。
 *
 * 意图迁移表（旧 ChangeDetailCard.test.tsx 断言 → 新归属；旧文件与组件暂留给 InboxView
 * 现行实现消费，T9 换宿主后由 T18 退役清理）：
 *   · verify 三轨证据格语义色 pass/fail/pending    → 当前行高亮框（dtl-box）内字段格
 *     data-state=pass/fail/miss 三态（本文件「默认 workflow 时间线」组）
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
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { I18nProvider, useT } from '../i18n'
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
  localStorage.clear()
  histEntries = []
  global.fetch = vi.fn(async (url: string) => {
    if (/\/api\/change\/[^/]+\/history\?root=/.test(url)) {
      return new Response(JSON.stringify({ entries: histEntries }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => {
  localStorage.clear()
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
  function LanguageToggle(): JSX.Element {
    const { setLang } = useT()
    return <button type="button" data-testid="task-language-en" onClick={() => setLang('en')}>en</button>
  }
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
      <LanguageToggle />
      <TaskDetail {...props} />
    </I18nProvider>,
  )
  // 等 history 拉取落定（组件挂 data-settled）——不等的话异步 setEntries 落在用例结束后，
  // 会刷一屏「not wrapped in act」告警且历史区断言时机不稳。
  await waitFor(() => expect(screen.getByTestId('dt-hist-sec').getAttribute('data-settled')).toBe('true'))
  return { ...props, container, rerender }
}

describe('TaskDetail 垂直时间线（默认 workflow 七阶段）', () => {
  it('为所有 Change 挂载独立的相关会话检索入口，且初始不发起检索', async () => {
    await renderDetail({
      change: makeChange('related-session-memory', 'open', { fields: {} }),
    })
    expect(screen.getByRole('heading', { name: '相关会话' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: '检索词' })).toHaveValue('related session memory')
    expect(fetch).not.toHaveBeenCalledWith('/api/mem/related-sessions/search', expect.anything())
  })

  it('切换项目或 Change 时同步重挂相关会话 scope，不提交上一 scope 的节点', async () => {
    const props = await renderDetail({
      root: '/repo-a',
      change: makeChange('first-change', 'open', { fields: {} }),
    })
    const previousSection = screen.getByTestId('related-sessions')

    await act(async () => {
      props.rerender(
        <I18nProvider>
          <TaskDetail
            {...props}
            root="/repo-b"
            change={makeChange('second-change', 'open', { fields: {} })}
          />
        </I18nProvider>,
      )
    })

    expect(screen.getByTestId('related-sessions')).not.toBe(previousSection)
    expect(screen.getByRole('textbox', { name: '检索词' })).toHaveValue('second change')
  })

  it('按 stageArtifacts 渲染 7 个阶段行，行语义（data-state）：done ×4 / cur(verify) / todo ×2', async () => {
    const { container } = await renderDetail()
    const items = container.querySelectorAll('[data-anim="stage"]')
    expect(items).toHaveLength(7)
    for (const step of ['open', 'explore', 'spec', 'build']) {
      expect(screen.getByTestId(`dtl-${step}`).getAttribute('data-state')).toBe('done')
    }
    expect(screen.getByTestId('dtl-verify').getAttribute('data-state')).toBe('cur')
    for (const step of ['ship', 'archive']) {
      expect(screen.getByTestId(`dtl-${step}`).getAttribute('data-state')).toBe('todo')
    }
  })

  it('当前行（verify）高亮框：三轨字段语义色 + 全过结论；未开始行显示「未开始」，无产物 done 行显示「无产物」', async () => {
    await renderDetail()
    const box = screen.getByTestId('dtl-verify').querySelector('[data-testid="dtl-box"]')
    expect(box).not.toBeNull()
    expect(screen.getByTestId('dt-field-verify_result').getAttribute('data-state')).toBe('pass')
    expect(box?.querySelector('[data-testid="dt-verdict"]')?.textContent).toContain('三轨全过')
    expect(screen.getByTestId('dtl-ship').textContent).toContain('未开始')
    expect(screen.getByTestId('dtl-open').textContent).toContain('无产物')
  })

  it('三轨有 fail → 结论列出未过项；verification_report 未设不算未过项（Important-1 判据迁移）且落 data-state=miss 占位', async () => {
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
    const verdict = within(screen.getByTestId('dtl-verify')).getByTestId('dt-verdict')
    expect(verdict.textContent).toContain('codex_review')
    expect(verdict.textContent).not.toContain('verification_report')
    const miss = screen.getByTestId('dt-field-verification_report')
    expect(miss.getAttribute('data-state')).toBe('miss')
    expect(miss.textContent).toContain('未产出')
    expect(screen.getByTestId('dt-field-codex_review_result').getAttribute('data-state')).toBe('fail')
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

  it('产物复制晚到且期间切为英文时，toast 使用当前语言', async () => {
    let releaseCopy!: () => void
    const writeText = vi.fn(() => new Promise<void>((resolve) => { releaseCopy = resolve }))
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const props = await renderDetail()

    fireEvent.click(screen.getByTestId('dtl-chip-design_doc'))
    fireEvent.click(screen.getByTestId('task-language-en'))
    releaseCopy()

    await waitFor(() => expect(props.onToast).toHaveBeenCalledWith('Copied: docs/design.md'))
  })

  it('OpenSpec tasks.md 投影的 checkbox 只显示在其 pipeline phase，不从原始需求另造通用 Todo', async () => {
    await renderDetail({
      change: makeChange('c1', 'verify', {
        fields: { verify_result: 'pass', agent_review_result: 'pass', codex_review_result: 'pass' },
        todo: {
          hasTaskSource: true,
          stages: [
            { id: 'open', label: '立项', status: 'done', tasks: [{ text: '确认范围', completed: true }] },
            { id: 'explore', label: '调研', status: 'done', tasks: [] },
            { id: 'spec', label: '规格', status: 'done', tasks: [] },
            { id: 'build', label: '实现', status: 'done', tasks: [{ text: '实现登录页', completed: true }] },
            { id: 'verify', label: '验证', status: 'current', tasks: [{ text: '运行浏览器验收', completed: false }] },
            { id: 'ship', label: '交付', status: 'pending', tasks: [] },
            { id: 'archive', label: '归档', status: 'pending', tasks: [] },
          ],
        },
      }),
    })
    expect(screen.getByTestId('dtl-todo-open').textContent).toContain('确认范围')
    expect(screen.getByTestId('dtl-todo-open-0').getAttribute('data-completed')).toBe('true')
    expect(screen.getByTestId('dtl-todo-build').textContent).toContain('实现登录页')
    expect(screen.getByTestId('dtl-todo-verify').textContent).toContain('运行浏览器验收')
    expect(screen.getByTestId('dtl-todo-verify-0').getAttribute('data-completed')).toBe('false')
    expect(screen.queryByTestId('dtl-todo-ship')).toBeNull()

    const compactDoneTasks = screen.getByTestId('dtl-todo-open-compact')
    expect(compactDoneTasks.tagName).toBe('DETAILS')
    expect(within(compactDoneTasks).getByText('查看 1 项已完成任务')).toBeInTheDocument()
    expect(compactDoneTasks).not.toHaveAttribute('open')
    expect(screen.getByTestId('dtl-todo-open')).toHaveClass('max-[769px]:hidden')
    expect(screen.getByTestId('dtl-todo-verify')).not.toHaveClass('max-[769px]:hidden')
  })
})

describe('TaskDetail 自定义 workflow（三阶段）与 rules 缺失回落', () => {
  it('三阶段 rules → 3 行；当前 review 门行有高亮框与「本阶段无产物登记」；draft done 行出 design_doc chip', async () => {
    const { container } = await renderDetail({
      change: makeChange('cn1', 'review', { fields: { workflow: 'release-train', design_doc: 'docs/draft.md' } }),
      rules: CN_RULES,
    })
    expect(container.querySelectorAll('[data-anim="stage"]')).toHaveLength(3)
    expect(screen.getByTestId('dtl-review').getAttribute('data-state')).toBe('cur')
    expect(screen.getByTestId('dtl-review').querySelector('[data-testid="dtl-box"]')).not.toBeNull()
    expect(screen.getByTestId('dtl-review').textContent).toContain('本阶段无产物登记')
    expect(screen.getByTestId('dtl-chip-design_doc').getAttribute('data-copy')).toBe('docs/draft.md')
  })

  it('rules 缺失（定义拉取失败）→ 时间线留白但卡不消失（G17 底线）：回落产物正门 chips', async () => {
    const { container } = await renderDetail({
      change: makeChange('c1', 'verify', { fields: { design_doc: 'docs/design.md', pr_url: 'https://x/pr/1' } }),
      rules: undefined,
    })
    expect(container.querySelectorAll('[data-anim="stage"]')).toHaveLength(0)
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
    expect(container.querySelectorAll('[data-anim="stage"]')).toHaveLength(0)
    expect(screen.getByText('工作流定义不可用，暂无法展示阶段——先列已产出的产物')).toBeInTheDocument()
    expect(screen.getByTestId('dtl-chip-design_doc')).toBeInTheDocument()
  })

  it('phase 错位 + automation failed → 失败信息不静默丢：兜底区渲染报错原文折叠与 attempts 元信息（v8-C 后原文在 rawfold 内）', async () => {
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
    expect(screen.getByTestId('dt8-raw-pre').textContent).toContain('boom: sandbox exploded')
    expect(screen.getByTestId('dt8-diag-meta').textContent).toContain('尝试次数 2')
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

  it('当前行 data-state=fail + 失败框 data-tone=bad：报错原文（折叠内）、attempts 元信息、缺产出合并 miss 占位、重试/放弃说明', async () => {
    await renderDetail({ change: failedChange })
    const row = screen.getByTestId('dtl-build')
    expect(row.getAttribute('data-state')).toBe('fail')
    const box = row.querySelector('[data-testid="dtl-box"]')
    expect(box?.getAttribute('data-tone')).toBe('bad')
    expect(screen.getByTestId('dt8-raw-pre').textContent).toContain('verify: 2 failed · auth.test.ts')
    expect(screen.getByTestId('dt8-diag-meta').textContent).toContain('尝试次数 3')
    // build 阶段声明产出 branch/build_sha 均未设 → 合并为一条 miss 占位
    const miss = screen.getByTestId('dt-field-missing')
    expect(miss.getAttribute('data-state')).toBe('miss')
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

  it('②凭证类失败 → 成因徽章（经 i18n）+ 可复制修复命令 tenon setup；last_error 原文仍在', async () => {
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
    expect(screen.getByTestId('detail-fix-cmd').textContent).toBe('tenon setup')
    const copyBtn = screen.getByTestId('detail-fix-copy')
    expect(copyBtn.getAttribute('data-copy')).toBe('tenon setup')
    fireEvent.click(copyBtn)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('tenon setup'))
    // 原文保留（v8-C 后收进 rawfold 折叠，人话结论是补充不是替换）
    expect(screen.getByTestId('dt8-raw-pre').textContent).toContain('OPENAI_API_KEY')
    // 前进转换命令区（detail-cmd）失败态仍不渲染——与修复命令区（detail-fix-cmd）互不相干
    expect(screen.queryByTestId('detail-cmd')).toBeNull()
  })

  it('②agent 非零退出：lifecycle 落盘的真实改写句（含「凭证」）→ 成因徽章 missing-credential + 修复命令 tenon setup（生产主路径，非 agent-nonzero）', async () => {
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
    expect(screen.getByTestId('detail-fix-cmd').textContent).toBe('tenon setup')
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
    // cancelled 非故障：无修复命令区（尤其不再建议 tenon doctor）
    expect(screen.queryByTestId('detail-fix-cmd')).toBeNull()
    // last_error 原文照渲染（v8-C 后在 rawfold 折叠内，人话结论是补充不是替换，与 W3 既有口径一致）
    expect(screen.getByTestId('dt8-raw-pre').textContent).toContain('任务被人工终止')
    // v8-C：cancelled 走琥珀 tone（人为终止非故障，不红成硬故障）
    expect(screen.getByTestId('dt-diag').getAttribute('data-tone')).toBe('amb')
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

  it('cause 空串（老数据/写入端未落）→ 回落 regex：凭证原文仍判 missing-credential + tenon setup', async () => {
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
    expect(screen.getByTestId('detail-fix-cmd').textContent).toBe('tenon setup')
  })
})

// #7（2026-07-15）：门行「在终端继续 tenon transition」命令区退役（与抽屉内联动作按钮等价，
// 冗余）——原本这里的两条「命令文案/自定义 event」用例随之删除。失败态本就不渲染该区（见上方
// 「失败态不渲染 detail-cmd」用例，保留），门行现在也一律不渲染 detail-cmd（下方断言锁死）。
describe('TaskDetail #7：门行不再渲染「在终端继续」命令区（退役）', () => {
  it('门行（verify 前进边就绪）也不渲染 detail-cmd —— 内联动作即等价', async () => {
    await renderDetail()
    expect(screen.queryByTestId('detail-cmd')).toBeNull()
    expect(screen.queryByTestId('detail-cmd-copy')).toBeNull()
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
  it('宿主传入 actions → 渲染在置顶动作条（dt8-acts）并可点；动作只此一处（旧底部动作区退役，v8-C 动作置顶）', async () => {
    const onRetry = vi.fn()
    await renderDetail({
      actions: (
        <button type="button" data-testid="host-retry" onClick={onRetry}>
          ↻ 重试
        </button>
      ),
    })
    fireEvent.click(screen.getByTestId('host-retry'))
    expect(onRetry).toHaveBeenCalledOnce()
    // 动作按钮只渲染一份且在置顶条内（不再有底部动作区双挂）
    expect(screen.getAllByTestId('host-retry')).toHaveLength(1)
    const acts = screen.getByTestId('dt8-acts')
    expect(acts.contains(screen.getByTestId('host-retry'))).toBe(true)
    expect(screen.getByTestId('dt-foot-label').textContent).toBe('verify → ship')
    // 置顶位置：动作条在阶段区之前
    const stagesSec = screen.getByTestId('dt-stages-sec')
    expect(acts.compareDocumentPosition(stagesSec) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // #7：「动作与终端命令等价」语义说明已退役——动作条只剩动作 + foot 标签，无冗余解释文字
  })

  it('不传 actions → 无动作条；不传 badge → 头部只有名字（无徽章）；不传 onClose → 无关闭钮', async () => {
    await renderDetail()
    expect(screen.queryByTestId('dt8-acts')).toBeNull()
    // 头部除任务名外无任何徽章/按钮文案
    expect(screen.getByTestId('dt-head').textContent).toBe('c1')
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

/**
 * 失败详情契约：动作置顶 + 人话报错卡（原文折叠）+
 * 「自己上手修」连接命令卡 + 流程级历史。props 接口零增改——宿主（B/D）不动也编译。
 */
describe('TaskDetail v8-C 意见④：人话报错卡（dt-diag）', () => {
  const fz = zh.failure as Record<string, string>

  it('失败态 → 卡标题=人话结论（cause_*）+ 处置指引（hint_*）；报错原文收 <details> 默认收起；meta 行含 attempts/cause', async () => {
    await renderDetail({
      change: makeChange('hotfix', 'build', {
        fields: {
          automation: 'failed',
          automation_last_error:
            'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
          automation_attempts: '3',
        },
      }),
    })
    expect(screen.getByTestId('dt-diag-cause').textContent).toBe(fz['cause_missing-docker'])
    expect(screen.getByTestId('dt8-diag-hint').textContent).toBe(fz['hint_missing-docker'])
    const fold = screen.getByTestId('dt8-rawfold') as HTMLDetailsElement
    expect(fold.open).toBe(false)
    expect(fold.querySelector('summary')?.textContent).toContain('automation_last_error')
    expect(screen.getByTestId('dt8-raw-pre').textContent).toContain('docker daemon')
    const meta = screen.getByTestId('dt8-diag-meta')
    expect(meta.textContent).toContain('尝试次数 3')
    expect(meta.textContent).toContain('原因 missing-docker')
    // 非 cancelled 不带琥珀修饰（红 tone）
    expect(screen.getByTestId('dt-diag').getAttribute('data-tone')).toBe('red')
  })

  it('fixCommand 可拷 chip 保留且在报错卡内（凭证类 → tenon setup）', async () => {
    await renderDetail({
      change: makeChange('hotfix', 'build', {
        fields: { automation: 'failed', automation_last_error: '未检测到 codex 凭证：宿主机需设 OPENAI_API_KEY' },
      }),
    })
    const card = screen.getByTestId('dt-diag')
    const chip = screen.getByTestId('detail-fix-cmd')
    expect(card.contains(chip)).toBe(true)
    expect(chip.textContent).toBe('tenon setup')
    expect(screen.getByTestId('detail-fix-copy').getAttribute('data-copy')).toBe('tenon setup')
  })

  it('last_error 空串 → 不渲染 rawfold（不给空折叠）；meta 行仍给 cause', async () => {
    await renderDetail({
      change: makeChange('hotfix', 'build', {
        fields: { automation: 'failed', automation_cause: 'cancelled', automation_last_error: '' },
      }),
    })
    expect(screen.queryByTestId('dt8-rawfold')).toBeNull()
    expect(screen.getByTestId('dt8-diag-meta').textContent).toContain('原因 cancelled')
  })
})

describe('TaskDetail v8-C 意见④：「自己上手修」连接命令卡（dt8-conn）', () => {
  const connFields = {
    automation: 'failed',
    automation_last_error: 'boom',
    automation_worktree: '/Users/x/.pipeline/worktrees/hotfix',
    automation_sandbox: 'pipeline-afk-hotfix',
  }

  it('失败态且有现场字段 → 三行可拷命令；automation!==running → 容器行带「（未在跑）」小注；卡底有来源字段说明', async () => {
    await renderDetail({ change: makeChange('hotfix', 'build', { fields: { ...connFields } }) })
    expect(screen.getByTestId('dt8-conn')).toBeInTheDocument()
    const wt = screen.getByTestId('dt8-conn-worktree')
    // 安全字符路径过 shellQuote 原样不带引号（codex 终稿 P2）：展示与 data-copy 同一串——拷走即可用
    expect(wt.textContent).toContain('cd /Users/x/.pipeline/worktrees/hotfix')
    expect(screen.getByTestId('dt8-conn-worktree-copy').getAttribute('data-copy')).toBe(
      'cd /Users/x/.pipeline/worktrees/hotfix',
    )
    const sb = screen.getByTestId('dt8-conn-sandbox')
    expect(sb.textContent).toContain('docker exec -it pipeline-afk-hotfix bash')
    expect(sb.textContent).toContain('未在跑')
    expect(screen.getByTestId('dt8-conn-sandbox-copy').getAttribute('data-copy')).toBe(
      'docker exec -it pipeline-afk-hotfix bash',
    )
    const rr = screen.getByTestId('dt8-conn-rerun')
    // #6（2026-07-15）：按名重跑正确命令是 afk enqueue（afk run 忽略 name、跑整轮）
    expect(rr.textContent).toContain('tenon afk enqueue hotfix')
    expect(screen.getByTestId('dt8-conn-rerun-copy').getAttribute('data-copy')).toBe('tenon afk enqueue hotfix')
    expect(screen.getByTestId('dt8-conn').textContent).toContain('automation_worktree')
  })

  it('sandbox 空串 → 容器行不渲染，worktree/重跑行照常', async () => {
    await renderDetail({
      change: makeChange('hotfix', 'build', { fields: { ...connFields, automation_sandbox: '' } }),
    })
    expect(screen.queryByTestId('dt8-conn-sandbox')).toBeNull()
    expect(screen.getByTestId('dt8-conn-worktree')).toBeInTheDocument()
    expect(screen.getByTestId('dt8-conn-rerun')).toBeInTheDocument()
  })

  it('worktree 路径含空格 → shellQuote 单引号包裹仍是一条可用命令（codex 终稿 P2）', async () => {
    await renderDetail({
      change: makeChange('hotfix', 'build', {
        fields: { ...connFields, automation_worktree: '/Users/x/My Work/wt hotfix' },
      }),
    })
    expect(screen.getByTestId('dt8-conn-worktree-copy').getAttribute('data-copy')).toBe(
      "cd '/Users/x/My Work/wt hotfix'",
    )
  })

  it('现场字段全空 → 卡仍渲染：恢复会话行挂载+重跑行在，无 worktree/sandbox 行（codex 终稿 P2：server 端 worktree 空回落 root 查会话，root 回退路径必须 UI 可达）', async () => {
    await renderDetail({
      change: makeChange('hotfix', 'build', {
        fields: { automation: 'failed', automation_last_error: 'boom' },
      }),
    })
    expect(screen.getByTestId('dt8-conn')).toBeInTheDocument()
    expect(screen.getByTestId('dt8-conn-rerun')).toBeInTheDocument()
    expect(screen.queryByTestId('dt8-conn-worktree')).toBeNull()
    expect(screen.queryByTestId('dt8-conn-sandbox')).toBeNull()
    // 恢复会话行挂载：本基座 fetch 桩对 session-link 报错 → 组件收敛 found:false 灰字行
    await waitFor(() => expect(screen.getByTestId('dt8-conn-resume-none')).toBeInTheDocument())
  })

  it('非失败且非 running 态即使有现场字段也不渲染（卡只服务失败处置与在跑接管）', async () => {
    await renderDetail({
      change: makeChange('c9', 'verify', {
        fields: { automation_worktree: '/w/c9', automation_sandbox: 'pipeline-afk-c9' },
      }),
    })
    expect(screen.queryByTestId('dt8-conn')).toBeNull()
  })

  it('running 态渲染本卡（容器活着，恢复会话最有意义）且容器行无「未在跑」注', async () => {
    await renderDetail({
      change: makeChange('c9', 'verify', {
        fields: {
          automation: 'running',
          automation_worktree: '/w/c9',
          automation_sandbox: 'pipeline-afk-c9',
        },
      }),
    })
    expect(screen.getByTestId('dt8-conn')).toBeInTheDocument()
    const sb = screen.getByTestId('dt8-conn-sandbox')
    expect(sb.textContent).not.toContain('（未在跑）')
  })
})

describe('TaskDetail v8-C 意见④：流程级历史（只留 transition/init/import）', () => {
  it('history 含 set 与未知 kind → 一律滤掉，只渲染 transition/init；区头有流程级口径 hint', async () => {
    histEntries = [
      { ts: '2026-07-09T08:00:00Z', kind: 'init' },
      { ts: '2026-07-09T08:30:00Z', kind: 'set', field: 'design_doc' },
      { ts: '2026-07-09T09:00:00Z', kind: 'transition', from: 'open', to: 'explore', raw: 'open-complete' },
      { ts: '2026-07-09T09:30:00Z', kind: 'set', field: 'plan' },
      { ts: '2026-07-09T10:00:00Z', kind: 'weird-kind', raw: 'noise' },
    ]
    await renderDetail()
    await waitFor(() => expect(screen.getByTestId('dt-hist')).toBeInTheDocument())
    const rows = screen.getAllByTestId(/^dt-hist-\d+$/)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('创建')
    expect(rows[1]?.textContent).toContain('open → explore · open-complete')
    const sec = screen.getByTestId('dt-hist-sec')
    expect(sec.textContent).not.toContain('已更新')
    expect(sec.textContent).not.toContain('noise')
    expect(sec.textContent).toContain('只留流程级事件')
  })

  it('history 含 import（kernel 与 init 同级里程碑，评审 P2-5）→ 白名单放行、人话文案可见', async () => {
    histEntries = [
      { ts: '2026-07-09T08:00:00Z', kind: 'import' },
      { ts: '2026-07-09T09:00:00Z', kind: 'transition', from: 'open', to: 'explore', raw: 'open-complete' },
    ]
    await renderDetail()
    await waitFor(() => expect(screen.getByTestId('dt-hist')).toBeInTheDocument())
    const rows = screen.getAllByTestId(/^dt-hist-\d+$/)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('导入既有任务')
    expect(rows[1]?.textContent).toContain('open → explore · open-complete')
  })

  it('全是 set 事件 → 滤空后按「早期记录不可用」空态展示（不渲染空列表）', async () => {
    histEntries = [
      { ts: '2026-07-09T08:30:00Z', kind: 'set', field: 'design_doc' },
      { ts: '2026-07-09T09:30:00Z', kind: 'set', field: 'plan' },
    ]
    await renderDetail()
    await waitFor(() => expect(screen.getByText('早期记录不可用')).toBeInTheDocument())
    expect(screen.queryByTestId('dt-hist')).toBeNull()
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
