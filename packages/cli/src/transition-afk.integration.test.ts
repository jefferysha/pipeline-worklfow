/**
 * 真实 e2e —— PM 默认流程在正常 `tenon transition` 完成 spec 后自动交给 AFK 队列。
 *
 * 这不是 scheduler 测试：断言的是 CLI adapter 真调用 post-commit 编排、真实 canonical state
 * 写入 queued，且默认 L1 只挂队不自行启动 Docker/runner。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { freshHarness, rm, type Harness } from './integration-harness.js'

describe('真实 e2e —— PM spec-complete 自动 AFK 挂队', () => {
  let h: Harness

  beforeEach(async () => {
    h = await freshHarness()
  })

  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('正常 CLI 转换提交 spec -> build 后，PM 的独立 policy 真写 automation=queued', async () => {
    await mkdir(join(h.cwd, '.pipeline'), { recursive: true })
    await writeFile(
      join(h.cwd, '.pipeline', 'automation.json'),
      `${JSON.stringify({ version: 1, enabled: true, default_opt_in: true })}\n`,
      'utf8',
    )
    expect(await h.run(['init', 'pm-afk', '--track', 'pm', '--preset', 'full'])).toBe(0)
    await h.seedGovernedDocumentEvidence('pm-afk')
    // 此用例聚焦 post-commit AFK；用真实 canonical store 预置已经完成的 Spec/review receipt，
    // 不伪造 transition 的后置写入。
    await h.seedArtifact('pm-afk', 'phase', 'spec')
    await h.seedArtifact('pm-afk', 'review_gate_phase', 'spec')
    await h.seedArtifact('pm-afk', 'review_gate_status', 'approved')
    await h.seedArtifact('pm-afk', 'review_gate_event', 'spec-complete')
    await h.seedArtifact('pm-afk', 'review_requested_at', '2026-07-07T00:00:00Z')
    await h.seedArtifact('pm-afk', 'review_acknowledged_at', '2026-07-07T00:00:00Z')

    expect(await h.run(['transition', 'pm-afk', 'spec-complete'])).toBe(0)
    const state = await h.read('pm-afk')
    expect(state).toMatch(/^phase: build$/m)
    expect(state).toMatch(/^automation: queued$/m)
    expect(state).toMatch(/^automation_queued_at: 2026-07-07T00:00:00Z$/m)
    expect(h.err.join('\n')).toContain('已由 spec-complete 自动挂队')
  })

  test('普通 frontend 默认流程仍完成 spec -> build，绝不被 PM 的自动 AFK 策略劫持', async () => {
    expect(await h.run(['init', 'frontend-normal', '--track', 'frontend', '--preset', 'full'])).toBe(0)
    await h.seedGovernedDocumentEvidence('frontend-normal')
    await h.seedArtifact('frontend-normal', 'phase', 'spec')
    await h.seedArtifact('frontend-normal', 'review_gate_phase', 'spec')
    await h.seedArtifact('frontend-normal', 'review_gate_status', 'approved')
    await h.seedArtifact('frontend-normal', 'review_gate_event', 'spec-complete')
    await h.seedArtifact('frontend-normal', 'review_requested_at', '2026-07-07T00:00:00Z')
    await h.seedArtifact('frontend-normal', 'review_acknowledged_at', '2026-07-07T00:00:00Z')
    await h.seedArtifact('frontend-normal', 'plan', 'docs/superpowers/plans/frontend-normal.md')

    expect(await h.run(['transition', 'frontend-normal', 'spec-complete'])).toBe(0)
    const state = await h.read('frontend-normal')
    expect(state).toMatch(/^phase: build$/m)
    expect(state).toMatch(/^automation: off$/m)
    expect(h.err.join('\n')).not.toContain('自动挂队')
  })
})
