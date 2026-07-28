import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button, buttonVariants } from './button'

afterEach(cleanup)

describe('Button 共享交互原语', () => {
  it('在移动视口使用增强触控目标，并为 reduced motion 关闭过渡', () => {
    render(<Button>继续</Button>)

    expect(screen.getByRole('button', { name: '继续' })).toHaveClass(
      'touch-manipulation',
      'motion-reduce:transition-none',
      'max-[720px]:min-h-11',
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

  it('所有常规与图标尺寸在移动视口提供 44px 目标，明确紧凑尺寸保持例外', () => {
    for (const size of ['default', 'sm', 'lg'] as const) {
      expect(buttonVariants({ size })).toContain('max-[720px]:min-h-11')
    }
    for (const size of ['icon', 'icon-sm', 'icon-lg'] as const) {
      expect(buttonVariants({ size })).toContain('max-[720px]:size-11')
    }
    expect(buttonVariants({ size: 'xs' })).not.toMatch(/max-\[720px\]:(?:min-h|size)-11/)
    expect(buttonVariants({ size: 'icon-xs' })).not.toMatch(/max-\[720px\]:(?:min-h|size)-11/)
  })
})
