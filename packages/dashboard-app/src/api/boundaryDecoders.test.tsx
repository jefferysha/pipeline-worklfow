import { describe, expect, it } from 'vitest'
import { decodeSessionLinks, decodeTraceTimeline } from './auditDecoders'
import { decodeHooksConfig, decodeRouterPreview } from './governanceDecoders'
import { decodeLoopsSnapshot } from './loopDecoder'
import { decodeSnapshot } from './snapshotDecoder'
import { selectProgress } from '../model/progressModel'
import { workflowRulesFromSnapshot } from '../model/workflowModel'

describe('API bounded-context response decoders', () => {
  const validTraceTimeline = () => {
    const warnings: string[] = []
    return {
    generated_at: '2026-07-29T00:00:00.000Z',
    outbound: 'local-only',
    content: 'metadata-only',
    session: {
      id: 'sess-a',
      client: 'claude',
      proxy_mode: 'reverse',
      status: 'complete',
      started_at: '2026-07-29T00:00:00.000Z',
      updated_at: '2026-07-29T00:00:02.000Z',
    },
    total_count: 2,
    returned_count: 2,
    skipped_count: 0,
    truncated: false,
    integrity: 'complete',
    warnings,
    summary: {
      success_count: 1,
      error_count: 1,
      unknown_count: 0,
      total_duration_ms: 1600,
      input_tokens: 12,
      output_tokens: 8,
      cached_input_tokens: 0,
    },
    entries: [
      {
        sequence: 1,
        request_id: 'req-1',
        turn: 1,
        timestamp: '2026-07-29T00:00:01.000Z',
        duration_ms: 400,
        transport: 'sse',
        method: 'POST',
        path: '/v1/messages',
        status_code: 200,
        outcome: 'success',
        model: 'claude-sonnet-4',
        input_tokens: 12,
        output_tokens: 8,
        cached_input_tokens: 0,
        stream_event_count: 3,
      },
      {
        sequence: 2,
        request_id: null,
        turn: null,
        timestamp: null,
        duration_ms: 1200,
        transport: null,
        method: null,
        path: null,
        status_code: 429,
        outcome: 'error',
        model: null,
        input_tokens: null,
        output_tokens: null,
        cached_input_tokens: null,
        stream_event_count: null,
      },
    ],
    }
  }

  const validRules = {
    executionModel: 'step-graph',
    steps: ['open', 'done'],
    transitions: { open: [{ event: 'finish', to: 'done' }], done: [] },
    gateByStep: { open: null, done: null },
    labelByStep: { open: '开始', done: '完成' },
    outputsByStep: { open: ['result'], done: [] },
  }
  const validSnapshot = () => ({
    version: '1',
    generated_at: 'now',
    capabilities: { snapshot: true },
    project_count: 1,
    change_count: 1,
    projects: [{
      root: '/repo',
      ok: true,
      changes: [{
        name: 'demo',
        path: '/repo/openspec/changes/demo',
        phase: 'open',
        phase_status: 'in_progress',
        track: 'backend',
        preset: 'full',
        archived: 'false',
        updated_at: 'now',
        fields: {},
        workflowPlanFingerprint: 'a'.repeat(64),
        workflowRules: structuredClone(validRules),
        workflowExecution: {
          readinessByTransition: {
            open: {
              finish: {
                ready: false,
                blockers: [{
                  kind: 'guard-failed',
                  guardType: 'field-nonempty',
                  field: 'result',
                  actual: '',
                }],
              },
            },
            done: {},
          },
        },
      }],
    }],
  })

  it('rejects Hook config keyword strings outside the shared empty-or-ASCII-token contract', () => {
    const base = {
      hooks: [],
      matrix: {},
    }
    expect(decodeHooksConfig({ ...base, prompt_skip_keyword: '' })?.promptSkipKeyword).toBe('')
    expect(decodeHooksConfig({ ...base, prompt_skip_keyword: 'skip_Tenon-2' })?.promptSkipKeyword)
      .toBe('skip_Tenon-2')
    for (const invalid of ['bad value', '-leading', 'a'.repeat(33), '中文']) {
      expect(decodeHooksConfig({ ...base, prompt_skip_keyword: invalid })).toBeNull()
    }
  })

  it('rejects a snapshot with a malformed nested todo item', () => {
    expect(decodeSnapshot({
      version: '1',
      generated_at: 'now',
      capabilities: { snapshot: true },
      project_count: 1,
      change_count: 1,
      projects: [{
        root: '/repo',
        ok: true,
        changes: [{
          name: 'demo',
          path: '/repo/openspec/changes/demo',
          phase: 'build',
          phase_status: 'in_progress',
          track: 'backend',
          preset: 'full',
          archived: 'false',
          updated_at: 'now',
          fields: {},
          todo: {
            hasTaskSource: true,
            stages: [{ id: 'build', label: 'Build', status: 'current', tasks: [{ text: 42, completed: false }] }],
          },
        }],
      }],
    })).toBeNull()
  })

  it('preserves governed loop telemetry after validating every rendered field', () => {
    const decoded = decodeLoopsSnapshot({
      generated_at: 'now',
      rows: [{
        root: '/repo',
        id: 'daily',
        name: 'Daily',
        autonomy_level: 'L2',
        status: 'active',
        cadence: 'daily',
        goal: 'ship',
        design_doc: 'docs/design.md',
        change_prefix: null,
        risk: 'medium',
        runner: 'codex',
        human_gates: [],
        kill_criteria: [],
        allowlist: [],
        denylist: [],
        budget_decl: {
          max_runs_per_day: 2,
          max_in_flight: 1,
          on_exceed: 'skip',
          max_tokens_per_day: 1000,
        },
        readiness: { score: 90, band: 'ready' },
        budget: {
          breaker: 'ok',
          runsToday: 1,
          spentToday: 10,
          remaining: 990,
          hasBudget: true,
          maxTokensPerDay: 1000,
        },
        matched_changes: ['daily-1'],
        phases: ['build'],
        draft: false,
        template_id: 'daily',
        template_version: 1,
        workflow_id: 'default',
        skill_bundle_id: 'backend',
        ledger: {
          health: 'ok',
          rejected_records: 0,
          admission_enforced: true,
          inflight_enforced: true,
          runs_today: 1,
          in_flight: 0,
          activated_in_flight: 0,
          settled_tokens_actual: 10,
          settled_tokens_estimated: 0,
          reserved_tokens: 0,
          remaining_tokens: 990,
          last_result: 'merged',
          last_finished_at: 'now',
        },
        graduation: {
          id: 'daily',
          current: 'L2',
          recommended: 'L3',
          enforcement: 'review',
          canGraduate: true,
          blockers: [],
          demotionReason: null,
          demotionSignals: [],
          readinessScore: 90,
          readinessBand: 'ready',
          driftCount: 0,
          breaker: 'ok',
          failStreak: 0,
          runs: 5,
        },
      }],
    })
    expect(decoded?.rows[0]?.ledger?.settled_tokens_actual).toBe(10)
    expect(decoded?.rows[0]?.graduation?.recommended).toBe('L3')
    expect(decoded?.rows[0]?.template_id).toBe('daily')
  })

  it('rejects a router preview whose nested track policy is incomplete', () => {
    expect(decodeRouterPreview({
      ok: true,
      revision: '1',
      source: 'project-file',
      winner: null,
      candidates: [{
        track: { id: 'backend', label: 'Backend', builtin: true, workflow: { default: 'default', allowed: '*' } },
        order: 0,
        priority: 1,
        score: 1,
        routable: true,
        excluded: false,
      }],
      suppressed_reason: null,
    })).toBeNull()
  })

  it('rejects malformed session-link rows instead of partially trusting the envelope', () => {
    expect(decodeSessionLinks({
      links: {
        'demo@/repo': { found: true, resumeCmd: 42 },
      },
    })).toBeNull()
  })

  it('accepts the exact metadata-only trace timeline contract', () => {
    expect(decodeTraceTimeline(validTraceTimeline())).toEqual(validTraceTimeline())
  })

  it('fails closed when trace disclosure literals, enums, or nullable counters drift', () => {
    const disclosureDrift = validTraceTimeline()
    disclosureDrift.content = 'raw'
    expect(decodeTraceTimeline(disclosureDrift)).toBeNull()

    const invalidOutcome = validTraceTimeline()
    invalidOutcome.entries[0]!.outcome = 'model-success'
    expect(decodeTraceTimeline(invalidOutcome)).toBeNull()

    const invalidCounter = validTraceTimeline()
    invalidCounter.entries[0]!.input_tokens = -1
    expect(decodeTraceTimeline(invalidCounter)).toBeNull()

    const queryLeak = validTraceTimeline()
    queryLeak.entries[0]!.path = '/v1/messages?api_key=sentinel'
    expect(decodeTraceTimeline(queryLeak)).toBeNull()
  })

  it('rejects inconsistent trace window counts and unknown warning codes', () => {
    const inconsistent = validTraceTimeline()
    inconsistent.returned_count = 3
    expect(decodeTraceTimeline(inconsistent)).toBeNull()

    const unknownWarning = validTraceTimeline()
    unknownWarning.integrity = 'partial'
    unknownWarning.warnings = ['secret-leak']
    expect(decodeTraceTimeline(unknownWarning)).toBeNull()
  })

  it('rejects trace ordering, outcome, size, and integrity drift', () => {
    const unordered = validTraceTimeline()
    unordered.entries[1]!.sequence = 1
    expect(decodeTraceTimeline(unordered)).toBeNull()

    const mismatchedOutcome = validTraceTimeline()
    mismatchedOutcome.entries[0]!.outcome = 'error'
    expect(decodeTraceTimeline(mismatchedOutcome)).toBeNull()

    const informationalOutcome = validTraceTimeline()
    informationalOutcome.entries[0]!.status_code = 101
    expect(decodeTraceTimeline(informationalOutcome)).toBeNull()

    const oversized = validTraceTimeline()
    oversized.entries = Array.from({ length: 201 }, (_, index) => ({
      ...oversized.entries[0]!,
      sequence: index + 1,
    }))
    oversized.returned_count = 201
    oversized.total_count = 201
    oversized.summary.success_count = 201
    oversized.summary.error_count = 0
    expect(decodeTraceTimeline(oversized)).toBeNull()

    const impossibleIntegrity = validTraceTimeline()
    impossibleIntegrity.warnings = ['malformed-record']
    expect(decodeTraceTimeline(impossibleIntegrity)).toBeNull()
  })

  it('rejects frozen workflow graphs whose edge target is outside the step set', () => {
    const snapshot = validSnapshot()
    snapshot.projects[0].changes[0].workflowRules.transitions.open[0]!.to = 'ghost'
    expect(decodeSnapshot(snapshot)).toBeNull()
  })

  it('rejects workflow label maps missing a frozen step key', () => {
    const snapshot = validSnapshot()
    delete (snapshot.projects[0].changes[0].workflowRules.labelByStep as Record<string, string>).done

    expect(decodeSnapshot(snapshot)).toBeNull()
  })

  it('rejects transition readiness with duplicate blockers', () => {
    const snapshot = validSnapshot()
    const blocker = snapshot.projects[0].changes[0].workflowExecution
      .readinessByTransition.open.finish.blockers[0]!
    snapshot.projects[0].changes[0].workflowExecution
      .readinessByTransition.open.finish.blockers.push(structuredClone(blocker))
    expect(decodeSnapshot(snapshot)).toBeNull()
  })

  it('rejects transition readiness whose event keys drift from the frozen graph', () => {
    const snapshot = validSnapshot()
    const byEvent = snapshot.projects[0].changes[0].workflowExecution
      .readinessByTransition.open as Record<string, { ready: boolean; blockers: unknown[] }>
    delete byEvent.finish
    byEvent.ghost = { ready: true, blockers: [] }
    expect(decodeSnapshot(snapshot)).toBeNull()
  })

  it('rejects readiness that claims ready while retaining a blocker', () => {
    const snapshot = validSnapshot()
    snapshot.projects[0].changes[0].workflowExecution.readinessByTransition.open.finish.ready = true
    expect(decodeSnapshot(snapshot)).toBeNull()
  })

  it('rejects a Change whose phase is outside its frozen workflow steps', () => {
    const snapshot = validSnapshot()
    snapshot.projects[0].changes[0].phase = 'ghost'

    expect(decodeSnapshot(snapshot)).toBeNull()
  })

  it('rejects structurally different workflow rules sharing one fingerprint in the same project', () => {
    const snapshot = validSnapshot()
    const collision = structuredClone(snapshot.projects[0].changes[0])
    collision.name = 'collision'
    collision.workflowRules.transitions.open[0]!.event = 'complete'
    snapshot.projects[0].changes.push(collision)
    snapshot.change_count = 2

    expect(decodeSnapshot(snapshot)).toBeNull()
  })

  it('accepts track-effective required outputs that differ under one immutable plan fingerprint', () => {
    const snapshot = validSnapshot()
    const gates = snapshot.projects[0].changes[0].workflowRules.gateByStep as Record<
      string,
      'review' | 'confirm' | null
    >
    gates.open = 'review'
    const pm = structuredClone(snapshot.projects[0].changes[0])
    pm.name = 'pm'
    pm.track = 'pm'
    pm.workflowExecution.readinessByTransition.open.finish = { ready: true, blockers: [] }
    snapshot.projects[0].changes.push(pm)
    snapshot.change_count = 2

    const decoded = decodeSnapshot(snapshot)
    expect(decoded).not.toBeNull()
    expect(decoded?.projects[0]?.changes.map((change) => [
      change.track,
      change.workflowExecution.readinessByTransition.open.finish,
    ])).toEqual([
      ['backend', {
        ready: false,
        blockers: [{
          kind: 'guard-failed',
          guardType: 'field-nonempty',
          field: 'result',
          actual: '',
        }],
      }],
      ['pm', { ready: true, blockers: [] }],
    ])
    const selection = selectProgress(decoded, '/repo', workflowRulesFromSnapshot(decoded))
    expect(new Map(selection.groups[0]?.rows.map((row) => [row.change.track, row.state]))).toEqual(
      new Map([['backend', 'agent'], ['pm', 'gate']]),
    )
  })
})
