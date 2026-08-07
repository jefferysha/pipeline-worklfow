/**
 * DefaultEventPolicy 单测（G2 P3）——default 轨事件的 typed guard/action 政策 + 逐字 ERROR
 * 文案渲染的回归锚。真相源 = 老仓 skills/pipeline/scripts/state-transition.sh cmd_transition
 * case 块（文案逐字对齐）；本套是 flow/transition-table.ts 两个 legacy switch 迁到 typed handler
 * 后的**新路径**特征化——precondition 逐字文案从「switch 直出字符串」变成「typed guard 判定 +
 * renderer 渲染」，本套钉住新路径产出与老 switch 逐字一致（老 switch 的直测在
 * transition-table.test.ts 删除前一直并存，两套同断言值 = 迁移等价的双重证据）。
 */
import { describe, expect, test } from 'vitest'
import type { FieldName, PipelineState } from '../types.js'
import type { TransitionContext } from './transition-table.js'
import {
  checkDefaultEventPreconditions,
  DEFAULT_EVENT_POLICY,
  renderPreconditionViolation,
} from './default-event-policy.js'
import { evaluateGuards, type GuardEvaluation } from '../workflow/guard-handlers.js'

/** 最小 PipelineState 构造：只关心被测字段，其余留空串。 */
function mkState(fields: Partial<Record<FieldName, string | string[]>>): PipelineState {
  return { fields: { ...fields } as Record<FieldName, string | string[]>, opaqueTail: '' }
}

/** 文件面注入：全部存在 / 全部不存在。 */
const filesExist = (exists: boolean): TransitionContext => ({ fileExists: () => exists })

describe('DEFAULT_EVENT_POLICY 表结构（穷尽 9 事件 + action 一一映射）', () => {
  test('键穷尽 = TRANSITION_EVENTS 9 事件', () => {
    expect(Object.keys(DEFAULT_EVENT_POLICY).sort()).toEqual(
      [
        'archived', 'build-complete', 'explore-complete', 'open-complete', 'requirements-changed',
        'ship-complete', 'spec-complete', 'verify-fail', 'verify-pass',
      ].sort(),
    )
  })

  test('action 映射：新实现 visit 重置 pre-Verify，build 冻结，verify/archive 保留既有副作用', () => {
    expect(DEFAULT_EVENT_POLICY['build-complete'].actions).toEqual([{ type: 'freeze-build-sha' }])
    expect(DEFAULT_EVENT_POLICY['verify-pass'].actions).toEqual([{ type: 'mark-verification-passed' }])
    expect(DEFAULT_EVENT_POLICY['spec-complete'].actions).toEqual([{ type: 'reset-pre-verify-review' }])
    expect(DEFAULT_EVENT_POLICY['requirements-changed'].actions).toEqual([{ type: 'reset-pre-verify-review' }])
    expect(DEFAULT_EVENT_POLICY['verify-fail'].actions).toEqual([
      { type: 'mark-verification-failed' },
      { type: 'reset-pre-verify-review' },
    ])
    expect(DEFAULT_EVENT_POLICY.archived.actions).toEqual([{ type: 'archive-run' }])
    for (const ev of ['open-complete', 'explore-complete', 'ship-complete'] as const) {
      expect(DEFAULT_EVENT_POLICY[ev].actions).toEqual([])
    }
  })

  test('guard 映射：explore/spec/build/verify-pass 与 Ship 迁移门禁有前置 guard，其余空', () => {
    expect(DEFAULT_EVENT_POLICY['explore-complete'].guards.length).toBe(1)
    expect(DEFAULT_EVENT_POLICY['spec-complete'].guards.length).toBe(1)
    expect(DEFAULT_EVENT_POLICY['build-complete'].guards.length).toBe(5)
    expect(DEFAULT_EVENT_POLICY['verify-pass'].guards.length).toBe(5)
    expect(DEFAULT_EVENT_POLICY['ship-complete'].guards).toEqual([{ type: 'spec-migration-applied' }])
    for (const ev of ['open-complete', 'requirements-changed', 'verify-fail', 'archived'] as const) {
      expect(DEFAULT_EVENT_POLICY[ev].guards).toEqual([])
    }
  })

  test('barrier 是 build-head-unchanged typed guard（不是 action）', () => {
    const g = DEFAULT_EVENT_POLICY['verify-pass'].guards.find((x) => x.type === 'build-head-unchanged')
    expect(g).toEqual({ type: 'build-head-unchanged', field: 'build_sha' })
  })

  test('tasks-through-phase 只约束完成/归档出口，不阻断 requirements-changed 与 verify-fail 回退', () => {
    expect(DEFAULT_EVENT_POLICY['requirements-changed'].enforceTaskExit).toBe(false)
    expect(DEFAULT_EVENT_POLICY['verify-fail'].enforceTaskExit).toBe(false)
    for (const event of [
      'open-complete', 'explore-complete', 'spec-complete', 'build-complete',
      'verify-pass', 'ship-complete', 'archived',
    ] as const) {
      expect(DEFAULT_EVENT_POLICY[event].enforceTaskExit).toBe(true)
    }
  })
})

describe('checkDefaultEventPreconditions —— explore-complete（老仓 L120-126，逐字文案）', () => {
  test('design_doc 字面 null → 拒（文案带当前值）', async () => {
    const r = await checkDefaultEventPreconditions('explore-complete', mkState({ design_doc: 'null' }))
    expect(r).toEqual(['ERROR: explore-complete 要求 design_doc 字段非空且文件存在 (当前=null)'])
  })

  test('design_doc 空串 → 拒', async () => {
    const r = await checkDefaultEventPreconditions('explore-complete', mkState({ design_doc: '' }))
    expect(r).toEqual(['ERROR: explore-complete 要求 design_doc 字段非空且文件存在 (当前=)'])
  })

  test('design_doc 文件不存在（注入 false）→ 拒', async () => {
    const r = await checkDefaultEventPreconditions('explore-complete', mkState({ design_doc: 'docs/d.md' }), filesExist(false))
    expect(r).toEqual(['ERROR: explore-complete 要求 design_doc 字段非空且文件存在 (当前=docs/d.md)'])
  })

  test('design_doc 存在（注入 true）→ 通过', async () => {
    const r = await checkDefaultEventPreconditions('explore-complete', mkState({ design_doc: 'docs/d.md' }), filesExist(true))
    expect(r).toBeNull()
  })

  test('无 ctx（文件面降级跳过）：字段非空即通过', async () => {
    const r = await checkDefaultEventPreconditions('explore-complete', mkState({ design_doc: 'docs/d.md' }))
    expect(r).toBeNull()
  })
})

describe('checkDefaultEventPreconditions —— spec-complete（原流程：仅非 PM track 强制 legacy plan artifact）', () => {
  test('backend 无 plan → 拒（文案带 track 名）', async () => {
    const r = await checkDefaultEventPreconditions('spec-complete', mkState({ track: 'backend', plan: 'null' }))
    expect(r).toEqual(['ERROR: backend track spec-complete 要求 plan 字段非空且文件存在 (当前=null)'])
  })

  test('frontend plan 文件不存在 → 拒', async () => {
    const r = await checkDefaultEventPreconditions('spec-complete', mkState({ track: 'frontend', plan: 'docs/p.md' }), filesExist(false))
    expect(r).toEqual(['ERROR: frontend track spec-complete 要求 plan 字段非空且文件存在 (当前=docs/p.md)'])
  })

  test('pm track 无 legacy plan artifact 仍可通过；其 OpenSpec/Superpower plan 文档由 ledger 单独治理', async () => {
    const r = await checkDefaultEventPreconditions('spec-complete', mkState({ track: 'pm', plan: 'null' }))
    expect(r).toBeNull()
  })

  test('backend plan 存在 → 通过', async () => {
    const r = await checkDefaultEventPreconditions('spec-complete', mkState({ track: 'backend', plan: 'docs/p.md' }), filesExist(true))
    expect(r).toBeNull()
  })

  test.each(['chat', 'ml'])('%s track（未知轨）同样要求 plan，文案逐字（NON_PM 谓词：pm 外都不豁免）', async (tr) => {
    const r = await checkDefaultEventPreconditions('spec-complete', mkState({ track: tr, plan: '' }))
    expect(r).toEqual([`ERROR: ${tr} track spec-complete 要求 plan 字段非空且文件存在 (当前=)`])
  })
})

describe('checkDefaultEventPreconditions —— build-complete（老仓 L139-153，首错优先序）', () => {
  test('缺 build_mode 首拒', async () => {
    const r = await checkDefaultEventPreconditions('build-complete', mkState({}))
    expect(r).toEqual(['ERROR: build_mode 必须设置'])
  })

  test('缺 isolation 次拒', async () => {
    const r = await checkDefaultEventPreconditions('build-complete', mkState({ build_mode: 'direct', isolation: 'null' }))
    expect(r).toEqual(['ERROR: isolation 必须设置'])
  })

  test('isolation 非法枚举防线（绕过 set 闸的脏值）', async () => {
    const r = await checkDefaultEventPreconditions('build-complete', mkState({ build_mode: 'direct', isolation: 'bogus' }))
    expect(r).toEqual(["ERROR: 非法值 'bogus'，允许: branch worktree in-place"])
  })

  test('full+direct 缺 direct_override → 拒', async () => {
    const r = await checkDefaultEventPreconditions('build-complete', mkState({ preset: 'full', build_mode: 'direct', isolation: 'worktree' }))
    expect(r).toEqual(['ERROR: full workflow 使用 build_mode=direct 必须显式设 direct_override=true'])
  })

  test('全量收敛 review 非 pass → 最后一道 Build guard 拒绝冻结', async () => {
    const r = await checkDefaultEventPreconditions('build-complete', mkState({
      preset: 'full',
      build_mode: 'direct',
      isolation: 'worktree',
      direct_override: 'true',
      pre_verify_review_result: 'pending',
    }))
    expect(r).toEqual(['ERROR: build-complete 要求 pre_verify_review_result=pass (当前=pending)'])
  })

  test('full+direct+direct_override=true → 通过', async () => {
    const r = await checkDefaultEventPreconditions('build-complete', mkState({ preset: 'full', build_mode: 'direct', isolation: 'worktree', direct_override: 'true', pre_verify_review_result: 'pass' }))
    expect(r).toBeNull()
  })

  test('hotfix preset + direct 不锁 direct_override → 通过', async () => {
    const r = await checkDefaultEventPreconditions('build-complete', mkState({ preset: 'hotfix', build_mode: 'direct', isolation: 'branch', pre_verify_review_result: 'pass' }))
    expect(r).toBeNull()
  })

  test('full+direct+in-place+direct_override=true → 通过（受限 Codex 沙盒不伪造 Git 隔离）', async () => {
    const r = await checkDefaultEventPreconditions(
      'build-complete',
      mkState({ preset: 'full', build_mode: 'direct', isolation: 'in-place', direct_override: 'true', pre_verify_review_result: 'pass' }),
    )
    expect(r).toBeNull()
  })
})

describe('checkDefaultEventPreconditions —— verify-pass（老仓 L163-199，首错优先序 + barrier）', () => {
  const base = {
    track: 'backend',
    verification_report: 'docs/v.md',
    branch_status: 'handled',
    agent_review_result: 'pass',
    codex_review_result: 'pass',
  }

  test('report → branch_status → agent → codex 首错优先序', async () => {
    const noVr = await checkDefaultEventPreconditions('verify-pass', mkState({ ...base, verification_report: 'null' }), filesExist(true))
    expect(noVr).toEqual(['ERROR: verify-pass 要求 verification_report 字段非空且文件存在 (当前=null)'])
    const noBs = await checkDefaultEventPreconditions('verify-pass', mkState({ ...base, branch_status: 'pending' }), filesExist(true))
    expect(noBs).toEqual(['ERROR: verify-pass 要求 branch_status=handled (当前=pending)'])
    const noAr = await checkDefaultEventPreconditions('verify-pass', mkState({ ...base, agent_review_result: 'pending' }), filesExist(true))
    expect(noAr).toEqual(['ERROR: backend track 要求 agent_review_result=pass (当前=pending)'])
    const noCr = await checkDefaultEventPreconditions('verify-pass', mkState({ ...base, codex_review_result: 'pending' }), filesExist(true))
    expect(noCr).toEqual(['ERROR: backend track 要求 codex_review_result=pass (当前=pending)'])
  })

  test.each(['chat', 'ml'])('%s track（未知轨）同样要求双 review，文案逐字（NON_PM：pm 外都不豁免）', async (tr) => {
    const r = await checkDefaultEventPreconditions('verify-pass', mkState({ ...base, track: tr, agent_review_result: 'pending' }), filesExist(true))
    expect(r).toEqual([`ERROR: ${tr} track 要求 agent_review_result=pass (当前=pending)`])
  })

  test('pm track 豁免双 review（when:NON_PM 不适用）', async () => {
    const r = await checkDefaultEventPreconditions(
      'verify-pass',
      mkState({ track: 'pm', verification_report: 'docs/v.md', branch_status: 'handled', agent_review_result: 'skipped', codex_review_result: 'skipped' }),
      filesExist(true),
    )
    expect(r).toBeNull()
  })

  test('free track 走中性验证分支，不继承工程 Track 的双 review', async () => {
    const r = await checkDefaultEventPreconditions(
      'verify-pass',
      mkState({ track: 'free', verification_report: 'docs/v.md', branch_status: 'handled', agent_review_result: 'skipped', codex_review_result: 'skipped' }),
      filesExist(true),
    )
    expect(r).toBeNull()
  })

  test('barrier：build_sha≠HEAD → 双行 ERROR 拒（逐字，含 build_sha= / HEAD= 值）', async () => {
    const ctx: TransitionContext = { fileExists: () => true, gitHeadSha: async () => 'DEADBEEF\n' }
    const r = await checkDefaultEventPreconditions('verify-pass', mkState({ ...base, track: 'pm', build_sha: 'CAFEBABE' }), ctx)
    expect(r).toEqual([
      'ERROR: verify-pass 要求 HEAD==build_sha（build 后产物被改未复验）build_sha=CAFEBABE HEAD=DEADBEEF',
      '  修复：要么把改动并入复验（重跑 build→verify），要么 verify-fail 回退后重新 build-complete 冻结新 SHA',
    ])
  })

  test('barrier 退化：build_sha=null → 跳过', async () => {
    const ctx: TransitionContext = { fileExists: () => true, gitHeadSha: async () => 'DEADBEEF' }
    const r = await checkDefaultEventPreconditions('verify-pass', mkState({ ...base, track: 'pm', build_sha: 'null' }), ctx)
    expect(r).toBeNull()
  })

  test('barrier 退化：HEAD 取不到（空串）→ 跳过', async () => {
    const ctx: TransitionContext = { fileExists: () => true, gitHeadSha: async () => '' }
    const r = await checkDefaultEventPreconditions('verify-pass', mkState({ ...base, track: 'pm', build_sha: 'CAFEBABE' }), ctx)
    expect(r).toBeNull()
  })

  test('barrier 退化：无 gitHeadSha 注入 → 跳过', async () => {
    const r = await checkDefaultEventPreconditions('verify-pass', mkState({ ...base, track: 'pm', build_sha: 'CAFEBABE' }), filesExist(true))
    expect(r).toBeNull()
  })

  test('barrier 通过：build_sha==HEAD', async () => {
    const ctx: TransitionContext = { fileExists: () => true, gitHeadSha: async () => 'CAFEBABE' }
    const r = await checkDefaultEventPreconditions('verify-pass', mkState({ ...base, track: 'pm', build_sha: 'CAFEBABE' }), ctx)
    expect(r).toBeNull()
  })

  test('barrier IO 序：verify-pass 前置全过时 gitHeadSha 恰调一次（barrier 在末位）', async () => {
    let calls = 0
    const ctx: TransitionContext = { fileExists: () => true, gitHeadSha: async () => { calls++; return 'CAFEBABE' } }
    await checkDefaultEventPreconditions('verify-pass', mkState({ ...base, track: 'pm', build_sha: 'CAFEBABE' }), ctx)
    expect(calls).toBe(1)
  })

  test('barrier IO 序：前置早错（branch_status 未过）→ 不到 barrier，gitHeadSha 零调用', async () => {
    let calls = 0
    const ctx: TransitionContext = { fileExists: () => true, gitHeadSha: async () => { calls++; return 'CAFEBABE' } }
    const r = await checkDefaultEventPreconditions('verify-pass', mkState({ ...base, track: 'pm', branch_status: 'pending', build_sha: 'CAFEBABE' }), ctx)
    expect(r).toEqual(['ERROR: verify-pass 要求 branch_status=handled (当前=pending)'])
    expect(calls).toBe(0)
  })
})

describe('checkDefaultEventPreconditions —— 无前置 guard 的事件通行（open/verify-fail/archived）', () => {
  test.each(['open-complete', 'verify-fail', 'archived'] as const)('%s → null', async (ev) => {
    expect(await checkDefaultEventPreconditions(ev, mkState({}))).toBeNull()
  })
})

describe('checkDefaultEventPreconditions —— ship-complete 主规格迁移硬门禁', () => {
  test('缺能力失败关闭；not-required/applied 通过；invalid 输出稳定原因', async () => {
    expect(await checkDefaultEventPreconditions('ship-complete', mkState({}))).toEqual([
      'ERROR: ship-complete 要求主规格迁移机器证据有效（当前=capability-unavailable）',
    ])
    expect(await checkDefaultEventPreconditions('ship-complete', mkState({}), {
      specMigrationStatus: async () => ({ kind: 'not-required' }),
    })).toBeNull()
    expect(await checkDefaultEventPreconditions('ship-complete', mkState({}), {
      specMigrationStatus: async () => ({ kind: 'applied' }),
    })).toBeNull()
    expect(await checkDefaultEventPreconditions('ship-complete', mkState({}), {
      specMigrationStatus: async () => ({ kind: 'invalid', reason: 'receipt-mismatch' }),
    })).toEqual([
      'ERROR: ship-complete 要求主规格迁移机器证据有效（当前=receipt-mismatch）',
    ])
  })
})

describe('checkDefaultEventPreconditions —— 数组边界输入（阻断 1：default 轨 fstr 归一，逐字等价老 switch）', () => {
  // 老 checkTransitionPreconditions switch 每个字段读值都过 fstr（Array→join(',')、缺省→''）：
  // build_mode=['direct'] → 'direct' → 放行。P3 typed guard 的 scalarValue 对数组直接 fail-loud
  // throw；本 describe 钉住 default 轨经 fstr 归一后与老 fstr 逐字等价（数组 join 后求值、不 throw），
  // 并对照证明 custom 轨（evaluateGuards 直吃原始 fields）同字段仍 throw——只 default 轨放宽。

  test("build_mode=['direct'] → 归一 'direct' → field-nonempty 放行（不 throw；续查 isolation/override 全过）", async () => {
    const r = await checkDefaultEventPreconditions('build-complete', mkState({
      build_mode: ['direct'],
      isolation: 'branch',
      pre_verify_review_result: 'pass',
    }))
    expect(r).toBeNull()
  })

  test("build_mode=[]（空数组）→ 归一 '' → field-nonempty 拒（逐字等价老 fstr 空串）", async () => {
    const r = await checkDefaultEventPreconditions('build-complete', mkState({ build_mode: [] }))
    expect(r).toEqual(['ERROR: build_mode 必须设置'])
  })

  test("isolation=['branch'] → 归一 'branch' → field-in 放行", async () => {
    const r = await checkDefaultEventPreconditions('build-complete', mkState({
      build_mode: 'direct',
      isolation: ['branch'],
      pre_verify_review_result: 'pass',
    }))
    expect(r).toBeNull()
  })

  test("isolation=['branch','worktree'] → 归一 'branch,worktree' → field-in 拒（join 后非法枚举，逐字等价老 fstr）", async () => {
    const r = await checkDefaultEventPreconditions('build-complete', mkState({ build_mode: 'direct', isolation: ['branch', 'worktree'] }))
    expect(r).toEqual(["ERROR: 非法值 'branch,worktree'，允许: branch worktree in-place"])
  })

  test("design_doc=['a','b'] → 归一 'a,b' 当路径判存在（filesExist=false）→ 拒（当前=a,b）", async () => {
    const r = await checkDefaultEventPreconditions('explore-complete', mkState({ design_doc: ['a', 'b'] }), filesExist(false))
    expect(r).toEqual(['ERROR: explore-complete 要求 design_doc 字段非空且文件存在 (当前=a,b)'])
  })

  test("design_doc=['docs/d.md'] → 归一 'docs/d.md' 判存在（filesExist=true）→ 通过", async () => {
    const r = await checkDefaultEventPreconditions('explore-complete', mkState({ design_doc: ['docs/d.md'] }), filesExist(true))
    expect(r).toBeNull()
  })

  test("verify-pass agent_review_result=['pass'] → 归一 'pass' → field-equals 放行（backend 轨全过）", async () => {
    const r = await checkDefaultEventPreconditions(
      'verify-pass',
      mkState({
        track: 'backend', verification_report: 'docs/v.md', branch_status: 'handled',
        agent_review_result: ['pass'], codex_review_result: 'pass',
      }),
      filesExist(true),
    )
    expect(r).toBeNull()
  })

  test('对照 custom 轨：evaluateGuards 直吃数组 build_mode → scalarValue fail-loud throw（default 同输入不 throw）', async () => {
    await expect(
      evaluateGuards(
        [{ type: 'field-nonempty', field: 'build_mode' }],
        { fields: { build_mode: ['direct'] } as Record<FieldName, string | string[]>, track: 'backend' },
      ),
    ).rejects.toThrow(/数组值|绕过编译器/)
    // 同输入走 default 轨：归一后放行（不 throw）——证明放宽只发生在 default 轨。
    expect(
      await checkDefaultEventPreconditions('build-complete', mkState({
        build_mode: ['direct'],
        isolation: 'branch',
        pre_verify_review_result: 'pass',
      })),
    ).toBeNull()
  })

  test('对照 custom 轨：evaluateGuards 直吃数组 isolation → field-in 前 scalarValue 即 throw（default 同输入 join 后判定）', async () => {
    await expect(
      evaluateGuards(
        [{ type: 'field-in', field: 'isolation', values: ['branch', 'worktree'] }],
        { fields: { isolation: ['branch', 'worktree'] } as Record<FieldName, string | string[]>, track: 'backend' },
      ),
    ).rejects.toThrow(/数组值/)
    expect(
      await checkDefaultEventPreconditions('build-complete', mkState({ build_mode: 'direct', isolation: ['branch', 'worktree'] })),
    ).toEqual(["ERROR: 非法值 'branch,worktree'，允许: branch worktree in-place"])
  })
})

describe('renderPreconditionViolation —— 政策表/渲染器漂移 fail-loud', () => {
  test('未覆盖的 (event, guardType) 组合 → 抛错（不静默产出错文案）', () => {
    const rogue: GuardEvaluation = {
      guard: { type: 'field-nonempty', field: 'design_doc' },
      decision: { kind: 'failed', guardType: 'field-nonempty', field: 'design_doc', actual: '' },
    }
    // open-complete 无 guard，任何 failed 落到它 = 漂移
    expect(() => renderPreconditionViolation('open-complete', rogue, 'backend')).toThrow(/未覆盖/)
  })
})
