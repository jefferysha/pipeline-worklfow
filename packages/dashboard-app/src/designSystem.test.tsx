import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'packages/dashboard-app/src/index.css'), 'utf8')
const readSource = (relativePath: string): string =>
  readFileSync(join(process.cwd(), 'packages/dashboard-app/src', relativePath), 'utf8')

describe('Dashboard 设计系统契约', () => {
  it('主动作使用 accent 语义，不复用 success green', () => {
    expect(css).toMatch(/--btn-bg:\s*var\(--accent\)/)
    expect(css).toMatch(/--btn-hover:\s*var\(--accent-d\)/)
    expect(css).toMatch(/--color-primary:\s*var\(--btn-bg\)/)
    expect(css).not.toMatch(/--color-primary:\s*var\(--green\)/)
  })

  it('reduced-motion 为 CSS transition/animation 提供全局终态兜底', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    expect(css).toMatch(/transition-duration:\s*0s\s*!important/)
    expect(css).toMatch(/animation-duration:\s*0s\s*!important/)
    expect(css).toMatch(/scroll-behavior:\s*auto\s*!important/)
  })

  it.each([
    'components/ui/button.tsx',
    'components/ui/input.tsx',
    'components/ui/select.tsx',
    'components/ui/tabs.tsx',
    'shell/Onboarding.tsx',
  ])('%s 不注入手机端触控尺寸规则', (relativePath) => {
    expect(readSource(relativePath)).not.toMatch(/max-\[720px\]:(?:min-h|size)-11/)
  })

  it.each([
    'components/ui/button.tsx',
    'components/ui/input.tsx',
    'components/ui/select.tsx',
    'components/ui/dialog.tsx',
    'components/ui/dropdown-menu.tsx',
    'components/ui/tabs.tsx',
    'components/ui/table.tsx',
    'components/ui/badge.tsx',
    'components/ui/tooltip.tsx',
  ])('%s 明确声明 reduced-motion 终态', (relativePath) => {
    expect(readSource(relativePath)).toMatch(/motion-reduce:/)
  })
})
