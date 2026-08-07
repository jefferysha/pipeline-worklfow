import { describe, expect, it } from 'vitest'
import { compileWorkflow } from './compile.js'
import { parseWorkflow } from './parse.js'
import { serializeWorkflow } from './serialize.js'

const SOURCE = `name: policy-codec
decomposition:
  version: v1
  mode: require-review
  target: child-pipelines
  strategy: breadth-first
  max_items: 12
  max_depth: 4
  auto_when: [independent-work-items, cross-component-boundary]
  ask_when: [ambiguous-requirements, hard-boundary]
interaction:
  version: v1
  mode: recommended-defaults
steps:
  - id: build
    label: Build
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions: []
`

describe('workflow policy YAML codec', () => {
  it('round-trips both orthogonal policies through the full definition', () => {
    const parsed = parseWorkflow(SOURCE)
    expect(parsed.decomposition?.mode).toBe('require-review')
    expect(parsed.interaction?.mode).toBe('recommended-defaults')
    expect(parseWorkflow(serializeWorkflow(parsed))).toEqual(parsed)
    expect(compileWorkflow(parsed).decomposition.max_depth).toBe(4)
  })

  it('rejects unknown policy YAML keys instead of publishing a partial definition', () => {
    expect(() => parseWorkflow(SOURCE.replace('  max_items: 12', '  max_items: 12\n  surprise: yes')))
      .toThrow(/surprise|未知/)
  })

  it.each([
    '[independent-work-items, , cross-component-boundary]',
    '[independent-work-items,]',
  ])('rejects empty YAML list entries instead of filtering them: %s', (list) => {
    expect(() => parseWorkflow(SOURCE.replace(
      '[independent-work-items, cross-component-boundary]',
      list,
    ))).toThrow(/空|列表/)
  })
})
