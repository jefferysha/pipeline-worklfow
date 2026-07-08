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
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
  })

  test('--workflow onboarding：真落 workflow=onboarding + phase=intake（workflow 首个 step 的 id，不是硬编码 open）', async () => {
    await seedWorkflow('onboarding', TWO_STEP_WF)
    expect(await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full', '--workflow', 'onboarding'])).toBe(0)
    const content = await h.read('demo')
    expect(content).toMatch(/^workflow: onboarding$/m)
    expect(content).toMatch(/^phase: intake$/m)
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
