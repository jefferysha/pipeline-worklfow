import { describe, it, expect } from 'vitest'
import {
  PROGRESS_STATES,
  changeProgressState,
  isDashboardGate,
  missingGateArtifacts,
  schedulerHealth,
  selectProgress,
  type ProgressCounts,
  type ProgressRules,
} from './progressModel'
import { DEFAULT_RULES, rulesFromDef, rulesKey, type WorkflowRules } from './workflowModel'
import { makeChange, makeProject, makeSnapshot } from '../testkit'
import type { ChangeSnapshot } from '../types'

/** demo 语境的 release-train：draft → review(review 门) → ship(confirm 门)。 */
const REL_DEF = {
  name: 'release-train',
  steps: [
    { id: 'draft', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'approved', to: 'review' }] },
    { id: 'review', label: '', gate: 'review', skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'shipped', to: 'ship' }] },
    { id: 'ship', label: '', gate: 'confirm', skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
} as Parameters<typeof rulesFromDef>[0]

/** 裸自定义 rules：没有产出扩展面 → gate 视为「无自动证据」，人可直接拍板。 */
const REL_RULES: WorkflowRules = rulesFromDef(REL_DEF)

/** 带产出扩展面的自定义 rules：review 步声明 nonempty-output guard + outputs=['release_notes']。 */
const REL_RULES_GUARDED: ProgressRules = {
  ...rulesFromDef(REL_DEF),
  outputsByStep: { review: ['release_notes'] },
  nonemptyOutputByStep: { review: true },
}

/** verify 三轨证据齐（可拍板）的 fields。 */
const VERIFY_OK = { verify_result: 'pass', agent_review_result: 'pass', codex_review_result: 'pass' }

describe('changeProgressState —— 五态判定（表驱动全覆盖）', () => {
  const table: [string, ChangeSnapshot, ProgressRules | undefined, (typeof PROGRESS_STATES)[number]][] = [
    // ── gate（等你确认）：gate 阶段且证据/产出齐 ──
    ['verify 三轨全 pass → gate', makeChange('c', 'verify', { fields: { ...VERIFY_OK } }), DEFAULT_RULES, 'gate'],
    ['verify 有 fail 判定（可打回）→ gate', makeChange('c', 'verify', { fields: { ...VERIFY_OK, verify_result: 'fail' } }), DEFAULT_RULES, 'gate'],
    ['verify 三轨齐但 verification_report/build_sha 未设 → gate（产物没产出不等于验证没过）', makeChange('c', 'verify', { fields: { ...VERIFY_OK } }), DEFAULT_RULES, 'gate'],
    ['explore 双产出齐 → gate', makeChange('c', 'explore', { fields: { design_doc: 'docs/d.md', plan: 'docs/p.md' } }), DEFAULT_RULES, 'gate'],
    ['自定义 review 步无产出声明（无自动证据）→ gate', makeChange('c', 'review'), REL_RULES, 'gate'],
    ['自定义 review 步 nonempty guard 且产出已设 → gate', makeChange('c', 'review', { fields: { release_notes: 'notes.md' } }), REL_RULES_GUARDED, 'gate'],
    // ── agent（等 agent 补产出 / 活在终端里）──
    ['spec 缺 plan → agent', makeChange('c', 'spec', { fields: { design_doc: 'docs/d.md' } }), DEFAULT_RULES, 'agent'],
    ["explore 的 design_doc 是字面 'null' → agent（cmd_get 口径未设）", makeChange('c', 'explore', { fields: { design_doc: 'null', plan: 'docs/p.md' } }), DEFAULT_RULES, 'agent'],
    ['verify 三轨全 pending → agent', makeChange('c', 'verify'), DEFAULT_RULES, 'agent'],
    ['自定义 review 步 nonempty guard 且产出未设 → agent', makeChange('c', 'review'), REL_RULES_GUARDED, 'agent'],
    ['default 非门阶段（build）无自动化 → agent', makeChange('c', 'build'), DEFAULT_RULES, 'agent'],
    ['default 非门阶段（open）无自动化 → agent', makeChange('c', 'open'), DEFAULT_RULES, 'agent'],
    ['confirm 门是终端会话内的秒级门，不是 dashboard 拍板点 → agent', makeChange('c', 'ship'), REL_RULES, 'agent'],
    ['automation=merged 回归阶段判定（ship 非门）→ agent', makeChange('c', 'ship', { fields: { automation: 'merged' } }), DEFAULT_RULES, 'agent'],
    ['rules 缺失（定义拉取失败）→ agent（卡不消失，判不了门）', makeChange('c', 'verify', { fields: { ...VERIFY_OK } }), undefined, 'agent'],
    // ── running / queued / failed：automation 态优先于阶段判定 ──
    ['automation=running → running', makeChange('c', 'build', { fields: { automation: 'running' } }), DEFAULT_RULES, 'running'],
    ['automation=scheduled（已认领在飞）→ running', makeChange('c', 'build', { fields: { automation: 'scheduled' } }), DEFAULT_RULES, 'running'],
    ['显式绑定的终端会话新鲜心跳 + automation=off → running', makeChange('c', 'build', {
      fields: { automation: 'off' },
      terminalActivity: {
        sessionId: '019f92c7-6e66-7290-9352-f9d915266f14',
        heartbeatAt: '2026-07-24T06:00:00.000Z',
        expiresAt: '2026-07-24T06:02:00.000Z',
      },
    }), DEFAULT_RULES, 'running'],
    ['gate 阶段但 automation=running 仍是 running（automation 优先）', makeChange('c', 'verify', { fields: { ...VERIFY_OK, automation: 'running' } }), DEFAULT_RULES, 'running'],
    ['automation=queued → queued', makeChange('c', 'open', { fields: { automation: 'queued' } }), DEFAULT_RULES, 'queued'],
    ['automation=failed → failed', makeChange('c', 'build', { fields: { automation: 'failed' } }), DEFAULT_RULES, 'failed'],
    ['automation=conflict（现场保留）→ failed', makeChange('c', 'build', { fields: { automation: 'conflict' } }), DEFAULT_RULES, 'failed'],
    ['rules 缺失但 automation=failed → failed（automation 判定不依赖 rules）', makeChange('c', 'build', { fields: { automation: 'failed' } }), undefined, 'failed'],
    // ── paused：跑完停住（L1/L2 report-only）归等你确认 ──
    ['automation=paused（非门阶段 build）→ gate（跑完停住等人放行）', makeChange('c', 'build', { fields: { automation: 'paused' } }), DEFAULT_RULES, 'gate'],
    ['automation=paused + rules 缺失 → gate', makeChange('c', 'explore', { fields: { automation: 'paused' } }), undefined, 'gate'],
    ['automation=paused 压过终端心跳，不能把待人工复核伪装成运行中', makeChange('c', 'build', {
      fields: { automation: 'paused' },
      terminalActivity: {
        sessionId: 'session-paused', heartbeatAt: '2026-07-24T06:00:00.000Z', expiresAt: '2026-07-24T06:02:00.000Z',
      },
    }), DEFAULT_RULES, 'gate'],
    // ── 未知 automation 值：回落阶段判定 ──
    ['automation 未知值回落阶段判定（verify 证据齐）→ gate', makeChange('c', 'verify', { fields: { ...VERIFY_OK, automation: 'bogus' } }), DEFAULT_RULES, 'gate'],
  ]

  it.each(table)('%s', (_desc, change, rules, expected) => {
    expect(changeProgressState(change, rules)).toBe(expected)
  })
})

describe('changeProgressState —— T7 兑现 T6 契约：rulesFromDef 产出的 rules 自然携带产出表', () => {
  it('def 声明 outputs+nonempty guard 后，判定不需要测试侧手工扩展 outputsByStep', () => {
    const rules = rulesFromDef({
      ...REL_DEF,
      steps: REL_DEF.steps.map((s) =>
        s.id === 'review'
          ? { ...s, outputs: [{ field: 'release_notes', type: 'file_path' as const }], guards: [{ type: 'nonempty-output' as const }] }
          : s,
      ),
    })
    expect(changeProgressState(makeChange('c', 'review'), rules)).toBe('agent')
    expect(changeProgressState(makeChange('c', 'review', { fields: { release_notes: 'notes.md' } }), rules)).toBe('gate')
  })
})

describe('missingGateArtifacts —— 「等 agent 补产出」的欠账清单', () => {
  it('spec 缺 plan → ["plan"]（badge 文案数据源）', () => {
    const c = makeChange('c', 'spec', { fields: { design_doc: 'docs/d.md' } })
    expect(missingGateArtifacts(c, DEFAULT_RULES)).toEqual(['plan'])
  })

  it('verify 三轨 pending 的字段逐个点名；verification_report/build_sha 未设不入欠账', () => {
    const c = makeChange('c', 'verify', { fields: { verify_result: 'pass' } })
    expect(missingGateArtifacts(c, DEFAULT_RULES)).toEqual(['agent_review_result', 'codex_review_result'])
  })

  it('自定义 nonempty guard：未设产出点名；无 guard 声明 → 空（无自动证据）', () => {
    expect(missingGateArtifacts(makeChange('c', 'review'), REL_RULES_GUARDED)).toEqual(['release_notes'])
    expect(missingGateArtifacts(makeChange('c', 'review'), REL_RULES)).toEqual([])
  })

  it('default 非门阶段 / rules 缺失 → 空', () => {
    expect(missingGateArtifacts(makeChange('c', 'build'), DEFAULT_RULES)).toEqual([])
    expect(missingGateArtifacts(makeChange('c', 'verify'), undefined)).toEqual([])
  })
})

describe('isDashboardGate —— 收件箱准入同源的门判据（T7 复用点）', () => {
  it('review 门是 dashboard 拍板点；confirm/null/rules 缺失不是', () => {
    expect(isDashboardGate(DEFAULT_RULES, 'verify')).toBe(true)
    expect(isDashboardGate(REL_RULES, 'review')).toBe(true)
    expect(isDashboardGate(REL_RULES, 'ship')).toBe(false)
    expect(isDashboardGate(REL_RULES, 'draft')).toBe(false)
    expect(isDashboardGate(undefined, 'verify')).toBe(false)
  })
})

describe('selectProgress —— 项目×workflow 分组选择器', () => {
  const RULES = new Map<string, WorkflowRules>([
    [rulesKey('/a', 'default'), DEFAULT_RULES],
    [rulesKey('/a', 'release-train'), REL_RULES_GUARDED],
    [rulesKey('/b', 'default'), DEFAULT_RULES],
  ])

  it('null snapshot → 空组 + 全零计数', () => {
    const sel = selectProgress(null, '', RULES)
    expect(sel.groups).toEqual([])
    expect(sel.total).toBe(0)
    for (const s of PROGRESS_STATES) expect(sel.counts[s]).toBe(0)
  })

  it('分组键 = rulesKey(root,wf)；组序 root 升序、同 root 下 default 在前其余按名升序', () => {
    const snap = makeSnapshot([
      makeProject('/b', [makeChange('b1', 'open')]),
      makeProject('/a', [
        makeChange('a1', 'review', { fields: { workflow: 'release-train' } }),
        makeChange('a2', 'open'),
      ]),
    ])
    const sel = selectProgress(snap, '', RULES)
    expect(sel.groups.map((g) => g.key)).toEqual([
      rulesKey('/a', 'default'),
      rulesKey('/a', 'release-train'),
      rulesKey('/b', 'default'),
    ])
    expect(sel.groups[0]).toMatchObject({ root: '/a', workflow: 'default' })
    expect(sel.groups[1]).toMatchObject({ root: '/a', workflow: 'release-train' })
  })

  it('组内行序：updated_at 倒序，并列按 name 升序', () => {
    const snap = makeSnapshot([
      makeProject('/a', [
        makeChange('older', 'open', { updated_at: '2026-07-01T00:00:00Z' }),
        makeChange('tie-b', 'open', { updated_at: '2026-07-08T00:00:00Z' }),
        makeChange('tie-a', 'open', { updated_at: '2026-07-08T00:00:00Z' }),
      ]),
    ])
    const sel = selectProgress(snap, '/a', RULES)
    expect(sel.groups[0]!.rows.map((r) => r.change.name)).toEqual(['tie-a', 'tie-b', 'older'])
  })

  it('currentRoot 非空只看该项目；空串聚合全部且行各自带 root', () => {
    const snap = makeSnapshot([
      makeProject('/a', [makeChange('a1', 'open')]),
      makeProject('/b', [makeChange('b1', 'open')]),
    ])
    const only = selectProgress(snap, '/a', RULES)
    expect(only.groups.map((g) => g.root)).toEqual(['/a'])
    const all = selectProgress(snap, '', RULES)
    expect(all.groups.map((g) => g.root)).toEqual(['/a', '/b'])
    expect(all.groups.flatMap((g) => g.rows.map((r) => r.root))).toEqual(['/a', '/b'])
  })

  it('ok:false 的项目跳过（不产组不计数）', () => {
    const snap = makeSnapshot([
      makeProject('/a', [makeChange('a1', 'open')]),
      makeProject('/broken', [makeChange('x', 'open')], { ok: false, error: 'boom' }),
    ])
    const sel = selectProgress(snap, '', RULES)
    expect(sel.groups.map((g) => g.root)).toEqual(['/a'])
    expect(sel.total).toBe(1)
  })

  it('archived 一律排除出行，但计入组头 archivedCount', () => {
    const snap = makeSnapshot([
      makeProject('/a', [
        makeChange('live', 'open'),
        makeChange('gone', 'archive', { archived: 'true' }),
      ]),
    ])
    const sel = selectProgress(snap, '/a', RULES)
    expect(sel.groups).toHaveLength(1)
    expect(sel.groups[0]).toMatchObject({ workflow: 'default', archivedCount: 1 })
    expect(sel.groups[0]!.rows.map((r) => r.change.name)).toEqual(['live'])
    expect(sel.total).toBe(1)
  })

  it('P1 修复：workflow 组若全部 change 都归档（零活跃行），组仍出现在 groups 里（archived 非空即保留组，供归档折叠区渲染）', () => {
    const snap = makeSnapshot([
      makeProject('/a', [
        makeChange('live', 'open'),
        makeChange('rel-gone-1', 'ship', {
          archived: 'true',
          updated_at: '2026-07-05T00:00:00Z',
          fields: { workflow: 'release-train' },
        }),
        makeChange('rel-gone-2', 'review', {
          archived: 'true',
          updated_at: '2026-07-06T00:00:00Z',
          fields: { workflow: 'release-train', release_notes: 'n.md' },
        }),
      ]),
    ])
    const sel = selectProgress(snap, '/a', RULES)
    expect(sel.groups).toHaveLength(2)
    const relGroup = sel.groups.find((g) => g.workflow === 'release-train')
    expect(relGroup).toBeDefined()
    expect(relGroup!.root).toBe('/a')
    expect(relGroup!.rows).toEqual([])
    expect(relGroup!.archivedCount).toBe(2)
    expect(relGroup!.archived.map((r) => r.change.name)).toEqual(['rel-gone-2', 'rel-gone-1']) // updated_at 倒序
    // 不变式不变：纯归档组不产任何计数，counts/total 仍只认活跃行 'live'
    expect(sel.total).toBe(1)
    expect(sel.counts).toEqual({ gate: 0, agent: 1, running: 0, queued: 0, failed: 0 })
  })

  it('#2：archived 数组含归档行的完整投影（state 判定同源，updated_at 倒序），且不影响 counts/total 不变式', () => {
    const snap = makeSnapshot([
      makeProject('/a', [
        makeChange('live', 'open'),
        makeChange('gone-older', 'archive', { archived: 'true', updated_at: '2026-07-01T00:00:00Z' }),
        makeChange('gone-newer', 'build', {
          archived: 'true',
          updated_at: '2026-07-05T00:00:00Z',
          fields: { automation: 'failed' },
        }),
      ]),
    ])
    const sel = selectProgress(snap, '/a', RULES)
    expect(sel.groups).toHaveLength(1)
    const g = sel.groups[0]!
    // archived 数组长度恒等 archivedCount；updated_at 倒序（同 rows 口径）
    expect(g.archivedCount).toBe(2)
    expect(g.archived.map((r) => r.change.name)).toEqual(['gone-newer', 'gone-older'])
    // state 判定同 changeProgressState 同源：failed automation → failed；无自动化的非门阶段 → agent
    expect(g.archived.map((r) => r.state)).toEqual(['failed', 'agent'])
    expect(g.archived.every((r) => r.root === '/a')).toBe(true)
    // 不变式不变：counts/total 仍只统计未归档行（live 一条,'open' 非门阶段无自动化 → agent）
    expect(sel.total).toBe(1)
    expect(sel.counts).toEqual({ gate: 0, agent: 1, running: 0, queued: 0, failed: 0 })
  })

  it('行上的 state 与 changeProgressState 同源；rules 按 rulesKey 查（同名 wf 跨项目不串）', () => {
    const snap = makeSnapshot([
      makeProject('/a', [
        makeChange('gate-1', 'verify', { fields: { ...VERIFY_OK } }),
        makeChange('agent-1', 'spec'),
        makeChange('run-1', 'build', { fields: { automation: 'running' } }),
        makeChange('queue-1', 'open', { fields: { automation: 'queued' } }),
        makeChange('fail-1', 'build', { fields: { automation: 'conflict' } }),
      ]),
    ])
    const sel = selectProgress(snap, '/a', RULES)
    const byName = new Map(sel.groups[0]!.rows.map((r) => [r.change.name, r.state]))
    expect(byName.get('gate-1')).toBe('gate')
    expect(byName.get('agent-1')).toBe('agent')
    expect(byName.get('run-1')).toBe('running')
    expect(byName.get('queue-1')).toBe('queued')
    expect(byName.get('fail-1')).toBe('failed')
  })

  it('不变式：五态计数之和 === total === 各组行数之和（聚合双项目混合态）', () => {
    const snap = makeSnapshot([
      makeProject('/a', [
        makeChange('a-gate', 'verify', { fields: { ...VERIFY_OK } }),
        makeChange('a-agent', 'spec'),
        makeChange('a-run', 'build', { fields: { automation: 'running' } }),
        makeChange('a-archived', 'ship', { archived: 'true' }),
        makeChange('a-rel', 'review', { fields: { workflow: 'release-train', release_notes: 'n.md' } }),
      ]),
      makeProject('/b', [
        makeChange('b-queue', 'open', { fields: { automation: 'queued' } }),
        makeChange('b-fail', 'build', { fields: { automation: 'failed' } }),
        makeChange('b-paused', 'build', { fields: { automation: 'paused' } }),
      ]),
      makeProject('/broken', [makeChange('x', 'open')], { ok: false }),
    ])
    const sel = selectProgress(snap, '', RULES)
    const sumCounts = PROGRESS_STATES.reduce((n, s) => n + sel.counts[s], 0)
    const sumRows = sel.groups.reduce((n, g) => n + g.rows.length, 0)
    expect(sumCounts).toBe(sel.total)
    expect(sumRows).toBe(sel.total)
    expect(sel.total).toBe(7) // archived 排除、ok:false 排除
    expect(sel.counts).toEqual({ gate: 3, agent: 1, running: 1, queued: 1, failed: 1 })
  })
})

describe('schedulerHealth —— 调度器健康灯聚合（对齐 server afk.ts 判据）', () => {
  const counts = (over: Partial<ProgressCounts>): ProgressCounts => ({ gate: 0, agent: 0, running: 0, queued: 0, failed: 0, ...over })

  it('有 failed（含 conflict 折叠）→ attention，压过 busy', () => {
    expect(schedulerHealth(counts({ failed: 2, running: 3, queued: 1 }))).toEqual({ status: 'attention', running: 3, queued: 1, failed: 2 })
  })

  it('有在跑或排队、无失败 → busy', () => {
    expect(schedulerHealth(counts({ running: 1 }))).toEqual({ status: 'busy', running: 1, queued: 0, failed: 0 })
    expect(schedulerHealth(counts({ queued: 2 }))).toEqual({ status: 'busy', running: 0, queued: 2, failed: 0 })
  })

  it('只有 gate/agent（无自动化活跃）→ ok', () => {
    expect(schedulerHealth(counts({ gate: 5, agent: 3 }))).toEqual({ status: 'ok', running: 0, queued: 0, failed: 0 })
  })
})
