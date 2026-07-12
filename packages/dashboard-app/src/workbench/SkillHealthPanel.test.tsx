import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SkillHealthPanel } from './SkillHealthPanel'

/**
 * W4（full-install 批 2 Wave B）：dashboard 只读「技能齐全度」面 + 去终端 setup 引导。
 * 消费既有 GET /api/skills/registry（{skills: WbSkillEntry[]}，每条含 installed 布尔）。
 * 前端只读不装——装在终端（pipeline setup），本面只呈现齐全度 + 引导回终端。
 * fail-soft 纪律：fetch 失败/registry 空都不谎报「已装齐」。
 */

function mockRegistry(skills: unknown[], status = 200): void {
  global.fetch = vi.fn(async (url: string) => {
    if (url === '/api/skills/registry') {
      return new Response(JSON.stringify({ skills }), { status })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
}

function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn(async () => {})
  vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: { writeText } })
  return writeText
}

function renderPanel(): void {
  render(
    <I18nProvider>
      <SkillHealthPanel />
    </I18nProvider>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SkillHealthPanel（full-install W4）：技能齐全度只读面', () => {
  it('① 有未装项 → 「已装 N / 未装 M」计数 + 未装名列表 + 可复制「pipeline setup」引导', async () => {
    const writeText = stubClipboard()
    mockRegistry([
      { name: 'superpowers', installed: true, source: 'local-plugin' },
      { name: 'brainstorming', installed: true, source: 'builtin' },
      { name: 'zoom-out', installed: false, source: 'user' },
      { name: 'uiuxdesign-pro', installed: false, source: 'external-marketplace' },
    ])
    renderPanel()

    // 已装/未装计数口径：installed=true 计已装，false 计未装。
    expect(await screen.findByTestId('skh-installed-n')).toHaveTextContent('2')
    expect(screen.getByTestId('skh-missing-n')).toHaveTextContent('2')

    // 未装名列表（未装>0 才出现）。
    const names = screen.getByTestId('skh-missing-names')
    expect(names).toHaveTextContent('zoom-out')
    expect(names).toHaveTextContent('uiuxdesign-pro')

    // 去终端引导：命令真实、可复制。
    const btn = screen.getByTestId('skh-copy-setup')
    expect(btn).toHaveTextContent('pipeline setup')
    fireEvent.click(btn)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('pipeline setup'))
  })

  it('② 全装 → 「已装齐」态，无未装名列表、无 setup 引导按钮', async () => {
    mockRegistry([
      { name: 'superpowers', installed: true, source: 'local-plugin' },
      { name: 'brainstorming', installed: true, source: 'builtin' },
    ])
    renderPanel()

    expect(await screen.findByTestId('skh-installed-n')).toHaveTextContent('2')
    expect(screen.getByTestId('skh-missing-n')).toHaveTextContent('0')
    expect(screen.getByTestId('skh-all-good')).toBeInTheDocument()
    expect(screen.queryByTestId('skh-missing-names')).toBeNull()
    expect(screen.queryByTestId('skh-copy-setup')).toBeNull()
  })

  it('③ registry fetch 失败 → fail-soft 行内错误，不崩、不谎报已装齐', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: false, error: '磁盘炸了' }), { status: 500 }),
    ) as unknown as typeof fetch
    renderPanel()

    await waitFor(() => expect(screen.getByTestId('skh-error')).toBeInTheDocument())
    expect(screen.getByTestId('skh-error')).toHaveTextContent('磁盘炸了')
    // 不谎报：既不出计数，也不出「已装齐」。
    expect(screen.queryByTestId('skh-all-good')).toBeNull()
    expect(screen.queryByTestId('skh-installed-n')).toBeNull()
  })

  it('④ registry 空/未就绪 → 「未就绪，跑 pipeline doctor 查」不谎报全绿，doctor 可复制', async () => {
    const writeText = stubClipboard()
    mockRegistry([])
    renderPanel()

    expect(await screen.findByTestId('skh-unready')).toHaveTextContent(/未就绪/)
    // 不谎报全绿：绝不出「已装齐」或计数。
    expect(screen.queryByTestId('skh-all-good')).toBeNull()
    expect(screen.queryByTestId('skh-installed-n')).toBeNull()
    // 导向 doctor（与终端同源），命令可复制。
    fireEvent.click(screen.getByTestId('skh-copy-doctor'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('pipeline doctor'))
  })

  it('⑤ 复制命令写入剪贴板的正是真实命令「pipeline setup」（与终端同源，不漂移）', async () => {
    const writeText = stubClipboard()
    mockRegistry([{ name: 'zoom-out', installed: false, source: 'user' }])
    renderPanel()

    fireEvent.click(await screen.findByTestId('skh-copy-setup'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('pipeline setup'))
    // 不漂移成别的安装命令。
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('npm'))
  })
})
