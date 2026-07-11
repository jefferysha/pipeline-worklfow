import { describe, it, expect } from 'vitest'
import { GLOBAL_CSS } from './styles'

/**
 * styles.test —— 验收反馈②-①：「执行中」视觉强化的字符串级钉住。
 *
 * GLOBAL_CSS 是一整段内联样式字符串，运行时经 App.tsx `<style>{GLOBAL_CSS}</style>` 注入
 * （见该文件头注释）；jsdom 不做真布局/真绘制，`color-mix()` 也不在其 CSS 引擎的可计算属性
 * 集内，getComputedStyle 断言拿不到有意义的值——所以这里直接对样式表源串做子串断言，只钉
 * 「新类/新样式存在」，不逐值断言（视觉参数留给真机/截图验收，同本仓既有纪律）。
 */

/** 取单条规则的声明体（`selector { ... }` 的花括号内文本），比全串 toContain 更精确——
 *  不会被同名前缀的其他规则（如 .prg-seg--fail）误命中。 */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  if (!m) throw new Error(`规则未找到：${selector}`)
  return m[1]!
}

describe('GLOBAL_CSS —— 执行中段常驻区分（不依赖动画，reduced-motion 下也可见）', () => {
  it('.prg-seg--run 声明存在：color-mix 派生底色 + 内描边（box-shadow），不含新硬编码色值', () => {
    const body = ruleBody(GLOBAL_CSS, '.prg-seg--run')
    expect(body).toContain('color-mix(')
    expect(body).toContain('box-shadow')
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/) // 禁新原色（决议 #9 同款纪律）
  })
})

describe('GLOBAL_CSS —— 光泽扫过强化（峰值/宽度）', () => {
  it('.prg-gloss 峰值不透明度提到约 75%、宽度加大到 64px，仍是 color-mix 派生', () => {
    const body = ruleBody(GLOBAL_CSS, '.prg-gloss')
    expect(body).toContain('width: 64px')
    expect(body).toContain('75%')
    expect(body).toContain('color-mix(')
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
