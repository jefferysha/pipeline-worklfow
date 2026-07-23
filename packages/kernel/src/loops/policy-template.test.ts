import { describe, expect, it } from 'vitest'
import {
  compileAutomationPolicyTemplate,
  getAutomationPolicyTemplate,
  listAutomationPolicyTemplates,
  validateAutomationPolicyTemplate,
} from './policy-template.js'
import { listAutomationPolicyTemplates as listFromLoopsBarrel } from './index.js'
import { listAutomationPolicyTemplates as listFromKernelBarrel } from '../index.js'

describe('AutomationPolicyTemplate v1 catalog', () => {
  it('按声明顺序列出由上游 registry 与 Scheduling 迁移的 7 个闭集模板', () => {
    expect(listAutomationPolicyTemplates()).toEqual([
      {
        version: 1,
        id: 'pr-babysitter',
        goal: 'Shepherd PRs through review, CI, rebase, and merge',
        trigger: [{ kind: 'schedule' }],
        risk: 'medium',
        recommendedWorkflow: 'default',
        recommendedSkills: ['pr-review-triage', 'minimal-fix', 'rebase-and-clean'],
      },
      {
        version: 1,
        id: 'daily-triage',
        goal: 'Prioritized morning scan of CI, issues, commits, and chat',
        trigger: [{ kind: 'schedule' }],
        risk: 'low',
        recommendedWorkflow: 'default',
        recommendedSkills: ['loop-triage', 'minimal-fix'],
      },
      {
        version: 1,
        id: 'ci-sweeper',
        goal: 'React to failing CI with minimal fixes and escalation',
        trigger: [{ kind: 'schedule' }, { kind: 'event' }],
        risk: 'medium',
        recommendedWorkflow: 'default',
        recommendedSkills: ['ci-triage', 'minimal-fix'],
      },
      {
        version: 1,
        id: 'post-merge-cleanup',
        goal: 'Follow-up tech debt and cleanup after merges to main',
        trigger: [{ kind: 'schedule' }, { kind: 'event' }],
        risk: 'low',
        recommendedWorkflow: 'default',
        recommendedSkills: ['post-merge-scan', 'minimal-fix'],
      },
      {
        version: 1,
        id: 'dependency-sweeper',
        goal: 'Discover, safely apply, and verify dependency + vulnerability updates with human gates on risky changes',
        trigger: [{ kind: 'schedule' }, { kind: 'event' }, { kind: 'manual' }],
        risk: 'medium',
        recommendedWorkflow: 'default',
        recommendedSkills: ['dependency-triage', 'minimal-fix', 'loop-verifier'],
      },
      {
        version: 1,
        id: 'changelog-drafter',
        goal: 'Scan merged PRs and commits, draft categorized high-quality release notes or CHANGELOG entries for human review',
        trigger: [{ kind: 'schedule' }, { kind: 'event' }, { kind: 'manual' }],
        risk: 'low',
        recommendedWorkflow: 'default',
        recommendedSkills: ['changelog-scan', 'draft-release-notes', 'loop-verifier'],
      },
      {
        version: 1,
        id: 'issue-triage',
        goal: 'Discover, deduplicate, prioritize and label incoming issues/discussions so the team always has a clean actionable queue. Excellent low-risk companion to Daily Triage.',
        trigger: [{ kind: 'schedule' }, { kind: 'event' }],
        risk: 'low',
        recommendedWorkflow: 'default',
        recommendedSkills: ['issue-triage', 'loop-verifier'],
      },
    ])
  })

  it('按 id 取得单个模板', () => {
    expect(getAutomationPolicyTemplate('daily-triage')).toEqual({
      version: 1,
      id: 'daily-triage',
      goal: 'Prioritized morning scan of CI, issues, commits, and chat',
      trigger: [{ kind: 'schedule' }],
      risk: 'low',
      recommendedWorkflow: 'default',
      recommendedSkills: ['loop-triage', 'minimal-fix'],
    })
    expect(() => getAutomationPolicyTemplate('unknown-pattern')).toThrow(/unknown-pattern/)
  })

  it('list/get 对未知版本 fail-loud', () => {
    expect(() => listAutomationPolicyTemplates(2)).toThrow(/version.*2/i)
    expect(() => getAutomationPolicyTemplate('daily-triage', 'v1')).toThrow(/version.*v1/i)
  })

  it('validate 接受合法 v1 并返回不复用输入引用的新副本', () => {
    const input = {
      version: 1,
      id: 'ci-sweeper',
      goal: 'Project-specific CI response',
      trigger: [{ kind: 'event' as const }],
      risk: 'medium',
      recommendedWorkflow: 'default',
      recommendedSkills: ['ci-triage'],
    }

    const validated = validateAutomationPolicyTemplate(input)

    expect(validated).toEqual(input)
    expect(validated).not.toBe(input)
    expect(validated.trigger).not.toBe(input.trigger)
    expect(validated.trigger[0]).not.toBe(input.trigger[0])
    expect(validated.recommendedSkills).not.toBe(input.recommendedSkills)
  })

  it('validate 对未知顶层键、版本与 id fail-loud', () => {
    const valid = {
      version: 1,
      id: 'ci-sweeper',
      goal: 'Project-specific CI response',
      trigger: [{ kind: 'event' }],
      risk: 'medium',
      recommendedWorkflow: 'default',
      recommendedSkills: ['ci-triage'],
    }

    expect(() => validateAutomationPolicyTemplate({ ...valid, cost: { tokens: 1 } })).toThrow(
      /unknown key 'cost'/i,
    )
    expect(() => validateAutomationPolicyTemplate({ ...valid, version: 2 })).toThrow(/version.*2/i)
    expect(() => validateAutomationPolicyTemplate({ ...valid, id: 'nightly-magic' })).toThrow(
      /id.*nightly-magic/i,
    )
  })

  it('拒绝完全由原型提供必填字段的模板', () => {
    const inherited = Object.create({
      version: 1,
      id: 'ci-sweeper',
      goal: 'Inherited policy',
      trigger: [{ kind: 'manual' }],
      risk: 'low',
      recommendedWorkflow: 'default',
      recommendedSkills: [],
    })

    expect(() => validateAutomationPolicyTemplate(inherited)).toThrow(
      /template.*(?:prototype|own data property)/i,
    )
  })

  it('strict record 接受普通/null-prototype，拒绝自定义原型', () => {
    const nullTrigger = Object.assign(Object.create(null), { kind: 'manual' })
    const fields = {
      version: 1,
      id: 'ci-sweeper',
      goal: 'Null-prototype policy',
      trigger: [nullTrigger],
      risk: 'low',
      recommendedWorkflow: 'default',
      recommendedSkills: [],
    }
    const nullPrototype = Object.assign(Object.create(null), fields)
    expect(validateAutomationPolicyTemplate(nullPrototype)).toEqual({
      ...fields,
      trigger: [{ kind: 'manual' }],
    })
    const nullOverride = Object.assign(Object.create(null), { goal: 'Null-prototype override' })
    expect(compileAutomationPolicyTemplate('ci-sweeper', nullOverride).goal).toBe('Null-prototype override')

    const customPrototype = Object.assign(Object.create({ marker: true }), fields)
    expect(() => validateAutomationPolicyTemplate(customPrototype)).toThrow(/template.*prototype/i)
  })

  it('顶层、override 与数组元素只接受 own data property，descriptor trap 原样 fail-loud', () => {
    const template = () => ({
      version: 1,
      id: 'ci-sweeper',
      goal: 'Descriptor-safe policy',
      trigger: [{ kind: 'event' }],
      risk: 'medium',
      recommendedWorkflow: 'default',
      recommendedSkills: ['ci-triage'],
    })

    let topReads = 0
    const topAccessor = template()
    Object.defineProperty(topAccessor, 'goal', {
      enumerable: true,
      get: () => {
        topReads += 1
        return 'Accessor policy'
      },
    })
    expect(() => validateAutomationPolicyTemplate(topAccessor)).toThrow(
      /template\.goal.*own data property/i,
    )
    expect(topReads).toBe(0)

    let overrideReads = 0
    const overrideAccessor = {}
    Object.defineProperty(overrideAccessor, 'goal', {
      enumerable: true,
      get: () => {
        overrideReads += 1
        return 'Accessor override'
      },
    })
    expect(() => compileAutomationPolicyTemplate('ci-sweeper', overrideAccessor)).toThrow(
      /override\.goal.*own data property/i,
    )
    expect(overrideReads).toBe(0)
    const overrideSetter = {}
    Object.defineProperty(overrideSetter, 'goal', {
      enumerable: true,
      set: () => {
        throw new Error('setter must not run')
      },
    })
    expect(() => compileAutomationPolicyTemplate('ci-sweeper', overrideSetter)).toThrow(
      /override\.goal.*own data property/i,
    )

    let triggerReads = 0
    const triggerAccessor: unknown[] = []
    Object.defineProperty(triggerAccessor, '0', {
      enumerable: true,
      get: () => {
        triggerReads += 1
        return { kind: 'manual' }
      },
    })
    expect(() => validateAutomationPolicyTemplate({ ...template(), trigger: triggerAccessor })).toThrow(
      /trigger\[0\].*own data property/i,
    )
    expect(triggerReads).toBe(0)

    const sparseSkills = new Array(1)
    expect(() => validateAutomationPolicyTemplate({ ...template(), recommendedSkills: sparseSkills })).toThrow(
      /recommendedSkills\[0\].*own data property/i,
    )

    let descriptorReads = 0
    const proxiedTrigger = new Proxy({ kind: 'manual' }, {
      getOwnPropertyDescriptor: (target, key) => {
        descriptorReads += 1
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    expect(validateAutomationPolicyTemplate({ ...template(), trigger: [proxiedTrigger] }).trigger).toEqual([
      { kind: 'manual' },
    ])
    expect(descriptorReads).toBe(1)

    const descriptorFailure = new Error('descriptor trap failed after one element')
    const proxiedSkills = new Proxy(['ci-triage', 'minimal-fix'], {
      getOwnPropertyDescriptor: (target, key) => {
        if (key === '1') throw descriptorFailure
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    let leaked: unknown
    expect(() => {
      leaked = validateAutomationPolicyTemplate({ ...template(), recommendedSkills: proxiedSkills })
    }).toThrow(descriptorFailure)
    expect(leaked).toBeUndefined()
  })

  it('validate 将 trigger 限定为非空的 schedule/event/manual 结构闭集', () => {
    const valid = {
      version: 1,
      id: 'ci-sweeper',
      goal: 'Project-specific CI response',
      risk: 'medium',
      recommendedWorkflow: 'default',
      recommendedSkills: ['ci-triage'],
    }

    expect(() => validateAutomationPolicyTemplate({ ...valid, trigger: [] })).toThrow(/trigger.*empty/i)
    expect(() => validateAutomationPolicyTemplate({ ...valid, trigger: [{ kind: 'cron' }] })).toThrow(
      /trigger\[0\].*kind.*cron/i,
    )
    expect(() =>
      validateAutomationPolicyTemplate({ ...valid, trigger: [{ kind: 'schedule', cadence: '5m' }] }),
    ).toThrow(/trigger\[0\].*unknown key 'cadence'/i)
  })

  it('拒绝 cycling getter，trigger.kind 不得在校验后变成闭集外值', () => {
    let reads = 0
    const triggerItem = {}
    Object.defineProperty(triggerItem, 'kind', {
      enumerable: true,
      get: () => {
        reads += 1
        return reads < 3 ? 'schedule' : 'claude'
      },
    })

    expect(() =>
      validateAutomationPolicyTemplate({
        version: 1,
        id: 'ci-sweeper',
        goal: 'Project-specific CI response',
        trigger: [triggerItem],
        risk: 'medium',
        recommendedWorkflow: 'default',
        recommendedSkills: ['ci-triage'],
      }),
    ).toThrow(/trigger\[0\]\.kind.*own data property/i)
    expect(reads).toBe(0)
  })

  it('validate 严格校验 goal/risk/workflow/recommendedSkills 的 v1 值域', () => {
    const valid = {
      version: 1,
      id: 'ci-sweeper',
      goal: 'Project-specific CI response',
      trigger: [{ kind: 'event' }],
      risk: 'medium',
      recommendedWorkflow: 'default',
      recommendedSkills: ['ci-triage'],
    }

    expect(validateAutomationPolicyTemplate({ ...valid, risk: 'high' }).risk).toBe('high')
    expect(() => validateAutomationPolicyTemplate({ ...valid, goal: '' })).toThrow(/goal/i)
    expect(() => validateAutomationPolicyTemplate({ ...valid, risk: 'critical' })).toThrow(/risk.*critical/i)
    expect(() => validateAutomationPolicyTemplate({ ...valid, recommendedWorkflow: 'custom' })).toThrow(
      /recommendedWorkflow.*custom/i,
    )
    expect(() => validateAutomationPolicyTemplate({ ...valid, recommendedSkills: 'ci-triage' })).toThrow(
      /recommendedSkills.*array/i,
    )
    expect(() => validateAutomationPolicyTemplate({ ...valid, recommendedSkills: ['ci-triage', 7] })).toThrow(
      /recommendedSkills\[1\]/i,
    )
  })

  it('compile 将合法 override 覆到指定模板的新副本且不污染 catalog', () => {
    const override = {
      goal: 'Triage only when requested',
      trigger: [{ kind: 'manual' as const }],
      risk: 'high' as const,
      recommendedSkills: [] as string[],
    }

    const compiled = compileAutomationPolicyTemplate('daily-triage', override)

    expect(compiled).toEqual({
      version: 1,
      id: 'daily-triage',
      goal: 'Triage only when requested',
      trigger: [{ kind: 'manual' }],
      risk: 'high',
      recommendedWorkflow: 'default',
      recommendedSkills: [],
    })
    expect(compiled.trigger).not.toBe(override.trigger)
    expect(compiled.recommendedSkills).not.toBe(override.recommendedSkills)
    expect(getAutomationPolicyTemplate('daily-triage').goal).toBe(
      'Prioritized morning scan of CI, issues, commits, and chat',
    )
  })

  it('compile 对未知 override 键、id、version 与嵌套键 fail-loud', () => {
    for (const key of ['cost', 'level', 'phases', 'tools', 'provider', 'id', 'version']) {
      expect(() => compileAutomationPolicyTemplate('daily-triage', { [key]: 'forbidden' })).toThrow(
        new RegExp(`unknown key '${key}'`, 'i'),
      )
    }
    expect(() => compileAutomationPolicyTemplate('nightly-magic')).toThrow(/id.*nightly-magic/i)
    expect(() => compileAutomationPolicyTemplate('daily-triage', {}, 2)).toThrow(/version.*2/i)
    expect(() =>
      compileAutomationPolicyTemplate('daily-triage', {
        trigger: [{ kind: 'schedule', cadence: '1d' }],
      }),
    ).toThrow(/trigger\[0\].*unknown key 'cadence'/i)
  })

  it('list/get/validate/compile 每次返回深冻结新副本且不冻结调用方输入', () => {
    const input = {
      version: 1,
      id: 'ci-sweeper',
      goal: 'Project-specific CI response',
      trigger: [{ kind: 'event' }],
      risk: 'medium',
      recommendedWorkflow: 'default',
      recommendedSkills: ['ci-triage'],
    }
    const listedA = listAutomationPolicyTemplates()
    const listedB = listAutomationPolicyTemplates()
    const gotA = getAutomationPolicyTemplate('ci-sweeper')
    const gotB = getAutomationPolicyTemplate('ci-sweeper')
    const validated = validateAutomationPolicyTemplate(input)
    const compiledA = compileAutomationPolicyTemplate('ci-sweeper')
    const compiledB = compileAutomationPolicyTemplate('ci-sweeper')

    expect(listedA).not.toBe(listedB)
    expect(listedA[0]).not.toBe(listedB[0])
    expect(gotA).not.toBe(gotB)
    expect(compiledA).not.toBe(compiledB)
    for (const value of [listedA, listedA[0], gotA, validated, compiledA]) {
      expect(Object.isFrozen(value)).toBe(true)
    }
    for (const template of [listedA[0]!, gotA, validated, compiledA]) {
      expect(Object.isFrozen(template.trigger)).toBe(true)
      expect(Object.isFrozen(template.trigger[0])).toBe(true)
      expect(Object.isFrozen(template.recommendedSkills)).toBe(true)
    }
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(input.trigger)).toBe(false)
    expect(Object.isFrozen(input.trigger[0])).toBe(false)
    expect(Object.isFrozen(input.recommendedSkills)).toBe(false)
  })

  it('经 loops 子 barrel 与 kernel 根 barrel 暴露 catalog API', () => {
    const expected = [
      'pr-babysitter',
      'daily-triage',
      'ci-sweeper',
      'post-merge-cleanup',
      'dependency-sweeper',
      'changelog-drafter',
      'issue-triage',
    ]
    expect(listFromLoopsBarrel().map((template) => template.id)).toEqual(expected)
    expect(listFromKernelBarrel().map((template) => template.id)).toEqual(expected)
  })
})
