/**
 * SessionResumeRow（v9-I）—— 恢复会话行三态：
 *   · found + resumeCmd：mono 命令可拷贝 + platform/sid 短形小字；
 *   · found:false / 请求失败：一行灰字「未找到可恢复会话」（诚实缺省，不是故障）；
 *   · found + resumeCmd:null（opencode/pi 无把握拼法）：只显示会话身份 + 目录拷贝，不给假命令。
 * client 打桩（fetchSessionLink 唯一数据面）；拷贝走宿主注入 onCopy（组件零剪贴板直连）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { SessionResumeRow } from './SessionResumeRow'
import { fetchSessionLink, type SessionLink } from '../api/client'

vi.mock('../api/client', () => ({ fetchSessionLink: vi.fn() }))
const mockLink = vi.mocked(fetchSessionLink)

beforeEach(() => {
  localStorage.clear()
  mockLink.mockReset()
})

function renderRow(onCopy?: (v: string) => void) {
  return render(
    <I18nProvider>
      <SessionResumeRow root="/repo" name="hotfix" onCopy={onCopy} />
    </I18nProvider>,
  )
}

describe('SessionResumeRow —— found + resumeCmd（claude）', () => {
  it('渲染 mono 恢复命令 + platform/sid 短形小字；拷贝钮回传完整命令', async () => {
    const cmd = 'cd "/tmp/wt-a" && claude --resume aaaabbbb-1111-2222-3333-444455556666'
    const link: SessionLink = {
      found: true,
      platform: 'claude',
      sessionId: 'aaaabbbb-1111-2222-3333-444455556666',
      dir: '/tmp/wt-a',
      resumeCmd: cmd,
      mtime: '2026-07-12T10:00:00Z',
    }
    mockLink.mockResolvedValue(link)
    const onCopy = vi.fn()
    renderRow(onCopy)

    const row = await screen.findByTestId('dt8-conn-resume')
    expect(row.textContent).toContain('恢复会话')
    expect(row.textContent).toContain(cmd)
    // 短形元信息：platform + sid 前 8 位（不是整条 UUID 平铺）
    expect(screen.getByTestId('dt8-conn-resume-meta').textContent).toBe('claude · aaaabbbb')

    const btn = screen.getByTestId('dt8-conn-resume-copy')
    expect(btn.getAttribute('data-copy')).toBe(cmd)
    fireEvent.click(btn)
    expect(onCopy).toHaveBeenCalledWith(cmd)
  })

  it('root/name 变化重取（依赖数组）——挂载即发一次请求', async () => {
    mockLink.mockResolvedValue({ found: false })
    renderRow()
    await screen.findByTestId('dt8-conn-resume-none')
    expect(mockLink).toHaveBeenCalledWith('/repo', 'hotfix')
  })
})

describe('SessionResumeRow —— found:false / 请求失败', () => {
  it('found:false → 一行灰字「未找到可恢复会话」，无拷贝钮', async () => {
    mockLink.mockResolvedValue({ found: false, dir: '/tmp/wt-b', reason: 'no-session' })
    renderRow()

    const row = await screen.findByTestId('dt8-conn-resume-none')
    expect(row.textContent).toContain('未找到可恢复会话')
    expect(screen.queryByTestId('dt8-conn-resume')).toBeNull()
    expect(screen.queryByTestId('dt8-conn-resume-copy')).toBeNull()
  })

  it('fetch reject（网络失败）→ 同样收敛灰字行，不炸卡', async () => {
    mockLink.mockRejectedValue(new Error('boom'))
    renderRow()
    await screen.findByTestId('dt8-conn-resume-none')
  })

  it('loading 期间静默（渲染 null，不闪骨架）', async () => {
    let resolve!: (v: SessionLink) => void
    mockLink.mockReturnValue(new Promise<SessionLink>((r) => (resolve = r)))
    renderRow()
    expect(screen.queryByTestId('dt8-conn-resume')).toBeNull()
    expect(screen.queryByTestId('dt8-conn-resume-none')).toBeNull()
    resolve({ found: false })
    await screen.findByTestId('dt8-conn-resume-none')
  })
})

describe('SessionResumeRow —— found + resumeCmd:null（无把握拼法的平台）', () => {
  it('只显示「会话 <sid8> · <platform>」+ 目录拷贝，不渲染假命令', async () => {
    mockLink.mockResolvedValue({
      found: true,
      platform: 'pi',
      sessionId: '0123456789abcdef',
      dir: '/tmp/wt-c',
      resumeCmd: null,
    })
    const onCopy = vi.fn()
    renderRow(onCopy)

    const row = await screen.findByTestId('dt8-conn-resume')
    expect(row.textContent).toContain('会话 01234567 · pi')
    expect(row.textContent).not.toContain('resume')

    const btn = screen.getByTestId('dt8-conn-resume-copy')
    expect(btn.getAttribute('data-copy')).toBe('cd "/tmp/wt-c"')
    fireEvent.click(btn)
    expect(onCopy).toHaveBeenCalledWith('cd "/tmp/wt-c"')
  })
})
