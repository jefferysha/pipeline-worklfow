/**
 * Dialog.test —— 共享 Dialog 组件的 6 条键盘礼仪契约（评审 P0-5/P1-9 地基，Task 3）。
 * 用带按钮的宿主组件真实开合（非直接 render Dialog 常驻），让「挂载即聚焦」「卸载归位」
 * 都对应真实的 DOM 生命周期，而不是靠 rerender props 模拟。
 */
import { useRef, useState, type RefObject } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from './Dialog'

/** 默认宿主：打开按钮 + Dialog（children 一个输入框，actions 两个按钮）。 */
function Host({ testid, initialFocusRef }: { testid?: string; initialFocusRef?: RefObject<HTMLElement> } = {}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>打开</button>
      {open && (
        <Dialog
          title="标题"
          onClose={() => setOpen(false)}
          testid={testid}
          initialFocusRef={initialFocusRef}
          actions={
            <>
              <button>取消</button>
              <button>确认</button>
            </>
          }
        >
          <input data-testid="dlg-input" placeholder="姓名" />
        </Dialog>
      )}
    </div>
  )
}

/** initialFocusRef 场景专用宿主：ref 指向「确认」按钮，验证优先级高于默认首个可聚焦元素。 */
function HostWithInitialFocus() {
  const [open, setOpen] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)
  return (
    <div>
      <button onClick={() => setOpen(true)}>打开</button>
      {open && (
        <Dialog
          title="标题"
          onClose={() => setOpen(false)}
          initialFocusRef={confirmRef}
          actions={
            <>
              <button>取消</button>
              <button ref={confirmRef}>确认</button>
            </>
          }
        >
          <input data-testid="dlg-input" placeholder="姓名" />
        </Dialog>
      )}
    </div>
  )
}

describe('Dialog（共享组件，Task 3）', () => {
  it('挂载时焦点进入对话框：默认落在容器内首个可聚焦元素；提供 initialFocusRef 时优先聚焦它', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Host />)
    await user.click(screen.getByText('打开'))
    expect(document.activeElement).toBe(screen.getByTestId('dlg-input'))
    unmount()

    render(<HostWithInitialFocus />)
    await user.click(screen.getByText('打开'))
    expect(document.activeElement).toBe(screen.getByText('确认'))
  })

  it('Esc 触发 onClose', async () => {
    const user = userEvent.setup()
    render(<Host />)
    await user.click(screen.getByText('打开'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('点 backdrop 自身（非冒泡）触发 onClose；点击对话框卡片内部不触发', async () => {
    const user = userEvent.setup()
    render(<Host testid="t-dialog" />)
    await user.click(screen.getByText('打开'))

    const card = screen.getByRole('dialog')
    fireEvent.click(card)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    const backdrop = screen.getByTestId('t-dialog')
    fireEvent.click(backdrop)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Tab 在对话框内循环困笼：末元素 Tab → 回到首元素', async () => {
    const user = userEvent.setup()
    render(<Host />)
    await user.click(screen.getByText('打开'))

    const input = screen.getByTestId('dlg-input')
    const cancelBtn = screen.getByText('取消')
    const confirmBtn = screen.getByText('确认')
    expect(document.activeElement).toBe(input)

    await user.tab()
    expect(document.activeElement).toBe(cancelBtn)
    await user.tab()
    expect(document.activeElement).toBe(confirmBtn)
    await user.tab()
    expect(document.activeElement).toBe(input)
  })

  it('卸载时焦点回到打开前的元素', async () => {
    const user = userEvent.setup()
    render(<Host />)
    const openBtn = screen.getByText('打开')
    await user.click(openBtn)
    expect(document.activeElement).not.toBe(openBtn)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(openBtn)
  })

  it('role="dialog" aria-modal="true" aria-label={title} 三件套', async () => {
    const user = userEvent.setup()
    render(<Host />)
    await user.click(screen.getByText('打开'))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', '标题')
  })
})
