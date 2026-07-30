import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HelpPopover } from './HelpPopover'

describe('HelpPopover', () => {
  it('通过真实按钮切换可访问说明，而不是只依赖 title', () => {
    render(<HelpPopover label="阶段帮助">真实执行顺序说明</HelpPopover>)
    const trigger = screen.getByRole('button', { name: '阶段帮助' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('help-popover-content')).toBeNull()

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('help-popover-content')).toHaveTextContent('真实执行顺序说明')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('help-popover-content')).toBeNull()
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByTestId('help-popover-content')).toBeNull()
  })
})
