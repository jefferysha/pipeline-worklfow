import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Icon, type IconName } from './Icon'

/** IconName 全集（逐字对齐 plan Task 2 interfaces）——用于覆盖率测试，非快照。 */
const ALL_ICON_NAMES: IconName[] = [
  'check',
  'copy',
  'doc',
  'link',
  'x',
  'chevron',
  'inbox',
  'board',
  'flow',
  'gauge',
  'gate',
  'clock',
  'folder',
  'layers',
]

describe('Icon（内联 SVG 图标 sprite，spec §2 图标语言 + Task 2）', () => {
  it('渲染 <Icon name="check"/> 产出 svg：aria-hidden=true，宽高=默认 size 14，viewBox/描边契约齐全', () => {
    const { container } = render(<Icon name="check" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '14')
    expect(svg).toHaveAttribute('height', '14')
    expect(svg).toHaveAttribute('viewBox', '0 0 16 16')
    expect(svg).toHaveAttribute('fill', 'none')
    expect(svg).toHaveAttribute('stroke', 'currentColor')
    expect(svg).toHaveAttribute('stroke-width', '1.5')
  })

  it('size prop 覆盖默认值，宽高同步跟随（非常量 14）', () => {
    const { container } = render(<Icon name="board" size={24} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '24')
    expect(svg).toHaveAttribute('height', '24')
  })

  it('IconName 全集（14 个）逐个渲染，每个都产出至少一个形状子节点——防止 path 表漏项', () => {
    for (const name of ALL_ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />)
      const svg = container.querySelector('svg')
      expect(svg, `name=${name} 应渲染出 <svg>`).not.toBeNull()
      const shapes = svg!.querySelectorAll('path, rect, circle')
      expect(shapes.length, `name=${name} 应至少有一个 path/rect/circle 形状`).toBeGreaterThan(0)
      unmount()
    }
  })

  it('不同 icon 产出不同形状标记——防止 path 表整段复制粘贴撞名', () => {
    const { container: c1 } = render(<Icon name="check" />)
    const { container: c2 } = render(<Icon name="x" />)
    const { container: c3 } = render(<Icon name="gate" />)
    const markups = [c1, c2, c3].map((c) => c.querySelector('svg')!.innerHTML)
    expect(new Set(markups).size).toBe(3)
  })

  it('未知 name 在类型层面被拒绝（@ts-expect-error，tsc --noEmit 校验，非运行时断言）', () => {
    // @ts-expect-error 'not-a-real-icon' 不在 IconName 字面量联合类型中，编译期应报错
    const el = <Icon name="not-a-real-icon" />
    expect(el).toBeDefined()
  })
})
