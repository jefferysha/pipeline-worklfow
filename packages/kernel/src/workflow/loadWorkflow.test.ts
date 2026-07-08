import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { loadWorkflow } from './loadWorkflow.js'
import { parseWorkflow } from './parse.js'

describe('loadWorkflow', () => {
  it('存在的 workflow 文件 → 解析返回 WorkflowDef', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wf-load-'))
    await mkdir(join(root, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(join(root, '.pipeline', 'workflows', 'custom.yaml'), 'name: custom\nsteps:\n', 'utf8')
    const wf = loadWorkflow(root, 'custom')
    expect(wf?.name).toBe('custom')
  })

  it('不存在的 workflow → null，不抛错', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wf-load-empty-'))
    expect(loadWorkflow(root, 'does-not-exist')).toBeNull()
  })

  it('GOAL E5：非法 workflow（skill 依赖成环）→ 保存时校验的第二消费点，loadWorkflow fail-loud 抛错而非静默返回', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wf-load-invalid-'))
    await mkdir(join(root, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(
      join(root, '.pipeline', 'workflows', 'cyclic.yaml'),
      `name: cyclic
steps:
  - id: s1
    label: x
    gate: null
    skills:
      - id: a
        depends_on: [b]
      - id: b
        depends_on: [a]
    inputs: []
    outputs: []
    guards: []
    transitions: []
`,
      'utf8',
    )
    expect(() => loadWorkflow(root, 'cyclic')).toThrow(/循环依赖/)
  })

  it('GOAL E5：非法 workflow（transitions.to 指向不存在的 step）→ loadWorkflow 抛错', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wf-load-invalid2-'))
    await mkdir(join(root, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(
      join(root, '.pipeline', 'workflows', 'dangling.yaml'),
      `name: dangling
steps:
  - id: s1
    label: x
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: complete
        to: does-not-exist
`,
      'utf8',
    )
    expect(() => loadWorkflow(root, 'dangling')).toThrow(/does-not-exist/)
  })

  it('真实 templates/workflows/default.yaml 文件 → 解析成功，7 个步骤，包括 tasks-at-least guard', async () => {
    // Find the repo root and read the real default.yaml template file
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const repoRoot = dirname(dirname(dirname(dirname(__dirname))))
    const defaultYamlPath = join(repoRoot, 'templates', 'workflows', 'default.yaml')
    const content = await readFile(defaultYamlPath, 'utf8')

    // Create a temp directory with .pipeline/workflows structure and write the content
    const tempRoot = await mkdtemp(join(tmpdir(), 'wf-load-real-'))
    await mkdir(join(tempRoot, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(join(tempRoot, '.pipeline', 'workflows', 'default.yaml'), content, 'utf8')

    // Call loadWorkflow to exercise the actual function under test (not just parseWorkflow)
    const wf = loadWorkflow(tempRoot, 'default')

    expect(wf).not.toBeNull()
    expect(wf?.name).toBe('default')
    expect(wf?.steps).toHaveLength(7)
    expect(wf?.steps.map((s) => s.id)).toEqual(['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'])

    // Verify the spec step has the tasks-at-least guard
    const specStep = wf?.steps.find((s) => s.id === 'spec')
    expect(specStep?.guards).toHaveLength(1)
    expect(specStep?.guards[0]).toEqual({ type: 'tasks-at-least', n: 3 })
  })
})
