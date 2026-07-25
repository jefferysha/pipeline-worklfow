import { describe, expect, it } from 'vitest'
import { decodeSessionLinks } from './auditDecoders'
import { decodeRouterPreview } from './governanceDecoders'
import { decodeLoopsSnapshot } from './loopDecoder'
import { decodeSnapshot } from './snapshotDecoder'

describe('API bounded-context response decoders', () => {
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
})
