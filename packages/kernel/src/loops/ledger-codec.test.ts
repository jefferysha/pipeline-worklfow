import { describe, expect, test } from 'vitest'
import { decodeLedgerLine, encodeLedgerRecord } from './ledger-codec.js'
import type {
  BudgetReservationRecord,
  ChangeLoopBindingRecord,
  LedgerRecord,
  MergeIntentRecord,
  MergeLandedRecord,
  ReservationActivatedRecord,
  RunRecord,
  SkillBundleSnapshotRecord,
  UsageRecord,
} from './ledger-types.js'
import type { VerificationResult } from '../verification/index.js'

// ── 样本工厂（最小必填为基底，override 注入变体）────────────────────────────

function base(id: string) {
  return { schema_version: 1 as const, record_id: id, recorded_at: '2026-07-17T05:00:00.000Z' }
}

function makeBinding(over: Partial<ChangeLoopBindingRecord> = {}): ChangeLoopBindingRecord {
  return {
    ...base('rec-bind-1'),
    kind: 'change-loop-binding',
    change: 'w1-ledger',
    loop_id: 'loop-a',
    source: 'explicit',
    ...over,
  }
}

function makeReservation(over: Partial<BudgetReservationRecord> = {}): BudgetReservationRecord {
  return {
    ...base('rec-res-1'),
    kind: 'budget-reservation',
    reservation_id: 'res-1',
    attempt_id: 'att-1',
    loop_id: 'loop-a',
    change: 'w1-ledger',
    budget_day: '2026-07-17',
    reserved_runs: 1,
    reserved_tokens: 60_000,
    token_basis: 'risk-default',
    limits_snapshot: { max_runs_per_day: 6, max_in_flight: 1, on_exceed: 'skip-run' },
    expires_at: '2026-07-17T06:00:00.000Z',
    ...over,
  }
}

function makeActivated(over: Partial<ReservationActivatedRecord> = {}): ReservationActivatedRecord {
  return {
    ...base('rec-act-1'),
    kind: 'reservation-activated',
    reservation_id: 'res-1',
    attempt_id: 'att-1',
    loop_id: 'loop-a',
    change: 'w1-ledger',
    started_at: '2026-07-17T05:01:00.000Z',
    ...over,
  } as ReservationActivatedRecord
}

function makeUsage(over: Partial<UsageRecord> = {}): UsageRecord {
  return {
    ...base('rec-usage-1'),
    kind: 'usage',
    usage_id: 'usage-1',
    attempt_id: 'att-1',
    loop_id: 'loop-a',
    provider: 'anthropic',
    tokens: { input: 1200, output: 3400, total: 4600 },
    source: 'provider-structured',
    observed_at: '2026-07-17T05:02:00.000Z',
    ...over,
  }
}

function makeSkillBundleSnapshot(over: Partial<SkillBundleSnapshotRecord> = {}): SkillBundleSnapshotRecord {
  return {
    ...base('rec-snap-1'),
    kind: 'skill-bundle-snapshot',
    attempt_id: 'att-1',
    reservation_id: 'res-1',
    // H10 r1 复审阻断2/D4：provenance 补全字段（loop_id/policy_epoch/workflow_run_id/workflow/
    // step/track/coordinate_digest）——三处一致规范见 ledger-types.ts::SkillBundleSnapshotRecord 头注。
    loop_id: 'loop-a',
    skill_bundle_id: 'pm',
    policy_epoch: 'epoch-a1',
    resolution_source: 'default',
    workflow_run_id: 'wfr-1',
    workflow: 'default',
    step: 'verify',
    track: 'pm',
    coordinate_digest: '1'.repeat(64),
    snapshot_sha256: 'e'.repeat(64),
    cas_relative_path: `.pipeline/loops/skill-snapshots/sha256/${'e'.repeat(64)}`,
    slots: [{ token: 'pm-writing', alternatives: ['pm-writing'], concrete_skill_id: 'pm-writing', tree_sha256: 'c'.repeat(64) }],
    ...over,
  }
}

function makeRun(over: Partial<RunRecord> = {}): RunRecord {
  return {
    ...base('rec-run-1'),
    kind: 'run',
    run_record_id: 'run-1',
    attempt_id: 'att-1',
    loop_id: 'loop-a',
    change: 'w1-ledger',
    level: 'L2',
    runner: 'claude-code',
    admitted_at: '2026-07-17T05:00:30.000Z',
    finished_at: '2026-07-17T05:10:00.000Z',
    result: 'merged',
    usage_record_ids: [],
    accounting: { reserved_tokens: 60_000, charged_tokens: 0, charge_source: 'none' },
    ...over,
  }
}

function makeMergeIntent(over: Partial<MergeIntentRecord> = {}): MergeIntentRecord {
  return {
    ...base('rec-merge-intent-1'),
    kind: 'merge-intent',
    attempt_id: 'att-1',
    reservation_id: 'res-1',
    loop_id: 'loop-a',
    change: 'w1-ledger',
    workflow_run_id: 'wfr-1',
    base_ref: 'refs/heads/main',
    expected_base_sha: 'base-before-short',
    branch_ref: 'refs/heads/sandcastle/w1-ledger',
    expected_branch_sha: 'branch-before-short',
    merged_commit_sha: 'merged-short',
    level: 'L3',
    runner: 'codex',
    image: 'sandcastle:local',
    admitted_at: '2026-07-17T05:00:30.000Z',
    started_at: '2026-07-17T05:01:00.000Z',
    created_at: '2026-07-17T05:09:59.000Z',
    verify: { result: 'pass', source: 'sandbox-output', trusted: false },
    verification: validVerification(),
    artifacts: {
      build_sha: 'build-short',
      build_sha_source: 'named-branch-head',
      branch: 'sandcastle/w1-ledger',
      commit_shas: ['commit-short'],
    },
    skill_bundle_snapshot_sha256: 'e'.repeat(64),
    usage_record_ids: ['usage-1'],
    accounting: { reserved_tokens: 60_000, charged_tokens: 4_600, charge_source: 'provider-structured' },
    ...over,
  }
}

function makeMergeLanded(over: Partial<MergeLandedRecord> = {}): MergeLandedRecord {
  return {
    ...base('rec-merge-landed-1'),
    kind: 'merge-landed',
    intent_record_id: 'rec-merge-intent-1',
    attempt_id: 'att-1',
    reservation_id: 'res-1',
    loop_id: 'loop-a',
    change: 'w1-ledger',
    base_ref: 'refs/heads/main',
    base_before_sha: 'base-before-short',
    branch_sha: 'branch-before-short',
    merged_commit_sha: 'merged-short',
    host_synced: true,
    landed_at: '2026-07-17T05:10:00.000Z',
    ...over,
  }
}

/** 破坏样本：绕过类型面拿到可任意增删字段的普通对象。 */
function asMutable(record: LedgerRecord): Record<string, unknown> {
  return JSON.parse(encodeLedgerRecord(record)) as Record<string, unknown>
}

function decodeObj(obj: unknown): ReturnType<typeof decodeLedgerLine> {
  return decodeLedgerLine(JSON.stringify(obj))
}

function expectRejected(obj: unknown, errorHint: string): void {
  const r = decodeObj(obj)
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.error).toContain(errorHint)
}

describe('loops/ledger-codec —— 单行 JSON 编解码 + 手写窄校验（H1 ledger 存储面）', () => {
  describe('encode/decode 往返（五种 kind 全覆盖）', () => {
    test('change-loop-binding 最小必填往返', () => {
      const rec = makeBinding()
      const r = decodeLedgerLine(encodeLedgerRecord(rec))
      expect(r).toEqual({ ok: true, record: rec })
    })

    test('change-loop-binding 含 supersedes_record_id 与 longest-prefix 来源往返', () => {
      const rec = makeBinding({ source: 'longest-prefix', supersedes_record_id: 'rec-bind-0' })
      const r = decodeLedgerLine(encodeLedgerRecord(rec))
      expect(r).toEqual({ ok: true, record: rec })
    })

    test('budget-reservation 往返（limits_snapshot 含可选 max_tokens_per_day；token_basis 双值）', () => {
      const rec = makeReservation({
        token_basis: 'budget.tokens_per_run',
        limits_snapshot: { max_runs_per_day: 6, max_in_flight: 2, max_tokens_per_day: 500_000, on_exceed: 'pause-loop' },
      })
      const r = decodeLedgerLine(encodeLedgerRecord(rec))
      expect(r).toEqual({ ok: true, record: rec })
    })

    test('H2 budget-reservation 固化本次 runner 真消费的 attempt context / pruning / stagnation', () => {
      const rec = makeReservation({
        attempt_context: {
          source_run_record_ids: ['run-a1', 'run-a2', 'run-a3'],
          omitted_attempt_ids: ['att-a2'],
          rendered: '# Attempts: loop-a/w1-ledger\n- att-a3 failed: compile failed',
          stagnation: {
            stagnant: true,
            fingerprint: 'a'.repeat(64),
            repeated_attempt_ids: ['att-a1', 'att-a2', 'att-a3'],
          },
        },
      })
      expect(decodeLedgerLine(encodeLedgerRecord(rec))).toEqual({ ok: true, record: rec })
    })

    test('H2 attempt_context malformed fail-closed（数组/布尔/fingerprint 逐字段窄校验）', () => {
      const malformed = {
        ...makeReservation(),
        attempt_context: {
          source_run_record_ids: 'run-a1',
          omitted_attempt_ids: [],
          rendered: 7,
          stagnation: { stagnant: 'yes', fingerprint: 'not-sha', repeated_attempt_ids: [1] },
        },
      }
      const decoded = decodeLedgerLine(JSON.stringify(malformed))
      expect(decoded.ok).toBe(false)
      if (!decoded.ok) {
        expect(decoded.error).toContain('attempt_context.source_run_record_ids')
        expect(decoded.error).toContain('attempt_context.stagnation.stagnant')
        expect(decoded.error).toContain('attempt_context.stagnation.fingerprint')
      }
    })

    test('reservation-activated 往返', () => {
      const rec = makeActivated()
      const r = decodeLedgerLine(encodeLedgerRecord(rec))
      expect(r).toEqual({ ok: true, record: rec })
    })

    test('reservation-activated 缺 loop_id/change → 关系身份不完整，codec fail-closed', () => {
      const { loop_id: _loop, change: _change, ...incomplete } = makeActivated() as ReservationActivatedRecord & {
        loop_id: string; change: string
      }
      const r = decodeLedgerLine(JSON.stringify(incomplete))
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error).toContain('loop_id')
        expect(r.error).toContain('change')
      }
    })

    test('usage 往返（tokens 可选 cached_input/reasoning + model/request_id 全填）', () => {
      const rec = makeUsage({
        model: 'claude-fable-5',
        request_id: 'req-9',
        tokens: { input: 100, output: 200, cached_input: 40, reasoning: 60, total: 300 },
      })
      const r = decodeLedgerLine(encodeLedgerRecord(rec))
      expect(r).toEqual({ ok: true, record: rec })
    })

    test('usage 最小 tokens（无可选子字段）往返', () => {
      const rec = makeUsage()
      const r = decodeLedgerLine(encodeLedgerRecord(rec))
      expect(r).toEqual({ ok: true, record: rec })
    })

    test('run 最小必填往返', () => {
      const rec = makeRun()
      const r = decodeLedgerLine(encodeLedgerRecord(rec))
      expect(r).toEqual({ ok: true, record: rec })
    })

    test('H9 iteration_id 在 reservation/activation/usage/merge-intent/run 五类事实中无损往返', () => {
      const iteration_id = 'iteration-att-1'
      for (const rec of [
        makeReservation({ iteration_id }),
        makeActivated({ iteration_id }),
        makeUsage({ iteration_id }),
        makeMergeIntent({ iteration_id }),
        makeRun({ iteration_id }),
      ]) {
        expect(decodeLedgerLine(encodeLedgerRecord(rec))).toEqual({ ok: true, record: rec })
      }
    })

    test('run 全可选字段往返（reservation_id/workflow_run_id/image/started_at/reason/verify/artifacts/error）', () => {
      const rec = makeRun({
        reservation_id: 'res-1',
        workflow_run_id: 'wfr-1',
        image: 'sandbox:2026-07',
        started_at: '2026-07-17T05:01:00.000Z',
        result: 'failed',
        reason: 'verify-fail',
        verify: { result: 'fail', source: 'sandbox-output', trusted: false },
        artifacts: {
          build_sha: 'abc123',
          build_sha_source: 'named-branch-head',
          branch: 'loop/loop-a/w1-ledger',
          commit_shas: ['abc123', 'def456'],
        },
        usage_record_ids: ['usage-1', 'usage-2'],
        accounting: { reserved_tokens: 60_000, charged_tokens: 4600, charge_source: 'provider-structured' },
        error: { cause: 'verify', message: 'vitest 3 failed' },
      })
      const r = decodeLedgerLine(encodeLedgerRecord(rec))
      expect(r).toEqual({ ok: true, record: rec })
    })

    test('encode 产出单行：值内含换行的字符串被 JSON 转义，结果不含字面换行符', () => {
      const rec = makeRun({ error: { cause: 'infra', message: '第一行\n第二行' } })
      const line = encodeLedgerRecord(rec)
      expect(line).not.toContain('\n')
      const r = decodeLedgerLine(line)
      expect(r).toEqual({ ok: true, record: rec })
    })

    test('H7 verifier Phase 2 + H7-S2：reason 新扩 5 值（verification-missing|untrusted|inconclusive|subject-mismatch|binding-unresolved）均往返', () => {
      for (const reason of [
        'verification-missing', 'verification-untrusted', 'verification-inconclusive', 'verification-subject-mismatch',
        // H7-S2（返工 r2 阻断4 custom fail-closed）：custom workflow 核验结果未真正落在 workflow-transition
        // binding 时的诊断成因，见 automation/verifier.ts::evaluateVerificationGate。
        'verification-binding-unresolved',
      ] as const) {
        const rec = makeRun({ result: 'paused', reason })
        const r = decodeLedgerLine(encodeLedgerRecord(rec))
        expect(r).toEqual({ ok: true, record: rec })
      }
    })

    test('H10 §5/§8任务5：reason 新扩 10 值（skill-bundle-* 精确 fail-closed 诊断闭集）均往返', () => {
      for (const reason of [
        'skill-bundle-unwired', 'skill-bundle-profile-not-found', 'skill-bundle-resolve-failed',
        'skill-bundle-skill-not-found', 'skill-bundle-content-invalid', 'skill-bundle-source-ambiguous',
        'skill-bundle-policy-changed', 'skill-bundle-source-unstable', 'skill-bundle-snapshot-io',
        'skill-bundle-snapshot-corrupt',
      ] as const) {
        const rec = makeRun({ result: 'paused', reason })
        const r = decodeLedgerLine(encodeLedgerRecord(rec))
        expect(r).toEqual({ ok: true, record: rec })
      }
    })

    test('H4：automation-policy-bind-failed 补偿终态 reason 可严格往返', () => {
      const rec = makeRun({ result: 'failed', reason: 'automation-policy-bind-failed' })
      expect(decodeLedgerLine(encodeLedgerRecord(rec))).toEqual({ ok: true, record: rec })
    })

    test('H10 §3/§8任务5：run 全可选字段往返新增 skill_bundle_snapshot_sha256（终态关联 skill-bundle-snapshot 记录）', () => {
      const rec = makeRun({ result: 'merged', skill_bundle_snapshot_sha256: 'f'.repeat(64) })
      const r = decodeLedgerLine(encodeLedgerRecord(rec))
      expect(r).toEqual({ ok: true, record: rec })
    })
  })

  describe('decode 拒绝面（ok:false 且 error 可读定位）', () => {
    test('非法 JSON', () => {
      const r = decodeLedgerLine('{oops')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain('JSON')
    })

    test('半行（截断 JSON，崩溃写坏的典型形态）', () => {
      const full = encodeLedgerRecord(makeUsage())
      const r = decodeLedgerLine(full.slice(0, Math.floor(full.length / 2)))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain('JSON')
    })

    test('顶层非对象：数组', () => expectRejected([makeUsage()], '对象'))
    test('顶层非对象：字符串', () => expectRejected('usage', '对象'))
    test('顶层 null', () => expectRejected(null, '对象'))

    test('schema_version 缺失', () => {
      const o = asMutable(makeUsage())
      delete o.schema_version
      expectRejected(o, 'schema_version')
    })

    test('schema_version ≠ 1', () => {
      const o = asMutable(makeUsage())
      o.schema_version = 2
      expectRejected(o, 'schema_version')
    })

    test('未知 kind', () => {
      const o = asMutable(makeUsage())
      o.kind = 'usage-v2'
      expectRejected(o, 'kind')
    })

    test('kind 缺失', () => {
      const o = asMutable(makeUsage())
      delete o.kind
      expectRejected(o, 'kind')
    })

    test('base 缺 record_id', () => {
      const o = asMutable(makeBinding())
      delete o.record_id
      expectRejected(o, 'record_id')
    })

    test('base recorded_at 错类型（number）', () => {
      const o = asMutable(makeBinding())
      o.recorded_at = 1752728400
      expectRejected(o, 'recorded_at')
    })

    test('binding：缺 change', () => {
      const o = asMutable(makeBinding())
      delete o.change
      expectRejected(o, 'change')
    })

    test('binding：source 闭集外', () => {
      const o = asMutable(makeBinding())
      o.source = 'guessed'
      expectRejected(o, 'source')
    })

    test('binding：可选 supersedes_record_id 存在但错类型也拒绝', () => {
      const o = asMutable(makeBinding())
      o.supersedes_record_id = 42
      expectRejected(o, 'supersedes_record_id')
    })

    test('reservation：reserved_runs ≠ 1（字面量钉死）', () => {
      const o = asMutable(makeReservation())
      o.reserved_runs = 2
      expectRejected(o, 'reserved_runs')
    })

    test('reservation：reserved_tokens 错类型（string）', () => {
      const o = asMutable(makeReservation())
      o.reserved_tokens = '60000'
      expectRejected(o, 'reserved_tokens')
    })

    test('reservation：token_basis 闭集外', () => {
      const o = asMutable(makeReservation())
      o.token_basis = 'manual'
      expectRejected(o, 'token_basis')
    })

    test('reservation：limits_snapshot 非对象', () => {
      const o = asMutable(makeReservation())
      o.limits_snapshot = 'defaults'
      expectRejected(o, 'limits_snapshot')
    })

    test('reservation：limits_snapshot 缺 on_exceed', () => {
      const o = asMutable(makeReservation())
      o.limits_snapshot = { max_runs_per_day: 6, max_in_flight: 1 }
      expectRejected(o, 'on_exceed')
    })

    test('reservation：limits_snapshot.on_exceed 闭集外', () => {
      const o = asMutable(makeReservation())
      o.limits_snapshot = { max_runs_per_day: 6, max_in_flight: 1, on_exceed: 'explode' }
      expectRejected(o, 'on_exceed')
    })

    test('reservation：limits_snapshot.max_runs_per_day 错类型（string）', () => {
      const o = asMutable(makeReservation())
      o.limits_snapshot = { max_runs_per_day: '6', max_in_flight: 1, on_exceed: 'skip-run' }
      expectRejected(o, 'max_runs_per_day')
    })

    test('activated：缺 started_at', () => {
      const o = asMutable(makeActivated())
      delete o.started_at
      expectRejected(o, 'started_at')
    })

    test('usage：source 闭集外（手报 self-reported 拒收）', () => {
      const o = asMutable(makeUsage())
      o.source = 'self-reported'
      expectRejected(o, 'source')
    })

    test('usage：tokens 非对象', () => {
      const o = asMutable(makeUsage())
      o.tokens = 4600
      expectRejected(o, 'tokens')
    })

    test('usage：tokens.total 缺失', () => {
      const o = asMutable(makeUsage())
      o.tokens = { input: 1, output: 2 }
      expectRejected(o, 'total')
    })

    test('usage：tokens.input 错类型（string）', () => {
      const o = asMutable(makeUsage())
      o.tokens = { input: '1', output: 2, total: 3 }
      expectRejected(o, 'input')
    })

    test.each([
      ['negative', { input: -1, output: 2, total: 1 }],
      ['fractional', { input: 1.5, output: 2, total: 3.5 }],
      ['unsafe', { input: Number.MAX_SAFE_INTEGER + 1, output: 0, total: Number.MAX_SAFE_INTEGER + 1 }],
      ['cached_gt_input', { input: 1, cached_input: 2, output: 2, total: 3 }],
      ['reasoning_gt_output', { input: 1, output: 2, reasoning: 3, total: 3 }],
      ['total_mismatch', { input: 1, output: 2, total: 99 }],
    ])('H6 usage token 语义非法：%s → codec fail-closed', (_name, tokens) => {
      const o = asMutable(makeUsage())
      o.tokens = tokens
      expectRejected(o, 'tokens')
    })

    test('usage：缺 provider', () => {
      const o = asMutable(makeUsage())
      delete o.provider
      expectRejected(o, 'provider')
    })

    test('run：result 闭集外', () => {
      const o = asMutable(makeRun())
      o.result = 'exploded'
      expectRejected(o, 'result')
    })

    test('run：level 闭集外', () => {
      const o = asMutable(makeRun())
      o.level = 'L4'
      expectRejected(o, 'level')
    })

    test('run：缺 accounting', () => {
      const o = asMutable(makeRun())
      delete o.accounting
      expectRejected(o, 'accounting')
    })

    test('run：accounting.charge_source 闭集外', () => {
      const o = asMutable(makeRun())
      o.accounting = { reserved_tokens: 1, charged_tokens: 1, charge_source: 'guessed' }
      expectRejected(o, 'charge_source')
    })

    test('run：usage_record_ids 缺失', () => {
      const o = asMutable(makeRun())
      delete o.usage_record_ids
      expectRejected(o, 'usage_record_ids')
    })

    test('run：usage_record_ids 含非字符串', () => {
      const o = asMutable(makeRun())
      o.usage_record_ids = ['usage-1', 7]
      expectRejected(o, 'usage_record_ids')
    })

    test('run：reason 闭集外', () => {
      const o = asMutable(makeRun())
      o.reason = 'because'
      expectRejected(o, 'reason')
    })

    test('run：verify.trusted ≠ false（字面量钉死）', () => {
      const o = asMutable(makeRun())
      o.verify = { result: 'pass', source: 'sandbox-output', trusted: true }
      expectRejected(o, 'trusted')
    })

    test('run：verify.source 闭集外', () => {
      const o = asMutable(makeRun())
      o.verify = { result: 'pass', source: 'host-output', trusted: false }
      expectRejected(o, 'verify')
    })

    test('run：artifacts 存在但缺 commit_shas', () => {
      const o = asMutable(makeRun())
      o.artifacts = { branch: 'main' }
      expectRejected(o, 'commit_shas')
    })

    test('run：可选 image 存在但错类型（number）也拒绝', () => {
      const o = asMutable(makeRun())
      o.image = 3
      expectRejected(o, 'image')
    })

    test('run：error 存在但缺 message', () => {
      const o = asMutable(makeRun())
      o.error = { cause: 'infra' }
      expectRejected(o, 'message')
    })
  })
})

// ── H7：RunRecord.verification 结构化字段（编解码往返 + 向后兼容 + 内嵌窄校验）───────────
const SHA40 = 'a'.repeat(40)
const SHA256 = 'b'.repeat(64)

function validVerification(over: Partial<VerificationResult> = {}): VerificationResult {
  return {
    schema_version: 1,
    verification_id: 'ver-1',
    subject: {
      workflow_run_id: 'wfr-1',
      attempt_id: 'att-1',
      change: 'w1-ledger',
      revision: { kind: 'named-branch-head', sha: SHA40 },
    },
    binding: { kind: 'workflow-transition', workflow_digest: 'wf-digest-1', workflow: 'default', step: 'verify', event: 'verify-pass' },
    verdict: 'passed',
    evidence: [{ kind: 'repo-file', path: 'packages/kernel/src/x.ts', sha256: SHA256, revision_sha: SHA40 }],
    issuer: { kind: 'host-verifier', verifier: 'kernel-verify', version: '1.0.0', trusted: true },
    evaluated_at: '2026-07-18T05:00:00.000Z',
    ...over,
  }
}

describe('loops/ledger-codec —— RunRecord.verification（H7 结构化 verdict 字段）', () => {
  test('往返：run 同时携带旧 verify（untrusted）与新 verification（trusted）', () => {
    const rec = makeRun({
      verify: { result: 'pass', source: 'sandbox-output', trusted: false },
      verification: validVerification(),
    })
    const r = decodeLedgerLine(encodeLedgerRecord(rec))
    expect(r).toEqual({ ok: true, record: rec })
    if (r.ok && r.record.kind === 'run') expect(r.record.verification?.issuer.trusted).toBe(true)
  })

  test('往返：verification 各 binding/issuer/evidence variant 保真', () => {
    const rec = makeRun({
      verification: validVerification({
        binding: { kind: 'runtime-verifier', verifier: 'host-vitest', version: '2' },
        verdict: 'inconclusive',
        evidence: [{ kind: 'command-result', command_id: 'tsc', exit_code: 2, stderr_sha256: SHA256 }],
        issuer: { kind: 'sandbox-report', runner: 'claude-code', trusted: false },
      }),
    })
    const r = decodeLedgerLine(encodeLedgerRecord(rec))
    expect(r).toEqual({ ok: true, record: rec })
  })

  test('向后兼容：旧 run 行无 verification 字段 → decode ok 且 verification 为 undefined', () => {
    const rec = makeRun() // 不含 verification
    const line = encodeLedgerRecord(rec)
    expect(line).not.toContain('verification')
    const r = decodeLedgerLine(line)
    expect(r.ok).toBe(true)
    if (r.ok && r.record.kind === 'run') expect(r.record.verification).toBeUndefined()
  })

  test('内嵌窄校验：verification 存在但畸形（坏 verdict）→ 拒，错误带 run.verification 路径', () => {
    const o = asMutable(makeRun({ verification: validVerification() }))
    ;(o.verification as Record<string, unknown>).verdict = 'maybe'
    const r = decodeObj(o)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('run.verification.verdict')
  })

  test('内嵌窄校验：passed 但 evidence 空 → 拒', () => {
    const o = asMutable(makeRun({ verification: validVerification({ verdict: 'passed', evidence: [] }) }))
    expectRejected(o, 'run.verification.evidence')
  })

  test('内嵌窄校验：sandbox-report 冒充 trusted:true → 拒', () => {
    const o = asMutable(makeRun({ verification: validVerification() }))
    ;(o.verification as Record<string, unknown>).issuer = { kind: 'sandbox-report', runner: 'x', trusted: true }
    expectRejected(o, 'trusted')
  })

  test('内嵌窄校验：evidence repo-file 路径逃逸 ../x → 拒', () => {
    const o = asMutable(makeRun({ verification: validVerification() }))
    ;(o.verification as Record<string, unknown>).evidence = [{ kind: 'repo-file', path: '../x', sha256: SHA256, revision_sha: SHA40 }]
    expectRejected(o, '..')
  })

  test('内嵌窄校验：subject.revision.sha 坏 git SHA → 拒', () => {
    const o = asMutable(makeRun({ verification: validVerification() }))
    ;(o.verification as Record<string, unknown>).subject = {
      workflow_run_id: 'w', attempt_id: 'a', change: 'c', revision: { kind: 'named-branch-head', sha: 'nope' },
    }
    expectRejected(o, 'run.verification.subject.revision.sha')
  })

  test('内嵌窄校验：verification 非对象 → 拒', () => {
    const o = asMutable(makeRun())
    o.verification = 'passed'
    expectRejected(o, 'run.verification')
  })
})

// ── H7-S1：encode/decode 侧的 verification canonical 抽取（杀 toJSON / 多余键 / getter 跨次读取）───
describe('loops/ledger-codec —— H7-S1 verification canonical 抽取（r2 阻断4：物理 merge/ledger 撕裂）', () => {
  test('encode 侧：record.verification 带恶意 toJSON → 落盘的是真实字段抽取副本，不是 toJSON() 谎报的另一份 verification', () => {
    const real = validVerification({ verdict: 'passed' })
    const fake = validVerification({ verdict: 'inconclusive', evidence: [] }) // toJSON 谎报的"另一份"
    const hostileVerification = { ...real, toJSON: () => fake }
    const rec = makeRun({ verification: hostileVerification as unknown as VerificationResult })
    const line = encodeLedgerRecord(rec)
    const onDisk = JSON.parse(line) as { verification: { verdict: string } }
    expect(onDisk.verification.verdict).toBe('passed') // 真实字段，不是 toJSON 谎报的 inconclusive
  })

  test('encode 侧：verification 的多余键不落盘（未知键丢弃）', () => {
    const withExtra = { ...validVerification(), unexpected_field: 'nope' }
    const rec = makeRun({ verification: withExtra as unknown as VerificationResult })
    const line = encodeLedgerRecord(rec)
    const onDisk = JSON.parse(line) as { verification: Record<string, unknown> }
    expect(onDisk.verification).not.toHaveProperty('unexpected_field')
  })

  test('encode 侧 canonical 化不会把非法字段悄悄变合法：畸形 verdict 原样落盘，decode 仍拒（往返一致性不因抽取而失效）', () => {
    const bad = { ...validVerification(), verdict: 'maybe' }
    const rec = makeRun({ verification: bad as unknown as VerificationResult })
    const line = encodeLedgerRecord(rec)
    const r = decodeLedgerLine(line)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('verdict')
  })

  test('decode 侧：verification 内嵌的多余键同样丢弃（canonical 副本落地，不是原始 parsed 引用）', () => {
    const o = asMutable(makeRun({ verification: validVerification() }))
    ;(o.verification as Record<string, unknown>).unexpected_field = 'nope'
    const r = decodeObj(o)
    expect(r.ok).toBe(true)
    if (r.ok && r.record.kind === 'run') {
      expect(r.record.verification).not.toHaveProperty('unexpected_field')
    }
  })

  test('decode 侧：解出的 verification 副本已递归冻结', () => {
    const rec = makeRun({ verification: validVerification() })
    const r = decodeLedgerLine(encodeLedgerRecord(rec))
    expect(r.ok).toBe(true)
    if (r.ok && r.record.kind === 'run' && r.record.verification) {
      expect(Object.isFrozen(r.record.verification)).toBe(true)
      expect(Object.isFrozen(r.record.verification.evidence)).toBe(true)
    }
  })
})

// ── H10 §3/§8任务3：skill-bundle-snapshot 记录（绑 attempt/reservation，只存 digest/结构摘要/CAS
// 引用，绝不存 skill 正文）+ RunRecord.skill_bundle_snapshot_sha256（终态快速关联，旧行可选缺席）──
const TREE_SHA_A = 'c'.repeat(64)
const TREE_SHA_B = 'd'.repeat(64)
const SNAPSHOT_SHA = 'e'.repeat(64)

describe('loops/ledger-codec —— skill-bundle-snapshot 记录（H10 §3/§8任务3，H10 r1 复审阻断2/D4 补全 provenance）', () => {
  test('往返：最小合法记录（单 slot，default 来源）', () => {
    const rec = makeSkillBundleSnapshot()
    const r = decodeLedgerLine(encodeLedgerRecord(rec))
    expect(r).toEqual({ ok: true, record: rec })
  })

  test('往返：合法空快照（slots: []——profile 合法但本 step 解析结果为空，不算未接线）', () => {
    const rec = makeSkillBundleSnapshot({ slots: [] })
    const r = decodeLedgerLine(encodeLedgerRecord(rec))
    expect(r).toEqual({ ok: true, record: rec })
  })

  test('往返：多 slot + custom 来源 + `_all` bundle id', () => {
    const rec = makeSkillBundleSnapshot({
      resolution_source: 'custom',
      skill_bundle_id: '_all',
      slots: [
        { token: 'a|b', alternatives: ['a', 'b'], concrete_skill_id: 'a', tree_sha256: TREE_SHA_A },
        { token: 'writing-clearly', alternatives: ['writing-clearly'], concrete_skill_id: 'writing-clearly', tree_sha256: TREE_SHA_B },
      ],
    })
    const r = decodeLedgerLine(encodeLedgerRecord(rec))
    expect(r).toEqual({ ok: true, record: rec })
  })

  test('往返：policy_epoch 为字面量 "absent"（governance.ts::registryContentEpoch 对缺席 registry 的合法哨兵值，非 sha256 格式，故本字段不用 checkSha256）', () => {
    const rec = makeSkillBundleSnapshot({ policy_epoch: 'absent' })
    const r = decodeLedgerLine(encodeLedgerRecord(rec))
    expect(r).toEqual({ ok: true, record: rec })
  })

  test('拒绝：缺 attempt_id', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    delete o.attempt_id
    expectRejected(o, 'attempt_id')
  })

  test('拒绝：缺 reservation_id', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    delete o.reservation_id
    expectRejected(o, 'reservation_id')
  })

  // H10 r1 复审阻断2/D4：loop_id/policy_epoch/workflow_run_id/workflow/step/track/coordinate_digest
  // 均为本轮补全的 provenance 必填字段（无历史行需要兼容，见 ledger-types.ts 头注）。
  test('拒绝：缺 loop_id', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    delete o.loop_id
    expectRejected(o, 'loop_id')
  })

  test('拒绝：skill_bundle_id 不匹配词法（大写开头，复用 registry.ts::SKILL_BUNDLE_ID_RE）', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.skill_bundle_id = 'Bad_ID'
    expectRejected(o, 'skill_bundle_id')
  })

  test('拒绝：skill_bundle_id 空字符串（区别于 loops.yaml 缺省 null=unwired 的合法语义）', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.skill_bundle_id = ''
    expectRejected(o, 'skill_bundle_id')
  })

  test('拒绝：缺 policy_epoch', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    delete o.policy_epoch
    expectRejected(o, 'policy_epoch')
  })

  test('拒绝：policy_epoch 错类型（number）', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.policy_epoch = 123
    expectRejected(o, 'policy_epoch')
  })

  test('拒绝：resolution_source 闭集外', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.resolution_source = 'manifest'
    expectRejected(o, 'resolution_source')
  })

  // H10 r1 复审阻断2/D4：workflow_run_id/workflow/step/track 均为必填纯 string（无预定词法，
  // 写入方保证语义正确，本层只钉「存在且是 string」，见 ledger-codec.ts::validateSkillBundleSnapshot）。
  test('拒绝：缺 workflow_run_id', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    delete o.workflow_run_id
    expectRejected(o, 'workflow_run_id')
  })

  test('拒绝：缺 workflow', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    delete o.workflow
    expectRejected(o, 'workflow')
  })

  test('拒绝：缺 step', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    delete o.step
    expectRejected(o, 'step')
  })

  test('拒绝：缺 track', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    delete o.track
    expectRejected(o, 'track')
  })

  test('拒绝：缺 coordinate_digest', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    delete o.coordinate_digest
    expectRejected(o, 'coordinate_digest')
  })

  test('拒绝：coordinate_digest 格式非法（非 64 位小写十六进制）', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.coordinate_digest = 'not-a-hash'
    expectRejected(o, 'coordinate_digest')
  })

  test('拒绝：coordinate_digest 大写十六进制不合法（大小写敏感）', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.coordinate_digest = 'A'.repeat(64)
    expectRejected(o, 'coordinate_digest')
  })

  test('拒绝：snapshot_sha256 格式非法（非 64 位小写十六进制）', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.snapshot_sha256 = 'not-a-hash'
    expectRejected(o, 'snapshot_sha256')
  })

  test('拒绝：snapshot_sha256 大写十六进制不合法（大小写敏感）', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.snapshot_sha256 = 'E'.repeat(64)
    expectRejected(o, 'snapshot_sha256')
  })

  test('拒绝：cas_relative_path 缺失', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    delete o.cas_relative_path
    expectRejected(o, 'cas_relative_path')
  })

  test('拒绝：slots 缺失', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    delete o.slots
    expectRejected(o, 'slots')
  })

  test('拒绝：slots 非数组', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.slots = 'none'
    expectRejected(o, 'slots')
  })

  test('拒绝：slots[i] 非对象', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.slots = ['x']
    expectRejected(o, 'slots[0]')
  })

  test('拒绝：slots[i] 缺 token', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.slots = [{ alternatives: ['x'], concrete_skill_id: 'x', tree_sha256: TREE_SHA_A }]
    expectRejected(o, 'token')
  })

  // H10 r1 复审阻断2/D4：slots[i].alternatives——token 按声明顺序拆出的全部候选 skill id（镜像
  // workflow/effective-skill-resolver.ts::EffectiveSkillSlot.alternatives），必填 string[]。
  test('拒绝：slots[i] 缺 alternatives', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.slots = [{ token: 'x', concrete_skill_id: 'x', tree_sha256: TREE_SHA_A }]
    expectRejected(o, 'alternatives')
  })

  test('拒绝：slots[i].alternatives 非数组', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.slots = [{ token: 'x', alternatives: 'x', concrete_skill_id: 'x', tree_sha256: TREE_SHA_A }]
    expectRejected(o, 'alternatives')
  })

  test('拒绝：slots[i].alternatives 含非字符串元素', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.slots = [{ token: 'x', alternatives: ['x', 7], concrete_skill_id: 'x', tree_sha256: TREE_SHA_A }]
    expectRejected(o, 'alternatives')
  })

  test('拒绝：slots[i] 缺 concrete_skill_id', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.slots = [{ token: 'x', alternatives: ['x'], tree_sha256: TREE_SHA_A }]
    expectRejected(o, 'concrete_skill_id')
  })

  test('拒绝：slots[i].tree_sha256 格式非法', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.slots = [{ token: 'x', alternatives: ['x'], concrete_skill_id: 'x', tree_sha256: 'zzzz' }]
    expectRejected(o, 'tree_sha256')
  })

  test('拒绝：未知 kind 闭集校验同样覆盖新 kind 拼写错误', () => {
    const o = asMutable(makeSkillBundleSnapshot())
    o.kind = 'skill-bundle-snapshot-v2'
    expectRejected(o, 'kind')
  })
})

describe('loops/ledger-codec —— RunRecord.skill_bundle_snapshot_sha256（H10 §3/§8任务3：终态快速关联）', () => {
  test('往返：存在时保真', () => {
    const rec = makeRun({ skill_bundle_snapshot_sha256: SNAPSHOT_SHA })
    const r = decodeLedgerLine(encodeLedgerRecord(rec))
    expect(r).toEqual({ ok: true, record: rec })
  })

  test('向后兼容：旧行无该字段 → encode 不落盘该键，decode ok 且字段为 undefined', () => {
    const rec = makeRun() // 不含 skill_bundle_snapshot_sha256
    const line = encodeLedgerRecord(rec)
    expect(line).not.toContain('skill_bundle_snapshot_sha256')
    const r = decodeLedgerLine(line)
    expect(r.ok).toBe(true)
    if (r.ok && r.record.kind === 'run') expect(r.record.skill_bundle_snapshot_sha256).toBeUndefined()
  })

  test('拒绝：存在但格式非法（非 64 位小写十六进制）', () => {
    const o = asMutable(makeRun())
    o.skill_bundle_snapshot_sha256 = 'nope'
    expectRejected(o, 'skill_bundle_snapshot_sha256')
  })

  test('拒绝：存在但错类型（number）', () => {
    const o = asMutable(makeRun())
    o.skill_bundle_snapshot_sha256 = 12345
    expectRejected(o, 'skill_bundle_snapshot_sha256')
  })
})

describe('loops/ledger-codec —— 旧 JSONL fixture 原样 decode（H10 §8任务3 红测先行的兼容基线：新 kind/新可选字段不改变旧行判读）', () => {
  test('H10 之前手写的 run 行（无 skill_bundle_snapshot_sha256、无 verification）原样 decode', () => {
    const oldLine = JSON.stringify({
      schema_version: 1,
      record_id: 'rec-legacy-run-1',
      recorded_at: '2026-06-01T00:00:00.000Z',
      kind: 'run',
      run_record_id: 'run-legacy-1',
      attempt_id: 'att-legacy-1',
      loop_id: 'loop-legacy',
      change: 'w0-legacy',
      level: 'L1',
      runner: 'claude-code',
      admitted_at: '2026-06-01T00:00:00.000Z',
      finished_at: '2026-06-01T00:10:00.000Z',
      result: 'merged',
      usage_record_ids: [],
      accounting: { reserved_tokens: 1000, charged_tokens: 0, charge_source: 'none' },
    })
    const r = decodeLedgerLine(oldLine)
    expect(r.ok).toBe(true)
    if (r.ok && r.record.kind === 'run') {
      expect(r.record.skill_bundle_snapshot_sha256).toBeUndefined()
      expect(r.record.verification).toBeUndefined()
    }
  })

  test('H10 之前手写的 budget-reservation 行原样 decode（不受新 kind 引入影响）', () => {
    const oldLine = JSON.stringify({
      schema_version: 1,
      record_id: 'rec-legacy-res-1',
      recorded_at: '2026-06-01T00:00:00.000Z',
      kind: 'budget-reservation',
      reservation_id: 'res-legacy-1',
      attempt_id: 'att-legacy-1',
      loop_id: 'loop-legacy',
      change: 'w0-legacy',
      budget_day: '2026-06-01',
      reserved_runs: 1,
      reserved_tokens: 1000,
      token_basis: 'risk-default',
      limits_snapshot: { max_runs_per_day: 6, max_in_flight: 1, on_exceed: 'skip-run' },
      expires_at: '2026-06-01T01:00:00.000Z',
    })
    const r = decodeLedgerLine(oldLine)
    expect(r.ok).toBe(true)
  })
})

describe('loops/ledger-codec —— H7 durable merge intent / landed facts', () => {
  test('merge-intent 全恢复事实往返；git SHA 沿用既有 string 口径，允许测试短占位', () => {
    const rec = makeMergeIntent()
    const decoded = decodeLedgerLine(encodeLedgerRecord(rec))
    expect(decoded).toEqual({ ok: true, record: rec })
  })

  test('merge-landed host 已同步往返', () => {
    const rec = makeMergeLanded()
    expect(decodeLedgerLine(encodeLedgerRecord(rec))).toEqual({ ok: true, record: rec })
  })

  test('merge-landed host 未同步时保留结构化错误事实', () => {
    const rec = makeMergeLanded({
      host_synced: false,
      host_sync_error: { cause: 'worktree-sync-failed', message: 'dirty path blocks checkout' },
    })
    expect(decodeLedgerLine(encodeLedgerRecord(rec))).toEqual({ ok: true, record: rec })
  })

  test('merge-intent verification encode 使用 canonical 副本，不受 hostile toJSON 欺骗', () => {
    const real = validVerification({ verdict: 'passed' })
    const fake = validVerification({ verdict: 'inconclusive', evidence: [] })
    const rec = makeMergeIntent({
      verification: { ...real, toJSON: () => fake } as unknown as VerificationResult,
    })
    const onDisk = JSON.parse(encodeLedgerRecord(rec)) as { verification: { verdict: string } }
    expect(onDisk.verification.verdict).toBe('passed')
  })

  test.each([
    'attempt_id', 'reservation_id', 'loop_id', 'change', 'workflow_run_id', 'base_ref', 'expected_base_sha',
    'branch_ref', 'expected_branch_sha', 'merged_commit_sha', 'level', 'runner', 'admitted_at',
    'created_at', 'usage_record_ids', 'accounting',
  ])('merge-intent 缺必填字段 %s → 拒绝', (field) => {
    const obj = asMutable(makeMergeIntent())
    delete obj[field]
    expectRejected(obj, field)
  })

  test.each([
    'intent_record_id', 'attempt_id', 'reservation_id', 'loop_id', 'change', 'base_ref',
    'base_before_sha', 'branch_sha', 'merged_commit_sha', 'host_synced', 'landed_at',
  ])('merge-landed 缺必填字段 %s → 拒绝', (field) => {
    const obj = asMutable(makeMergeLanded())
    delete obj[field]
    expectRejected(obj, field)
  })

  test('merge-intent 未知顶层字段 → 拒绝，不把未建模恢复事实静默吞掉', () => {
    const obj = asMutable(makeMergeIntent())
    obj.unexpected_recovery_fact = 'nope'
    expectRejected(obj, 'unexpected_recovery_fact')
  })

  test('merge-landed 未知顶层字段 → 拒绝', () => {
    const obj = asMutable(makeMergeLanded())
    obj.unexpected_receipt = 'nope'
    expectRejected(obj, 'unexpected_receipt')
  })

  test('merge-intent 嵌套 accounting 未知字段 → 拒绝', () => {
    const obj = asMutable(makeMergeIntent())
    ;(obj.accounting as Record<string, unknown>).untrusted_charge = 1
    expectRejected(obj, 'untrusted_charge')
  })

  test('merge-intent level 闭集外、skill snapshot SHA 非法、verification 畸形均拒绝', () => {
    const badLevel = asMutable(makeMergeIntent())
    badLevel.level = 'L9'
    expectRejected(badLevel, 'level')

    const badSnapshot = asMutable(makeMergeIntent())
    badSnapshot.skill_bundle_snapshot_sha256 = 'short'
    expectRejected(badSnapshot, 'skill_bundle_snapshot_sha256')

    const badVerification = asMutable(makeMergeIntent())
    ;(badVerification.verification as Record<string, unknown>).verdict = 'maybe'
    expectRejected(badVerification, 'merge-intent.verification.verdict')
  })

  test('merge-intent verify.trusted 只能为 false；artifacts 必须有 commit_shas', () => {
    const trustedSelfReport = asMutable(makeMergeIntent())
    trustedSelfReport.verify = { result: 'pass', source: 'sandbox-output', trusted: true }
    expectRejected(trustedSelfReport, 'trusted')

    const missingCommits = asMutable(makeMergeIntent())
    missingCommits.artifacts = { branch: 'sandcastle/w1-ledger' }
    expectRejected(missingCommits, 'commit_shas')
  })

  test('merge-landed host_synced 必须 boolean；同步成功不能同时携带错误', () => {
    const wrongType = asMutable(makeMergeLanded())
    wrongType.host_synced = 'yes'
    expectRejected(wrongType, 'host_synced')

    const contradictory = asMutable(makeMergeLanded({
      host_synced: true,
      host_sync_error: { cause: 'impossible', message: 'must not coexist' },
    }))
    expectRejected(contradictory, 'host_sync_error')
  })
})
