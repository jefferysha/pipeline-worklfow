/**
 * transition 单一真相源单测（BACKLOG #25b / GOAL B2）——事件表 + 前置校验 + 副作用的
 * 回归锚（cli/server 曾各持一份逐条镜像，#25 点名的重复真相源；此处上提为唯一真相源）。
 * 真相源 = 老仓 skills/pipeline/scripts/state-transition.sh cmd_transition case 块，文案逐字对齐。
 */
import { describe, expect, test } from 'vitest'
import type { FieldName, PipelineState } from '../types.js'
import {
  applyTransitionEffects,
  checkTransitionPreconditions,
  eventEdge,
  TRANSITION_EVENTS,
  type TransitionContext,
} from './transition-table.js'

/** 最小 PipelineState 构造：只关心被测字段，其余留空串。 */
function mkState(fields: Partial<Record<FieldName, string | string[]>>): PipelineState {
  return { fields: { ...fields } as Record<FieldName, string | string[]>, opaqueTail: '' }
}

/** 固定时钟（副作用时间戳断言用）。 */
const CLOCK = () => '2026-07-07T00:00:00Z'

/** 文件面注入：全部存在 / 全部不存在。 */
const filesExist = (exists: boolean): TransitionContext => ({ fileExists: () => exists })

describe('事件 → 转移边表（逐边对齐老仓 _DEFAULT_TRANSITIONS）', () => {
  test('8 条边逐字', () => {
    expect(TRANSITION_EVENTS).toEqual({
      'open-complete': { from: 'open', to: 'explore' },
      'explore-complete': { from: 'explore', to: 'spec' },
      'spec-complete': { from: 'spec', to: 'build' },
      'build-complete': { from: 'build', to: 'verify' },
      'verify-pass': { from: 'verify', to: 'ship' },
      'verify-fail': { from: 'verify', to: 'build' },
      'ship-complete': { from: 'ship', to: 'archive' },
      archived: { from: 'archive', to: 'archive' },
    })
  })

  test('eventEdge 命中已知事件', () => {
    expect(eventEdge('build-complete')).toEqual({ from: 'build', to: 'verify' })
    expect(eventEdge('verify-fail')).toEqual({ from: 'verify', to: 'build' })
    expect(eventEdge('archived')).toEqual({ from: 'archive', to: 'archive' })
  })

  test('eventEdge 未知事件 → undefined（含原型链属性名不误判）', () => {
    expect(eventEdge('warp-speed')).toBeUndefined()
    expect(eventEdge('toString')).toBeUndefined()
    expect(eventEdge('constructor')).toBeUndefined()
    expect(eventEdge('')).toBeUndefined()
  })
})

describe('前置校验 —— explore-complete（老仓 L120-126）', () => {
  test('design_doc 字面 null → 拒（文案带当前值）', async () => {
    const r = await checkTransitionPreconditions('explore-complete', mkState({ design_doc: 'null' }))
    expect(r).toEqual(['ERROR: explore-complete 要求 design_doc 字段非空且文件存在 (当前=null)'])
  })

  test('design_doc 空串 → 拒', async () => {
    const r = await checkTransitionPreconditions('explore-complete', mkState({ design_doc: '' }))
    expect(r).toEqual(['ERROR: explore-complete 要求 design_doc 字段非空且文件存在 (当前=)'])
  })

  test('design_doc 文件不存在（注入 false）→ 拒', async () => {
    const r = await checkTransitionPreconditions('explore-complete', mkState({ design_doc: 'docs/d.md' }), filesExist(false))
    expect(r).toEqual(['ERROR: explore-complete 要求 design_doc 字段非空且文件存在 (当前=docs/d.md)'])
  })

  test('design_doc 存在（注入 true）→ 通过', async () => {
    const r = await checkTransitionPreconditions('explore-complete', mkState({ design_doc: 'docs/d.md' }), filesExist(true))
    expect(r).toBeNull()
  })

  test('无 ctx（文件面降级跳过）：字段非空即通过', async () => {
    const r = await checkTransitionPreconditions('explore-complete', mkState({ design_doc: 'docs/d.md' }))
    expect(r).toBeNull()
  })
})

describe('前置校验 —— spec-complete（老仓 L127-138）', () => {
  test('backend 无 plan → 拒（文案带 track 名）', async () => {
    const r = await checkTransitionPreconditions('spec-complete', mkState({ track: 'backend', plan: 'null' }))
    expect(r).toEqual(['ERROR: backend track spec-complete 要求 plan 字段非空且文件存在 (当前=null)'])
  })

  test('frontend plan 文件不存在 → 拒', async () => {
    const r = await checkTransitionPreconditions('spec-complete', mkState({ track: 'frontend', plan: 'docs/p.md' }), filesExist(false))
    expect(r).toEqual(['ERROR: frontend track spec-complete 要求 plan 字段非空且文件存在 (当前=docs/p.md)'])
  })

  test('pm track 豁免 plan → 通过', async () => {
    const r = await checkTransitionPreconditions('spec-complete', mkState({ track: 'pm', plan: 'null' }))
    expect(r).toBeNull()
  })

  test('backend plan 存在 → 通过', async () => {
    const r = await checkTransitionPreconditions('spec-complete', mkState({ track: 'backend', plan: 'docs/p.md' }), filesExist(true))
    expect(r).toBeNull()
  })
})

describe('前置校验 —— build-complete（老仓 L139-153，首错优先序）', () => {
  test('缺 build_mode 首拒', async () => {
    const r = await checkTransitionPreconditions('build-complete', mkState({}))
    expect(r).toEqual(['ERROR: build_mode 必须设置'])
  })

  test('缺 isolation 次拒', async () => {
    const r = await checkTransitionPreconditions('build-complete', mkState({ build_mode: 'direct', isolation: 'null' }))
    expect(r).toEqual(['ERROR: isolation 必须设置'])
  })

  test('isolation 非法枚举防线（绕过 set 闸的脏值）', async () => {
    const r = await checkTransitionPreconditions('build-complete', mkState({ build_mode: 'direct', isolation: 'bogus' }))
    expect(r).toEqual(["ERROR: 非法值 'bogus'，允许: branch worktree"])
  })

  test('full+direct 缺 direct_override → 拒', async () => {
    const r = await checkTransitionPreconditions('build-complete', mkState({ preset: 'full', build_mode: 'direct', isolation: 'worktree' }))
    expect(r).toEqual(['ERROR: full workflow 使用 build_mode=direct 必须显式设 direct_override=true'])
  })

  test('full+direct+direct_override=true → 通过', async () => {
    const r = await checkTransitionPreconditions('build-complete', mkState({ preset: 'full', build_mode: 'direct', isolation: 'worktree', direct_override: 'true' }))
    expect(r).toBeNull()
  })

  test('hotfix preset + direct 不锁 direct_override → 通过', async () => {
    const r = await checkTransitionPreconditions('build-complete', mkState({ preset: 'hotfix', build_mode: 'direct', isolation: 'branch' }))
    expect(r).toBeNull()
  })
})

describe('前置校验 —— verify-pass（老仓 L163-199，首错优先序 + barrier）', () => {
  const base = {
    track: 'backend',
    verification_report: 'docs/v.md',
    branch_status: 'handled',
    agent_review_result: 'pass',
    codex_review_result: 'pass',
  }

  test('report → branch_status → agent → codex 首错优先序', async () => {
    const noVr = await checkTransitionPreconditions('verify-pass', mkState({ ...base, verification_report: 'null' }), filesExist(true))
    expect(noVr).toEqual(['ERROR: verify-pass 要求 verification_report 字段非空且文件存在 (当前=null)'])
    const noBs = await checkTransitionPreconditions('verify-pass', mkState({ ...base, branch_status: 'pending' }), filesExist(true))
    expect(noBs).toEqual(['ERROR: verify-pass 要求 branch_status=handled (当前=pending)'])
    const noAr = await checkTransitionPreconditions('verify-pass', mkState({ ...base, agent_review_result: 'pending' }), filesExist(true))
    expect(noAr).toEqual(['ERROR: backend track 要求 agent_review_result=pass (当前=pending)'])
    const noCr = await checkTransitionPreconditions('verify-pass', mkState({ ...base, codex_review_result: 'pending' }), filesExist(true))
    expect(noCr).toEqual(['ERROR: backend track 要求 codex_review_result=pass (当前=pending)'])
  })

  test('pm track 豁免双 review（skipped 通过）', async () => {
    const r = await checkTransitionPreconditions(
      'verify-pass',
      mkState({ track: 'pm', verification_report: 'docs/v.md', branch_status: 'handled', agent_review_result: 'skipped', codex_review_result: 'skipped' }),
      filesExist(true),
    )
    expect(r).toBeNull()
  })

  test('barrier：build_sha≠HEAD → 双行 ERROR 拒', async () => {
    const ctx: TransitionContext = { fileExists: () => true, gitHeadSha: async () => 'DEADBEEF\n' }
    const r = await checkTransitionPreconditions('verify-pass', mkState({ ...base, track: 'pm', build_sha: 'CAFEBABE' }), ctx)
    expect(r).toEqual([
      'ERROR: verify-pass 要求 HEAD==build_sha（build 后产物被改未复验）build_sha=CAFEBABE HEAD=DEADBEEF',
      '  修复：要么把改动并入复验（重跑 build→verify），要么 verify-fail 回退后重新 build-complete 冻结新 SHA',
    ])
  })

  test('barrier 退化：build_sha=null → 跳过', async () => {
    const ctx: TransitionContext = { fileExists: () => true, gitHeadSha: async () => 'DEADBEEF' }
    const r = await checkTransitionPreconditions('verify-pass', mkState({ ...base, track: 'pm', build_sha: 'null' }), ctx)
    expect(r).toBeNull()
  })

  test('barrier 退化：HEAD 取不到（空串）→ 跳过', async () => {
    const ctx: TransitionContext = { fileExists: () => true, gitHeadSha: async () => '' }
    const r = await checkTransitionPreconditions('verify-pass', mkState({ ...base, track: 'pm', build_sha: 'CAFEBABE' }), ctx)
    expect(r).toBeNull()
  })

  test('barrier 退化：无 gitHeadSha 注入 → 跳过', async () => {
    const r = await checkTransitionPreconditions('verify-pass', mkState({ ...base, track: 'pm', build_sha: 'CAFEBABE' }), filesExist(true))
    expect(r).toBeNull()
  })

  test('barrier 通过：build_sha==HEAD', async () => {
    const ctx: TransitionContext = { fileExists: () => true, gitHeadSha: async () => 'CAFEBABE' }
    const r = await checkTransitionPreconditions('verify-pass', mkState({ ...base, track: 'pm', build_sha: 'CAFEBABE' }), ctx)
    expect(r).toBeNull()
  })
})

describe('前置校验 —— 无专属校验的事件通行（open/verify-fail/ship/archived）', () => {
  test.each(['open-complete', 'verify-fail', 'ship-complete', 'archived', 'custom-event'])('%s → null', async (ev) => {
    expect(await checkTransitionPreconditions(ev, mkState({}))).toBeNull()
  })
})

describe('副作用 —— applyTransitionEffects（老仓 mutation 体）', () => {
  test('build-complete：git HEAD 冻结 build_sha，buildShaMissing=false', async () => {
    const s = mkState({ build_sha: 'null' })
    const out = await applyTransitionEffects('build-complete', s, CLOCK, { gitHeadSha: async () => 'DEADBEEF\n' })
    expect(s.fields.build_sha).toBe('DEADBEEF')
    expect(out).toEqual({ buildShaMissing: false })
  })

  test('build-complete：HEAD 取不到（空串）→ build_sha 留原值，buildShaMissing=true', async () => {
    const s = mkState({ build_sha: 'null' })
    const out = await applyTransitionEffects('build-complete', s, CLOCK, { gitHeadSha: async () => '' })
    expect(s.fields.build_sha).toBe('null') // 未改
    expect(out).toEqual({ buildShaMissing: true })
  })

  test('build-complete：无 gitHeadSha 注入 → build_sha 留原值，buildShaMissing=true', async () => {
    const s = mkState({ build_sha: 'null' })
    const out = await applyTransitionEffects('build-complete', s, CLOCK)
    expect(s.fields.build_sha).toBe('null')
    expect(out).toEqual({ buildShaMissing: true })
  })

  test('verify-pass：verify_result=pass + verified_at=clock', async () => {
    const s = mkState({})
    const out = await applyTransitionEffects('verify-pass', s, CLOCK)
    expect(s.fields.verify_result).toBe('pass')
    expect(s.fields.verified_at).toBe('2026-07-07T00:00:00Z')
    expect(out).toEqual({ buildShaMissing: false })
  })

  test('verify-fail：verify_result=fail + build_sha=null（barrier 回退清空）', async () => {
    const s = mkState({ build_sha: 'DEADBEEF' })
    const out = await applyTransitionEffects('verify-fail', s, CLOCK)
    expect(s.fields.verify_result).toBe('fail')
    expect(s.fields.build_sha).toBe('null')
    expect(out).toEqual({ buildShaMissing: false })
  })

  test('archived：archived=true + archived_at=clock', async () => {
    const s = mkState({})
    const out = await applyTransitionEffects('archived', s, CLOCK)
    expect(s.fields.archived).toBe('true')
    expect(s.fields.archived_at).toBe('2026-07-07T00:00:00Z')
    expect(out).toEqual({ buildShaMissing: false })
  })

  test.each(['open-complete', 'explore-complete', 'spec-complete', 'ship-complete'])('%s：无副作用，buildShaMissing=false', async (ev) => {
    const s = mkState({ build_sha: 'x', verify_result: 'y' })
    const out = await applyTransitionEffects(ev, s, CLOCK)
    expect(s.fields).toEqual({ build_sha: 'x', verify_result: 'y' }) // 未改
    expect(out).toEqual({ buildShaMissing: false })
  })
})
