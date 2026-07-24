import { describe, expect, it } from 'vitest'
import { validateWorkflow } from './validate.js'
import type { WorkflowActionConfig, WorkflowDef } from './types.js'
import { DOCUMENT_CONTRACT_PHASES } from './document-contract.js'

function wf(overrides: Partial<WorkflowDef>): WorkflowDef {
  return { name: 'test', steps: [], ...overrides }
}

const CONTRACT_SKILLS: Readonly<Record<string, readonly string[]>> = {
  open: ['pipeline-open', 'openspec-propose'],
  explore: ['pipeline-explore', 'brainstorming'],
  spec: ['pipeline-spec', 'openspec-propose', 'writing-plans'],
  build: ['pipeline-build'],
  verify: ['pipeline-verify', 'verification-before-completion'],
  ship: ['pipeline-ship', 'openspec-apply-change'],
  archive: ['pipeline-archive'],
}

function governedWorkflow(overrides: Partial<WorkflowDef> = {}): WorkflowDef {
  const next = (id: string): readonly { readonly event: string; readonly to: string }[] => {
    if (id === 'open') return [{ event: 'open-complete', to: 'explore' }]
    if (id === 'explore') return [{ event: 'explore-complete', to: 'spec' }]
    if (id === 'spec') return [{ event: 'spec-complete', to: 'build' }]
    if (id === 'build') {
      return [
        { event: 'build-complete', to: 'verify' },
        { event: 'requirements-changed', to: 'spec' },
      ]
    }
    if (id === 'verify') return [{ event: 'verify-pass', to: 'ship' }, { event: 'verify-fail', to: 'build' }]
    if (id === 'ship') return [{ event: 'ship-complete', to: 'archive' }]
    return []
  }
  return {
    name: 'governed',
    openspecContract: 'required',
    steps: DOCUMENT_CONTRACT_PHASES.map((id) => ({
      id,
      label: id,
      gate: ['explore', 'spec', 'verify'].includes(id) ? 'review' as const : null,
      skills: CONTRACT_SKILLS[id].map((skill) => ({ id: skill })),
      inputs: id === 'verify' ? [{ field: 'build_sha', type: 'string' }] : [],
      outputs: id === 'build'
        ? [{ field: 'build_sha', type: 'string' }]
        : id === 'verify'
          ? [{ field: 'verification_report', type: 'file_path' }]
          : [],
      guards: [], transitions: next(id),
    })),
    ...overrides,
  }
}

describe('validateWorkflow', () => {
  it('openspec_contract: required 只有 canonical 7 phases、边、review gate 和所需 skills 全齐才可保存', () => {
    expect(validateWorkflow(governedWorkflow())).toEqual([])
    const broken = governedWorkflow({
      steps: governedWorkflow().steps.map((step) => step.id === 'explore'
        ? { ...step, skills: step.skills.filter((skill) => skill.id !== 'brainstorming') }
        : step),
    })
    expect(validateWorkflow(broken).some((error) => error.includes('Superpower brainstorming'))).toBe(true)
  })

  it('openspec_contract: required 必须把 build 基线显式交给 verify，并声明验证报告输出', () => {
    const missingBuildBaseline = governedWorkflow({
      steps: governedWorkflow().steps.map((step) => step.id === 'build' ? { ...step, outputs: [] } : step),
    })
    expect(validateWorkflow(missingBuildBaseline).some((error) => error.includes("output 'build_sha'"))).toBe(true)

    const missingVerifyRead = governedWorkflow({
      steps: governedWorkflow().steps.map((step) => step.id === 'verify' ? { ...step, inputs: [] } : step),
    })
    expect(validateWorkflow(missingVerifyRead).some((error) => error.includes("input 'build_sha'"))).toBe(true)
  })

  it('skill 依赖成环 → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [{
        id: 's1', label: 'x', gate: null, inputs: [], outputs: [], guards: [], transitions: [],
        skills: [
          { id: 'a', depends_on: ['b'] },
          { id: 'b', depends_on: ['a'] },
        ],
      }],
    }))
    expect(result.some((e) => e.includes('循环依赖'))).toBe(true)
  })

  it('命名空间 skill id（superpowers:brainstorming）通过校验（Bug1：validate 与 parse 对齐，可 gate 插件 skill）', () => {
    const result = validateWorkflow(wf({
      steps: [{
        id: 's1', label: 'x', gate: null, inputs: [], outputs: [], guards: [], transitions: [],
        skills: [
          { id: 'superpowers:brainstorming' },
          { id: 'commit-commands:commit', depends_on: ['superpowers:brainstorming'] },
        ],
      }],
    }))
    expect(result.filter((e) => e.includes('含非法字符'))).toEqual([]) // 冒号命名空间不再被拒
  })

  it('非法 skill id（含空格/前导冒号）仍被拒（命名空间放宽不等于放任）', () => {
    const bad = validateWorkflow(wf({
      steps: [{
        id: 's1', label: 'x', gate: null, inputs: [], outputs: [], guards: [], transitions: [],
        skills: [{ id: 'has space' }],
      }],
    }))
    expect(bad.some((e) => e.includes('含非法字符'))).toBe(true)
    const lead = validateWorkflow(wf({
      steps: [{
        id: 's2', label: 'y', gate: null, inputs: [], outputs: [], guards: [], transitions: [],
        skills: [{ id: ':leading' }],
      }],
    }))
    expect(lead.some((e) => e.includes('含非法字符'))).toBe(true)
  })

  it('depends_on 引用跨 step 不存在的 skill id → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [{
        id: 's1', label: 'x', gate: null, inputs: [], outputs: [], guards: [], transitions: [],
        skills: [{ id: 'a', depends_on: ['does-not-exist'] }],
      }],
    }))
    expect(result.some((e) => e.includes('does-not-exist'))).toBe(true)
  })

  it('inputs 引用的字段不是任何更早 step 的 outputs → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 's2' }] },
        { id: 's2', label: 'b', gate: null, skills: [], inputs: [{ field: 'design_doc', type: 'file_path' }], outputs: [], guards: [], transitions: [] },
      ],
    }))
    expect(result.some((e) => e.includes('design_doc'))).toBe(true)
  })

  it('transitions 的 to 引用不存在的 step id → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 'does-not-exist' }] },
      ],
    }))
    expect(result.some((e) => e.includes("'does-not-exist'") && e.includes('不存在'))).toBe(true)
  })

  it('允许多个显式终态，但拒绝从首 step 不可达的节点', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
        { id: 's2', label: 'b', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }))
    expect(result.some((e) => e.includes("step 's2'") && e.includes('不可达'))).toBe(true)
  })

  // G16：serialize 写出 / parse 用 (\S+) 读回的每一类标识符都必须锁 ^[a-zA-Z0-9_-]+$（与
  // dashboard 客户端、server 路由层同一规则）——否则绕过浏览器直调已鉴权 HTTP 可写入
  // 「保存成功、下次 loadWorkflow 打不开」的坏文件，validateWorkflow 是唯一的服务端后盾。
  it('G16：transition event 名含空格 → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'bad event', to: 's2' }] },
        { id: 's2', label: 'b', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }))
    expect(result.some((e) => e.includes("'bad event'") && e.includes('非法字符'))).toBe(true)
  })

  it('G16：inputs/outputs field 名含空格 → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [{ field: 'bad field', type: 'string' }], guards: [], transitions: [] },
      ],
    }))
    expect(result.some((e) => e.includes("'bad field'") && e.includes('非法字符'))).toBe(true)
  })

  it('G16：step id 含空格 → 报错（同一往返破坏向量，一并锁死）', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 'bad id', label: 'a', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }))
    expect(result.some((e) => e.includes("'bad id'") && e.includes('非法字符'))).toBe(true)
  })

  it('G16：skill id 含空格 → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [{ id: 'bad skill' }], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }))
    expect(result.some((e) => e.includes("'bad skill'") && e.includes('非法字符'))).toBe(true)
  })

  it('G16：workflow name 含空格 → 报错（POST body 的 name 不必等于路由 name，serialize 第一行原样写它）', () => {
    const result = validateWorkflow(wf({
      name: 'bad name',
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }))
    expect(result.some((e) => e.includes("'bad name'") && e.includes('非法字符'))).toBe(true)
  })

  it('workflow 名称允许中文，但路径符号与点仍被拒绝', () => {
    expect(validateWorkflow(wf({ name: '发布验收流程' })).filter((e) => e.includes('workflow name'))).toEqual([])
    for (const name of ['发布/验收', '发布.验收', '发布 验收']) {
      expect(validateWorkflow(wf({ name })).some((e) => e.includes('workflow name') && e.includes('非法字符'))).toBe(true)
    }
  })

  it('合法 workflow（含分支 transitions）→ 空数组', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [{ field: 'design_doc', type: 'file_path' }], guards: [], transitions: [{ event: 'complete', to: 's2' }] },
        { id: 's2', label: 'b', gate: null, skills: [], inputs: [{ field: 'design_doc', type: 'file_path' }], outputs: [], guards: [], transitions: [{ event: 'pass', to: 's3' }, { event: 'fail', to: 's1' }] },
        { id: 's3', label: 'c', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }))
    expect(result).toEqual([])
  })

  // ── G2 P2：validateWorkflow 复用 compileWorkflow 深校验新 guard/action 变体（loadWorkflow /
  //    server 保存两个入口共用同一 validateWorkflow，故两处都被这层拒） ──
  it('G2 P2：scalar guard 挂列表字段（field-nonempty on scope）→ 经 compile 深校验拒绝', () => {
    const result = validateWorkflow(wf({
      steps: [{
        id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [],
        guards: [{ type: 'field-nonempty', field: 'scope' }], transitions: [],
      }],
    }))
    expect(result.some((e) => e.includes('scope') && e.includes('列表字段'))).toBe(true)
  })

  it('G2 P2：非法 edge action type → 经 compile 深校验拒绝', () => {
    const result = validateWorkflow(wf({
      steps: [
        {
          id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [], guards: [],
          transitions: [{ event: 'e', to: 's2', actions: [{ type: 'nuke' } as unknown as WorkflowActionConfig] }],
        },
        { id: 's2', label: 'b', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }))
    expect(result.some((e) => e.includes('nuke') && e.includes('action'))).toBe(true)
  })

  it('G2 P2 兼容回退：含未知惰性 output（custom_doc，type string，无 guard）+ 后序同名 input → 空数组（能 load；pre-P2 合法行为恢复）', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [{ field: 'custom_doc', type: 'string' }], guards: [], transitions: [{ event: 'go', to: 's2' }] },
        { id: 's2', label: 'b', gate: null, skills: [], inputs: [{ field: 'custom_doc', type: 'string' }], outputs: [], guards: [], transitions: [] },
      ],
    }))
    expect(result).toEqual([])
  })

  it('G2 P2 兼容回退：nonempty-output 指未知惰性 output → validate 不因 compile 深校验而误拒（下沉 output-present，非 load 报错）', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [{ field: 'custom_doc', type: 'string' }], guards: [{ type: 'nonempty-output' }], transitions: [] },
      ],
    }))
    expect(result).toEqual([])
  })

  it('阻断 1：未知 file_path output（custom_report，无显式 artifact）→ 空数组（能 load；不再因 artifact 派生规则误拒）', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [{ field: 'custom_report', type: 'file_path' }], guards: [], transitions: [] },
      ],
    }))
    expect(result).toEqual([])
  })

  it('阻断 3：结构化 guard 附加顶层键（nonempty-output 带 n）经 compile 深校验拒（server 直调 validateWorkflow→serialize 落盘路径，不被 serialize 静默吞）', () => {
    const result = validateWorkflow(wf({
      steps: [{
        id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [],
        guards: [{ type: 'nonempty-output', n: 2 } as unknown as WorkflowDef['steps'][number]['guards'][number]], transitions: [],
      }],
    }))
    expect(result.some((e) => e.includes('附加键') && e.includes('n'))).toBe(true)
  })

  it('阻断 3：结构化 guard 嵌套 when 附加键 → 经 compile 深校验拒', () => {
    const result = validateWorkflow(wf({
      steps: [{
        id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [],
        guards: [{ type: 'full-direct-override', when: { kind: 'track-in', values: ['pm'], extra: 1 } } as unknown as WorkflowDef['steps'][number]['guards'][number]],
        transitions: [],
      }],
    }))
    expect(result.some((e) => e.includes('when') && e.includes('附加键'))).toBe(true)
  })

  it('G2 P2：含新变体 + when + edge guards/actions 的合法 workflow → 空数组（不误拒）', () => {
    const result = validateWorkflow(wf({
      steps: [
        {
          id: 'verify', label: 'v', gate: 'review', skills: [], inputs: [], outputs: [],
          guards: [{ type: 'field-equals', field: 'branch_status', value: 'handled', when: { kind: 'track-not-in', values: ['pm'] } }],
          transitions: [{
            event: 'pass', to: 'done',
            guards: [{ type: 'field-in', field: 'isolation', values: ['branch', 'worktree'] }],
            actions: [{ type: 'mark-verification-passed' }],
          }],
        },
        { id: 'done', label: 'd', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }))
    expect(result).toEqual([])
  })

  // ── G2 P5 · A 契约：validateWorkflow 经 compileWorkflow(custom 契约) 深校验，故 custom workflow
  //    声明 effective-phase-skills 在保存/加载入口即被拒（loadWorkflow 据此 fail-loud）──
  it('G2 P5 · A 契约：custom workflow 显式 effective-phase-skills artifact → 校验拒（fail-loud）', () => {
    const result = validateWorkflow(wf({
      steps: [{
        id: 's1', label: 'a', gate: null, skills: [], inputs: [],
        outputs: [{ field: 'design_doc', type: 'file_path' }],
        artifacts: [{ field: 'design_doc', type: 'file_path', producerPolicy: 'effective-phase-skills' }],
        guards: [], transitions: [],
      }],
    }))
    expect(result.some((e) => e.includes('producerPolicy') && e.includes('effective-phase-skills'))).toBe(true)
  })

  it('G2 P5 · A 契约：custom workflow 显式 effective-step-skills artifact → 不误拒（空数组）', () => {
    const result = validateWorkflow(wf({
      steps: [{
        id: 's1', label: 'a', gate: null, skills: [], inputs: [],
        outputs: [{ field: 'design_doc', type: 'file_path' }],
        artifacts: [{ field: 'design_doc', type: 'file_path', producerPolicy: 'effective-step-skills' }],
        guards: [], transitions: [],
      }],
    }))
    expect(result).toEqual([])
  })
})
