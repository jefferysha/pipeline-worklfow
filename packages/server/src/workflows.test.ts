import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listWorkflowNames, readWorkflowForApi } from './workflows.js'

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'wf-server-'))
}

const VALID_WF = `name: onboarding
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

describe('listWorkflowNames', () => {
  it('无 .pipeline/workflows 目录 → 空数组（不抛错）', async () => {
    const root = await tempRoot()
    expect(listWorkflowNames(root)).toEqual([])
  })

  it('真扫 *.yaml 文件名（去扩展名），排除 default.yaml', async () => {
    const root = await tempRoot()
    const dir = join(root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'onboarding.yaml'), VALID_WF, 'utf8')
    await writeFile(join(dir, 'release.yaml'), VALID_WF.replace('onboarding', 'release'), 'utf8')
    await writeFile(join(dir, 'default.yaml'), VALID_WF.replace('onboarding', 'default'), 'utf8')
    expect(listWorkflowNames(root).sort()).toEqual(['onboarding', 'release'])
  })
})

describe('readWorkflowForApi', () => {
  it('真读 + 解析，返回 WorkflowDef', async () => {
    const root = await tempRoot()
    const dir = join(root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'onboarding.yaml'), VALID_WF, 'utf8')
    const wf = readWorkflowForApi(root, 'onboarding')
    expect(wf.name).toBe('onboarding')
    expect(wf.steps.map((s) => s.id)).toEqual(['intake', 'done'])
  })

  it('文件不存在 → 抛错（路由层负责转 404）', async () => {
    const root = await tempRoot()
    expect(() => readWorkflowForApi(root, 'ghost')).toThrow()
  })

  it('非法 workflow 文件（transitions.to 指向不存在的 step）→ 抛错（loadWorkflow 已接 validateWorkflow，路由层负责转 500）', async () => {
    const root = await tempRoot()
    const dir = join(root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'broken.yaml'),
      `name: broken\nsteps:\n  - id: s1\n    label: x\n    gate: null\n    skills: []\n    inputs: []\n    outputs: []\n    guards: []\n    transitions:\n      - event: go\n        to: does-not-exist\n`,
      'utf8',
    )
    expect(() => readWorkflowForApi(root, 'broken')).toThrow(/does-not-exist/)
  })
})
