import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SkillTransferModal } from './SkillTransferModal'

beforeEach(() => {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ skills: ['browser-qa', 'grill-with-docs', 'superpowers:brainstorming'] }), { status: 200 }),
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

describe('SkillTransferModal', () => {
  it('挂载后真 fetch 全部 skill，左栏显示未选中的、右栏显示已选的', async () => {
    render(<SkillTransferModal selected={['grill-with-docs']} onSave={vi.fn()} onCancel={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('skill-available')).toBeInTheDocument())
    const available = screen.getByTestId('skill-available')
    const chosen = screen.getByTestId('skill-chosen')
    expect(available.textContent).toContain('browser-qa')
    expect(available.textContent).not.toContain('grill-with-docs')
    expect(chosen.textContent).toContain('grill-with-docs')
  })

  it('从左栏拖到右栏 → 加入已选；点保存 → onSave 收到含新项的列表', async () => {
    const onSave = vi.fn()
    render(<SkillTransferModal selected={['grill-with-docs']} onSave={onSave} onCancel={vi.fn()} />)
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
})
