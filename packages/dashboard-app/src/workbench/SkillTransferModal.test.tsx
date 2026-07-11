import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SkillTransferModal, type SkillTransferModalProps } from './SkillTransferModal'

beforeEach(() => {
  localStorage.clear()
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ skills: [
      { name: 'browser-qa', installed: false, source: 'user' },
      { name: 'grill-with-docs', installed: true, source: 'user' },
      { name: 'superpowers:brainstorming', installed: true, source: 'external-marketplace' },
    ] }), { status: 200 }),
  ) as unknown as typeof fetch
})
afterEach(() => vi.restoreAllMocks())

function dt(): DataTransfer {
  const data: Record<string, string> = {}
  return {
    setData: (k: string, v: string) => { data[k] = v },
    getData: (k: string) => data[k] ?? '',
  } as unknown as DataTransfer
}

function renderModal(props: SkillTransferModalProps) {
  render(
    <I18nProvider>
      <SkillTransferModal {...props} />
    </I18nProvider>,
  )
}

describe('SkillTransferModal', () => {
  it('挂载后真 fetch 全部 skill，左栏显示未选中的、右栏显示已选的', async () => {
    renderModal({ selected: ['grill-with-docs'], onSave: vi.fn(), onCancel: vi.fn() })
    await waitFor(() => expect(screen.getByTestId('skill-available')).toBeInTheDocument())
    const available = screen.getByTestId('skill-available')
    const chosen = screen.getByTestId('skill-chosen')
    expect(available.textContent).toContain('browser-qa')
    expect(available.textContent).not.toContain('grill-with-docs')
    expect(chosen.textContent).toContain('grill-with-docs')
  })

  it('从左栏拖到右栏 → 加入已选；点保存 → onSave 收到含新项的列表', async () => {
    const onSave = vi.fn()
    renderModal({ selected: ['grill-with-docs'], onSave, onCancel: vi.fn() })
    await waitFor(() => expect(screen.getByTestId('skill-available')).toBeInTheDocument())

    const source = screen.getByText('browser-qa')
    const target = screen.getByTestId('skill-chosen')
    const transfer = dt()
    fireEvent.dragStart(source, { dataTransfer: transfer })
    fireEvent.dragOver(target, { dataTransfer: transfer })
    fireEvent.drop(target, { dataTransfer: transfer })

    fireEvent.click(screen.getByRole('button', { name: /保存|Save/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.arrayContaining(['grill-with-docs', 'browser-qa'])))
  })

  it('fetch 网络层失败（reject）时显示错误消息', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('Network error')
    }) as unknown as typeof fetch

    renderModal({ selected: [], onSave: vi.fn(), onCancel: vi.fn() })
    await waitFor(() => expect(screen.getByTestId('skill-error')).toBeInTheDocument())
    expect(screen.getByTestId('skill-error')).toHaveTextContent(/failed|error/i)
  })

  it('whole-branch review 回归锚：非 2xx + 真实 server JSON 信封（{ok:false,error}）而非 reject → r.ok 检查真触发、真读出 error 文案（此前无 r.ok 检查时 r.json() 会 resolve 而不 reject，setAll(undefined) 会让下一次 render 里 all.filter(...) 直接抛错）', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'skill 注册表读取失败' }), { status: 500 })) as unknown as typeof fetch

    renderModal({ selected: [], onSave: vi.fn(), onCancel: vi.fn() })
    await waitFor(() => expect(screen.getByTestId('skill-error')).toHaveTextContent(/skill 注册表读取失败/))
  })

  it('中英切换：英文下渲染英文占位符/按钮（此前本组件完全不走 t()，且 error 文案硬编码英文、其余硬编码中文，混杂不一致）', async () => {
    localStorage.setItem('pipeline-dashboard-lang', 'en')
    renderModal({ selected: [], onSave: vi.fn(), onCancel: vi.fn() })
    await waitFor(() => expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })
})
