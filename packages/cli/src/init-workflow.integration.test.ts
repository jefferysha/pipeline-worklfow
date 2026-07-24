/**
 * 真实 e2e —— `pipeline init --workflow <name>`（whole-branch review 补：此前没有任何
 * 支持的命令能把一个 change 摆到自定义 workflow 的首个 step 上，除非该 step 恰好叫
 * `open`——`pipeline set <name> phase <custom-id>` 被 manifest 派生的 7 相位枚举挡下，
 * `transition-custom-workflow.integration.test.ts` / `internal-skill-gate-hook.integration.
 * test.ts` 都不得不用手改 .pipeline.yaml 的 phase 行来搭测试夹具）。
 *
 * 零 mock：真 harness（真 buildProgram + 真临时项目 + 真 kernel store）+ 真在磁盘落一份
 * `.pipeline/workflows/<name>.yaml` + 真跑 `pipeline init --workflow <name>`，断言真落盘的
 * workflow/phase 字段，并链式验证创建出的 change 立即可被其它真实命令（internal-skill-gate/
 * transition）消费，不需要任何手工改写状态文件。
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { freshHarness, rm, type Harness } from './integration-harness.js'

const TWO_STEP_WF = `name: onboarding
steps:
  - id: intake
    label: intake
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: complete
        to: done
  - id: done
    label: done
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions: []
`

describe('真实 e2e —— init --workflow 落地自定义 workflow 的首个 step', () => {
  let h: Harness

  beforeEach(async () => {
    h = await freshHarness()
  })

  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  async function seedWorkflow(name: string, yaml: string): Promise<void> {
    const wfDir = join(h.cwd, '.pipeline', 'workflows')
    await mkdir(wfDir, { recursive: true })
    await writeFile(join(wfDir, `${name}.yaml`), yaml, 'utf8')
  }

  test('省略 --workflow：workflow=default、phase=open（零回归，逐字对齐此前行为）', async () => {
    expect(await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])).toBe(0)
    const content = await h.read('demo')
    expect(content).toMatch(/^workflow: default$/m)
    expect(content).toMatch(/^phase: open$/m)
    // state-first CLI init 也必须留下 OpenSpec 继续点；正常入口中 richer openspec-propose 若已先
    // 写这些文件，repository 的 wx scaffold 会保留它们，这里覆盖无 OpenSpec skill 的恢复路径。
    expect(await h.readIn('demo', 'proposal.md')).toContain('# Proposal')
    expect(await h.readIn('demo', 'design.md')).toContain('# Design')
    expect(await h.readIn('demo', 'tasks.md')).toContain('- [ ]')
  })

  test('simple Track 默认绑定内建 simple workflow，从 change 开始且不生成完整 OpenSpec 文档链', async () => {
    expect(await h.run(['init', 'tiny-fix', '--track', 'simple', '--preset', 'tweak'])).toBe(0)
    const content = await h.read('tiny-fix')
    expect(content).toMatch(/^workflow: simple$/m)
    expect(content).toMatch(/^phase: change$/m)
    await expect(h.readIn('tiny-fix', 'proposal.md')).rejects.toThrow()
    await expect(h.readIn('tiny-fix', 'tasks.md')).rejects.toThrow()
  })

  test('free/default 是完整七阶段 Change，但不继承标准 Track policy', async () => {
    expect(await h.run(['init', 'free-default', '--track', 'free', '--preset', 'full'])).toBe(0)
    const content = await h.read('free-default')
    expect(content).toMatch(/^track: free$/m)
    expect(content).toMatch(/^workflow: default$/m)
    expect(content).toMatch(/^phase: open$/m)
    expect(await h.readIn('free-default', 'proposal.md')).toContain('# Proposal')
    expect(await h.readIn('free-default', 'design.md')).toContain('# Design')
    expect(await h.readIn('free-default', 'tasks.md')).toContain('- [ ]')
    expect(await h.run(['set', 'free-default', 'automation', 'queued'])).toBe(0)
    expect(await h.run(['afk', 'enqueue', 'free-default'])).toBe(3)
  })

  test('free/default 可从 Open 完整推进到 Archive，且不要求工程双 review 或 PR URL', async () => {
    const name = 'free-lifecycle'
    expect(await h.run(['init', name, '--track', 'free', '--preset', 'full'])).toBe(0)
    await h.seedGovernedDocumentEvidence(name)
    await h.seedArtifact(name, 'design_doc', `openspec/changes/${name}/design.md`)
    await h.seedArtifact(name, 'plan', `docs/superpowers/plans/${name}.md`)
    await h.seedArtifact(name, 'verification_report', `docs/superpowers/reports/${name}.md`)

    expect(await h.run(['transition', name, 'open-complete'])).toBe(0)
    expect(await h.run(['review', 'request', name, '--event', 'explore-complete'])).toBe(0)
    expect(await h.run(['review', 'acknowledge', name])).toBe(0)
    expect(await h.run(['transition', name, 'explore-complete'])).toBe(0)
    expect(await h.run(['review', 'request', name, '--event', 'spec-complete'])).toBe(0)
    expect(await h.run(['review', 'acknowledge', name])).toBe(0)
    expect(await h.run(['transition', name, 'spec-complete'])).toBe(0)

    expect(await h.run(['set-many', name, 'build_mode=direct', 'isolation=worktree', 'direct_override=true'])).toBe(0)
    expect(await h.run(['transition', name, 'build-complete'])).toBe(0)
    expect(await h.run(['set', name, 'branch_status', 'handled'])).toBe(0)
    expect(
      await h.run(['review', 'request', name, '--event', 'verify-pass']),
      h.err.join('\n'),
    ).toBe(0)
    expect(await h.run(['review', 'acknowledge', name])).toBe(0)
    expect(await h.run(['transition', name, 'verify-pass'])).toBe(0)

    expect(await h.run(['transition', name, 'ship-complete'])).toBe(0)
    expect(await h.run(['transition', name, 'archived'])).toBe(0)
    const completed = await h.read(name)
    expect(completed).toMatch(/^track: free$/m)
    expect(completed).toMatch(/^phase: archive$/m)
    expect(completed).toMatch(/^verify_result: pass$/m)
    expect(completed).toMatch(/^agent_review_result: pending$/m)
    expect(completed).toMatch(/^codex_review_result: pending$/m)
    expect(completed).toMatch(/^pr_url: null$/m)
    expect(completed).toMatch(/^archived: true$/m)
  })

  test('simple workflow 完整生命周期可验证后结束；范围扩大走独立 escalated 终态', async () => {
    expect(await h.run(['init', 'tiny-done', '--track', 'simple', '--preset', 'tweak'])).toBe(0)
    expect(await h.run(['transition', 'tiny-done', 'change-complete'])).toBe(2)
    expect((await h.read('tiny-done'))).toMatch(/^phase: change$/m)
    await appendFile(
      join(h.cwd, 'openspec', 'changes', 'tiny-done', '.pipeline-history.jsonl'),
      `${JSON.stringify({ ts: '2026-07-24T00:00:00Z', kind: 'tool', raw: 'Skill: simple-task' })}\n`,
      'utf8',
    )
    expect(await h.run(['transition', 'tiny-done', 'change-complete'])).toBe(0)
    expect((await h.read('tiny-done'))).toMatch(/^phase: verify$/m)
    expect(await h.run(['transition', 'tiny-done', 'verify-pass'])).toBe(2)
    await appendFile(
      join(h.cwd, 'openspec', 'changes', 'tiny-done', '.pipeline-history.jsonl'),
      `${JSON.stringify({ ts: '2026-07-24T00:01:00Z', kind: 'tool', raw: 'Skill: verification-before-completion' })}\n`,
      'utf8',
    )
    expect(await h.run(['transition', 'tiny-done', 'verify-pass'])).toBe(0)
    const completed = await h.read('tiny-done')
    expect(completed).toMatch(/^phase: done$/m)
    expect(completed).toMatch(/^verify_result: pass$/m)

    expect(await h.run(['init', 'tiny-expanded', '--track', 'simple', '--preset', 'tweak'])).toBe(0)
    await appendFile(
      join(h.cwd, 'openspec', 'changes', 'tiny-expanded', '.pipeline-history.jsonl'),
      `${JSON.stringify({ ts: '2026-07-24T00:02:00Z', kind: 'tool', raw: 'Skill: simple-task' })}\n`,
      'utf8',
    )
    expect(await h.run(['transition', 'tiny-expanded', 'scope-expanded'])).toBe(0)
    expect((await h.read('tiny-expanded'))).toMatch(/^phase: escalated$/m)
  }, 15_000)

  test('--workflow onboarding：真落 workflow=onboarding + phase=intake（workflow 首个 step 的 id，不是硬编码 open）', async () => {
    await seedWorkflow('onboarding', TWO_STEP_WF)
    expect(await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full', '--workflow', 'onboarding'])).toBe(0)
    const content = await h.read('demo')
    expect(content).toMatch(/^workflow: onboarding$/m)
    expect(content).toMatch(/^phase: intake$/m)
  })

  test('free 可绑定任意已存在的自定义 Workflow，并从其真实首 Step 开始', async () => {
    await seedWorkflow('onboarding', TWO_STEP_WF)
    expect(await h.run(['init', 'free-custom', '--track', 'free', '--preset', 'full', '--workflow', 'onboarding'])).toBe(0)
    const content = await h.read('free-custom')
    expect(content).toMatch(/^track: free$/m)
    expect(content).toMatch(/^workflow: onboarding$/m)
    expect(content).toMatch(/^phase: intake$/m)
    expect(await h.run(['internal-skill-gate', 'free-custom', 'anything'])).toBe(0)
  })

  test('--workflow 指向不存在的文件：exit 1，不落盘任何 change 目录（先校验后创建，不留半成品）', async () => {
    const code = await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full', '--workflow', 'ghost'])
    expect(code).toBe(1)
    expect(h.err.join('\n')).toContain("workflow 'ghost' 未找到")
    await expect(h.read('demo')).rejects.toThrow()
  })

  test('--workflow 指向非法 workflow（transitions.to 指向不存在的 step）：exit 1，不落盘（E5 保存时校验在 init 这一步同样生效，非法 workflow 不会先创建 change 再报错）', async () => {
    await seedWorkflow(
      'broken',
      `name: broken
steps:
  - id: s1
    label: x
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: go
        to: does-not-exist
`,
    )
    const code = await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full', '--workflow', 'broken'])
    expect(code).toBe(1)
    expect(h.err.join('\n')).toContain('does-not-exist')
    await expect(h.read('demo')).rejects.toThrow()
  })

  test('端到端链式验证：init --workflow 创建的 change 立即可被 internal-skill-gate 消费，不需要任何手工改写状态文件', async () => {
    await seedWorkflow('onboarding', TWO_STEP_WF)
    expect(await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full', '--workflow', 'onboarding'])).toBe(0)
    // internal-skill-gate 对 skills:[] 的 step 一律放行（opt-in 语义）——只是验证它能读到正确
    // 的 workflow/phase 组合并找到 step，而不是报 "step 不在 workflow 里"。
    const code = await h.run(['internal-skill-gate', 'demo', 'anything'])
    expect(code).toBe(0)
    expect(h.err.join('\n')).not.toContain('不在 workflow')
  })

  test('端到端链式验证：init --workflow 创建的 change 立即可被 transition 真推进（真实 event 名，无需手改 phase）', async () => {
    await seedWorkflow('onboarding', TWO_STEP_WF)
    expect(await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full', '--workflow', 'onboarding'])).toBe(0)
    expect(await h.run(['transition', 'demo', 'complete'])).toBe(0)
    const content = await h.read('demo')
    expect(content).toMatch(/^phase: done$/m)
  })
})
