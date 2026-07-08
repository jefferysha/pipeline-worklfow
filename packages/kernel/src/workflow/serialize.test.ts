import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseWorkflow } from './parse.js'
import { serializeWorkflow } from './serialize.js'
import type { WorkflowDef } from './types.js'

const MINIMAL: WorkflowDef = {
  name: 'onboarding',
  steps: [
    {
      id: 'intake', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [],
      transitions: [{ event: 'complete', to: 'done' }],
    },
    { id: 'done', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
}

const RICH: WorkflowDef = {
  name: 'rich',
  steps: [
    {
      id: 's1', label: '第一步', gate: 'review',
      skills: [
        { id: 'a' },
        { id: 'b' },
        { id: 'c', depends_on: ['a', 'b'] },
      ],
      inputs: [],
      outputs: [{ field: 'design_doc', type: 'file_path' }],
      guards: [{ type: 'tasks-at-least', n: 3 }, { type: 'nonempty-output' }],
      transitions: [
        { event: 'pass', to: 's2' },
        { event: 'fail', to: 's1' },
      ],
    },
    {
      id: 's2', label: '', gate: null, skills: [], inputs: [{ field: 'design_doc', type: 'file_path' }],
      outputs: [], guards: [], transitions: [],
    },
  ],
}

describe('serializeWorkflow —— parse 的反向操作，往返等价是唯一正确性判据', () => {
  it('MINIMAL：serialize→parse 深度等于原始 WorkflowDef', () => {
    const round = parseWorkflow(serializeWorkflow(MINIMAL))
    expect(round).toEqual(MINIMAL)
  })

  it('RICH（多 skill+depends_on+多 guard+多 transition+非空 label/gate/inputs/outputs）：往返等价', () => {
    const round = parseWorkflow(serializeWorkflow(RICH))
    expect(round).toEqual(RICH)
  })

  it('真文件写入 + 真 loadWorkflow 风格读回（真 fs，非纯内存往返）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'serialize-wf-'))
    const p = join(dir, 'rich.yaml')
    await writeFile(p, serializeWorkflow(RICH), 'utf8')
    const content = await readFile(p, 'utf8')
    expect(parseWorkflow(content)).toEqual(RICH)
  })

  it('真实 templates/workflows/default.yaml 解析后再 serialize 再 parse：三重往返仍等价（覆盖真实生产 fixture 形状，不只是手写测试夹具）', async () => {
    const { dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const repoRoot = dirname(dirname(dirname(dirname(__dirname))))
    const defaultYamlPath = join(repoRoot, 'templates', 'workflows', 'default.yaml')
    const original = parseWorkflow(await readFile(defaultYamlPath, 'utf8'))
    const roundTripped = parseWorkflow(serializeWorkflow(original))
    expect(roundTripped).toEqual(original)
  })
})
