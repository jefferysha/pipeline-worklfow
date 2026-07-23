import { describe, expect, test } from 'vitest'
import type { DriftReport } from './drift.js'
import type { LoopEntry } from './types.js'
import {
  applyReconciliationOperations,
  buildReconciliationPlan,
  decodeReconciliationPlan,
  encodeReconciliationPlan,
  reconciliationPlanId,
  resourceEpoch,
} from './reconciliation.js'
import type { ReconciliationPlan, ReconciliationPlanPayload } from './reconciliation.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function loop(overrides: Partial<LoopEntry> = {}): LoopEntry {
  return {
    id: 'loop-a',
    name: 'Loop A',
    kind: 'orchestrator',
    goal: 'Keep the declared loop mirror synchronized.',
    cadence: '1h',
    risk: 'low',
    runner: 'codex',
    change_prefix: 'loop-a-',
    phases: ['decide', 'record'],
    human_gates: ['destructive changes'],
    state: 'docs/loops/progress.md',
    design_doc: 'LOOP.md',
    status: 'active',
    budget: { max_runs_per_day: 4, max_in_flight: 1, on_exceed: 'pause' },
    kill_criteria: ['goal reached'],
    autonomy_level: 'L1',
    allowlist: [],
    denylist: [],
    ...overrides,
  }
}

function report(items: DriftReport['items'], checked = ['loop-a']): DriftReport {
  return {
    version: 1,
    generated_at: '2026-07-19T03:00',
    clean: items.every((item) => item.severity !== 'warn'),
    checked,
    items,
  }
}

function missingMirrorPlan(): ReconciliationPlan {
  return buildReconciliationPlan({
    generated_at: '2026-07-19T03:01:02.003Z',
    scope: { kind: 'all' },
    loops: [loop()],
    registry_epoch: { kind: 'sha256', value: 'a'.repeat(64) },
    run_log_epoch: { kind: 'sha256', value: 'b'.repeat(64) },
    loop_doc_bytes: encoder.encode('# LOOP.md\n'),
    drift_report: report([{
      loop: 'loop-a', dimension: 'mirror-missing', severity: 'warn',
      detail: 'missing mirror', suggestion: 'ensure mirror',
    }]),
  })
}

function rehash(raw: Record<string, unknown>): void {
  const { plan_id: _oldPlanId, ...payload } = raw
  raw.plan_id = reconciliationPlanId(payload as unknown as ReconciliationPlanPayload)
}

describe('buildReconciliationPlan / applyReconciliationOperations', () => {
  test('ResourceEpoch hashes exact bytes and distinguishes an absent resource from an empty file', () => {
    expect(resourceEpoch(null)).toEqual({ kind: 'absent' })
    expect(resourceEpoch(new Uint8Array())).toEqual({
      kind: 'sha256',
      value: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    })
    expect(resourceEpoch(encoder.encode('abc'))).toEqual({
      kind: 'sha256',
      value: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    })
  })

  test('mirror-missing produces one LOOP.md ensure operation and a deterministic post-image', () => {
    const before = encoder.encode('# Human notes\n\nKeep this paragraph byte-for-byte.\n')
    const drift = report([{
      loop: 'loop-a',
      dimension: 'mirror-missing',
      severity: 'warn',
      detail: 'registry loop loop-a is absent from LOOP.md',
      suggestion: 'add its mirror section',
    }])

    const plan = buildReconciliationPlan({
      generated_at: '2026-07-19T03:01:02.003Z',
      scope: { kind: 'all' },
      loops: [loop()],
      registry_epoch: { kind: 'sha256', value: 'a'.repeat(64) },
      run_log_epoch: { kind: 'sha256', value: 'b'.repeat(64) },
      loop_doc_bytes: before,
      drift_report: drift,
    })

    expect(plan.operations).toEqual([{
      kind: 'ensure-managed-loop-section',
      target: 'LOOP.md',
      loop_id: 'loop-a',
    }])
    expect(plan.plan_id).toMatch(/^[a-f0-9]{64}$/)
    expect(plan.preconditions.loop_doc_epoch).toEqual(resourceEpoch(before))

    const applied = applyReconciliationOperations({
      loop_doc_bytes: before,
      loops: [loop()],
      operations: plan.operations,
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return

    const text = decoder.decode(applied.bytes)
    expect(text.startsWith(decoder.decode(before))).toBe(true)
    expect(text).toContain('<!-- PIPELINE:LOOP-MIRROR-V1:START loop-a -->')
    expect(text).toContain('### `loop-a`')
    expect(text).toContain('<!-- PIPELINE:LOOP-MIRROR-V1:END loop-a -->')
    expect(plan.expected_loop_doc_epoch).toEqual(applied.epoch)
  })

  test('a wildcard missing-document drift honors loop scope and preserves the absent precondition', () => {
    const loopB = loop({ id: 'loop-b', name: 'Loop B', change_prefix: 'loop-b-' })
    const drift = report([{
      loop: '*', dimension: 'mirror-missing', severity: 'warn',
      detail: 'LOOP.md is absent', suggestion: 'create managed mirrors',
    }], ['loop-a', 'loop-b'])

    const plan = buildReconciliationPlan({
      generated_at: '2026-07-19T03:01:02.003Z',
      scope: { kind: 'loop', loop_id: 'loop-b' },
      loops: [loop(), loopB],
      registry_epoch: { kind: 'sha256', value: 'a'.repeat(64) },
      run_log_epoch: { kind: 'absent' },
      loop_doc_bytes: null,
      drift_report: drift,
    })

    expect(plan.scope).toEqual({ kind: 'loop', loop_id: 'loop-b' })
    expect(plan.preconditions.loop_doc_epoch).toEqual({ kind: 'absent' })
    expect(plan.drift_report.checked).toEqual(['loop-b'])
    expect(plan.operations).toEqual([{
      kind: 'ensure-managed-loop-section', target: 'LOOP.md', loop_id: 'loop-b',
    }])
    expect(plan.expected_loop_doc_epoch.kind).toBe('sha256')
  })

  test('the five non-document drift classes become typed blockers and never write operations', () => {
    const dimensions = [
      ['runlog-orphan-id', 'ghost', 'historical-fact-immutable'],
      ['never-run', 'loop-a', 'runtime-remediation-required'],
      ['cadence-idle', 'loop-a', 'runtime-remediation-required'],
      ['change-prefix', 'loop-a', 'ambiguous-authority'],
      ['status-drift', 'loop-a', 'runtime-remediation-required'],
    ] as const
    const drift = report(dimensions.map(([dimension, id]) => ({
      loop: id,
      dimension,
      severity: 'warn' as const,
      detail: `${dimension} detail`,
      suggestion: `${dimension} suggestion`,
    })))

    const plan = buildReconciliationPlan({
      generated_at: '2026-07-19T03:01:02.003Z',
      scope: { kind: 'all' },
      loops: [loop()],
      registry_epoch: { kind: 'sha256', value: 'a'.repeat(64) },
      run_log_epoch: { kind: 'sha256', value: 'b'.repeat(64) },
      loop_doc_bytes: encoder.encode('# LOOP.md\n'),
      drift_report: drift,
    })

    expect(plan.operations).toEqual([])
    expect(plan.blockers.map(({ drift: item, reason }) => [item.dimension, reason])).toEqual(
      dimensions.map(([dimension, , reason]) => [dimension, reason]),
    )
  })

  test('mirror-orphan removes only a pipeline-owned section and preserves a handwritten orphan', () => {
    const manual = '### `manual-orphan` — handwritten\n\nNever delete this paragraph.\n'
    const owned = [
      '<!-- PIPELINE:LOOP-MIRROR-V1:START owned-orphan -->',
      '### `owned-orphan` — generated',
      '',
      'Pipeline-owned content.',
      '<!-- PIPELINE:LOOP-MIRROR-V1:END owned-orphan -->',
      '',
    ].join('\n')
    const before = encoder.encode(`# LOOP.md\n\n${manual}\n${owned}`)
    const drift = report([
      {
        loop: 'manual-orphan', dimension: 'mirror-orphan', severity: 'warn',
        detail: 'manual orphan', suggestion: 'review manually',
      },
      {
        loop: 'owned-orphan', dimension: 'mirror-orphan', severity: 'warn',
        detail: 'owned orphan', suggestion: 'remove generated mirror',
      },
    ])

    const plan = buildReconciliationPlan({
      generated_at: '2026-07-19T03:01:02.003Z',
      scope: { kind: 'all' },
      loops: [loop()],
      registry_epoch: { kind: 'sha256', value: 'a'.repeat(64) },
      run_log_epoch: { kind: 'sha256', value: 'b'.repeat(64) },
      loop_doc_bytes: before,
      drift_report: drift,
    })

    expect(plan.operations).toEqual([{
      kind: 'remove-managed-loop-section',
      target: 'LOOP.md',
      loop_id: 'owned-orphan',
      ownership: 'pipeline-loop-mirror-v1',
    }])
    expect(plan.blockers).toEqual([expect.objectContaining({
      drift: expect.objectContaining({ loop: 'manual-orphan', dimension: 'mirror-orphan' }),
      reason: 'unowned-document-section',
    })])

    const applied = applyReconciliationOperations({
      loop_doc_bytes: before,
      loops: [loop()],
      operations: plan.operations,
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    const text = decoder.decode(applied.bytes)
    expect(text).toContain(manual)
    expect(text).not.toContain('owned-orphan')
    expect(plan.expected_loop_doc_epoch).toEqual(applied.epoch)
  })

  test.each([
    [
      'duplicate',
      [
        '<!-- PIPELINE:LOOP-MIRROR-V1:START dup -->',
        '<!-- PIPELINE:LOOP-MIRROR-V1:END dup -->',
        '<!-- PIPELINE:LOOP-MIRROR-V1:START dup -->',
        '<!-- PIPELINE:LOOP-MIRROR-V1:END dup -->',
      ].join('\n'),
    ],
    [
      'nested',
      [
        '<!-- PIPELINE:LOOP-MIRROR-V1:START outer -->',
        '<!-- PIPELINE:LOOP-MIRROR-V1:START inner -->',
        '<!-- PIPELINE:LOOP-MIRROR-V1:END inner -->',
        '<!-- PIPELINE:LOOP-MIRROR-V1:END outer -->',
      ].join('\n'),
    ],
    ['unpaired', '<!-- PIPELINE:LOOP-MIRROR-V1:START broken -->\n'],
    ['malformed', '<!-- PIPELINE:LOOP-MIRROR-V1:START -->\n'],
  ])('corrupt %s managed markers fail closed before applying an operation', (_case, source) => {
    const before = encoder.encode(source)
    const snapshot = new Uint8Array(before)
    const applied = applyReconciliationOperations({
      loop_doc_bytes: before,
      loops: [loop()],
      operations: [{ kind: 'ensure-managed-loop-section', target: 'LOOP.md', loop_id: 'loop-a' }],
    })

    expect(applied).toEqual(expect.objectContaining({ ok: false, reason: 'managed-section-corrupt' }))
    expect(before).toEqual(snapshot)
  })

  test('a document operation becomes a typed blocker when ownership markers are corrupt', () => {
    const before = encoder.encode('<!-- PIPELINE:LOOP-MIRROR-V1:START loop-a -->\n')
    const drift = report([{
      loop: 'loop-a', dimension: 'mirror-missing', severity: 'warn',
      detail: 'missing mirror heading', suggestion: 'ensure mirror',
    }])

    const plan = buildReconciliationPlan({
      generated_at: '2026-07-19T03:01:02.003Z',
      scope: { kind: 'all' },
      loops: [loop()],
      registry_epoch: { kind: 'sha256', value: 'a'.repeat(64) },
      run_log_epoch: { kind: 'sha256', value: 'b'.repeat(64) },
      loop_doc_bytes: before,
      drift_report: drift,
    })

    expect(plan.operations).toEqual([])
    expect(plan.blockers).toEqual([expect.objectContaining({
      drift: expect.objectContaining({ dimension: 'mirror-missing', loop: 'loop-a' }),
      reason: 'managed-section-corrupt',
    })])
    expect(plan.expected_loop_doc_epoch).toEqual(resourceEpoch(before))
  })

  test('ensure is idempotent and repairs an owned section in place without duplicating markers', () => {
    const operation = { kind: 'ensure-managed-loop-section', target: 'LOOP.md', loop_id: 'loop-a' } as const
    const first = applyReconciliationOperations({
      loop_doc_bytes: null,
      loops: [loop()],
      operations: [operation],
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const replay = applyReconciliationOperations({
      loop_doc_bytes: first.bytes,
      loops: [loop()],
      operations: [operation],
    })
    expect(replay.ok).toBe(true)
    if (!replay.ok) return
    expect(replay.changed).toBe(false)
    expect(replay.bytes).toEqual(first.bytes)

    const edited = encoder.encode(decoder.decode(first.bytes).replace('### `loop-a`', '### edited-heading'))
    const repaired = applyReconciliationOperations({
      loop_doc_bytes: edited,
      loops: [loop()],
      operations: [operation],
    })
    expect(repaired.ok).toBe(true)
    if (!repaired.ok) return
    const repairedText = decoder.decode(repaired.bytes)
    expect(repaired.changed).toBe(true)
    expect(repairedText).toContain('### `loop-a`')
    expect(repairedText.match(/PIPELINE:LOOP-MIRROR-V1:START/g)).toHaveLength(1)
    expect(repairedText.match(/PIPELINE:LOOP-MIRROR-V1:END/g)).toHaveLength(1)
  })
})

describe('ReconciliationPlan v1 codec', () => {
  test('round-trips canonical JSON and accepts an equivalent payload with reordered object keys', () => {
    const plan = missingMirrorPlan()
    const decoded = decodeReconciliationPlan(encodeReconciliationPlan(plan))
    expect(decoded).toEqual({ ok: true, plan })

    const raw = JSON.parse(encodeReconciliationPlan(plan)) as Record<string, unknown>
    const reversed = Object.fromEntries(Object.entries(raw).reverse())
    const reordered = decodeReconciliationPlan(JSON.stringify(reversed))
    expect(reordered).toEqual({ ok: true, plan })
  })

  test('rejects unknown keys and an arbitrary operation target even when plan_id is recomputed', () => {
    const withUnknown = JSON.parse(encodeReconciliationPlan(missingMirrorPlan())) as Record<string, unknown>
    const unknownOperations = withUnknown.operations as Array<Record<string, unknown>>
    unknownOperations[0]!.surprise = true
    rehash(withUnknown)
    const unknownResult = decodeReconciliationPlan(JSON.stringify(withUnknown))
    expect(unknownResult.ok).toBe(false)
    if (!unknownResult.ok) expect(unknownResult.errors.join('\n')).toContain('surprise')

    const withTarget = JSON.parse(encodeReconciliationPlan(missingMirrorPlan())) as Record<string, unknown>
    const targetOperations = withTarget.operations as Array<Record<string, unknown>>
    targetOperations[0]!.target = '../README.md'
    rehash(withTarget)
    const targetResult = decodeReconciliationPlan(JSON.stringify(withTarget))
    expect(targetResult.ok).toBe(false)
    if (!targetResult.ok) expect(targetResult.errors.join('\n')).toContain('target')
  })

  test('rejects plan_id or payload tampering', () => {
    const badId = JSON.parse(encodeReconciliationPlan(missingMirrorPlan())) as Record<string, unknown>
    badId.plan_id = '0'.repeat(64)
    const badIdResult = decodeReconciliationPlan(JSON.stringify(badId))
    expect(badIdResult.ok).toBe(false)
    if (!badIdResult.ok) expect(badIdResult.errors.join('\n')).toContain('plan_id')

    const changedPayload = JSON.parse(encodeReconciliationPlan(missingMirrorPlan())) as Record<string, unknown>
    changedPayload.generated_at = '2026-07-19T03:01:02.004Z'
    const changedResult = decodeReconciliationPlan(JSON.stringify(changedPayload))
    expect(changedResult.ok).toBe(false)
    if (!changedResult.ok) expect(changedResult.errors.join('\n')).toContain('plan_id')
  })

  test('rejects contradictory ensure and remove operations for the same loop', () => {
    const raw = JSON.parse(encodeReconciliationPlan(missingMirrorPlan())) as Record<string, unknown>
    const operations = raw.operations as Array<Record<string, unknown>>
    operations.push({
      kind: 'remove-managed-loop-section',
      target: 'LOOP.md',
      loop_id: 'loop-a',
      ownership: 'pipeline-loop-mirror-v1',
    })
    rehash(raw)

    const result = decodeReconciliationPlan(JSON.stringify(raw))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('contradictory')
  })
})
