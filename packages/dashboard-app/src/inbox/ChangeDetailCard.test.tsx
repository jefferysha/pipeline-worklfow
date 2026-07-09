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
import { DEFAULT_RULES } from '../model/workflowModel'
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
  render(
    <I18nProvider>
      <ChangeDetailCard {...props} />
    </I18nProvider>,
  )
  return props
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
