import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { RunAuditPanel } from './RunAuditPanel'

const DETAIL = {
  ok: true,
  root: '/repo',
  change: 'change-a',
  source: 'canonical',
  projection: { status: 'current', revisionId: 'revision-2' },
  workflow_run: {
    id: 'run-1', workflow_id: 'release-train', current_step: 'verify', lifecycle: 'active',
    transition_sequence: 2, transition_head: 'record-2', created_at: '2026-07-19T00:00:00Z',
    updated_at: '2026-07-19T00:10:00Z', policy_id: 'loop-1', policy_version: 'p'.repeat(64),
    loop_id: 'loop-1', iteration_id: 'iteration-3',
    automation_policy: {
      schema_version: 1, policy_id: 'loop-1', policy_version: 'p'.repeat(64), loop_id: 'loop-1',
      goal: 'Keep release verification deterministic', skill_bundle_id: 'backend', captured_at: '2026-07-19T00:10:00Z',
      constraints: { schema_version: 1, admission: { require_active: true }, write: { allowlist: ['src/**'], denylist: ['secrets/**'] }, transition: { require_active: true, human_gates: ['verify'] }, merge: { require_active: true, allowlist: ['src/**'], denylist: ['secrets/**'] } },
      budget: { max_runs_per_day: 4, max_in_flight: 1, max_tokens_per_day: 10000, on_exceed: 'pause-loop' },
      kill_policy: { required_status: 'active', on_inactive: 'skip-run', recheck: ['schedule', 'pre-claim', 'transition', 'settlement'] },
      verifier_binding: { kind: 'runtime-verifier', verifier: 'pipeline-git-integrity', version: '1' },
    },
  },
  current_revision: { revision: 2, revisionId: 'revision-2', stateDigest: 'd'.repeat(64), mutation: { kind: 'transition' } },
  revisions: [
    { revision: 0, revisionId: 'revision-0', stateDigest: 'a'.repeat(64), mutation: { kind: 'init' } },
    { revision: 1, revisionId: 'revision-1', previousRevisionId: 'revision-0', stateDigest: 'b'.repeat(64), mutation: { kind: 'transition', observedAt: '2026-07-19T00:05:00Z', transitionRecordId: 'record-1' } },
    { revision: 2, revisionId: 'revision-2', previousRevisionId: 'revision-1', stateDigest: 'd'.repeat(64), mutation: { kind: 'transition', observedAt: '2026-07-19T00:10:00Z', transitionRecordId: 'record-2' } },
  ],
  transitions: [
    { id: 'record-1', runId: 'run-1', sequence: 1, event: 'draft-done', from: 'draft', to: 'review', observedAt: '2026-07-19T00:05:00Z', effects: [] },
    { id: 'record-2', runId: 'run-1', sequence: 2, event: 'review-approved', from: 'review', to: 'verify', observedAt: '2026-07-19T00:10:00Z', effects: [{ kind: 'state-field-change', field: 'phase', from: 'review', to: 'verify' }, { kind: 'state-field-change', field: 'phase_status', from: 'pending', to: 'in_progress' }] },
  ],
  attempt_contexts: [{
    record_id: 'reservation-record', recorded_at: '2026-07-19T00:10:00Z',
    reservation_id: 'reservation-1', attempt_id: 'attempt-1', iteration_id: 'iteration-3', loop_id: 'loop-1',
    source_run_record_ids: ['terminal-old-1', 'terminal-old-2', 'terminal-old-3'],
    omitted_attempt_ids: ['attempt-old-0'],
    rendered: 'attempt-old-1: tests failed\nattempt-old-2: tests failed\nattempt-old-3: tests failed',
    stagnation: {
      stagnant: true, fingerprint: 'e'.repeat(64),
      repeated_attempt_ids: ['attempt-old-1', 'attempt-old-2', 'attempt-old-3'],
    },
  }],
  ledger: {
    health: 'ok', rejected: [], records: [
      {
        kind: 'budget-reservation', record_id: 'reservation-record', recorded_at: '2026-07-19T00:10:00Z',
        reservation_id: 'reservation-1', attempt_id: 'attempt-1', iteration_id: 'iteration-3', loop_id: 'loop-1', change: 'change-a',
        budget_day: '2026-07-19', reserved_runs: 1, reserved_tokens: 2000, token_basis: 'risk-default',
        limits_snapshot: { max_runs_per_day: 4, max_in_flight: 1, max_tokens_per_day: 10000, on_exceed: 'pause-loop' },
        expires_at: '2026-07-19T01:10:00Z',
      },
      {
        kind: 'usage', record_id: 'usage-record', recorded_at: '2026-07-19T00:11:00Z', usage_id: 'usage-1',
        attempt_id: 'attempt-1', loop_id: 'loop-1', provider: 'openai-codex', model: 'gpt-5-codex',
        request_id: 'req-codex-42',
        tokens: { input: 1200, output: 300, cached_input: 200, reasoning: 80, total: 1500 }, source: 'provider-structured',
      },
      {
        kind: 'skill-bundle-snapshot', record_id: 'skill-record', recorded_at: '2026-07-19T00:11:30Z',
        attempt_id: 'attempt-1', reservation_id: 'reservation-1', loop_id: 'loop-1', skill_bundle_id: 'backend',
        policy_epoch: 'epoch-1', resolution_source: 'custom', workflow_run_id: 'run-1', workflow: 'release-train',
        step: 'verify', track: 'backend', coordinate_digest: 'c'.repeat(64), snapshot_sha256: 's'.repeat(64),
        cas_relative_path: '.pipeline/loops/skill-snapshots/sha256/snapshot',
        slots: [{ token: 'verify|review', alternatives: ['verify', 'review'], concrete_skill_id: 'verify', tree_sha256: 't'.repeat(64) }],
      },
      {
        kind: 'run', record_id: 'terminal-record', recorded_at: '2026-07-19T00:12:00Z', run_record_id: 'terminal-1',
        attempt_id: 'attempt-1', reservation_id: 'reservation-1', loop_id: 'loop-1', change: 'change-a', workflow_run_id: 'run-1', level: 'L3',
        runner: 'codex', image: 'sandcastle:local', admitted_at: '2026-07-19T00:10:00Z', finished_at: '2026-07-19T00:12:00Z',
        result: 'paused', reason: 'verify-fail', usage_record_ids: ['usage-1'],
        artifacts: {
          build_sha: 'f'.repeat(40), build_sha_source: 'named-branch-head',
          branch: 'sandcastle-pipeline/change-a', commit_shas: ['e'.repeat(40), 'f'.repeat(40)],
        },
        accounting: { reserved_tokens: 2000, charged_tokens: 1500, charge_source: 'provider-structured' },
        verification: {
          verification_id: 'verification-1', verdict: 'failed', evaluated_at: '2026-07-19T00:12:00Z',
          subject: { workflow_run_id: 'run-1', attempt_id: 'attempt-1', change: 'change-a', revision: { kind: 'named-branch-head', sha: 'f'.repeat(40) } },
          binding: { kind: 'runtime-verifier', verifier: 'pipeline-git-integrity', version: '1' },
          issuer: { kind: 'host-verifier', verifier: 'pipeline-git-integrity', version: '1', trusted: true },
          evidence: [{ kind: 'command-result', command_id: 'git-integrity', exit_code: 1 }],
        },
      },
    ],
  },
}

function renderPanel(): void {
  render(<I18nProvider><RunAuditPanel root="/repo" change="change-a" refreshKey="verify" /></I18nProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('RunAuditPanel · 用户只看到真实且可行动的运行记录', () => {
  it('用中文展示当前工作流、阶段、更新时间和真实来源，不暴露内部标识', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify(DETAIL), { status: 200 })) as unknown as typeof fetch
    renderPanel()
    const panel = await screen.findByTestId('run-audit')
    expect(panel).toHaveAttribute('data-source', 'canonical')
    expect(panel).toHaveTextContent('系统记录')
    expect(panel).toHaveTextContent('工作流')
    expect(panel).toHaveTextContent('release-train')
    expect(panel).toHaveTextContent('当前阶段')
    expect(panel).toHaveTextContent('验证')
    expect(panel).toHaveTextContent('第 2 版')
    expect(panel).toHaveTextContent('2026年07月19日 00:10:00')
    expect(panel).not.toHaveTextContent('run-1')
    expect(panel).not.toHaveTextContent('revision-2')
    expect(panel).not.toHaveTextContent('attempt-1')
    expect(panel).not.toHaveTextContent('reservation-1')
  })

  it('只呈现用户关心的执行结果、代码产出、验证证据、技能和用量', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify(DETAIL), { status: 200 })) as unknown as typeof fetch
    renderPanel()
    const panel = await screen.findByTestId('run-audit')
    expect(within(panel).getByTestId('run-audit-execution')).toHaveTextContent('已暂停')
    expect(within(panel).getByTestId('run-audit-execution')).toHaveTextContent('sandcastle-pipeline/change-a')
    expect(within(panel).getByTestId('run-audit-execution')).toHaveTextContent('构建基线')
    expect(within(panel).getByTestId('run-audit-execution')).toHaveTextContent('2 个提交')
    expect(within(panel).getByTestId('run-audit-verification')).toHaveTextContent('未通过')
    expect(within(panel).getByTestId('run-audit-verification')).toHaveTextContent('命令检查未通过')
    expect(within(panel).getByTestId('run-audit-skills')).toHaveTextContent('backend')
    expect(within(panel).getByTestId('run-audit-skills')).toHaveTextContent('verify')
    expect(within(panel).getByTestId('run-audit-usage')).toHaveTextContent('1,500 tokens')
    expect(panel).not.toHaveTextContent('request req-codex-42')
    expect(panel).not.toHaveTextContent('tree tttttttt')
    expect(panel).not.toHaveTextContent('usage-record')
  })

  it('阶段流转只显示中文结果，不显示事件名、哈希和内部因果标识', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify(DETAIL), { status: 200 })) as unknown as typeof fetch
    renderPanel()
    const transitions = await screen.findByTestId('run-audit-transitions')
    expect(transitions).toHaveTextContent('初稿 → 复核')
    expect(transitions).toHaveTextContent('复核 → 验证')
    expect(transitions).not.toHaveTextContent('review-approved')
    expect(transitions).not.toHaveTextContent('record-2')
  })

  it('兼容来源、投影漂移和账本损坏只显示可行动的中文提醒', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      ...DETAIL,
      source: 'legacy',
      projection: { status: 'drift', reason: 'digest mismatch' },
      ledger: { ...DETAIL.ledger, health: 'degraded', rejected: [{ line: 4, raw_hash: 'badbadbadbad', error: 'bad json shape' }] },
    }), { status: 200 })) as unknown as typeof fetch
    renderPanel()
    const panel = await screen.findByTestId('run-audit')
    expect(panel).toHaveTextContent('兼容记录')
    expect(screen.getByTestId('run-audit-source-alert')).toHaveTextContent('可能不是最新版本')
    expect(screen.getByTestId('run-audit-projection-alert')).toHaveTextContent('进度数据不同步')
    expect(screen.getByTestId('run-audit-ledger-alert')).toHaveTextContent('1 条运行记录无法读取')
    expect(panel).not.toHaveTextContent('digest mismatch')
    expect(panel).not.toHaveTextContent('badbadbadbad')
  })

  it('HTTP 失败显式报错，不伪装成没有运行记录', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'canonical current 损坏' }), { status: 500 })) as unknown as typeof fetch
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('run-audit-error')).toHaveTextContent('canonical current 损坏'))
  })
})
