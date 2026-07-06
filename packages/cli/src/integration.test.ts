/**
 * 真实端到端集成测试（GOAL C9/C10：无伪测试 · 真实且全量，2026-07-07 用户指令）。
 *
 * 与其余 *.test.ts 的根本区别：**零 mock**。
 *   - 真 kernel：createStateStore / createFlowEngine / loadManifest / createHistoryWriter
 *   - 真文件系统：每个用例一个 mkdtemp 临时项目，断言落盘的真实 .pipeline.yaml / JSONL / marker 字节
 *   - 真装配：走 buildProgram(realDeps).parseAsync——与 main.ts 同一条命令解析路径
 * 只差一层进程边界（那层由 tools/test-bundle.sh 真跑编译产物覆盖）+ 老内核对照（oracle 覆盖）。
 *
 * 命中「伪测试」判据即不算数：断言 mock 返回 / 真实路径未执行 / 伪造 pass。本文件全程摸真盘。
 */
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  createFlowEngine,
  createHistoryWriter,
  createStateStore,
  loadManifest,
  type GuardContext,
} from '@pipeline-lite/kernel'
import type { CliDeps } from './deps.js'
import { buildProgram, CliExit } from './program.js'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MANIFEST = join(REPO_ROOT, 'templates', 'manifest.yaml')
const FIXED_CLOCK = '2026-07-07T00:00:00Z'

interface Harness {
  cwd: string
  out: string[]
  err: string[]
  run: (args: string[]) => Promise<number>
  read: (name: string) => Promise<string>
}

/** 真实 deps：与 main.ts 同款 fs 副作用，只把 io 收进数组、clock 固定，其余全真。 */
function realDeps(cwd: string, out: string[], err: string[]): CliDeps {
  const manifest = loadManifest(MANIFEST)
  const abs = (p: string) => join(cwd, p)
  const guardCtx = (name: string): GuardContext => ({
    changeDirRel: `openspec/changes/${name}`,
    fileExists: (p) => { try { return statSync(abs(p)).isFile() } catch { return false } },
    fileNonempty: (p) => { try { const s = statSync(abs(p)); return s.isFile() && s.size > 0 } catch { return false } },
    readFile: (p) => { try { return readFileSync(abs(p), 'utf8') } catch { return undefined } },
    dirExists: (p) => { try { return statSync(abs(p)).isDirectory() } catch { return false } },
    changeArchived: (dep) => {
      try {
        return readdirSync(abs('openspec/changes/archive'), { withFileTypes: true })
          .some((e) => e.isDirectory() && e.name.endsWith(`-${dep}`))
      } catch { return false }
    },
    automationRunner: false,
  })
  return {
    store: createStateStore(),
    flow: createFlowEngine(manifest),
    cwd,
    io: { out: (l) => out.push(l), err: (l) => err.push(l) },
    clock: () => FIXED_CLOCK,
    listChanges: async (root) => {
      try {
        return readdirSync(root, { withFileTypes: true })
          .filter((e) => e.isDirectory() && e.name !== 'archive')
          .filter((e) => { try { return statSync(join(root, e.name, '.pipeline.yaml')).isFile() } catch { return false } })
          .map((e) => e.name).sort()
      } catch { return [] }
    },
    guardCtx,
    readGateMarkers: async () => {
      const res = []
      for (const kind of ['confirm', 'review', 'interaction'] as const) {
        try {
          const p = join(cwd, `.pipeline-pending-${kind}`)
          const st = await stat(p)
          res.push({ kind, ageMs: 0, raw: await readFile(p, 'utf8') })
        } catch { /* 缺失 */ }
      }
      return res
    },
    readHistoryRaw: async (dir) => { try { return await readFile(join(dir, '.pipeline-history.jsonl'), 'utf8') } catch { return '' } },
    writeBreadcrumb: (dir, content) => writeFile(join(dir, '.breadcrumb'), content, 'utf8'),
    history: createHistoryWriter(),
    gitHeadSha: async () => 'DEADBEEF',
    writeReviewMarker: (content) => writeFile(join(cwd, '.pipeline-pending-review'), content, 'utf8'),
    // 真探针束：pluginRoot 指真仓，manifest/verify-skills 真跑（doctor 的真实生效面）
    doctor: {
      nodeVersion: () => process.version,
      gitAvailable: async () => { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true } catch { return false } },
      pluginRoot: REPO_ROOT,
      manifestError: () => { try { loadManifest(MANIFEST); return null } catch (e) { return e instanceof Error ? e.message : String(e) } },
      fileExists: (p) => { try { return statSync(p).isFile() } catch { return false } },
      fileExecutable: (p) => { try { return (statSync(p).mode & 0o111) !== 0 } catch { return false } },
      dirExists: (p) => { try { return statSync(p).isDirectory() } catch { return false } },
      env: (name) => process.env[name],
      statuslineConfigured: () => false,
      runVerifySkills: async () => {
        try {
          const output = execFileSync('bash', [join(REPO_ROOT, 'tools', 'verify-skills.sh')], { encoding: 'utf8' })
          return { code: 0, output }
        } catch (e) {
          const err = e as { status?: number; stdout?: string; stderr?: string }
          return { code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` }
        }
      },
    },
  }
}

function makeHarness(cwd: string): Harness {
  const out: string[] = []
  const err: string[] = []
  return {
    cwd, out, err,
    run: async (args) => {
      out.length = 0
      err.length = 0
      try {
        await buildProgram(realDeps(cwd, out, err)).parseAsync(args, { from: 'user' })
        return 0
      } catch (e) {
        if (e instanceof CliExit) return e.code
        throw e
      }
    },
    read: (name) => readFile(join(cwd, 'openspec', 'changes', name, '.pipeline.yaml'), 'utf8'),
  }
}

describe('真实 e2e —— 全命令驱动真 kernel + 真 fs（GOAL C9）', () => {
  let h: Harness
  beforeEach(async () => {
    h = makeHarness(await mkdtemp(join(tmpdir(), 'lite-e2e-')))
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('init 真落盘 .pipeline.yaml：字段序 + created_by + phase=open', async () => {
    expect(await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full', '--user', 'jeff'])).toBe(0)
    const yaml = await h.read('demo')
    expect(yaml).toMatch(/^track: backend$/m)
    expect(yaml).toMatch(/^created_by: jeff$/m)
    expect(yaml).toMatch(/^phase: open$/m)
    // 字段序：track 必在 phase 之前（FIELD_ORDER 落盘真相）
    expect(yaml.indexOf('\ntrack:')).toBeLessThan(yaml.indexOf('\nphase:'))
  })

  test('get 真读回 init 写的值', async () => {
    await h.run(['init', 'demo', '--track', 'pm', '--preset', 'full'])
    expect(await h.run(['get', 'demo', 'track'])).toBe(0)
    expect(h.out).toEqual(['pm'])
  })

  test('set 真写字段 + 真记 history JSONL', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    expect(await h.run(['set', 'demo', 'plan', 'docs/plans/p.md'])).toBe(0)
    expect(await h.read('demo')).toMatch(/^plan: docs\/plans\/p\.md$/m)
    const hist = await readFile(join(h.cwd, 'openspec/changes/demo/.pipeline-history.jsonl'), 'utf8')
    expect(hist).toContain('"kind":"set"')
    expect(hist).toContain('"field":"plan"')
  })

  test('get 未设字段真读回 init 忠实值 exit 0（G1，老内核 heredoc：可选字段写字面 null）', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    // 真实发现：init 对 plan 等可选字段落盘字面 "null"（忠实老内核，oracle 双跑据此过）——非空串
    expect(await h.run(['get', 'demo', 'plan'])).toBe(0)
    expect(h.out).toEqual(['null'])
    expect(await h.read('demo')).toMatch(/^plan: null$/m)
    // FIELD_ORDER 之外的未知字段 → grep-miss 空行 + exit 0（yaml_get 语义）
    expect(await h.run(['get', 'demo', 'nonesuch'])).toBe(0)
    expect(h.out).toEqual([''])
  })

  test('set-many 真原子写多字段，落盘字段序正确（G2）', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    expect(await h.run(['set-many', 'demo', 'build_mode=direct', 'isolation=branch'])).toBe(0)
    const yaml = await h.read('demo')
    expect(yaml).toMatch(/^build_mode: direct$/m)
    expect(yaml).toMatch(/^isolation: branch$/m)
    // FIELD_ORDER：build_mode 在 isolation 之前
    expect(yaml.indexOf('\nbuild_mode:')).toBeLessThan(yaml.indexOf('\nisolation:'))
  })

  test('check 真跑 guard 全量面：未满足出口条件 exit 2，满足 exit 0（G3）', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    await h.run(['transition', 'demo', 'open-complete']) // → explore
    // explore 出口要求 design_doc 指向存在文件——未设 → check 不过 exit 2
    expect(await h.run(['check', 'demo'])).toBe(2)
    // 真建 design doc 并指向它 → check 过
    const ddir = join(h.cwd, 'openspec/changes/demo')
    await writeFile(join(ddir, 'design.md'), '# design\n覆盖矩阵齐全\n', 'utf8')
    await h.run(['set', 'demo', 'design_doc', 'openspec/changes/demo/design.md'])
    expect(await h.run(['check', 'demo'])).toBe(0)
  })

  test('set 四闸真拒写（": " 注入）exit 1，文件不被破坏', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    const before = await h.read('demo')
    expect(await h.run(['set', 'demo', 'assignee', 'a: b'])).toBe(1)
    expect(await h.read('demo')).toBe(before) // 字节不变
  })

  test('cas 真比对：匹配写入 exit 0 / 不匹配 exit 3', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    await h.run(['set', 'demo', 'automation', 'queued'])
    expect(await h.run(['cas', 'demo', 'automation', 'queued', 'running'])).toBe(0)
    expect(await h.read('demo')).toMatch(/^automation: running$/m)
    expect(await h.run(['cas', 'demo', 'automation', 'queued', 'off'])).toBe(3) // 现值已是 running
  })

  test('transition 真改相位 + 真落 review marker + 真记历史', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    expect(await h.run(['transition', 'demo', 'open-complete'])).toBe(0)
    expect(await h.read('demo')).toMatch(/^phase: explore$/m)
    // explore 是复核相位 → 真落 .pipeline-pending-review
    await expect(stat(join(h.cwd, '.pipeline-pending-review'))).resolves.toBeTruthy()
    const hist = await readFile(join(h.cwd, 'openspec/changes/demo/.pipeline-history.jsonl'), 'utf8')
    expect(hist).toContain('"kind":"transition"')
    expect(hist).toContain('"to":"explore"')
  })

  test('transition 非法真拒：exit 1，相位不变', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    expect(await h.run(['transition', 'demo', 'verify-pass'])).toBe(1) // open 相位收 verify 事件非法
    expect(await h.read('demo')).toMatch(/^phase: open$/m)
  })

  test('build-complete 真冻结 build_sha（gitHeadSha 注入）', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    for (const ev of ['open-complete', 'explore-complete', 'spec-complete', 'build-complete']) {
      await h.run(['transition', 'demo', ev])
    }
    expect(await h.read('demo')).toMatch(/^phase: verify$/m)
    expect(await h.read('demo')).toMatch(/^build_sha: DEADBEEF$/m)
  })

  test('inbox 真读复核相位 change（--json schema）', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    await h.run(['transition', 'demo', 'open-complete']) // → explore（复核相位）
    expect(await h.run(['inbox', '--json'])).toBe(0)
    const payload = JSON.parse(h.out.join('\n')) as { inbox: Array<{ name: string; waiting_on: string }> }
    expect(payload.inbox.some((i) => i.name === 'demo')).toBe(true)
  })

  test('status/list 真枚举活跃 change', async () => {
    await h.run(['init', 'a1', '--track', 'backend', '--preset', 'full'])
    await h.run(['init', 'b2', '--track', 'pm', '--preset', 'full'])
    expect(await h.run(['list', '--json'])).toBe(0)
    const payload = JSON.parse(h.out.join('\n')) as { changes: Array<{ name: string }> }
    expect(payload.changes.map((c) => c.name).sort()).toEqual(['a1', 'b2'])
  })

  test('doctor 真跑健康面：识别本 pipeline 项目，exit 0/1 合法', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    const code = await h.run(['doctor', '--json'])
    expect([0, 1]).toContain(code)
    const payload = JSON.parse(h.out.join('\n')) as { checks: unknown[]; summary: Record<string, number> }
    expect(Array.isArray(payload.checks)).toBe(true)
    expect(payload.checks.length).toBeGreaterThan(0)
  })

  test('全程 init→archive 七相位真跑通，落盘 archived=true', async () => {
    await h.run(['init', 'e2e', '--track', 'backend', '--preset', 'full', '--user', 'conv'])
    const events = ['open-complete', 'explore-complete', 'spec-complete', 'build-complete', 'verify-pass', 'ship-complete', 'archived']
    for (const ev of events) {
      const code = await h.run(['transition', 'e2e', ev])
      expect(code, `事件 ${ev} 应成功`).toBe(0)
      // 每步清门 marker，模拟人工放行（真删真文件）
      for (const k of ['confirm', 'review', 'interaction']) {
        await rm(join(h.cwd, `.pipeline-pending-${k}`), { force: true })
      }
    }
    expect(await h.read('e2e')).toMatch(/^phase: archive$/m)
    expect(await h.read('e2e')).toMatch(/^archived: true$/m)
    // 历史 JSONL 真记满 7 条 transition
    const hist = await readFile(join(h.cwd, 'openspec/changes/e2e/.pipeline-history.jsonl'), 'utf8')
    expect(hist.split('\n').filter((l) => l.includes('"kind":"transition"'))).toHaveLength(7)
  })

  test('import 真迁移 base64 历史区（老仓 fixture）+ --strip 真清 YAML', async () => {
    // 用老仓真实 fixture 建 change（含 tools/prompts/transitions_history base64 区）
    const fixture = await readFile(join(REPO_ROOT, 'packages/kernel/src/state/fixtures/dashboard-interaction-fixes.pipeline.yaml'), 'utf8')
    const dir = join(h.cwd, 'openspec/changes/legacy1')
    await rm(dir, { recursive: true, force: true })
    await import('node:fs/promises').then((fs) => fs.mkdir(dir, { recursive: true }))
    await writeFile(join(dir, '.pipeline.yaml'), fixture, 'utf8')
    expect(await h.run(['import', 'legacy1', '--strip'])).toBe(0)
    const jsonl = await readFile(join(dir, '.pipeline-history.jsonl'), 'utf8')
    expect(jsonl).toContain('"kind":"import"')
    expect(jsonl.split('\n').filter(Boolean).length).toBeGreaterThan(5)
    expect(await h.read('legacy1')).not.toContain('_history:') // YAML 历史节真被清
    // --strip 后再 import：历史区已清空 → 诚实返回 exit 0「无历史区可导入」（非幂等哨兵路径）
    expect(await h.run(['import', 'legacy1'])).toBe(0)
    expect(h.err.join('\n')).toContain('无历史区')
  })

  test('import 幂等哨兵真拦重复导入（不带 --strip：tail 仍在，第二次被哨兵挡）', async () => {
    const fixture = await readFile(join(REPO_ROOT, 'packages/kernel/src/state/fixtures/dashboard-interaction-fixes.pipeline.yaml'), 'utf8')
    const dir = join(h.cwd, 'openspec/changes/legacy2')
    await import('node:fs/promises').then((fs) => fs.mkdir(dir, { recursive: true }))
    await writeFile(join(dir, '.pipeline.yaml'), fixture, 'utf8')
    expect(await h.run(['import', 'legacy2'])).toBe(0) // 首次真导入
    // 第二次：tail 未清（无 --strip）但 JSONL 已有 import 哨兵 → 真拦 exit 1
    expect(await h.run(['import', 'legacy2'])).toBe(1)
    expect(h.err.join('\n')).toContain('已导入过')
  })

  test('并发真锁：两个 set 竞争同一 change 不丢字段', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    // 真并发跑两条 set（各自独立 deps/store，真 mkdir 锁串行化落盘）
    const o1: string[] = [], e1: string[] = [], o2: string[] = [], e2: string[] = []
    const p1 = buildProgram(realDeps(h.cwd, o1, e1)).parseAsync(['set', 'demo', 'plan', 'P'], { from: 'user' }).catch((e) => { if (!(e instanceof CliExit)) throw e })
    const p2 = buildProgram(realDeps(h.cwd, o2, e2)).parseAsync(['set', 'demo', 'branch', 'B'], { from: 'user' }).catch((e) => { if (!(e instanceof CliExit)) throw e })
    await Promise.all([p1, p2])
    const yaml = await h.read('demo')
    expect(yaml).toMatch(/^plan: P$/m)
    expect(yaml).toMatch(/^branch: B$/m) // 两笔都在，锁未丢写
  })
})

describe('真实构建产物 —— tsc + esbuild bundle 存在且可执行（GOAL C9 证据链）', () => {
  test('dist/pipeline.mjs 真存在、真跑 --help 不炸', () => {
    const bundle = join(REPO_ROOT, 'packages/cli/dist/pipeline.mjs')
    expect(statSync(bundle).isFile()).toBe(true)
    // 真起子进程跑真产物（与 test-bundle.sh 同源，vitest 内也钉一道）
    const help = execFileSync('node', [bundle, '--help'], { encoding: 'utf8' })
    expect(help).toContain('pipeline')
    expect(help).toContain('transition')
  })
})
