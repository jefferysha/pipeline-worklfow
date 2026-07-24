/**
 * hooksConfig.test —— 阶段×hook 开关矩阵存储（v5 T5 / 决议#2）。
 * 真 fs（mkdtemp 临时目录，绝不碰真实项目/HOME）：读写 <root>/.pipeline/hooks.json。
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  HOOK_METAS, hooksConfigPath, readHooksMatrix, validateHookToggleBody, writeHookToggle,
} from './hooksConfig.js'

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'hooks-cfg-'))
}

async function seedConfig(root: string, content: string): Promise<void> {
  await mkdir(join(root, '.pipeline'), { recursive: true })
  await writeFile(join(root, '.pipeline', 'hooks.json'), content, 'utf8')
}

describe('HOOK_METAS —— hook 元数据（时机/开关粒度单一真相源）', () => {
  it('id 全集唯一且齐全（8 个插件 hook）', () => {
    const ids = HOOK_METAS.map((h) => h.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.sort()).toEqual([
      'breadcrumb', 'confirm-clear', 'decision-recorder', 'gate',
      'interactive-skill-gate', 'router', 'session-start', 'skill-tracker',
    ])
  })

  it('gate 交互门与 interactive-skill-gate 安全门强制常开（configurable=false，决议#2）', () => {
    const byId = new Map(HOOK_METAS.map((h) => [h.id, h]))
    expect(byId.get('gate')!.configurable).toBe(false)
    expect(byId.get('interactive-skill-gate')!.configurable).toBe(false)
  })

  it('人类决策的 PostToolUse 同时覆盖 Claude 与 Codex 的真实工具名', () => {
    const byId = new Map(HOOK_METAS.map((h) => [h.id, h]))
    expect(byId.get('confirm-clear')!.matcher).toBe('AskUserQuestion|request_user_input')
    expect(byId.get('decision-recorder')!.matcher).toBe('AskUserQuestion|request_user_input')
  })

  it('四个 sh 侧已接开关的 hook 可配置（session-start/breadcrumb/router/skill-tracker）', () => {
    const byId = new Map(HOOK_METAS.map((h) => [h.id, h]))
    for (const id of ['session-start', 'breadcrumb', 'router', 'skill-tracker']) {
      expect(byId.get(id)!.configurable).toBe(true)
    }
  })

  it('时机归类逐条核实自插件 hooks/hooks.json 的稳定 hook-id ABI（T15 风险项：不得凭名字猜）', () => {
    // 真读插件清单：host 不再直连可变 payload 中的脚本，而是调用稳定 pipeline-hook
    // 启动器并传入逻辑 hook id；bootstrap 只会进入已验证 release 再解析 meta.script。
    const pluginHooksPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'hooks', 'hooks.json')
    const plugin = JSON.parse(readFileSync(pluginHooksPath, 'utf8')) as {
      hooks: Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>>
    }
    for (const meta of HOOK_METAS) {
      const entries = plugin.hooks[meta.event] ?? []
      const entry = entries.find((e) => e.hooks.some((h) => h.command.includes(`pipeline-hook\" ${meta.id}`)))
      expect(entry, `${meta.id} 应挂在 ${meta.event}`).toBeDefined()
      expect(entry?.matcher, `${meta.id} 的 UI 元数据必须与 hooks.json 同步`).toBe(meta.matcher)
    }
  })
})

describe('readHooksMatrix —— 缺省全启用（fail-open）', () => {
  it('缺文件 → 空矩阵（全默认启用）', async () => {
    const root = await tempRoot()
    expect(readHooksMatrix(root)).toEqual({})
  })

  it('损坏 JSON → 空矩阵（fail-open，行为与今天完全一致）', async () => {
    const root = await tempRoot()
    await seedConfig(root, 'not json {{{')
    expect(readHooksMatrix(root)).toEqual({})
  })

  it('matrix 字段非对象 → 空矩阵', async () => {
    const root = await tempRoot()
    await seedConfig(root, JSON.stringify({ version: 1, matrix: 'oops' }))
    expect(readHooksMatrix(root)).toEqual({})
  })

  it('只保留「可配置 hook × 合法阶段名 × false」的禁用项，其余键一律丢弃', async () => {
    const root = await tempRoot()
    await seedConfig(root, JSON.stringify({
      version: 1,
      matrix: {
        'router.build': false, // 合法禁用项 → 保留
        'skill-tracker.verify': false, // 合法禁用项 → 保留
        'breadcrumb.open': true, // true 非禁用项（语义：只存 false）→ 丢弃
        'gate.build': false, // 强制常开 hook（手改文件也无效）→ 丢弃
        'interactive-skill-gate.build': false, // 同上
        'ghost-hook.build': false, // 未知 hook → 丢弃
        'router.bad phase': false, // 阶段名含非法字符 → 丢弃
        router: false, // 缺阶段段（非 阶段×hook 键形状）→ 丢弃
      },
    }))
    expect(readHooksMatrix(root)).toEqual({ 'router.build': false, 'skill-tracker.verify': false })
  })
})

describe('validateHookToggleBody —— POST /api/hooks 请求体校验（fail-loud）', () => {
  it('非对象 body → 拒绝', () => {
    for (const bad of [null, 'x', 42, ['a']]) {
      const r = validateHookToggleBody(bad)
      expect(r.ok).toBe(false)
    }
  })

  it('hook 缺失/未知 → 拒绝并列出可配置项', () => {
    const missing = validateHookToggleBody({ phase: 'build', enabled: false })
    expect(missing.ok).toBe(false)
    const unknown = validateHookToggleBody({ hook: 'ghost', phase: 'build', enabled: false })
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.error).toContain('router')
  })

  it('gate / interactive-skill-gate → 拒绝（强制常开，决议#2）', () => {
    for (const hook of ['gate', 'interactive-skill-gate']) {
      const r = validateHookToggleBody({ hook, phase: 'build', enabled: false })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain('强制常开')
    }
  })

  it('阶段名非法字符（空/点/空格）→ 拒绝', () => {
    for (const phase of ['', 'a.b', 'a b', 'x/y', '..']) {
      const r = validateHookToggleBody({ hook: 'router', phase, enabled: false })
      expect(r.ok, `phase=${JSON.stringify(phase)} 应被拒`).toBe(false)
    }
  })

  it('自定义 workflow 的 step id（非 7 相位固定值）也放行', () => {
    const r = validateHookToggleBody({ hook: 'router', phase: 'custom-step_1', enabled: false })
    expect(r.ok).toBe(true)
  })

  it('enabled 非布尔 → 拒绝', () => {
    const r = validateHookToggleBody({ hook: 'router', phase: 'build', enabled: 'false' })
    expect(r.ok).toBe(false)
  })

  it('合法 → ok + 归一值', () => {
    const r = validateHookToggleBody({ hook: 'skill-tracker', phase: 'verify', enabled: false })
    expect(r).toEqual({ ok: true, value: { hook: 'skill-tracker', phase: 'verify', enabled: false } })
  })
})

describe('writeHookToggle —— 真落盘 .pipeline/hooks.json（canonical 一键一行，bash 可 grep）', () => {
  it('disable → 建文件；矩阵含该键；canonical 形态 `"<hook>.<阶段>": false` 独立成行（sh 侧 grep -F 契约）', async () => {
    const root = await tempRoot()
    writeHookToggle(root, { hook: 'router', phase: 'build', enabled: false })
    const file = hooksConfigPath(root)
    expect(existsSync(file)).toBe(true)
    const text = await readFile(file, 'utf8')
    // grep -F 契约：hooks/*.sh 用 `grep -Fq '"<hook>.<阶段>": false'` 判定，冒号后恰一空格。
    expect(text).toContain('"router.build": false')
    expect(text).toMatch(/^\s*"router\.build": false,?$/m)
    const parsed = JSON.parse(text) as { version: number; matrix: Record<string, false> }
    expect(parsed.version).toBe(1)
    expect(parsed.matrix).toEqual({ 'router.build': false })
  })

  it('enable → 删除该键（矩阵只存禁用项）；重复操作幂等', async () => {
    const root = await tempRoot()
    writeHookToggle(root, { hook: 'router', phase: 'build', enabled: false })
    writeHookToggle(root, { hook: 'breadcrumb', phase: 'open', enabled: false })
    writeHookToggle(root, { hook: 'router', phase: 'build', enabled: true })
    expect(readHooksMatrix(root)).toEqual({ 'breadcrumb.open': false })
    writeHookToggle(root, { hook: 'router', phase: 'build', enabled: true }) // 幂等
    expect(readHooksMatrix(root)).toEqual({ 'breadcrumb.open': false })
    writeHookToggle(root, { hook: 'breadcrumb', phase: 'open', enabled: false }) // 幂等
    expect(readHooksMatrix(root)).toEqual({ 'breadcrumb.open': false })
  })

  it('既有文件损坏 → fail-open 视作空矩阵重建（不抛错、不落半成品）', async () => {
    const root = await tempRoot()
    await seedConfig(root, '{{{broken')
    writeHookToggle(root, { hook: 'skill-tracker', phase: 'build', enabled: false })
    expect(readHooksMatrix(root)).toEqual({ 'skill-tracker.build': false })
    // 重建后是合法 JSON
    expect(() => JSON.parse(readFileSync(hooksConfigPath(root), 'utf8'))).not.toThrow()
  })
})
