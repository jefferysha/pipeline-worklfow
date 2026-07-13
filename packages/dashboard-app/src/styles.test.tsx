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

// cause-touchup：失败成因徽章「非故障/未明」琥珀组——cancelled(人为终止)/no-op(空跑无产出)非故障，
// 不该落 .dt-diag-badge 的红色基础样(视觉误导成硬故障)；与 agent-nonzero/unknown 同组琥珀中性。
// 类名由 TaskDetail `dt-diag-badge--${diag.cause}` 拼出(TaskDetail.tsx:264)，cause 值即类名尾。
describe('GLOBAL_CSS —— 失败成因徽章琥珀组收编 cancelled / no-op（cause-touchup）', () => {
  it('--cancelled/--no-op 与 --agent-nonzero/--unknown 同一选择器组：琥珀 color-mix 派生，禁新硬编码原色', () => {
    // 组内末位 selector 可被 ruleBody 命中；组体沿用琥珀派生（红绿 oklch 取中），无新原色。
    const body = ruleBody(GLOBAL_CSS, '.dt-diag-badge--no-op')
    expect(body).toContain('color-mix(')
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    // 四类同组（逗号并列共享同一声明体）——cancelled 不再落红色基础样。
    expect(GLOBAL_CSS).toMatch(
      /\.dt-diag-badge--agent-nonzero,\s*\.dt-diag-badge--unknown,\s*\.dt-diag-badge--cancelled,\s*\.dt-diag-badge--no-op\s*\{/,
    )
  })
})

// v6 计划 T11：流程带 running 脉冲光泽——同上一条纪律，color-mix 派生、禁新硬编码原色（决议 #9）。
describe('GLOBAL_CSS —— 流程带 running 脉冲（v6 T11，决议 #9 同款校验）', () => {
  it('.wb-flow-gloss 声明存在：color-mix 派生渐变、缺省 opacity:0（GSAP 驱动可见性），不含新硬编码色值', () => {
    const body = ruleBody(GLOBAL_CSS, '.wb-flow-gloss')
    expect(body).toContain('color-mix(')
    expect(body).toContain('opacity: 0')
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
