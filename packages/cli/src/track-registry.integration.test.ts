/**
 * 动态 Track Registry 校验面切换 e2e（GOAL.md 清单 T · R2）——真 kernel + 真临时 fs，零 mock。
 * 证明 track 合法性全集由 `.pipeline/tracks.yaml` 驱动（而非写死内建 Track）：
 *  - 自定义 track（data）经 registry 注册后，init/set 放行、workflow 绑定按其 policy 生效；
 *  - workflow.allowed 白名单真拦截（不在白名单的 workflow 在落盘前被拒）；
 *  - 未注册 track 在 init/set 一律 fail-loud，不落盘。
 * 缺 tracks.yaml 的内建 Track 行为另由 init.test / fields.test 覆盖（builtin-only=旧行为逐字一致）。
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { freshHarness, type Harness } from './integration-harness.js'

/** 自定义 track 'data'：缺省绑 data-flow（真存在的自定义 workflow），allowed 仅 data-flow/default。 */
const TRACKS_YAML = `version: 1
tracks:
  - id: data
    label: Data
    workflow:
      default: data-flow
      allowed: [data-flow, default]
    policy_profile:
      review_seed: skipped
      automation_eligible: false
      coverage_profile: backend
      routing:
        enabled: true
        pattern: '(数据|ETL)'
        priority: 150
      skills:
        matrix: true
        profile: backend
`

/** data-flow 自定义 workflow（首 step=draft）——init --track data 缺省应种到 draft。 */
const DATA_FLOW_YAML = `name: data-flow
steps:
  - id: draft
    label: draft
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

describe('动态 Track Registry 校验面（R2，e2e：真 tracks.yaml 驱动）', () => {
  let h: Harness

  beforeEach(async () => {
    h = await freshHarness()
    await mkdir(join(h.cwd, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(join(h.cwd, '.pipeline', 'tracks.yaml'), TRACKS_YAML, 'utf8')
    await writeFile(join(h.cwd, '.pipeline', 'workflows', 'data-flow.yaml'), DATA_FLOW_YAML, 'utf8')
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('init --track data（缺省 workflow）：注册轨放行，绑定 data-flow 首态 draft，reviewSeed 与 id 无关', async () => {
    expect(await h.run(['init', 'dc', '--track', 'data', '--preset', 'full'])).toBe(0)
    const yaml = await h.read('dc')
    expect(yaml).toContain('track: data')
    expect(yaml).toContain('workflow: data-flow')
    expect(yaml).toContain('phase: draft')
    expect(yaml).toContain('agent_review_result: skipped')
    expect(yaml).toContain('codex_review_result: skipped')
  })

  test('init --track data --workflow default：allowed 含 default → 放行，走内建 open 首态', async () => {
    expect(await h.run(['init', 'dc2', '--track', 'data', '--workflow', 'default', '--preset', 'full'])).toBe(0)
    const yaml = await h.read('dc2')
    expect(yaml).toContain('track: data')
    expect(yaml).toContain('phase: open')
  })

  test('init --track data --workflow other：other 不在 allowed → 落盘前拒，exit 1，不建 change', async () => {
    expect(await h.run(['init', 'bad', '--track', 'data', '--workflow', 'other', '--preset', 'full'])).toBe(1)
    expect(existsSync(join(h.cwd, 'openspec', 'changes', 'bad'))).toBe(false)
    expect(h.err.join('\n')).toContain("不允许绑定 workflow 'other'")
  })

  test('init --track ghost：未注册 track → exit 1，不建 change', async () => {
    expect(await h.run(['init', 'g', '--track', 'ghost', '--preset', 'full'])).toBe(1)
    expect(existsSync(join(h.cwd, 'openspec', 'changes', 'g'))).toBe(false)
    expect(h.err.join('\n')).toContain("未注册的 track 'ghost'")
  })

  test('init --track backend：内建轨与自定义轨并存，内建轨仍放行（走内建 open 首态）', async () => {
    expect(await h.run(['init', 'bc', '--track', 'backend', '--preset', 'full'])).toBe(0)
    const yaml = await h.read('bc')
    expect(yaml).toContain('track: backend')
    expect(yaml).toContain('phase: open')
  })

  test('set track data：注册轨放行；set track ghost：未注册 → exit 1', async () => {
    expect(await h.run(['init', 's1', '--track', 'chat', '--preset', 'full'])).toBe(0)
    expect(await h.run(['set', 's1', 'track', 'data'])).toBe(0)
    expect(await h.read('s1')).toContain('track: data')
    expect(await h.run(['set', 's1', 'track', 'ghost'])).toBe(1)
  })

  test('set-many track=data workflow=other：最终组合触犯 data 的 allowed → exit 1，不写', async () => {
    expect(await h.run(['init', 's2', '--track', 'chat', '--preset', 'full'])).toBe(0)
    expect(await h.run(['set-many', 's2', 'track=data', 'workflow=other'])).toBe(1)
    // track 未被改写（组合校验在落盘前拦截）
    expect(await h.read('s2')).toContain('track: chat')
  })

  test('AFK enqueue 真读动态 policy：automationEligible=false 即使已 queued 也拒绝且零写入', async () => {
    expect(await h.run(['init', 'manual', '--track', 'data', '--preset', 'full'])).toBe(0)
    expect(await h.run(['set', 'manual', 'automation', 'queued'])).toBe(0)
    const before = await h.read('manual')

    expect(await h.run(['afk', 'enqueue', 'manual'])).toBe(3)
    expect(await h.read('manual')).toBe(before)
  })

  test('AFK enqueue 遇直改文件造成的 orphan track → fail-loud exit 1，不回退静态判断', async () => {
    expect(await h.run(['init', 'orphan', '--track', 'data', '--preset', 'full'])).toBe(0)
    const before = await h.read('orphan')
    await writeFile(join(h.cwd, '.pipeline', 'tracks.yaml'), 'version: 1\n', 'utf8')

    expect(await h.run(['afk', 'enqueue', 'orphan'])).toBe(1)
    expect(h.err.join('\n')).toContain("未注册的 track 'data'")
    expect(await h.read('orphan')).toBe(before)
  })

  test('AFK enqueue 遇损坏 tracks.yaml → fail-loud exit 1，不回退 builtin/旧 PM 判断', async () => {
    expect(await h.run(['init', 'corrupt', '--track', 'data', '--preset', 'full'])).toBe(0)
    const before = await h.read('corrupt')
    await writeFile(join(h.cwd, '.pipeline', 'tracks.yaml'), 'version: [broken\n', 'utf8')

    expect(await h.run(['afk', 'enqueue', 'corrupt'])).toBe(1)
    expect(h.err.join('\n')).toContain('tracks.yaml')
    expect(await h.read('corrupt')).toBe(before)
  })

  test('check 真读动态 policy：data+coverageProfile=backend 按 backend 7 层矩阵阻断', async () => {
    const name = 'coverage-data'
    expect(await h.run(['init', name, '--track', 'data', '--workflow', 'default', '--preset', 'full'])).toBe(0)
    await h.seedArtifact(name, 'phase', 'spec')
    await h.seedArtifact(name, 'design_doc', 'docs/design.md')
    await h.seedArtifact(name, 'plan', 'docs/plan.md')
    await mkdir(join(h.cwd, 'docs'), { recursive: true })
    await writeFile(join(h.cwd, 'docs', 'design.md'), '# design without coverage block\n', 'utf8')
    await writeFile(join(h.cwd, 'docs', 'plan.md'), '# plan\n', 'utf8')
    await writeFile(
      join(h.cwd, 'openspec', 'changes', name, 'tasks.md'),
      '- [ ] task 1\n- [ ] task 2\n- [ ] task 3\n',
      'utf8',
    )

    expect(await h.run(['check', name])).toBe(2)
    expect(h.out.join('\n')).toContain('全栈 Spec 覆盖（7 层阻塞）')
  })

  test('坏 tracks.yaml（缺 policy_profile 必填字段）：track 相关命令 fail-loud，exit 1', async () => {
    await writeFile(
      join(h.cwd, '.pipeline', 'tracks.yaml'),
      'version: 1\ntracks:\n  - id: broken\n    label: Broken\n',
      'utf8',
    )
    expect(await h.run(['init', 'b', '--track', 'chat', '--preset', 'full'])).toBe(1)
    expect(h.err.join('\n')).toContain('tracks.yaml')
  })
})
