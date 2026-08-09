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
review_budget:
  version: v1
  max_attempts: 2
steps:
  - id: build
    label: Build
    gate: null
    review_lanes: [standards, spec, e2e]
    skills:
      - id: acme-quality-gate
        kind: review
        review_lane: standards
      - id: test-driven-development
        kind: work
    inputs: []
    outputs: []
    guards: []
    transitions: []
`

describe('workflow policy YAML codec', () => {
  it('round-trips all orthogonal policies through the full definition', () => {
    const parsed = parseWorkflow(SOURCE)
    expect(parsed.decomposition?.mode).toBe('require-review')
    expect(parsed.interaction?.mode).toBe('recommended-defaults')
    expect(parsed.reviewBudget?.max_attempts).toBe(2)
    expect(parsed.steps[0]?.reviewLanes).toEqual(['standards', 'spec', 'e2e'])
    expect(parsed.steps[0]?.skills).toEqual([
      { id: 'acme-quality-gate', kind: 'review', review_lane: 'standards' },
      { id: 'test-driven-development', kind: 'work' },
    ])
    expect(parseWorkflow(serializeWorkflow(parsed))).toEqual(parsed)
    expect(compileWorkflow(parsed).decomposition.max_depth).toBe(4)
    expect(compileWorkflow(parsed).reviewBudget).toEqual({ version: 'v1', max_attempts: 2 })
    expect(compileWorkflow(parsed).steps[0]).toMatchObject({
      reviewLanes: ['standards', 'spec', 'e2e'],
      skills: [
        { id: 'acme-quality-gate', kind: 'review', review_lane: 'standards' },
        { id: 'test-driven-development', kind: 'work' },
      ],
    })
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

  it('rejects unknown review budget YAML keys instead of silently publishing an unlimited policy', () => {
    expect(() => parseWorkflow(SOURCE.replace(
      '  max_attempts: 2',
      '  max_attempts: 2\n  unlimited: true',
    ))).toThrow(/unlimited|未知/)
  })

  it('rejects a Review Skill whose explicit lane is not declared by the step', () => {
    expect(() => compileWorkflow(parseWorkflow(SOURCE.replace(
      'review_lane: standards',
      'review_lane: security',
    )))).toThrow(/security|review.*lane|声明/i)
  })

  it('does not infer Review semantics from a skill name', () => {
    const parsed = parseWorkflow(SOURCE.replace(
      'id: test-driven-development\n        kind: work',
      'id: e2e-review-looking-name\n        kind: work',
    ))
    expect(compileWorkflow(parsed).steps[0]?.skills[1]).toEqual({
      id: 'e2e-review-looking-name',
      kind: 'work',
    })
  })
})
