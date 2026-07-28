import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button, buttonVariants } from './button'

afterEach(cleanup)

describe('Button 共享交互原语', () => {
  it('在电脑端保持既有紧凑尺寸，并为 reduced motion 关闭过渡', () => {
    render(<Button>继续</Button>)

    expect(screen.getByRole('button', { name: '继续' })).toHaveClass(
      'motion-reduce:transition-none',
      'h-9',
    )
  })

  it('disabled 状态同时阻断交互并提供明确视觉反馈', () => {
    render(<Button disabled>保存中</Button>)

    expect(screen.getByRole('button', { name: '保存中' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存中' })).toHaveClass(
      'disabled:cursor-not-allowed',
      'disabled:opacity-60',
    )
  })

  it('尺寸变体不注入手机端触控目标规则', () => {
    for (const size of ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const) {
      expect(buttonVariants({ size })).not.toMatch(/max-\[720px\]:(?:min-h|size)-11/)
    }
  })
})
