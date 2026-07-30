/**
 * SecretsCard.test(v6 T8)——机器级凭证卡:掩码只读/write-only 编辑(绝不回填明文)/
 * 保存-删除真 POST-DELETE 且成功后重拉+onChanged(就绪三灯联动信号)/CODEX_HOME 只读说明
 * (决策 C2b,无编辑入口)/优先级提示。fetch 打桩;server 契约由 server.test.ts 钉住。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, useT } from '../i18n'
import { SecretsCard } from './SecretsCard'

let keys: Record<string, { set: boolean; masked?: string }>
let postCalls: Array<Record<string, unknown>>
let deleteUrls: string[]
let getCalls: number

function renderCard(onChanged?: () => void, onDirtyChange?: (dirty: boolean) => void) {
  function LanguageToggle(): JSX.Element {
    const { setLang } = useT()
    return <button type="button" data-testid="test-language-en" onClick={() => setLang('en')}>en</button>
  }
  render(
    <I18nProvider>
      <LanguageToggle />
      <SecretsCard onChanged={onChanged} onDirtyChange={onDirtyChange} />
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
  it('打开空 write-only 输入不算 dirty，真实输入才上报，清空或取消后清除', async () => {
    const onDirtyChange = vi.fn()
    renderCard(undefined, onDirtyChange)
    fireEvent.click(await screen.findByTestId('sc-edit-OPENAI_API_KEY'))
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))

    const input = screen.getByTestId('sc-input-OPENAI_API_KEY')
    fireEvent.change(input, { target: { value: 'not-saved' } })
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))

    fireEvent.change(input, { target: { value: '' } })
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))

    fireEvent.change(input, { target: { value: 'not-saved-again' } })
    fireEvent.click(screen.getByTestId('sc-cancel-OPENAI_API_KEY'))
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
  })

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

  it('④CODEX_HOME:只读说明行,无输入框无编辑钮(决策 C2b,不做假开关);优先级提示折进「▸ 高级设置」', async () => {
    renderCard()
    await screen.findByTestId('sc-edit-CLAUDE_CODE_OAUTH_TOKEN') // 核心凭证列表就位
    // IA 精简（2026-07-14）：CODEX_HOME 只读路径 + 优先级说明收进「▸ 高级设置」折叠区，展开后可见。
    fireEvent.click(screen.getByTestId('sc-adv'))
    const row = screen.getByTestId('sc-row-CODEX_HOME')
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

  it('切换语言时不重拉凭证、不清空 write-only 草稿，既有错误按当前语言重算', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/secrets' && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: false, error: '值超长(>4KB)' }), { status: 400 })
      }
      if (url === '/api/secrets') {
        getCalls += 1
        return new Response(JSON.stringify({ ok: true, keys }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderCard()
    fireEvent.click(await screen.findByTestId('sc-edit-OPENAI_API_KEY'))
    fireEvent.change(screen.getByTestId('sc-input-OPENAI_API_KEY'), { target: { value: 'keep-me' } })
    fireEvent.click(screen.getByTestId('sc-save-OPENAI_API_KEY'))
    expect(await screen.findByTestId('sc-op-error')).toHaveTextContent('值超长')
    expect(getCalls).toBe(1)

    fireEvent.click(screen.getByTestId('test-language-en'))

    expect(screen.getByTestId('sc-input-OPENAI_API_KEY')).toHaveValue('keep-me')
    expect(screen.getByTestId('sc-op-error')).toHaveTextContent('Request failed (HTTP 400).')
    expect(screen.getByTestId('sc-op-error')).not.toHaveTextContent('值超长')
    expect(getCalls).toBe(1)
  })
})

describe('SecretsCard —— 前置缺失引导「怎么拿」(G2:不光报缺,教怎么获取)', () => {
  it('①claude-code `claude setup-token` 引导(已配态也常驻,折进「▸ 高级设置」)', async () => {
    // 缺省 beforeEach:CLAUDE_CODE_OAUTH_TOKEN set=true —— 引导仍须在(不只未配才教)
    renderCard()
    await screen.findByTestId('sc-row-CLAUDE_CODE_OAUTH_TOKEN')
    // IA 精简：「怎么拿」引导收进「▸ 高级设置」折叠区，展开后仍是静态命令文本。
    fireEvent.click(screen.getByTestId('sc-adv'))
    expect(screen.getByTestId('sc-howto-CLAUDE_CODE_OAUTH_TOKEN').textContent).toContain('claude setup-token')
  })

  it('②codex `codex login` 与 platform.openai.com/api-keys 两条获取路径(折进「▸ 高级设置」)', async () => {
    renderCard()
    await screen.findByTestId('sc-row-OPENAI_API_KEY')
    fireEvent.click(screen.getByTestId('sc-adv'))
    const howto = screen.getByTestId('sc-howto-OPENAI_API_KEY')
    expect(howto.textContent).toContain('codex login')
    expect(howto.textContent).toContain('platform.openai.com/api-keys')
  })

  it('④write-only 回归:进编辑态输入仍空,引导只是静态命令文本、不回显掩码/明文', async () => {
    renderCard()
    fireEvent.click(await screen.findByTestId('sc-edit-CLAUDE_CODE_OAUTH_TOKEN'))
    expect(screen.getByTestId('sc-input-CLAUDE_CODE_OAUTH_TOKEN')).toHaveValue('')
    const row = screen.getByTestId('sc-row-CLAUDE_CODE_OAUTH_TOKEN')
    expect(row.textContent).not.toContain('tok…7f3a') // 编辑态不显掩码
    // 引导已折进「▸ 高级设置」——展开后仍是静态命令文本，不回显掩码/明文
    fireEvent.click(screen.getByTestId('sc-adv'))
    expect(screen.getByTestId('sc-howto-CLAUDE_CODE_OAUTH_TOKEN').textContent).toContain('claude setup-token')
  })
})

/**
 * Bug7：挂载/动作后 reload 无 seq 守卫 → 慢响应盖快响应（out-of-order）/setState-after-unmount。
 * 参照 SkillChain/SkillHealthPanel 的守卫。这里以「连保存两次」制造两发 reload 竞态，验后发起的
 * 快响应不被先发起的慢响应覆盖。
 */
describe('SecretsCard Bug7：reload seq 守卫（慢响应不盖快响应）', () => {
  it('out-of-order：先发起的慢 reload 回来不覆盖后发起的快 reload 落地值', async () => {
    let getCount = 0
    const laterGets: Array<(r: Response) => void> = []
    const initial = { CLAUDE_CODE_OAUTH_TOKEN: { set: true, masked: 'v1…7f3a' }, OPENAI_API_KEY: { set: false } }
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/secrets' && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      if (url === '/api/secrets') {
        getCount += 1
        if (getCount === 1) return new Response(JSON.stringify({ ok: true, keys: initial }), { status: 200 })
        return new Promise<Response>((resolve) => laterGets.push(resolve)) // GET#2、#3 手控解析顺序
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch

    render(
      <I18nProvider>
        <SecretsCard />
      </I18nProvider>,
    )
    await screen.findByTestId('sc-masked-CLAUDE_CODE_OAUTH_TOKEN') // GET#1 落定

    // 保存#1 → reload GET#2（先发起，稍后让它慢回）
    fireEvent.click(screen.getByTestId('sc-edit-CLAUDE_CODE_OAUTH_TOKEN'))
    fireEvent.change(screen.getByTestId('sc-input-CLAUDE_CODE_OAUTH_TOKEN'), { target: { value: 'v2' } })
    fireEvent.click(screen.getByTestId('sc-save-CLAUDE_CODE_OAUTH_TOKEN'))
    await waitFor(() => expect(laterGets.length).toBe(1))

    // 保存#2 → reload GET#3（后发起，让它先回）
    fireEvent.click(screen.getByTestId('sc-edit-CLAUDE_CODE_OAUTH_TOKEN'))
    fireEvent.change(screen.getByTestId('sc-input-CLAUDE_CODE_OAUTH_TOKEN'), { target: { value: 'v3' } })
    fireEvent.click(screen.getByTestId('sc-save-CLAUDE_CODE_OAUTH_TOKEN'))
    await waitFor(() => expect(laterGets.length).toBe(2))

    // GET#3（后发起）先回 → v3
    await act(async () => {
      laterGets[1]!(new Response(JSON.stringify({ ok: true, keys: { CLAUDE_CODE_OAUTH_TOKEN: { set: true, masked: 'v3…zzzz' }, OPENAI_API_KEY: { set: false } } }), { status: 200 }))
    })
    // GET#2（先发起）后回 → v2（stale）——有 seq 守卫则被忽略
    await act(async () => {
      laterGets[0]!(new Response(JSON.stringify({ ok: true, keys: { CLAUDE_CODE_OAUTH_TOKEN: { set: true, masked: 'v2…yyyy' }, OPENAI_API_KEY: { set: false } } }), { status: 200 }))
    })

    expect(screen.getByTestId('sc-masked-CLAUDE_CODE_OAUTH_TOKEN').textContent).toBe('v3…zzzz')
  })
})
