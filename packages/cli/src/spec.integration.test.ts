/**
 * living spec 库 —— 真实端到端集成测试（BACKLOG #16，GOAL C9：无伪测试）。
 *
 * 零 mock：freshHarness 真临时项目 + 真 `init`（走 buildProgram 真路径）+ realDeps 构造真 kernel
 * deps（createStateStore/createHistoryWriter）+ 真调 cmdSpec（默认 REAL_FS 走真 listSpecEntries/
 * injectJsonl）。断言真实落盘的 spec_scope 字段字节、真 history JSONL、真枚举 openspec/specs、
 * 真读 jsonl 清单 + 真 cat 文件内容 + 真目录展开。
 *
 * 覆盖（C10）：specs happy（文本/JSON/回退/缺失）；set-spec-scope happy（CSV/all/清空回 null）+
 * 错误（缺 change）；inject-jsonl happy（file/dir 真内容）+ 关键错误（缺文件 WARN / 坏行容错 /
 * seed 跳过 / bad agent / 缺 jsonl）；跨命令串联 init→set-spec-scope→读回。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { freshHarness, realDeps, rm, type Harness } from './integration-harness.js'
import { cmdSpec } from './commands/spec.js'

interface SpecRun {
  code: number
  out: string[]
  err: string[]
}

/** 真调 cmdSpec（realDeps 真 kernel + 真 fs，默认 REAL_FS 走真 listSpecEntries/injectJsonl）。 */
async function spec(h: Harness, sub: string, ...args: string[]): Promise<SpecRun> {
  const out: string[] = []
  const err: string[] = []
  const code = await cmdSpec(realDeps(h.cwd, out, err), sub, args)
  return { code, out, err }
}

async function init(h: Harness, name: string): Promise<void> {
  expect(await h.run(['init', name, '--track', 'backend', '--preset', 'full'])).toBe(0)
}

/** 建一个 capability（openspec/specs/<cap>/[spec.md]）。 */
async function makeCapability(h: Harness, cap: string, withSpec = true): Promise<void> {
  await mkdir(join(h.cwd, 'openspec', 'specs', cap), { recursive: true })
  if (withSpec) await writeFile(join(h.cwd, 'openspec', 'specs', cap, 'spec.md'), `# ${cap} spec\n`, 'utf8')
}

describe('真实 e2e —— specs 枚举（真读 openspec/specs）', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshHarness()
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('specs 目录缺失 → 文本提示 / --json []', async () => {
    const t = await spec(h, 'specs')
    expect(t.code).toBe(0)
    expect(t.out).toEqual(['(无 main spec — openspec/specs 不存在)'])

    const j = await spec(h, 'specs', '--json')
    expect(j.out).toEqual(['[]'])
  })

  test('真枚举：spec.md 有无并存，按名排序，文本对齐 + JSON', async () => {
    await makeCapability(h, 'billing')
    await makeCapability(h, 'auth')
    await makeCapability(h, 'zeta', false) // 目录在、无 spec.md

    const t = await spec(h, 'specs')
    expect(t.code).toBe(0)
    expect(t.out).toEqual([
      '## Main Specs（capability → spec.md）',
      `  - ${'auth'.padEnd(32)} openspec/specs/auth/spec.md`,
      `  - ${'billing'.padEnd(32)} openspec/specs/billing/spec.md`,
      `  - ${'zeta'.padEnd(32)} (无 spec.md)`,
    ])

    const j = await spec(h, 'specs', '--json')
    expect(JSON.parse(j.out.join('\n'))).toEqual([
      { name: 'auth', spec_path: 'openspec/specs/auth/spec.md', has_spec: true },
      { name: 'billing', spec_path: 'openspec/specs/billing/spec.md', has_spec: true },
      { name: 'zeta', spec_path: '', has_spec: false },
    ])
  })

  test('.openspec/specs 回退（openspec/specs 不在时）', async () => {
    await mkdir(join(h.cwd, '.openspec', 'specs', 'core'), { recursive: true })
    await writeFile(join(h.cwd, '.openspec', 'specs', 'core', 'spec.md'), '# core\n', 'utf8')
    const j = await spec(h, 'specs', '--json')
    expect(JSON.parse(j.out.join('\n'))).toEqual([
      { name: 'core', spec_path: '.openspec/specs/core/spec.md', has_spec: true },
    ])
  })
})

describe('真实 e2e —— set-spec-scope（spec_scope 真落盘）', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshHarness()
    await init(h, 'feat')
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('init 初值 spec_scope: null，set CSV 后真写标量 + [OK] stderr + 真 history', async () => {
    expect(await h.read('feat')).toContain('spec_scope: null')

    const r = await spec(h, 'set-spec-scope', 'feat', 'auth,billing')
    expect(r.code).toBe(0)
    expect(r.out).toEqual([]) // 无 stdout
    expect(r.err.join('\n')).toContain('[OK] set-spec-scope feat: auth,billing')

    const yaml = await h.read('feat')
    expect(yaml).toContain('spec_scope: auth,billing')

    // 真 history JSONL 记账
    const hist = await h.readIn('feat', '.pipeline-history.jsonl')
    const entries = hist.trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.field === 'spec_scope')
    expect(entries.at(-1)).toMatchObject({ kind: 'set', field: 'spec_scope', to: 'auth,billing' })
  })

  test('all sentinel 原样写', async () => {
    expect((await spec(h, 'set-spec-scope', 'feat', 'all')).code).toBe(0)
    expect(await h.read('feat')).toContain('spec_scope: all')
  })

  test('清空（空 scope）→ 归一回 null 哨兵 + 全扫消息', async () => {
    await spec(h, 'set-spec-scope', 'feat', 'auth')
    expect(await h.read('feat')).toContain('spec_scope: auth')

    const r = await spec(h, 'set-spec-scope', 'feat', '')
    expect(r.code).toBe(0)
    expect(r.err.join('\n')).toContain('null（全扫，fail-open）')
    expect(await h.read('feat')).toContain('spec_scope: null')
  })

  test('缺 change（状态文件不存在）→ exit 1', async () => {
    const r = await spec(h, 'set-spec-scope', 'ghost', 'auth')
    expect(r.code).toBe(1)
    expect(r.err.join('\n')).toContain('ERROR')
  })

  test('spec_scope 不污染其它字段（phase 仍 open）', async () => {
    await spec(h, 'set-spec-scope', 'feat', 'auth,billing')
    expect(await h.run(['get', 'feat', 'phase'])).toBe(0)
    expect(h.out).toEqual(['open'])
    expect(await h.run(['get', 'feat', 'spec_scope'])).toBe(0)
    expect(h.out).toEqual(['auth,billing'])
  })
})

describe('真实 e2e —— inject-jsonl（真读 jsonl + 真 cat 内容 + 真目录展开）', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshHarness()
    await init(h, 'feat')
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  /** 写 change 的 <agent>.jsonl 真文件 */
  async function writeJsonl(agent: string, lines: string[]): Promise<void> {
    await writeFile(join(h.cwd, 'openspec', 'changes', 'feat', `${agent}.jsonl`), lines.join('\n') + '\n', 'utf8')
  }

  test('缺 jsonl → stderr WARN + rc0（fail-open）', async () => {
    const r = await spec(h, 'inject-jsonl', 'feat')
    expect(r.code).toBe(0)
    expect(r.out).toEqual([])
    expect(r.err.join('\n')).toContain('implement.jsonl 不存在')
  })

  test('bad agent → stderr Error + rc0', async () => {
    const r = await spec(h, 'inject-jsonl', 'feat', 'bogus')
    expect(r.code).toBe(0)
    expect(r.err.join('\n')).toContain('jsonl agent 仅支持 implement / check（得到: bogus）')
  })

  test('file entry：真 cat 内容进 header 下', async () => {
    await writeFile(join(h.cwd, 'note.md'), 'REAL FILE CONTENT\nLINE2\n', 'utf8')
    await writeJsonl('implement', ['{"file":"note.md","reason":"ctx"}'])

    const r = await spec(h, 'inject-jsonl', 'feat')
    expect(r.code).toBe(0)
    expect(r.out).toEqual([
      '## Curated Context Manifest · implement (openspec/changes/feat/implement.jsonl)',
      '',
      '=== note.md ===',
      'REAL FILE CONTENT',
      'LINE2',
    ])
    expect(r.err).toEqual([]) // 有真实 entry → 无 only-seed WARN
  })

  test('directory entry：真展开其下 *.md（排序），非 md 忽略', async () => {
    await mkdir(join(h.cwd, 'ctxdir'), { recursive: true })
    await writeFile(join(h.cwd, 'ctxdir', 'b.md'), 'BBB\n', 'utf8')
    await writeFile(join(h.cwd, 'ctxdir', 'a.md'), 'AAA\n', 'utf8')
    await writeFile(join(h.cwd, 'ctxdir', 'skip.txt'), 'IGNORE\n', 'utf8')
    await writeJsonl('check', ['{"file":"ctxdir","type":"directory","reason":"dir ctx"}'])

    const r = await spec(h, 'inject-jsonl', 'feat', 'check')
    expect(r.code).toBe(0)
    const text = r.out.join('\n')
    expect(r.out[0]).toBe('## Curated Context Manifest · check (openspec/changes/feat/check.jsonl)')
    expect(text).toContain('=== ctxdir/a.md ===\nAAA')
    expect(text).toContain('=== ctxdir/b.md ===\nBBB')
    // a 在 b 前（排序）
    expect(text.indexOf('ctxdir/a.md')).toBeLessThan(text.indexOf('ctxdir/b.md'))
    expect(text).not.toContain('IGNORE')
  })

  test('缺文件 entry → file not found WARN，坏行容错，seed 跳过', async () => {
    await writeFile(join(h.cwd, 'real.md'), 'R\n', 'utf8')
    await writeJsonl('implement', [
      '{"_example":"seed 行——注入期静默跳过"}',
      '{"file":"real.md"}',
      '{"file":"gone.md"}',
      '{oops not json}',
    ])

    const r = await spec(h, 'inject-jsonl', 'feat')
    expect(r.code).toBe(0)
    // 真内容只含 real.md（gone.md 缺、坏行/seed 跳过）
    expect(r.out.join('\n')).toContain('=== real.md ===\nR')
    expect(r.out.join('\n')).not.toContain('gone.md')
    const err = r.err.join('\n')
    expect(err).toContain('file not found（注入期跳过）: gone.md')
    expect(err).not.toContain('only seed') // 有真实 entry
  })

  test('整表只 seed → only-seed WARN（可观测，rc0）', async () => {
    await writeJsonl('implement', ['{"_example":"only seed here"}'])
    const r = await spec(h, 'inject-jsonl', 'feat')
    expect(r.code).toBe(0)
    expect(r.err.join('\n')).toContain('has no curated entries (only seed)')
  })
})
