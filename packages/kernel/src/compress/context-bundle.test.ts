import { describe, expect, test } from 'vitest'
import {
  compileContextBundle,
  ContextBundleError,
  verifyContextBundleAggregate,
  type ContextBundleInputV1,
} from './context-bundle.js'

const digest = `sha256:${'a'.repeat(64)}` as const
const inputs: ContextBundleInputV1[] = [
  {
    kind: 'proposal',
    path: 'openspec/changes/demo/proposal.md',
    digest,
    reason: '定义目标',
    mode: 'full',
    content: '# Proposal\n',
  },
  {
    kind: 'openspec-design',
    path: 'openspec/changes/demo/design.md',
    digest,
    reason: '冻结设计',
    mode: 'summary',
    content: '# Design\nDecision: deterministic\n',
  },
]

describe('Context Bundle v1', () => {
  test('同输入生成 byte-identical payload 和 aggregate digest', () => {
    const one = compileContextBundle({
      change: 'demo', from: 'spec', to: 'build', tier: 'strong', maxBytes: 10_000, inputs,
    })
    const two = compileContextBundle({
      change: 'demo', from: 'spec', to: 'build', tier: 'strong', maxBytes: 10_000, inputs,
    })
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
    expect(one.aggregateDigest).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(verifyContextBundleAggregate(one)).toBe(true)
  })

  test('aggregate digest 不签自身且能检测 payload 漂移', () => {
    const bundle = compileContextBundle({
      change: 'demo', from: 'spec', to: 'build', tier: 'strong', maxBytes: 10_000, inputs,
    })
    expect(verifyContextBundleAggregate({ ...bundle, to: 'verify' })).toBe(false)
  })

  test('按 UTF-8 bytes 执行显式预算，超限 fail closed', () => {
    expect(() => compileContextBundle({
      change: 'demo', from: 'spec', to: 'build', tier: 'strong', maxBytes: 2, inputs: [inputs[0]!],
    })).toThrow(/required=.*available=2/)
  })

  test.each([
    [{ ...inputs[0]!, path: '../escape.md' }, /path 非法/],
    [{ ...inputs[0]!, digest: 'sha256:bad' }, /digest 非法/],
    [{ ...inputs[0]!, reason: '' }, /reason 不能为空/],
    [{ ...inputs[0]!, mode: 'reference', content: 'leak' }, /不得内嵌 content/],
  ] as const)('拒绝非法 input %#', (bad, message) => {
    expect(() => compileContextBundle({
      change: 'demo',
      from: 'spec',
      to: 'build',
      tier: 'strong',
      maxBytes: 10_000,
      inputs: [bad as ContextBundleInputV1],
    })).toThrow(message)
  })

  test('拒绝同 kind/path 重复，允许不同 kind 对同一路径作 reference alias', () => {
    expect(() => compileContextBundle({
      change: 'demo', from: 'spec', to: 'build', tier: 'strong', maxBytes: 10_000,
      inputs: [inputs[0]!, inputs[0]!],
    })).toThrow(ContextBundleError)
    expect(() => compileContextBundle({
      change: 'demo', from: 'spec', to: 'build', tier: 'strong', maxBytes: 10_000,
      inputs: [
        inputs[0]!,
        { ...inputs[0]!, kind: 'plan', mode: 'reference', content: undefined },
      ],
    })).not.toThrow()
  })
})
