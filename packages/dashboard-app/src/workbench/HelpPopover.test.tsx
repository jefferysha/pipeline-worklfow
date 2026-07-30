import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HelpPopover } from './HelpPopover'

describe('HelpPopover', () => {
  it('通过真实按钮切换可访问说明，而不是只依赖 title', () => {
    render(<HelpPopover label="阶段帮助">真实执行顺序说明</HelpPopover>)
    const trigger = screen.getByRole('button', { name: '阶段帮助' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('tooltip')).toBeNull()

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('tooltip')).toHaveTextContent('真实执行顺序说明')

    fireEvent.click(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
