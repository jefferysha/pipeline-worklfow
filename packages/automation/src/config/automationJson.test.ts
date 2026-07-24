/**
 * automationJson.test —— per-root .pipeline/automation.json 读模块（T21 数据面）。
 * 注入 fake fs（不碰真盘），逐字段验证值域裁剪 + 缺文件/损坏 fail-open 全默认。
 */
import { describe, expect, it } from 'vitest'
import { automationJsonPath, readAutomationJson, type AutomationJsonFs } from './automationJson.js'

/** fake fs：只认一个路径 → 内容；其余抛 ENOENT（对齐 node readFileSync 语义）。 */
function fsWith(root: string, content: string): AutomationJsonFs {
  const path = automationJsonPath(root)
  return {
    readFileSync: (p: string) => {
      if (p !== path) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' })
      return content
    },
  }
}

const ROOT = '/proj'

describe('automationJsonPath', () => {
  it('落位 <root>/.pipeline/automation.json（对齐 hooks.json 先例）', () => {
    expect(automationJsonPath('/a/b')).toBe('/a/b/.pipeline/automation.json')
  })
})

describe('readAutomationJson —— fail-open 全默认', () => {
  it('缺文件 → 空配置（全部字段 undefined，消费方吃 DEFAULT）', () => {
    expect(readAutomationJson(ROOT, fsWith('/other', '{}'))).toEqual({})
  })

  it('损坏 JSON → 空配置（fail-open，与缺文件同语义）', () => {
    expect(readAutomationJson(ROOT, fsWith(ROOT, 'not json {{{'))).toEqual({})
  })

  it('非对象顶层（数组/字符串）→ 空配置', () => {
    expect(readAutomationJson(ROOT, fsWith(ROOT, '[1,2]'))).toEqual({})
    expect(readAutomationJson(ROOT, fsWith(ROOT, '"x"'))).toEqual({})
  })
})

describe('readAutomationJson —— 逐字段值域（非法字段单独丢弃，不拖垮整文件）', () => {
  it('合法全字段 → 全量读出（snake_case 落盘 → camelCase 消费）', () => {
    const cfg = readAutomationJson(ROOT, fsWith(ROOT, JSON.stringify({
      version: 1, enabled: true, max_parallel: 8, max_retries: 0, default_opt_in: true, image: 'ghcr.io/acme/sc:v2',
    })))
    expect(cfg).toEqual({
      enabled: true, maxParallel: 8, maxRetries: 0, defaultOptIn: true, image: 'ghcr.io/acme/sc:v2',
    })
  })

  it('max_parallel 越界（0 / 9 / 小数 / 字符串）→ 该字段丢弃，其余保留', () => {
    for (const bad of [0, 9, 2.5, '4', -1, null]) {
      const cfg = readAutomationJson(ROOT, fsWith(ROOT, JSON.stringify({ max_parallel: bad, max_retries: 2 })))
      expect(cfg, `max_parallel=${JSON.stringify(bad)}`).toEqual({ maxRetries: 2 })
    }
  })

  it('max_retries 越界（-1 / 4 / 小数 / 布尔）→ 丢弃', () => {
    for (const bad of [-1, 4, 1.5, true, 'x']) {
      const cfg = readAutomationJson(ROOT, fsWith(ROOT, JSON.stringify({ max_retries: bad })))
      expect(cfg, `max_retries=${JSON.stringify(bad)}`).toEqual({})
    }
  })

  it('default_opt_in 非布尔 → 丢弃', () => {
    for (const bad of ['true', 1, null]) {
      expect(readAutomationJson(ROOT, fsWith(ROOT, JSON.stringify({ default_opt_in: bad })))).toEqual({})
    }
  })

  it('image：空串/纯空白/非法字符/超长 → 丢弃（空串=缺省内置镜像，不占字段）', () => {
    for (const bad of ['', '  ', 'has space', 'a\nb', 'x'.repeat(201), 42]) {
      expect(readAutomationJson(ROOT, fsWith(ROOT, JSON.stringify({ image: bad }))), `image=${JSON.stringify(bad)}`).toEqual({})
    }
  })

  it('image 合法字符集（registry/路径/tag/digest）放行且 trim', () => {
    const cfg = readAutomationJson(ROOT, fsWith(ROOT, JSON.stringify({ image: ' sandcastle:local ' })))
    expect(cfg).toEqual({ image: 'sandcastle:local' })
  })

  it('enabled 是项目总开关，level 仍忽略（autonomy 只归 loop registry）', () => {
    const cfg = readAutomationJson(ROOT, fsWith(ROOT, JSON.stringify({ enabled: true, level: 'L3', max_parallel: 2 })))
    expect(cfg).toEqual({ enabled: true, maxParallel: 2 })
  })
})
