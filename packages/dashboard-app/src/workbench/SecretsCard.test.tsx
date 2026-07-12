/**
 * SecretsCard.test(v6 T8)——机器级凭证卡:掩码只读/write-only 编辑(绝不回填明文)/
 * 保存-删除真 POST-DELETE 且成功后重拉+onChanged(就绪三灯联动信号)/CODEX_HOME 只读说明
 * (决策 C2b,无编辑入口)/优先级提示。fetch 打桩;server 契约由 server.test.ts 钉住。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SecretsCard } from './SecretsCard'

let keys: Record<string, { set: boolean; masked?: string }>
let postCalls: Array<Record<string, unknown>>
let deleteUrls: string[]
let getCalls: number

function renderCard(onChanged?: () => void) {
  render(
    <I18nProvider>
      <SecretsCard onChanged={onChanged} />
    </I18nProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  keys = {
    CLAUDE_CODE_OAUTH_TOKEN: { set: true, masked: 'tok…7f3a' },
    OPENAI_API_KEY: { set: false },
  }
  postCalls = []
  deleteUrls = []
  getCalls = 0
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === '/api/secrets' && opts?.method === 'POST') {
      postCalls.push(JSON.parse(String(opts.body)) as Record<string, unknown>)
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    if (url.startsWith('/api/secrets?key=') && opts?.method === 'DELETE') {
      deleteUrls.push(url)
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    if (url === '/api/secrets') {
      getCalls += 1
      return new Response(JSON.stringify({ ok: true, keys }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SecretsCard —— 掩码只读与 write-only 编辑', () => {
  it('①已配键显掩码不显明文;未配键显「未配置」;点「更新」输入框为空(绝不回填)', async () => {
    renderCard()
    expect((await screen.findByTestId('sc-masked-CLAUDE_CODE_OAUTH_TOKEN')).textContent).toBe('tok…7f3a')
    expect(screen.getByTestId('sc-unset-OPENAI_API_KEY')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('sc-edit-CLAUDE_CODE_OAUTH_TOKEN'))
    expect(screen.getByTestId('sc-input-CLAUDE_CODE_OAUTH_TOKEN')).toHaveValue('')
  })

  it('②保存:POST {key,value} → 成功后退出编辑态、GET 重拉、onChanged 触发一次', async () => {
    const onChanged = vi.fn()
    renderCard(onChanged)
    fireEvent.click(await screen.findByTestId('sc-edit-OPENAI_API_KEY'))
    fireEvent.change(screen.getByTestId('sc-input-OPENAI_API_KEY'), { target: { value: 'sk-new-123' } })
    keys = { ...keys, OPENAI_API_KEY: { set: true, masked: 'sk-…-123' } }
    fireEvent.click(screen.getByTestId('sc-save-OPENAI_API_KEY'))
    await waitFor(() => expect(postCalls).toEqual([{ key: 'OPENAI_API_KEY', value: 'sk-new-123' }]))
    await waitFor(() => expect(screen.getByTestId('sc-masked-OPENAI_API_KEY')).toHaveTextContent('sk-…-123'))
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(getCalls).toBe(2) // 挂载 1 + 保存后重拉 1
  })

  it('③删除:DELETE ?key= → 重拉后显未配置、onChanged 触发', async () => {
    const onChanged = vi.fn()
    renderCard(onChanged)
    await screen.findByTestId('sc-masked-CLAUDE_CODE_OAUTH_TOKEN')
    keys = { ...keys, CLAUDE_CODE_OAUTH_TOKEN: { set: false } }
    fireEvent.click(screen.getByTestId('sc-del-CLAUDE_CODE_OAUTH_TOKEN'))
    await waitFor(() => expect(deleteUrls).toEqual(['/api/secrets?key=CLAUDE_CODE_OAUTH_TOKEN']))
    await waitFor(() => expect(screen.getByTestId('sc-unset-CLAUDE_CODE_OAUTH_TOKEN')).toBeInTheDocument())
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('④CODEX_HOME:只读说明行,无输入框无编辑钮(决策 C2b,不做假开关);优先级提示常驻', async () => {
    renderCard()
    const row = await screen.findByTestId('sc-row-CODEX_HOME')
    expect(row.querySelector('input')).toBeNull()
    expect(row.querySelector('button')).toBeNull()
    expect(screen.getByText(/宿主环境变量.*非空.*此处保存的值/)).toBeInTheDocument()
  })

  it('⑤保存失败:server error 原文行内展示,编辑态保持(不静默吞错)', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/secrets' && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: false, error: '值超长(>4KB)' }), { status: 400 })
      }
      if (url === '/api/secrets') return new Response(JSON.stringify({ ok: true, keys }), { status: 200 })
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderCard()
    fireEvent.click(await screen.findByTestId('sc-edit-OPENAI_API_KEY'))
    fireEvent.change(screen.getByTestId('sc-input-OPENAI_API_KEY'), { target: { value: 'x' } })
    fireEvent.click(screen.getByTestId('sc-save-OPENAI_API_KEY'))
    expect((await screen.findByTestId('sc-op-error')).textContent).toContain('值超长')
    expect(screen.getByTestId('sc-input-OPENAI_API_KEY')).toBeInTheDocument()
  })
})

describe('SecretsCard —— 前置缺失引导「怎么拿」(G2:不光报缺,教怎么获取)', () => {
  it('①claude-code 键行含 `claude setup-token` 引导(已配态也常驻,兼作轮换指引)', async () => {
    // 缺省 beforeEach:CLAUDE_CODE_OAUTH_TOKEN set=true —— 引导仍须在(不只未配才教)
    renderCard()
    const row = await screen.findByTestId('sc-row-CLAUDE_CODE_OAUTH_TOKEN')
    expect(row.textContent).toContain('claude setup-token')
  })

  it('②codex 键行含 `codex login` 与 platform.openai.com/api-keys 两条获取路径', async () => {
    renderCard()
    const row = await screen.findByTestId('sc-row-OPENAI_API_KEY')
    expect(row.textContent).toContain('codex login')
    expect(row.textContent).toContain('platform.openai.com/api-keys')
  })

  it('④write-only 回归:进编辑态输入仍空,引导只是静态命令文本、不回显掩码/明文', async () => {
    renderCard()
    fireEvent.click(await screen.findByTestId('sc-edit-CLAUDE_CODE_OAUTH_TOKEN'))
    expect(screen.getByTestId('sc-input-CLAUDE_CODE_OAUTH_TOKEN')).toHaveValue('')
    const row = screen.getByTestId('sc-row-CLAUDE_CODE_OAUTH_TOKEN')
    expect(row.textContent).not.toContain('tok…7f3a') // 编辑态不显掩码
    expect(row.textContent).toContain('claude setup-token') // 引导仍在,且是静态文本
  })
})
