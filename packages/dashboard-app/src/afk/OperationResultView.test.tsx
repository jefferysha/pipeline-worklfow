import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { OperationResponse } from '../api/client'
import { OperationResultView } from './OperationResultView'

function renderResult(result: unknown, command = ['tenon', 'triage'], onOpenChange?: (name: string) => void): void {
  const response: OperationResponse = { ok: true, exit_code: 0, command, result, stdout: JSON.stringify(result), stderr: '' }
  render(<I18nProvider><OperationResultView response={response} onOpenChange={onOpenChange} /></I18nProvider>)
}

describe('OperationResultView 结构化生产结果', () => {
  it('Triage 显示页/观察/Run/checkpoint，不把 JSON 当主界面', () => {
    renderResult({
      command: 'triage', pagesProcessed: 2, observationsProcessed: 7,
      workflowRuns: { total: 1, created: 1, existing: 0, runs: [{ status: 'created', changeName: 'fix-ci', runId: 'run-1', workflowId: 'default', currentStep: 'open' }] },
      checkpoint: { sourceId: 'repo-head', actionKind: 'observe', commit: 'committed', hasMore: false, limitReached: false },
    })
    const card = screen.getByTestId('ops-result-triage')
    expect(card).toHaveTextContent('2')
    expect(card).toHaveTextContent('7')
    expect(card).toHaveTextContent('fix-ci')
    expect(card).toHaveTextContent('run-1')
    expect(card).toHaveTextContent('committed')
    expect(within(screen.getByTestId('ops-result')).queryByTestId('ops-result-raw')).toBeInTheDocument()
  })

  it('Sync 显示 plan operation、CAS precondition 与 blocker', () => {
    renderResult({
      command: 'loop-sync', mode: 'dry-run', status: 'planned', summary: { operations: 1, unsupported: 1, not_applicable: 0 },
      plan: {
        plan_id: 'plan-7',
        preconditions: { registry_epoch: { kind: 'sha256', value: 'abc' }, loop_doc_epoch: { kind: 'absent' } },
        operations: [{ kind: 'ensure-managed-loop-section', target: 'LOOP.md', loop_id: 'ci-loop' }],
        blockers: [{ reason: 'runtime-remediation-required', next_step: 'repair ledger', drift: { dimension: 'run_log' } }],
      },
    }, ['tenon', 'loops', 'sync'])
    const card = screen.getByTestId('ops-result-sync')
    expect(card).toHaveTextContent('plan-7')
    expect(card).toHaveTextContent('ensure-managed-loop-section')
    expect(card).toHaveTextContent('abc')
    expect(card).toHaveTextContent('repair ledger')
  })

  it('Run dry-run 主界面用中文解释计划，后端枚举与命令仅保留在原始诊断', () => {
    renderResult({
      dry_run: true, selector: 'ci-loop', matched: 1,
      previews: [{ loop_id: 'ci-loop', status: 'active', admission: 'allowed', level: 'L2', runner: 'codex', settlement: 'paused', reserved_tokens: { tokens: 8000, basis: 'budget.tokens_per_run' }, ledger_health: 'ok', skill_bundle: { status: 'ready', bundle_id: 'backend', blocking_reason: null } }],
    }, ['tenon', 'loops', 'run'])
    const card = screen.getByTestId('ops-result-run')
    expect(card).toHaveTextContent('ci-loop')
    expect(card).toHaveTextContent('规则 ci-loop')
    expect(card).toHaveTextContent('匹配 1 个任务')
    expect(card).toHaveTextContent('可运行')
    expect(card).toHaveTextContent('执行引擎 Codex')
    expect(card).toHaveTextContent('预计结果 暂停等待')
    expect(card).toHaveTextContent('预留预算 8000 令牌')
    expect(card).toHaveTextContent('账本 健康')
    expect(card).toHaveTextContent('技能包 就绪')
    expect(card).toHaveTextContent('backend')
    expect(card).not.toHaveTextContent('selector')
    expect(card).not.toHaveTextContent('matched')
    expect(card).not.toHaveTextContent('budget')
    expect(card).not.toHaveTextContent('ledger')
    expect(card).not.toHaveTextContent('skill bundle')
    expect(screen.getByTestId('ops-result')).toHaveTextContent('操作成功')
    expect(screen.getByTestId('ops-result-raw')).toHaveTextContent('tenon loops run')
  })

  it('阻止原因在摘要中转成用户可理解的中文，原始枚举只留在诊断区', () => {
    renderResult({
      dry_run: true, selector: 'paused-loop', matched: 1,
      previews: [{ loop_id: 'paused-loop', admission: 'blocked:loop-inactive', level: 'L1', runner: 'codex', settlement: 'paused', reserved_tokens: { tokens: 2000 }, ledger_health: 'ok', skill_bundle: { status: 'ready', bundle_id: 'frontend', blocking_reason: null } }],
    }, ['tenon', 'loops', 'run'])

    const card = screen.getByTestId('ops-result-run')
    expect(card).toHaveTextContent('被阻止 · 规则未启用')
    expect(card).not.toHaveTextContent('blocked:loop-inactive')
    expect(screen.getByTestId('ops-result-raw')).toHaveTextContent('blocked:loop-inactive')
  })

  it('Triage 的权威 changeName 可直接打开对应 Change 审计', () => {
    const onOpenChange = vi.fn()
    renderResult({
      command: 'triage', pagesProcessed: 1, observationsProcessed: 1,
      workflowRuns: { created: 1, existing: 0, runs: [{ status: 'created', changeName: 'fix-ci', runId: 'run-1', workflowId: 'default', currentStep: 'open' }] },
      checkpoint: { commit: 'committed' },
    }, ['tenon', 'triage'], onOpenChange)

    fireEvent.click(screen.getByTestId('ops-open-change-fix-ci'))
    expect(onOpenChange).toHaveBeenCalledWith('fix-ci')
  })

  it('H14 real-run 的权威 target.change 可直接打开对应 Change / Run 审计', () => {
    const onOpenChange = vi.fn()
    renderResult({
      dry_run: false, selector: 'ci-loop', selected: 1, ok: true,
      groups: [{
        level: 'L3',
        targets: [{ change: 'release-api', expectedLoopId: 'ci-loop', expectedAutonomyLevel: 'L3' }],
        result: { status: 'completed', report: { ok: true, entries: [{ change: 'release-api', disposition: 'settled', result: 'merged' }] } },
      }],
    }, ['tenon', 'loops', 'run'], onOpenChange)

    fireEvent.click(screen.getByTestId('ops-open-change-release-api'))
    expect(onOpenChange).toHaveBeenCalledWith('release-api')
  })

  it('中文结构化结果不泄漏 checkpoint/has more/plan/ops/unsupported/CAS 产品标签', () => {
    renderResult({
      command: 'triage', pagesProcessed: 1, observationsProcessed: 1,
      checkpoint: { sourceId: 'head', commit: 'committed', hasMore: true },
    })
    const triage = screen.getByTestId('ops-result-triage')
    expect(triage).toHaveTextContent('检查点')
    expect(triage).toHaveTextContent('仍有后续')
    expect(triage.textContent).not.toMatch(/\b(checkpoint|has more)\b/i)
  })

  it('英文结构化 Sync 标签使用同一当前语言且不混入中文', () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    renderResult({
      command: 'loop-sync', mode: 'dry-run', status: 'planned', summary: { operations: 1, unsupported: 1 },
      plan: {
        plan_id: 'plan-8',
        preconditions: { registry_epoch: { kind: 'sha256', value: 'abc' }, loop_doc_epoch: { kind: 'absent' } },
        operations: [],
        blockers: [],
      },
    }, ['tenon', 'loops', 'sync'])
    const card = screen.getByTestId('ops-result-sync')
    expect(card).toHaveTextContent('plan')
    expect(card).toHaveTextContent('Operations')
    expect(card).toHaveTextContent('Unsupported')
    expect(card.textContent).not.toMatch(/[\u3400-\u9fff]/u)
    localStorage.clear()
  })
})
