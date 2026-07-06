/**
 * living spec 库 —— 真实 fs 单元测试（BACKLOG #16，GOAL C9：无 mock，真临时目录）。
 * 覆盖 specs 枚举（openspec/specs + .openspec 回退 + spec.md 三态）、set-spec-scope 写值归一、
 * inject-jsonl 全分支（bad agent / 缺文件 / 坏 JSON 容错 / seed 跳过 / file / dir 展开 / 20 上限 /
 * not-found WARN / sawReal）。纯函数 parseJsonlLine / specScopeWriteValue 直接断言。
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  injectJsonl,
  jsonlRelPath,
  listSpecEntries,
  parseJsonlLine,
  resolveSpecsDir,
  specScopeWriteValue,
} from './spec.js'

let cwd: string
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'lite-spec-'))
})
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true })
})

async function writeSpec(cap: string, body = '# spec\n', dir = 'openspec/specs'): Promise<void> {
  await mkdir(join(cwd, dir, cap), { recursive: true })
  await writeFile(join(cwd, dir, cap, 'spec.md'), body, 'utf8')
}

async function writeJsonl(name: string, agent: string, lines: string[]): Promise<void> {
  await mkdir(join(cwd, 'openspec', 'changes', name), { recursive: true })
  await writeFile(join(cwd, 'openspec', 'changes', name, `${agent}.jsonl`), lines.join('\n') + '\n', 'utf8')
}

describe('parseJsonlLine —— 容错解析（老仓 jq .file // empty / .type // "file"）', () => {
  test('普通 file entry → {file, type:file}', () => {
    expect(parseJsonlLine('{"file":"src/x.ts","reason":"why"}')).toEqual({ file: 'src/x.ts', type: 'file' })
  })
  test('directory entry → type:directory', () => {
    expect(parseJsonlLine('{"file":"src/dir","type":"directory"}')).toEqual({ file: 'src/dir', type: 'directory' })
  })
  test('seed（_example 无 file）→ null（静默跳过）', () => {
    expect(parseJsonlLine('{"_example":"curated manifest ..."}')).toBeNull()
  })
  test('坏 JSON → null（注入期容错 continue）', () => {
    expect(parseJsonlLine('{not json')).toBeNull()
    expect(parseJsonlLine('garbage')).toBeNull()
  })
  test('file 空串 → null（jq empty 语义）', () => {
    expect(parseJsonlLine('{"file":""}')).toBeNull()
  })
  test('file null → null', () => {
    expect(parseJsonlLine('{"file":null}')).toBeNull()
  })
  test('缺 type → 默认 file', () => {
    expect(parseJsonlLine('{"file":"a"}')?.type).toBe('file')
  })
})

describe('specScopeWriteValue —— 空清回 null 哨兵（老仓 cmd_set_spec_scope）', () => {
  test('空串 → null', () => {
    expect(specScopeWriteValue('')).toBe('null')
  })
  test('undefined → null', () => {
    expect(specScopeWriteValue(undefined)).toBe('null')
  })
  test('all → all（全扫 sentinel 原样）', () => {
    expect(specScopeWriteValue('all')).toBe('all')
  })
  test('list CSV → 原样', () => {
    expect(specScopeWriteValue('auth,billing')).toBe('auth,billing')
  })
})

describe('resolveSpecsDir —— openspec/specs 优先 + .openspec 回退', () => {
  test('都不存在 → openspec/specs, exists false', async () => {
    expect(await resolveSpecsDir(cwd)).toEqual({ dir: 'openspec/specs', exists: false })
  })
  test('openspec/specs 存在 → 用之', async () => {
    await mkdir(join(cwd, 'openspec', 'specs'), { recursive: true })
    expect(await resolveSpecsDir(cwd)).toEqual({ dir: 'openspec/specs', exists: true })
  })
  test('仅 .openspec/specs 存在 → 回退', async () => {
    await mkdir(join(cwd, '.openspec', 'specs'), { recursive: true })
    expect(await resolveSpecsDir(cwd)).toEqual({ dir: '.openspec/specs', exists: true })
  })
  test('两者都存在 → 优先 openspec/specs（不回退）', async () => {
    await mkdir(join(cwd, 'openspec', 'specs'), { recursive: true })
    await mkdir(join(cwd, '.openspec', 'specs'), { recursive: true })
    expect((await resolveSpecsDir(cwd)).dir).toBe('openspec/specs')
  })
})

describe('listSpecEntries —— capability 枚举 + spec.md 三态', () => {
  test('specs 目录缺失 → exists false, 空', async () => {
    expect(await listSpecEntries(cwd)).toEqual({ dir: 'openspec/specs', exists: false, entries: [] })
  })

  test('多 capability，spec.md 有无并存，按名排序', async () => {
    await writeSpec('billing')
    await writeSpec('auth')
    // capability 有目录但无 spec.md
    await mkdir(join(cwd, 'openspec', 'specs', 'zeta'), { recursive: true })

    const r = await listSpecEntries(cwd)
    expect(r.exists).toBe(true)
    expect(r.entries).toEqual([
      { name: 'auth', specPath: 'openspec/specs/auth/spec.md', hasSpec: true },
      { name: 'billing', specPath: 'openspec/specs/billing/spec.md', hasSpec: true },
      { name: 'zeta', specPath: '', hasSpec: false },
    ])
  })

  test('.openspec/specs 回退时 specPath 用回退前缀', async () => {
    await writeSpec('auth', '# a\n', '.openspec/specs')
    const r = await listSpecEntries(cwd)
    expect(r.dir).toBe('.openspec/specs')
    expect(r.entries[0]).toEqual({ name: 'auth', specPath: '.openspec/specs/auth/spec.md', hasSpec: true })
  })
})

describe('jsonlRelPath', () => {
  test('拼 openspec/changes/<name>/<agent>.jsonl', () => {
    expect(jsonlRelPath('feat', 'implement')).toBe('openspec/changes/feat/implement.jsonl')
    expect(jsonlRelPath('feat', 'check')).toBe('openspec/changes/feat/check.jsonl')
  })
})

describe('injectJsonl —— 注入期容错（老仓 cmd_inject_jsonl，fail-open）', () => {
  test('非法 agent → kind bad-agent（不读盘）', async () => {
    const r = await injectJsonl(cwd, 'feat', 'bogus')
    expect(r.kind).toBe('bad-agent')
    expect(r.chunks).toEqual([])
  })

  test('jsonl 文件缺失 → kind missing + jsonlPath', async () => {
    await mkdir(join(cwd, 'openspec', 'changes', 'feat'), { recursive: true })
    const r = await injectJsonl(cwd, 'feat', 'implement')
    expect(r.kind).toBe('missing')
    expect(r.jsonlPath).toBe('openspec/changes/feat/implement.jsonl')
  })

  test('单 file entry 存在 → chunk 含真实内容, sawReal true', async () => {
    await writeFile(join(cwd, 'note.md'), 'HELLO CONTENT\n', 'utf8')
    await writeJsonl('feat', 'implement', ['{"file":"note.md","reason":"r"}'])
    const r = await injectJsonl(cwd, 'feat', 'implement')
    expect(r.kind).toBe('ok')
    expect(r.sawReal).toBe(true)
    expect(r.chunks).toEqual([{ path: 'note.md', content: 'HELLO CONTENT\n' }])
    expect(r.warnings).toEqual([])
  })

  test('file entry 不存在 → warning file not found, 无 chunk, sawReal true', async () => {
    await writeJsonl('feat', 'implement', ['{"file":"missing.md","reason":"r"}'])
    const r = await injectJsonl(cwd, 'feat', 'implement')
    expect(r.chunks).toEqual([])
    expect(r.sawReal).toBe(true)
    expect(r.warnings).toEqual(['  > [WARN] file not found（注入期跳过）: missing.md'])
  })

  test('坏 JSON 行容错 continue + seed 跳过（只 seed → sawReal false）', async () => {
    await writeJsonl('feat', 'implement', [
      '{"_example":"seed"}',
      '{bad json',
      '',
    ])
    const r = await injectJsonl(cwd, 'feat', 'implement')
    expect(r.kind).toBe('ok')
    expect(r.sawReal).toBe(false)
    expect(r.chunks).toEqual([])
  })

  test('directory entry → 展开其下 *.md（排序），每文件一个 chunk', async () => {
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'docs', 'b.md'), 'B\n', 'utf8')
    await writeFile(join(cwd, 'docs', 'a.md'), 'A\n', 'utf8')
    await writeFile(join(cwd, 'docs', 'ignore.txt'), 'X\n', 'utf8')
    await writeJsonl('feat', 'implement', ['{"file":"docs","type":"directory","reason":"r"}'])
    const r = await injectJsonl(cwd, 'feat', 'implement')
    expect(r.chunks).toEqual([
      { path: 'docs/a.md', content: 'A\n' },
      { path: 'docs/b.md', content: 'B\n' },
    ])
  })

  test('directory entry 缺目录 → warning directory not found', async () => {
    await writeJsonl('feat', 'implement', ['{"file":"nodir","type":"directory"}'])
    const r = await injectJsonl(cwd, 'feat', 'implement')
    expect(r.chunks).toEqual([])
    expect(r.warnings).toEqual(['  > [WARN] directory not found（注入期跳过）: nodir'])
  })

  test('directory entry *.md 上限 20（第 21 个不注入）', async () => {
    await mkdir(join(cwd, 'many'), { recursive: true })
    for (let i = 0; i < 25; i++) {
      await writeFile(join(cwd, 'many', `f${String(i).padStart(2, '0')}.md`), `C${i}\n`, 'utf8')
    }
    await writeJsonl('feat', 'implement', ['{"file":"many","type":"directory"}'])
    const r = await injectJsonl(cwd, 'feat', 'implement')
    expect(r.chunks).toHaveLength(20)
    // 排序取前 20（f00..f19）
    expect(r.chunks[0]?.path).toBe('many/f00.md')
    expect(r.chunks[19]?.path).toBe('many/f19.md')
  })

  test('混合：file + dir + seed + 坏行，chunks/warnings 各按序', async () => {
    await writeFile(join(cwd, 'real.md'), 'R\n', 'utf8')
    await writeJsonl('feat', 'check', [
      '{"_example":"seed"}',
      '{"file":"real.md"}',
      '{"file":"gone.md"}',
      '{oops',
    ])
    const r = await injectJsonl(cwd, 'feat', 'check')
    expect(r.jsonlPath).toBe('openspec/changes/feat/check.jsonl')
    expect(r.chunks).toEqual([{ path: 'real.md', content: 'R\n' }])
    expect(r.warnings).toEqual(['  > [WARN] file not found（注入期跳过）: gone.md'])
    expect(r.sawReal).toBe(true)
  })
})
