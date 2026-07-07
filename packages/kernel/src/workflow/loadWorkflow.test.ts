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
