/**
 * advance —— auto-transition 中间档 真实端到端集成测试（BACKLOG #31 / GOAL B14·D12·C9）。
 *
 * 零 mock：真临时项目（freshHarness）+ 真 init/set/transition 喂前置 + 真 kernel guard/transition +
 * 真调 cmdAdvance（真 fs realDeps）。断言的是真实副作用：.pipeline.yaml phase 真变 / 真停在复核门 /
 * guard 不过真不推进 / dry-run 真不改盘 / 硬门真不跨越。
 *
 * 说明：advance 尚未接入 program（收编由主会话统一接线），故用 h.run 做 init/set/transition 铺场，
 * 再用 realDeps 直调 cmdAdvance —— 与 main.ts 同一条 fs 副作用装配路径，只把 io 收进数组。
 */
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { freshHarness, realDeps, type Harness } from './integration-harness.js'
import { cmdAdvance, type AdvanceOpts } from './commands/advance.js'

describe('真实 e2e —— advance auto-transition 中间档（HITL 红线：复核相位必停）', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshHarness()
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  const cd = (name: string) => join(h.cwd, 'openspec', 'changes', name)
  const phaseOf = async (name: string): Promise<string> =>
    (await h.read(name)).match(/^phase: (.+)$/m)?.[1] ?? '?'

  /** 真调 cmdAdvance（真 fs realDeps）；返回 exit + 收集的 io */
  async function advance(name: string, opts: AdvanceOpts): Promise<{ code: number; out: string[]; err: string[] }> {
    const out: string[] = []
    const err: string[] = []
    const code = await cmdAdvance(realDeps(h.cwd, out, err), name, opts)
    return { code, out, err }
  }

  /** 用裸 transition（只需事件前置，绕过 guard）把 change 真推到 build 相位 */
  async function seedToBuild(name: string): Promise<void> {
    await h.run(['init', name, '--track', 'backend', '--preset', 'full'])
    await h.run(['transition', name, 'open-complete']) // → explore（复核相位，落 review marker）
    await writeFile(join(cd(name), 'design.md'), '# design\n覆盖矩阵齐全\n', 'utf8')
    await h.run(['set', name, 'design_doc', `openspec/changes/${name}/design.md`])
    await h.run(['transition', name, 'explore-complete']) // → spec
    await writeFile(join(cd(name), 'plan.md'), '# plan\n', 'utf8')
    await h.run(['set', name, 'plan', `openspec/changes/${name}/plan.md`])
    await h.run(['transition', name, 'spec-complete']) // → build
  }

  /** 让 build 出口 guard 真通过：tasks.md 全勾 + build_mode/isolation/direct_override */
  async function armBuildGuard(name: string): Promise<void> {
    await writeFile(join(cd(name), 'tasks.md'), '- [x] 已完成\n', 'utf8')
    await h.run(['set-many', name, 'build_mode=direct', 'isolation=worktree', 'direct_override=true'])
  }

  /** 让 verify 出口 guard + verify-pass 事件前置真通过（backend：双 review pass + 报告 + branch_status） */
  async function armVerifyGuard(name: string): Promise<void> {
    await writeFile(join(cd(name), 'verify.md'), '# verify\n', 'utf8')
    await h.run(['set-many', name,
      `verification_report=openspec/changes/${name}/verify.md`,
      'branch_status=handled', 'agent_review_result=pass', 'codex_review_result=pass'])
  }

  /** 让 ship 出口 guard 真通过（backend：pr_url） */
  async function armShipGuard(name: string): Promise<void> {
    await h.run(['set', name, 'pr_url', 'https://example.com/pr/1'])
  }

  test('HITL 红线：默认从 build 只推进到 verify（复核相位）就停，绝不跑到 ship/archive', async () => {
    await seedToBuild('demo')
    await armBuildGuard('demo')
    // 即使 verify 出口也备齐（本可继续），默认档仍在 verify 复核门停——证 HITL 不越门
    await armVerifyGuard('demo')
    await armShipGuard('demo')

    const r = await advance('demo', {})
    expect(r.code).toBe(0)
    // .pipeline.yaml phase 真变：build → verify（真推进一步）
    expect(await phaseOf('demo')).toBe('verify')
    // build-complete 真冻结 build_sha（证真的走了 transition 事件体）
    expect(await h.read('demo')).toMatch(/^build_sha: DEADBEEF$/m)
    // 停在复核门，绝不自动跑完
    expect(r.out.some((l) => l.includes('[STOP]') && l.includes('复核相位'))).toBe(true)
    // verify 是复核相位 → transition 真落 .pipeline-pending-review 门 marker
    expect(await readFile(join(h.cwd, '.pipeline-pending-review'), 'utf8')).toContain('verify')
  })

  test('HITL 红线：默认从复核相位（explore）立即停，绝不自动离开——phase 不变', async () => {
    await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    await h.run(['transition', 'demo', 'open-complete']) // → explore（复核相位）
    const before = await h.read('demo')

    const r = await advance('demo', {})
    expect(r.code).toBe(0)
    expect(await phaseOf('demo')).toBe('explore') // 未离开复核相位
    expect(await h.read('demo')).toBe(before) // 字节不变（零推进）
    expect(r.out.some((l) => l.includes('[STOP]') && l.includes('复核相位'))).toBe(true)
  })

  test('guard 不过时真不推进：build 缺 tasks.md → 停在 build，exit 2', async () => {
    await seedToBuild('demo')
    // 故意不建 tasks.md（build 出口 tasks-all-done 缺文件即 FAIL）
    await h.run(['set-many', 'demo', 'build_mode=direct', 'isolation=worktree', 'direct_override=true'])
    const before = await h.read('demo')

    const r = await advance('demo', {})
    expect(r.code).toBe(2)
    expect(await phaseOf('demo')).toBe('build') // 相位不变
    expect(await h.read('demo')).toBe(before) // 零写盘
    expect(r.out.some((l) => l.includes('guard'))).toBe(true)
  })

  test('--dry-run 真不改盘：报计划、phase 与字节均不变', async () => {
    await seedToBuild('demo')
    await armBuildGuard('demo')
    const before = await h.read('demo')

    const r = await advance('demo', { dryRun: true })
    expect(r.code).toBe(0)
    expect(await h.read('demo')).toBe(before) // 字节不变
    expect(await phaseOf('demo')).toBe('build')
    expect(r.out.some((l) => l.includes('[DRY-RUN]'))).toBe(true)
    // 计划显示 build → verify 一步 + 预计停在复核相位
    expect(r.out.some((l) => l.includes('build') && l.includes('verify'))).toBe(true)
    expect(r.out.some((l) => l.includes('复核相位'))).toBe(true)
  })

  test('--through-gates 显式放行复核相位：真跑 build→verify→ship→archive 到终态', async () => {
    await seedToBuild('demo')
    await armBuildGuard('demo')
    await armVerifyGuard('demo')
    await armShipGuard('demo')

    const r = await advance('demo', { throughGates: true })
    expect(r.code).toBe(0)
    // 真跨复核相位 verify，一路推进到 archive 终态
    expect(await phaseOf('demo')).toBe('archive')
    // 历史 JSONL 真记满这几步 transition
    const hist = await readFile(join(cd('demo'), '.pipeline-history.jsonl'), 'utf8')
    const trans = hist.split('\n').filter((l) => l.includes('"kind":"transition"'))
    expect(trans.some((l) => l.includes('"to":"verify"'))).toBe(true)
    expect(trans.some((l) => l.includes('"to":"ship"'))).toBe(true)
    expect(trans.some((l) => l.includes('"to":"archive"'))).toBe(true)
    expect(r.out.some((l) => l.includes('[STOP]') && l.includes('终态'))).toBe(true)
  })

  test('HITL 红线：--through-gates 仍不跨越 confirm 硬门（真 marker 新鲜存在 → 停）', async () => {
    await seedToBuild('demo')
    await armBuildGuard('demo')
    await armVerifyGuard('demo')
    await armShipGuard('demo')
    // 真植一个新鲜 confirm 硬门 marker
    await writeFile(join(h.cwd, '.pipeline-pending-confirm'), 'build\n请确认\ndemo\n', 'utf8')

    const r = await advance('demo', { throughGates: true })
    expect(r.code).toBe(0)
    // 硬门当前，绝不自动跨越——phase 停在 build，零推进
    expect(await phaseOf('demo')).toBe('build')
    expect(r.out.some((l) => l.includes('[STOP]') && l.includes('confirm'))).toBe(true)
  })
})
