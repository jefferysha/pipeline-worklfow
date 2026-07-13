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

// v9-F1：进度条换列车轨（prg9+rail 块）——旧 .prg-seg--run/.prg-gloss 断言随箭头带退役替换为
// 新 rail 等强度断言：color-mix/var 派生禁新硬编码原色（决议 #9 同款）+「在跑才流光」的
// [data-mode="run"] 门控 + reduced-motion 停帧。旧 prg- 规则本体双保留不删（append-only）。
describe('GLOBAL_CSS —— v9 列车轨：流光层 color-mix 派生 + 在跑才流动（data-mode 门控）', () => {
  it('.rl-ph--done .rl-track::after 流光层：color-mix 派生高光、缺省停位段外、不挂 animation、无新硬编码色值', () => {
    const body = ruleBody(GLOBAL_CSS, '.rl-ph--done .rl-track::after')
    expect(body).toContain('color-mix(')
    expect(body).toContain('translateX(-130%)') // 缺省停在段外，不流动
    expect(body).not.toContain('animation') // 流光只由 run 门控选择器启动
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/) // 禁新原色（决议 #9 同款纪律）
  })

  it('流光/列车头脉冲只挂 .prg9-rail[data-mode="run"] 门控选择器（观察行安静）', () => {
    expect(ruleBody(GLOBAL_CSS, '.prg9-rail[data-mode="run"] .rl-ph--done .rl-track::after')).toContain('prg9-railflow')
    expect(ruleBody(GLOBAL_CSS, '.prg9-rail[data-mode="run"] .rl-ph--cur .rl-node')).toContain('prg9-trainpulse')
  })
})

describe('GLOBAL_CSS —— v9 列车轨：门呼吸/断轨/琥珀/幽灵轨全走 token，无新硬编码原色', () => {
  it('门=红菱形呼吸仅 gate 模式启动；节点/轨道用 --red 系 token', () => {
    expect(ruleBody(GLOBAL_CSS, '.prg9-rail[data-mode="gate"] .rl-ph--gate .rl-node::after')).toContain('prg9-gatepulse')
    const node = ruleBody(GLOBAL_CSS, '.rl-ph--gate .rl-node')
    expect(node).toContain('var(--red')
    expect(node).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('失败=断轨豁口（linear-gradient 中段透明），取消=琥珀，排队=幽灵虚线——全 token', () => {
    const fail = ruleBody(GLOBAL_CSS, '.rl-ph--fail .rl-track')
    expect(fail).toContain('linear-gradient(')
    expect(fail).toContain('var(--red)')
    expect(fail).toContain('transparent')
    expect(ruleBody(GLOBAL_CSS, '.rl-ph--cxl .rl-node')).toContain('var(--amb')
    expect(ruleBody(GLOBAL_CSS, '.rl-ph--cxl .rl-track')).toContain('var(--amb-b)')
    const queue = ruleBody(GLOBAL_CSS, '.rl-ph--queue .rl-track')
    expect(queue).toContain('repeating-linear-gradient(')
    expect(queue).toContain('var(--border-2)')
    for (const sel of ['.rl-ph--fail .rl-track', '.rl-ph--cxl .rl-node', '.rl-ph--cxl .rl-track', '.rl-ph--queue .rl-track']) {
      expect(ruleBody(GLOBAL_CSS, sel)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })

  it('需操作行绿 ring（.prg9-row--need）走 --ring/--green-b token，无新原色', () => {
    const body = ruleBody(GLOBAL_CSS, '.prg9-row--need')
    expect(body).toContain('var(--ring)')
    expect(body).toContain('var(--green-b)')
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  // 真机验收 G：「失败就是红框,终止就是土色框」——need 行 ring 按语义分色,tone 修饰叠加于
  // --need 之后(同特异度后写覆盖);halo 走 color-mix 从 token 派生,禁 #hex(决议 #9 同款)。
  it('失败行红 ring（.prg9-row--need-fail）：--red-b 描边 + --red 12% color-mix halo，无新原色', () => {
    const body = ruleBody(GLOBAL_CSS, '.prg9-row--need-fail')
    expect(body).toContain('var(--red-b)')
    expect(body).toContain('color-mix(in srgb, var(--red) 12%, transparent)')
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('人为终止琥珀 ring（.prg9-row--need-cxl）：--amb-b 描边 + --amb-d 14% color-mix halo，无新原色', () => {
    const body = ruleBody(GLOBAL_CSS, '.prg9-row--need-cxl')
    expect(body).toContain('var(--amb-b)')
    expect(body).toContain('color-mix(in srgb, var(--amb-d) 14%, transparent)')
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('reduced-motion 停帧：rail 循环层/列车头/门呼吸/运行徽章点全停', () => {
    expect(GLOBAL_CSS).toMatch(
      /prefers-reduced-motion: reduce\) \{\s*\n\s*\.prg9-rail \.rl-track::after, \.prg9-rail \.rl-node, \.prg9-rail \.rl-node::after, \.prg9-bdg--blue \.dot \{ animation: none !important; \}/,
    )
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
// v8-E：承载类随阶段卡横排从 .wb-flow-gloss 换 .wb8-gloss（旧规则双保留,新类等强度钉住——
// 仍断言 color-mix 派生渐变 + 缺省 opacity:0 + 禁新硬编码原色,守门强度不降）。
describe('GLOBAL_CSS —— 阶段卡 running 微光（v8-E 承接 v6 T11，决议 #9 同款校验）', () => {
  it('.wb8-gloss 声明存在：color-mix 派生渐变、缺省 opacity:0（GSAP 驱动可见性），不含新硬编码色值', () => {
    const body = ruleBody(GLOBAL_CSS, '.wb8-gloss')
    expect(body).toContain('color-mix(')
    expect(body).toContain('opacity: 0')
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('.wb8-conn 流动虚线连接件：repeating-linear-gradient 走 token,gated 变体存在,reduced-motion 停动画', () => {
    const body = ruleBody(GLOBAL_CSS, '.wb8-conn::before')
    expect(body).toContain('repeating-linear-gradient(')
    expect(body).toContain('var(--green)')
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(ruleBody(GLOBAL_CSS, '.wb8-conn--gated::before')).toContain('var(--red)')
    // reduced-motion 停帧兜底（.wb8-conn 与 .wb8-skconn 同组）
    expect(GLOBAL_CSS).toMatch(/prefers-reduced-motion: reduce\) \{\s*\n\s*\.wb8-conn::before, \.wb8-skconn::before \{ animation: none; \}/)
  })
})

// v9-H：进度页状态 sheet 页签 + 项目分组组头 + 行 workflow/调度标识 + 行体 v2（demo v9-flowdeck
// .deck-tabs/.stab/#deckInk、.pgroup/.pg-h、.schip、.fl-top/.fl-body 对位）。纪律同上：只钉
// 「类存在+关键 token」，禁新硬编码原色（决议 #9 同款）；页签形制参照 wb8 但自持 .prg9t- 一套
// 类名（不复用 wb8 前缀）。
describe('GLOBAL_CSS —— v9-H 状态 sheet 页签/项目分组/调度 chip/行体 v2（全 token,禁新原色）', () => {
  it('页签条/页签/墨线：墨线走 --green token、缺省宽 0（GSAP 落位）；页签用 --text-3 缺省色——无新原色', () => {
    const tabs = ruleBody(GLOBAL_CSS, '.prg9t-tabs')
    expect(tabs).toContain('var(--border)')
    const tab = ruleBody(GLOBAL_CSS, '.prg9t-tab')
    expect(tab).toContain('var(--text-3)')
    const ink = ruleBody(GLOBAL_CSS, '.prg9t-ink')
    expect(ink).toContain('var(--green)')
    expect(ink).toContain('width: 0')
    for (const sel of ['.prg9t-tabs', '.prg9t-tab', '.prg9t-ink', '.prg9t-n']) {
      expect(ruleBody(GLOBAL_CSS, sel)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })

  it('组头/件数胶囊/右延细线：胶囊 --fill-2 底+--border 描边,细线 --border——全 token 无新原色', () => {
    expect(ruleBody(GLOBAL_CSS, '.prg9g-head')).toContain('var(--text)')
    const pill = ruleBody(GLOBAL_CSS, '.prg9g-n')
    expect(pill).toContain('var(--fill-2)')
    expect(pill).toContain('var(--border)')
    expect(ruleBody(GLOBAL_CSS, '.prg9g-rule')).toContain('var(--border)')
    for (const sel of ['.prg9g-head', '.prg9g-n', '.prg9g-rule', '.prg9g-name', '.prg9g-stack']) {
      expect(ruleBody(GLOBAL_CSS, sel)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })

  it('行标识：workflow chip=mono outline 形;调度 chip 中性=--fill/--border,--sbx 蓝 tint 走 --accent 系——无新原色', () => {
    const wf = ruleBody(GLOBAL_CSS, '.prg9s-wf')
    expect(wf).toContain('var(--mono)')
    expect(wf).toContain('var(--border)')
    const chip = ruleBody(GLOBAL_CSS, '.prg9s-schip')
    expect(chip).toContain('var(--fill)')
    expect(chip).toContain('var(--border)')
    const sbx = ruleBody(GLOBAL_CSS, '.prg9s-schip--sbx')
    expect(sbx).toContain('var(--accent-t)')
    expect(sbx).toContain('var(--accent-b)')
    expect(sbx).toContain('var(--accent-d)')
    for (const sel of ['.prg9s-wf', '.prg9s-schip', '.prg9s-schip--sbx', '.prg9s-tags']) {
      expect(ruleBody(GLOBAL_CSS, sel)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })

  it('行体 v2：标题行内联（.prg9v2-top flex）+ 第二行两列（.prg9v2-body grid,轨道左/动作右垂直居中）,时间弱化 mono——无新原色', () => {
    expect(ruleBody(GLOBAL_CSS, '.prg9v2-top')).toContain('flex')
    const body = ruleBody(GLOBAL_CSS, '.prg9v2-body')
    expect(body).toContain('grid')
    expect(body).toContain('minmax(0, 1fr) auto')
    expect(body).toContain('align-items: center')
    const time = ruleBody(GLOBAL_CSS, '.prg9v2-time')
    expect(time).toContain('var(--mono)')
    expect(time).toContain('var(--text-3)')
    for (const sel of ['.prg9v2-top', '.prg9v2-body', '.prg9v2-time', '.prg9v2-mid', '.prg9v2-acts']) {
      expect(ruleBody(GLOBAL_CSS, sel)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })
})
