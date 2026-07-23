import { describe, expect, it } from 'vitest'
import { budgetDayOf, normalizeOnExceed, reservedTokensFor, resolveLoopBinding } from './binding.js'
import { latestChangeLoopBinding } from './index.js'
import type { BindingLoopSource } from './binding.js'
import type { ChangeLoopBindingRecord, LedgerRecord } from './ledger-types.js'
import type { LoopEntry } from './types.js'

const L = (id: string, prefix: string | null): BindingLoopSource => ({ id, change_prefix: prefix })
const bindingRecord = (
  recordId: string,
  change: string,
  loopId: string,
  supersedesRecordId?: string,
): ChangeLoopBindingRecord => ({
  schema_version: 1,
  record_id: recordId,
  recorded_at: '2026-07-19T00:00:00.000Z',
  kind: 'change-loop-binding',
  change,
  loop_id: loopId,
  source: 'explicit',
  ...(supersedesRecordId === undefined ? {} : { supersedes_record_id: supersedesRecordId }),
})

describe('latestChangeLoopBinding · ledger 文件序最后事实', () => {
  it('没有记录时返回 undefined', () => {
    expect(latestChangeLoopBinding([] satisfies readonly LedgerRecord[], 'change-a')).toBeUndefined()
  })

  it('单条匹配时返回完整 change-loop-binding record', () => {
    const record = bindingRecord('binding-1', 'change-a', 'loop-a', 'binding-0')
    expect(latestChangeLoopBinding([record], 'change-a')).toEqual(record)
  })

  it('同一 change 多次绑定时以文件序最后一条为权威，supersedes_record_id 不改变选择规则', () => {
    const oldRecord = {
      ...bindingRecord('binding-old', 'change-a', 'loop-old'),
      recorded_at: '2099-01-01T00:00:00.000Z',
    }
    const latestRecord = {
      ...bindingRecord('binding-latest', 'change-a', 'loop-latest', 'some-other-record'),
      recorded_at: '2000-01-01T00:00:00.000Z',
    }

    expect(latestChangeLoopBinding([oldRecord, latestRecord], 'change-a')).toEqual(latestRecord)
  })

  it('目标最新事实之后的非 binding 与别的 change 均不改变目标选择', () => {
    const oldRecord = bindingRecord('binding-old', 'change-a', 'loop-old')
    const latestRecord = bindingRecord('binding-latest', 'change-a', 'loop-latest')
    const activated: LedgerRecord = {
      schema_version: 1,
      record_id: 'activated-1',
      recorded_at: '2026-07-19T00:01:00.000Z',
      kind: 'reservation-activated',
      reservation_id: 'reservation-1',
      attempt_id: 'attempt-1',
      loop_id: 'loop-a',
      change: 'change-a',
      started_at: '2026-07-19T00:01:00.000Z',
    }

    expect(latestChangeLoopBinding([
      oldRecord,
      latestRecord,
      activated,
      bindingRecord('binding-other', 'change-b', 'loop-other'),
    ], 'change-a')).toEqual(latestRecord)
  })

  it('只有别的 change 与非 binding 时返回 undefined', () => {
    const records: readonly LedgerRecord[] = [
      bindingRecord('binding-other', 'change-b', 'loop-other'),
      {
        schema_version: 1,
        record_id: 'activated-1',
        recorded_at: '2026-07-19T00:01:00.000Z',
        kind: 'reservation-activated',
        reservation_id: 'reservation-1',
        attempt_id: 'attempt-1',
        loop_id: 'loop-a',
        change: 'change-a',
        started_at: '2026-07-19T00:01:00.000Z',
      },
    ]

    expect(latestChangeLoopBinding(records, 'change-a')).toBeUndefined()
  })

  it('完整 record 可直接投影 loop_id 组合 resolveLoopBinding，且仍优先于前缀', () => {
    const records = [
      bindingRecord('binding-old', 'change-a', 'loop-old'),
      bindingRecord('binding-latest', 'change-a', 'loop-ledger'),
    ] satisfies readonly LedgerRecord[]
    const latest = latestChangeLoopBinding(records, 'change-a')

    expect(resolveLoopBinding({
      change: 'change-a',
      latestBindingLoopId: latest?.loop_id,
      loops: [L('loop-prefix', 'change-'), L('loop-ledger', null)],
    })).toEqual({ ok: true, loopId: 'loop-ledger', materialize: null })
  })
})

describe('resolveLoopBinding · 归属优先级 ①→⑤（fail-closed）', () => {
  const loops = [L('styling', 'style-'), L('styling-deep', 'style-deep-'), L('nightly', 'nf-')]

  it('① 显式 loop_id 存在 → 直接用，不 materialize', () => {
    const r = resolveLoopBinding({ change: 'anything', explicitLoopId: 'nightly', loops })
    expect(r).toEqual({ ok: true, loopId: 'nightly', materialize: null })
  })

  it('① 显式 loop_id 不存在 → fail-closed unknown-explicit-loop（不回落前缀）', () => {
    const r = resolveLoopBinding({ change: 'style-x', explicitLoopId: 'ghost', loops })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('unknown-explicit-loop')
  })

  it('② ledger 最新绑定优先于前缀发现（已固化不再重发现）', () => {
    // change 前缀本会命中 styling，但已绑定到 nightly → 用绑定
    const r = resolveLoopBinding({ change: 'style-deep-thing', latestBindingLoopId: 'nightly', loops })
    expect(r).toEqual({ ok: true, loopId: 'nightly', materialize: null })
  })

  it('② 绑定的 loop 已从 registry 消失 → fail-closed bound-loop-missing（不静默重绑）', () => {
    const r = resolveLoopBinding({ change: 'style-x', latestBindingLoopId: 'retired-loop', loops })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('bound-loop-missing')
  })

  it('③ 未绑定 legacy change → 取最长前缀命中并 materialize', () => {
    const r = resolveLoopBinding({ change: 'style-deep-widget', loops })
    // style- 与 style-deep- 都命中，最长 = style-deep- → styling-deep
    expect(r).toEqual({ ok: true, loopId: 'styling-deep', materialize: { source: 'longest-prefix' } })
  })

  it('③ 短前缀单命中 → materialize', () => {
    const r = resolveLoopBinding({ change: 'style-basic', loops })
    expect(r).toEqual({ ok: true, loopId: 'styling', materialize: { source: 'longest-prefix' } })
  })

  it('④ 等长前缀多命中 → fail-closed ambiguous-prefix', () => {
    const dup = [L('a-loop', 'shared-'), L('b-loop', 'shared-')]
    const r = resolveLoopBinding({ change: 'shared-thing', loops: dup })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('ambiguous-prefix')
  })

  it('⑤ 无任何命中 → fail-closed no-match（不再静默无 loop 语境跑）', () => {
    const r = resolveLoopBinding({ change: 'orphan-change', loops })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no-match')
  })

  it('null / 空前缀不参与发现', () => {
    const r = resolveLoopBinding({ change: '', loops: [L('x', null), L('y', '')] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no-match')
  })
})

describe('normalizeOnExceed · 闭集归一（fail-closed）', () => {
  it('canonical 原样', () => {
    expect(normalizeOnExceed('skip-run')).toBe('skip-run')
    expect(normalizeOnExceed('pause-loop')).toBe('pause-loop')
    expect(normalizeOnExceed('halt-round')).toBe('halt-round')
  })
  it('legacy 迁移：skip→skip-run、halt→halt-round', () => {
    expect(normalizeOnExceed('skip')).toBe('skip-run')
    expect(normalizeOnExceed('halt')).toBe('halt-round')
  })
  it('其它自由字符串 fail-closed → pause-loop（不静默放行超限）', () => {
    expect(normalizeOnExceed('warn')).toBe('pause-loop')
    expect(normalizeOnExceed('explode')).toBe('pause-loop')
    expect(normalizeOnExceed('')).toBe('pause-loop')
  })
})

describe('reservedTokensFor · 预占 token 依据', () => {
  const mk = (over: Partial<LoopEntry['budget']> & { risk?: LoopEntry['risk'] } = {}): Pick<LoopEntry, 'risk' | 'budget'> => ({
    risk: over.risk ?? 'low',
    budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip', ...over },
  })
  it('显式 budget.tokens_per_run 优先 → basis=budget.tokens_per_run', () => {
    expect(reservedTokensFor(mk({ tokens_per_run: 12345 }))).toEqual({ tokens: 12345, basis: 'budget.tokens_per_run' })
  })
  it('缺省按 risk 预设 → basis=risk-default（low=2000/medium=8000/high=20000）', () => {
    expect(reservedTokensFor(mk({ risk: 'low' }))).toEqual({ tokens: 2000, basis: 'risk-default' })
    expect(reservedTokensFor(mk({ risk: 'high' }))).toEqual({ tokens: 20000, basis: 'risk-default' })
  })
})

describe('budgetDayOf · UTC 预算日', () => {
  it('取 ISO 的 UTC YYYY-MM-DD', () => {
    expect(budgetDayOf('2026-07-16T23:59:00.000Z')).toBe('2026-07-16')
    expect(budgetDayOf('2026-07-17T00:00:01.000Z')).toBe('2026-07-17')
  })
})
