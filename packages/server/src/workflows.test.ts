import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { WorkflowDef } from '@pipeline-lite/kernel'
import { deleteWorkflowForApi, listWorkflowNames, readWorkflowForApi, writeWorkflowForApi, WorkflowNotFoundError } from './workflows.js'

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

  it('文件不存在 → 抛的具体是 WorkflowNotFoundError（round 2 review fix：路由层靠 instanceof 判 404，不再摸错误文本子串）', async () => {
    const root = await tempRoot()
    expect(() => readWorkflowForApi(root, 'ghost')).toThrow(WorkflowNotFoundError)
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

  it('非法 workflow 文件且错误信息恰好含"未找到"字样（用户自起的 transition 目标名）→ 抛的不是 WorkflowNotFoundError（round 2 review fix：证明分类不能靠子串匹配，只能靠类型）', async () => {
    const root = await tempRoot()
    const dir = join(root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'broken2.yaml'),
      `name: broken2\nsteps:\n  - id: s1\n    label: x\n    gate: null\n    skills: []\n    inputs: []\n    outputs: []\n    guards: []\n    transitions:\n      - event: go\n        to: 未找到\n`,
      'utf8',
    )
    let caught: unknown
    try {
      readWorkflowForApi(root, 'broken2')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('未找到') // 校验错误消息恰好含这个子串（用户自己起的 transition 目标名）
    expect(caught).not.toBeInstanceOf(WorkflowNotFoundError) // 但类型上不是"未找到"错误——它是一次真实的校验失败
  })
})

const VALID_DEF: WorkflowDef = {
  name: 'onboarding',
  steps: [
    { id: 'intake', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 'done' }] },
    { id: 'done', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
}

const INVALID_DEF: WorkflowDef = {
  name: 'broken',
  steps: [
    { id: 's1', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'go', to: 'does-not-exist' }] },
  ],
}

describe('writeWorkflowForApi', () => {
  it('合法 WorkflowDef → 真原子写入 .pipeline/workflows/<name>.yaml，{ok:true}', async () => {
    const root = await tempRoot()
    const result = writeWorkflowForApi(root, 'onboarding', VALID_DEF)
    expect(result).toEqual({ ok: true })
    const content = await readFile(join(root, '.pipeline', 'workflows', 'onboarding.yaml'), 'utf8')
    expect(content).toContain('name: onboarding')
    expect(content).toContain('- id: intake')
  })

  it('非法 WorkflowDef（validateWorkflow 拒绝）→ {ok:false, errors} + 不落盘', async () => {
    const root = await tempRoot()
    const result = writeWorkflowForApi(root, 'broken', INVALID_DEF)
    expect(result.ok).toBe(false)
    expect((result as { ok: false; errors: string[] }).errors.some((e) => e.includes('does-not-exist'))).toBe(true)
    const { existsSync } = await import('node:fs')
    expect(existsSync(join(root, '.pipeline', 'workflows', 'broken.yaml'))).toBe(false)
  })

  it('已存在的 workflow → 覆盖（新建和编辑共用同一函数）', async () => {
    const root = await tempRoot()
    writeWorkflowForApi(root, 'onboarding', VALID_DEF)
    const updated: WorkflowDef = { ...VALID_DEF, name: 'onboarding', steps: [...VALID_DEF.steps, { id: 'extra', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] }] }
    // extra 挂在末尾、done 仍是最后一个真正的终态——为了合法（非终态必须有 transitions），
    // 这里改成 done 指向 extra，extra 作真正终态
    const updatedValid: WorkflowDef = {
      name: 'onboarding',
      steps: [
        { id: 'intake', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 'done' }] },
        { id: 'done', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'next', to: 'extra' }] },
        { id: 'extra', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }
    const result = writeWorkflowForApi(root, 'onboarding', updatedValid)
    expect(result).toEqual({ ok: true })
    const content = await readFile(join(root, '.pipeline', 'workflows', 'onboarding.yaml'), 'utf8')
    expect(content).toContain('- id: extra')
  })
})

describe('deleteWorkflowForApi', () => {
  it('真删存在的文件 → true', async () => {
    const root = await tempRoot()
    writeWorkflowForApi(root, 'onboarding', VALID_DEF)
    expect(deleteWorkflowForApi(root, 'onboarding')).toBe(true)
    const { existsSync } = await import('node:fs')
    expect(existsSync(join(root, '.pipeline', 'workflows', 'onboarding.yaml'))).toBe(false)
  })

  it('文件不存在 → false（不抛错）', async () => {
    const root = await tempRoot()
    expect(deleteWorkflowForApi(root, 'ghost')).toBe(false)
  })
})
