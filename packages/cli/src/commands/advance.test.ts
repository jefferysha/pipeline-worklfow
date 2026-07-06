/**
 * advance —— auto-transition 中间档编排（BACKLOG #31 / GOAL B14·D12）。
 * 快速回归层（mock）：验证「停点规则」纯逻辑——终态 / guard 不过 / 复核相位（HITL 默认停）/
 * 三门硬门 / --through-gates 放行 / --dry-run 不写盘 / --max-steps 防失控。
 * 真实副作用（真推进真落盘真停点）由 advance.integration.test.ts（真 fs）证。
 *
 * 复用 test-support 的 mockFlow（契约相位图 + reviewPhases=explore/spec/verify）；
 * store 换成"有状态"版（write 反映到 read），使 advance 的循环能真的逐步推进。
 */
import { describe, expect, test } from 'vitest'
import { GATE_TTL_MS } from '@pipeline-lite/kernel'
import type { FieldName, GuardResult, Phase, PipelineState } from '@pipeline-lite/kernel'
import type { CliDeps, GateMarkerInfo } from '../deps.js'
import { FIXED_CLOCK, mockFlow, mockState, spy } from '../test-support.js'
import { cmdAdvance } from './advance.js'

/** 满足全程事件前置的字段基线（backend track：verify-pass 需 agent/codex pass） */
const READY: Partial<Record<FieldName, string | string[]>> = {
  track: 'backend',
  design_doc: 'openspec/changes/demo/design.md',
  plan: 'openspec/changes/demo/plan.md',
  build_mode: 'direct',
  isolation: 'worktree',
  verification_report: 'openspec/changes/demo/verify.md',
  branch_status: 'handled',
  agent_review_result: 'pass',
  codex_review_result: 'pass',
}

/** 有状态 store：write 落进 holder，read 读回 holder —— 让 advance 循环能逐步推进 */
function statefulStore(initial: PipelineState) {
  let s = initial
  return {
    read: spy(async (_d: string): Promise<PipelineState> => s),
    write: spy(async (_d: string, ns: PipelineState): Promise<void> => { s = ns }),
    get: spy(async (_d: string, f: FieldName) => s.fields[f]),
    set: spy(async (_d: string, f: FieldName, v: string | string[]): Promise<void> => { s = { ...s, fields: { ...s.fields, [f]: v } } }),
    setMany: spy(async (_d: string, kv: Partial<Record<FieldName, string | string[]>>): Promise<void> => { s = { ...s, fields: { ...s.fields, ...kv } } }),
    cas: spy(async (): Promise<boolean> => true),
    init: spy(async (o: { repoRoot: string; name: string }) => `${o.repoRoot}/openspec/changes/${o.name}`),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withLock: spy(async (_d: string, fn: () => Promise<any>): Promise<any> => fn()),
    phase: () => (Array.isArray(s.fields.phase) ? s.fields.phase.join(',') : s.fields.phase),
  }
}

interface Adv {
  deps: CliDeps
  out: string[]
  err: string[]
  store: ReturnType<typeof statefulStore>
}

function makeAdv(opts: {
  phase: Phase
  fields?: Partial<Record<FieldName, string | string[]>>
  gateMarkers?: GateMarkerInfo[]
  guard?: GuardResult
  fileExists?: boolean
}): Adv {
  const out: string[] = []
  const err: string[] = []
  const store = statefulStore(mockState({ ...READY, phase: opts.phase, ...opts.fields }))
  const flow = mockFlow()
  if (opts.guard) flow.guardCheck = spy((): GuardResult => opts.guard as GuardResult)
  const fx = opts.fileExists ?? true
  const deps = {
    store,
    flow,
    cwd: '/repo',
    io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) },
    clock: () => FIXED_CLOCK,
    listChanges: async () => [],
    guardCtx: (name: string) => ({
      changeDirRel: `openspec/changes/${name}`,
      fileExists: () => fx,
      fileNonempty: () => fx,
      readFile: () => 'x',
      dirExists: () => fx,
      changeArchived: () => false,
    }),
    readGateMarkers: async () => opts.gateMarkers ?? [],
    history: { append: async () => {} },
  } as unknown as CliDeps
  return { deps, out, err, store }
}

const marker = (kind: GateMarkerInfo['kind'], ageMs: number): GateMarkerInfo => ({
  kind,
  ageMs,
  raw: `build\n请处理\ndemo\n`,
})

describe('advance —— auto-transition 中间档停点规则（B14/D12，快速回归）', () => {
  test('非法 change 名 → exit 1，零推进', async () => {
    const a = makeAdv({ phase: 'build' })
    expect(await cmdAdvance(a.deps, '../etc', {})).toBe(1)
    expect(a.store.write.calls).toHaveLength(0)
  })

  test('终态（archive）→ 立即停，零推进，exit 0', async () => {
    const a = makeAdv({ phase: 'archive' })
    expect(await cmdAdvance(a.deps, 'demo', {})).toBe(0)
    expect(a.store.write.calls).toHaveLength(0)
    expect(a.out.some((l) => l.includes('[STOP]') && l.includes('终态'))).toBe(true)
  })

  test('HITL 红线：默认在复核相位（explore）立即停，绝不自动离开——零推进', async () => {
    const a = makeAdv({ phase: 'explore' })
    expect(await cmdAdvance(a.deps, 'demo', {})).toBe(0)
    // 未离开 explore（review 相位不自动退出）
    expect(a.store.phase()).toBe('explore')
    expect(a.store.write.calls).toHaveLength(0)
    expect(a.out.some((l) => l.includes('[STOP]') && l.includes('复核相位'))).toBe(true)
  })

  test('HITL 红线：默认从非复核相位只推进到"进入复核相位"就停（build → verify 停）', async () => {
    const a = makeAdv({ phase: 'build' })
    expect(await cmdAdvance(a.deps, 'demo', {})).toBe(0)
    // 真推进一步进入 verify（复核相位）后停，绝不跑到 ship/archive
    expect(a.store.phase()).toBe('verify')
    expect(a.store.write.calls).toHaveLength(1)
    expect(a.out.some((l) => l.includes('[STOP]') && l.includes('复核相位'))).toBe(true)
  })

  test('guard 不过 → 停且零推进，exit 2（对齐 check 口径）', async () => {
    const a = makeAdv({ phase: 'build', guard: { pass: false, failures: ['tasks.md 仍有未勾项'] } })
    expect(await cmdAdvance(a.deps, 'demo', {})).toBe(2)
    expect(a.store.write.calls).toHaveLength(0)
    expect(a.store.phase()).toBe('build')
    expect(a.out.some((l) => l.includes('guard'))).toBe(true)
    expect(a.out.some((l) => l.includes('tasks.md 仍有未勾项'))).toBe(true)
  })

  test('--through-gates：显式放行复核相位，真跑完 open→archive（6 步）', async () => {
    const a = makeAdv({ phase: 'open' })
    expect(await cmdAdvance(a.deps, 'demo', { throughGates: true })).toBe(0)
    expect(a.store.phase()).toBe('archive')
    expect(a.store.write.calls).toHaveLength(6) // open→explore→spec→build→verify→ship→archive
    expect(a.out.some((l) => l.includes('[STOP]') && l.includes('终态'))).toBe(true)
  })

  test('--through-gates 也放行"从复核相位离开"（explore 起可继续推进）', async () => {
    const a = makeAdv({ phase: 'explore' })
    expect(await cmdAdvance(a.deps, 'demo', { throughGates: true })).toBe(0)
    // 越过 explore（不再停在复核相位）
    expect(a.store.phase()).not.toBe('explore')
    expect(a.store.write.calls.length).toBeGreaterThan(0)
  })

  test('硬门（confirm marker 新鲜）→ 即便 --through-gates 也停，零推进（HITL 红线）', async () => {
    const a = makeAdv({ phase: 'build', gateMarkers: [marker('confirm', 1000)] })
    expect(await cmdAdvance(a.deps, 'demo', { throughGates: true })).toBe(0)
    expect(a.store.write.calls).toHaveLength(0)
    expect(a.store.phase()).toBe('build')
    expect(a.out.some((l) => l.includes('[STOP]') && l.includes('confirm'))).toBe(true)
  })

  test('硬门（interaction marker 新鲜）→ 也是硬门，停', async () => {
    const a = makeAdv({ phase: 'build', gateMarkers: [marker('interaction', 1000)] })
    expect(await cmdAdvance(a.deps, 'demo', { throughGates: true })).toBe(0)
    expect(a.store.write.calls).toHaveLength(0)
    expect(a.out.some((l) => l.includes('interaction'))).toBe(true)
  })

  test('陈旧 confirm marker（age > TTL）不算硬门 → 推进不被拦', async () => {
    const a = makeAdv({ phase: 'build', gateMarkers: [marker('confirm', GATE_TTL_MS.confirm + 1000)] })
    expect(await cmdAdvance(a.deps, 'demo', {})).toBe(0)
    // 陈旧门不拦，正常推进到 verify（复核相位）停
    expect(a.store.phase()).toBe('verify')
    expect(a.store.write.calls).toHaveLength(1)
  })

  test('--dry-run：只报计划、零写盘、相位不变', async () => {
    const a = makeAdv({ phase: 'build' })
    expect(await cmdAdvance(a.deps, 'demo', { dryRun: true })).toBe(0)
    expect(a.store.write.calls).toHaveLength(0)
    expect(a.store.phase()).toBe('build')
    expect(a.out.some((l) => l.includes('[DRY-RUN]'))).toBe(true)
    expect(a.out.some((l) => l.includes('计划') && l.includes('build') && l.includes('verify'))).toBe(true)
  })

  test('--dry-run 在复核相位（默认）→ 计划即报"停在复核相位"，零写盘', async () => {
    const a = makeAdv({ phase: 'explore' })
    expect(await cmdAdvance(a.deps, 'demo', { dryRun: true })).toBe(0)
    expect(a.store.write.calls).toHaveLength(0)
    expect(a.out.some((l) => l.includes('复核相位'))).toBe(true)
  })

  test('--max-steps 封顶（防失控）：through-gates 下只推进 N 步', async () => {
    const a = makeAdv({ phase: 'open' })
    expect(await cmdAdvance(a.deps, 'demo', { throughGates: true, maxSteps: 2 })).toBe(0)
    expect(a.store.write.calls).toHaveLength(2) // open→explore→spec 后封顶
    expect(a.store.phase()).toBe('spec')
    expect(a.out.some((l) => l.includes('[STOP]') && l.includes('max-steps'))).toBe(true)
  })

  test('停点报告：每步一行 [ADVANCE]，收尾一行 [STOP]（可审计）', async () => {
    const a = makeAdv({ phase: 'build' })
    await cmdAdvance(a.deps, 'demo', {})
    expect(a.out.some((l) => l.startsWith('[ADVANCE]') && l.includes('build') && l.includes('verify'))).toBe(true)
    expect(a.out.filter((l) => l.startsWith('[STOP]'))).toHaveLength(1)
  })
})
