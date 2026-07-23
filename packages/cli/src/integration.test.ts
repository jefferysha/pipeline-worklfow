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
import { readFile, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { buildProgram, CliExit } from './program.js'
import { freshHarness, realDeps, REPO_ROOT, type Harness } from './integration-harness.js'

describe('真实 e2e —— 全命令驱动真 kernel + 真 fs（GOAL C9）', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshHarness()
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
    await h.seedGovernedDocumentEvidence('demo')
    await h.run(['transition', 'demo', 'open-complete']) // → explore
    // explore 出口要求 design_doc 指向存在文件——未设 → check 不过 exit 2
    expect(await h.run(['check', 'demo'])).toBe(2)
    // 真建 design doc 并指向它 → check 过
    const ddir = join(h.cwd, 'openspec/changes/demo')
    await h.seedArtifact('demo', 'design_doc', 'openspec/changes/demo/design.md') // P6：artifact 白盒预置
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
    await h.seedGovernedDocumentEvidence('demo')
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

  test('build-complete 真冻结 build_sha（喂足真实前置，忠实老内核 case 块）', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    await h.seedGovernedDocumentEvidence('demo')
    // explore 出口：使用已记录的 OpenSpec design 并登记字段（不得改写 hash-bound 文档）。
    await h.seedArtifact('demo', 'design_doc', 'openspec/changes/demo/design.md') // P6：artifact 白盒预置
    await h.run(['transition', 'demo', 'open-complete'])
    await rm(join(h.cwd, '.pipeline-pending-review'), { force: true })
    await h.run(['transition', 'demo', 'explore-complete'])
    await rm(join(h.cwd, '.pipeline-pending-review'), { force: true })
    // spec 出口（backend）：真建 plan 并指向它（老仓 L127-138）
    await writeFile(join(h.cwd, 'openspec/changes/demo/plan.md'), '# plan\n', 'utf8')
    await h.seedArtifact('demo', 'plan', 'openspec/changes/demo/plan.md') // P6：artifact 白盒预置
    await h.run(['transition', 'demo', 'spec-complete'])
    // build 出口：build_mode + isolation 必设；full+direct 须显式 direct_override=true（老仓 L144-151）
    await h.run(['set-many', 'demo', 'build_mode=direct', 'isolation=worktree', 'direct_override=true'])
    expect(await h.run(['transition', 'demo', 'build-complete'])).toBe(0)
    expect(await h.read('demo')).toMatch(/^phase: verify$/m)
    expect(await h.read('demo')).toMatch(/^build_sha: DEADBEEF$/m)
  })

  test('inbox 真读复核相位 change（--json schema）', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    await h.seedGovernedDocumentEvidence('demo')
    await h.run(['transition', 'demo', 'open-complete']) // → explore（复核相位）
    expect(await h.run(['inbox', '--json'])).toBe(0)
    const payload = JSON.parse(h.out.join('\n')) as { inbox: Array<{ name: string; waiting_on: string }> }
    expect(payload.inbox.some((i) => i.name === 'demo')).toBe(true)
  })

  test('task add-dep + children 真跑通（走 buildProgram 注册，真落盘 depends_on）', async () => {
    await h.run(['init', 'a', '--track', 'backend', '--preset', 'full'])
    await h.run(['init', 'b', '--track', 'backend', '--preset', 'full'])
    expect(await h.run(['task', 'add-dep', 'a', 'b'])).toBe(0)
    // a 真落盘 depends_on 块序列含 b
    expect(await h.read('a')).toMatch(/depends_on:\n\s*-\s*b/)
    // children of b 真反查到 a（--json 经 program 的 --json 选项透传进 args）
    expect(await h.run(['task', 'children', 'b', '--json'])).toBe(0)
    const payload = JSON.parse(h.out.join('\n')) as Array<{ name: string; archived: boolean }>
    expect(payload).toEqual([{ name: 'a', archived: false }])
    // remove-dep 真清空回 []
    expect(await h.run(['task', 'remove-dep', 'a', 'b'])).toBe(0)
    expect(await h.run(['get', 'a', 'depends_on'])).toBe(0)
    expect(h.out).toEqual([''])
  })

  test('spec：specs 真枚举 + set-spec-scope 真落盘标量（走 buildProgram）', async () => {
    await h.run(['init', 'auth', '--track', 'backend', '--preset', 'full'])
    await import('node:fs/promises').then((fs) => fs.mkdir(join(h.cwd, 'openspec/specs/login'), { recursive: true }))
    await writeFile(join(h.cwd, 'openspec/specs/login/spec.md'), '# login\n', 'utf8')
    expect(await h.run(['spec', 'specs', '--json'])).toBe(0)
    const specs = JSON.parse(h.out.join('\n')) as Array<{ name: string; has_spec: boolean }>
    expect(specs).toEqual([{ name: 'login', spec_path: 'openspec/specs/login/spec.md', has_spec: true }])
    expect(await h.run(['spec', 'set-spec-scope', 'auth', 'login,billing'])).toBe(0)
    // 老仓字节：spec_scope 落标量 CSV（非 list 块序列）
    expect(await h.read('auth')).toMatch(/^spec_scope: login,billing$/m)
  })

  test('session：activate 真落 .pipeline-active（走 buildProgram，不动 phase）', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    const before = await h.read('demo')
    expect(await h.run(['session', 'activate', 'demo'])).toBe(0)
    expect(await readFile(join(h.cwd, '.pipeline-active'), 'utf8')).toContain('demo')
    expect(await h.read('demo')).toBe(before) // activate 不碰 .pipeline.yaml
    // 缺 change → exit 1
    expect(await h.run(['session', 'activate', 'nonesuch'])).toBe(1)
  })

  test('status/list 真枚举活跃 change（含 YAML projection 缺失的 canonical-only change）', async () => {
    await h.run(['init', 'a1', '--track', 'backend', '--preset', 'full'])
    await h.run(['init', 'b2', '--track', 'pm', '--preset', 'full'])
    await unlink(join(h.cwd, 'openspec', 'changes', 'b2', '.pipeline.yaml'))
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

  test('sync 真跑（走 buildProgram，--json 决策信封 cli_version 来自注入）', async () => {
    await h.run(['init', 'x', '--track', 'backend', '--preset', 'full'])
    expect(await h.run(['sync'])).toBe(0)
    const env = JSON.parse(h.out.join('\n')) as { stage: string; cli_version: string; report_only: boolean }
    expect(env.stage).toBe('sync')
    expect(env.cli_version).toBe('0.1.0') // deps.pluginVersion 注入
    expect(env.report_only).toBe(true) // 无 --migrate 只报告
  })

  test('uninstall --dry-run 真跑（只打印计划不删文件）', async () => {
    await h.run(['init', 'x', '--track', 'backend', '--preset', 'full'])
    const before = await h.read('x')
    expect(await h.run(['uninstall', '--dry-run', '--yes'])).toBe(0)
    // dry-run 不动 change 文件
    expect(await h.read('x')).toBe(before)
  })

  test('全程 init→archive 七相位真跑通（喂足每相位真实前置，忠实老内核）', async () => {
    const cd = join(h.cwd, 'openspec/changes/e2e')
    await h.run(['init', 'e2e', '--track', 'backend', '--preset', 'full', '--user', 'conv'])
    await h.seedGovernedDocumentEvidence('e2e')
    const clearGates = async () => {
      for (const k of ['confirm', 'review', 'interaction']) await rm(join(h.cwd, `.pipeline-pending-${k}`), { force: true })
    }
    const step = async (ev: string) => {
      const code = await h.run(['transition', 'e2e', ev])
      expect(code, `事件 ${ev} 应成功；stderr=${h.err.join('|')}`).toBe(0)
      await clearGates()
    }
    // 每相位出口前喂真实前置（老仓 state-transition.sh case 块要求）
    await h.run(['transition', 'e2e', 'open-complete']); await clearGates()
    // design.md 已由真实 ledger fixture 记录，保持它的 digest 不变。
    await h.seedArtifact('e2e', 'design_doc', 'openspec/changes/e2e/design.md') // P6：artifact 白盒预置
    await step('explore-complete')
    await writeFile(join(cd, 'plan.md'), '# plan\n', 'utf8')
    await h.seedArtifact('e2e', 'plan', 'openspec/changes/e2e/plan.md') // P6：artifact 白盒预置
    await step('spec-complete')
    await h.run(['set-many', 'e2e', 'build_mode=direct', 'isolation=worktree', 'direct_override=true'])
    await step('build-complete')
    // verify 出口：报告 + branch_status + 双 review pass + barrier（build_sha 已=DEADBEEF）
    await writeFile(join(cd, 'verify.md'), '# verify\n', 'utf8')
    await h.seedArtifact('e2e', 'verification_report', 'openspec/changes/e2e/verify.md') // P6：verify 相位 verification_report 是有效 artifact，白盒预置
    await h.run(['set-many', 'e2e', 'branch_status=handled', 'agent_review_result=pass', 'codex_review_result=pass'])
    await step('verify-pass')
    await step('ship-complete')
    await step('archived')
    expect(await h.read('e2e')).toMatch(/^phase: archive$/m)
    expect(await h.read('e2e')).toMatch(/^archived: true$/m)
    // 历史 JSONL 真记满 7 条 transition，raw=事件名（#14 补）
    const hist = await readFile(join(cd, '.pipeline-history.jsonl'), 'utf8')
    const trans = hist.split('\n').filter((l) => l.includes('"kind":"transition"'))
    expect(trans).toHaveLength(7)
    expect(trans.some((l) => l.includes('"raw":"verify-pass"'))).toBe(true)
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
