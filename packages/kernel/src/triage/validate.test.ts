import { describe, expect, it } from 'vitest'
import {
  canonicalizeTriageResult,
  validateObservationPage,
  validateObserveAction,
  validateProviderTriageClassification,
  validateSourceCheckpoint,
  validateTriageRoutes,
} from './validate.js'

const page = {
  schemaVersion: 1,
  action: { schemaVersion: 1, kind: 'git-commits', sourceId: 'repo-main' },
  observations: [
    {
      schemaVersion: 1,
      observationId: 'commit:aaaaaaaa',
      sourceId: 'repo-main',
      actionKind: 'git-commits',
      observedAt: '2026-07-19T08:00:00.000Z',
      title: 'Fix checkout race',
      body: 'Makes the state transition atomic.',
    },
  ],
  nextCheckpoint: {
    schemaVersion: 1,
    sourceId: 'repo-main',
    actionKind: 'git-commits',
    cursor: 'aaaaaaaa',
  },
  hasMore: false,
} as const

const routes = [
  {
    routeId: 'default-fix',
    description: 'Create a default-workflow fix change',
    resolved: { workflowId: 'default', initialStep: 'open' },
  },
] as const

const provider = { kind: 'codex', model: 'gpt-5.4', invocationId: 'response-1' } as const

const deriveCandidate = ({ observation, route }: {
  observation: { observationId: string; sourceId: string }
  route: { routeId: string }
}) => ({
  candidateId: `candidate:${observation.observationId}`,
  creationKey: `triage:${observation.sourceId}:${observation.observationId}:${route.routeId}`,
  changeName: `triage-fix-${observation.observationId.split(':').at(-1)}`,
})

const hostContext = (overrides: Record<string, unknown> = {}) => ({
  page,
  routes,
  trustedHighCap: 1,
  provider,
  deriveCandidate,
  ...overrides,
})

function expectInvalid(result: { ok: boolean; errors?: readonly string[] }, pattern: RegExp): void {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error('expected invalid result')
  expect(result.errors?.join('\n')).toMatch(pattern)
}

describe('canonicalizeTriageResult', () => {
  it('由 provider 最小分类与 host-owned 值生成递归冻结的新 TriageResult', () => {
    const providerOutput = {
      schemaVersion: 1,
      decisions: [
        {
          observationId: 'commit:aaaaaaaa',
          classification: 'high',
          rationale: 'The commit fixes a correctness defect.',
          routeId: 'default-fix',
        },
      ],
    }

    const result = canonicalizeTriageResult(providerOutput, {
      page,
      routes,
      trustedHighCap: 1,
      provider,
      deriveCandidate: ({ observation, route }) => ({
        candidateId: `candidate:${observation.observationId}`,
        creationKey: `triage:${observation.sourceId}:${observation.observationId}:${route.routeId}`,
        changeName: 'triage-fix-aaaaaaaa',
      }),
    })

    expect(result).toEqual({
      ok: true,
      value: {
        schemaVersion: 1,
        page,
        decisions: [
          {
            observationId: 'commit:aaaaaaaa',
            classification: 'high',
            rationale: 'The commit fixes a correctness defect.',
            routeId: 'default-fix',
            candidate: {
              candidateId: 'candidate:commit:aaaaaaaa',
              creationKey: 'triage:repo-main:commit:aaaaaaaa:default-fix',
              changeName: 'triage-fix-aaaaaaaa',
              route: routes[0],
            },
          },
        ],
        provider: { kind: 'codex', model: 'gpt-5.4', invocationId: 'response-1' },
      },
    })
    if (!result.ok) throw new Error(result.errors.join('\n'))
    expect(result.value).not.toBe(providerOutput)
    expect(result.value.page).not.toBe(page)
    expect(result.value.decisions).not.toBe(providerOutput.decisions)
    expect(result.value.decisions[0]).not.toBe(providerOutput.decisions[0])
    expect(result.value.decisions[0]!.classification).toBe('high')
    if (result.value.decisions[0]!.classification !== 'high') throw new Error('expected high')
    expect(result.value.decisions[0]!.candidate.route).not.toBe(routes[0])
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(result.value.page.observations)).toBe(true)
    expect(Object.isFrozen(result.value.decisions[0]!.candidate.route.resolved)).toBe(true)
  })

  it('ObserveAction v1 只接受两个闭集 kind，拒绝 connector path/command 配置越界进入数据契约', () => {
    expect(validateObserveAction({ schemaVersion: 1, kind: 'git-commits', sourceId: 'repo-main' })).toMatchObject({
      ok: true,
    })
    expect(validateObserveAction({ schemaVersion: 1, kind: 'loop-run-terminals', sourceId: 'loop-ledger' })).toMatchObject({
      ok: true,
    })
    expectInvalid(
      validateObserveAction({ schemaVersion: 1, kind: 'filesystem', sourceId: 'repo-main' }),
      /unknown ObserveAction 'filesystem'/,
    )
    expectInvalid(
      validateObserveAction({
        schemaVersion: 1,
        kind: 'git-commits',
        sourceId: 'repo-main',
        repoPath: '/tmp/repo',
        command: ['git', 'log'],
      }),
      /unknown key '(?:repoPath|command)'.*host trust boundary/,
    )
  })

  it('SourceCheckpoint 与 ObservationPage 是闭集 canonical clone，且 page 绑定 action/source/checkpoint', () => {
    const checkpointResult = validateSourceCheckpoint(page.nextCheckpoint)
    expect(checkpointResult).toEqual({ ok: true, value: page.nextCheckpoint })
    if (!checkpointResult.ok) throw new Error(checkpointResult.errors.join('\n'))
    expect(checkpointResult.value).not.toBe(page.nextCheckpoint)
    expect(Object.isFrozen(checkpointResult.value)).toBe(true)

    const pageResult = validateObservationPage(page)
    expect(pageResult).toMatchObject({ ok: true })
    if (!pageResult.ok) throw new Error(pageResult.errors.join('\n'))
    expect(pageResult.value).not.toBe(page)
    expect(pageResult.value.observations[0]).not.toBe(page.observations[0])
    expect(Object.isFrozen(pageResult.value.action)).toBe(true)

    expectInvalid(
      validateObservationPage({
        ...page,
        nextCheckpoint: { ...page.nextCheckpoint, sourceId: 'another-source' },
      }),
      /nextCheckpoint.*not bound to page\.action/,
    )
    expectInvalid(
      validateObservationPage({
        ...page,
        observations: [{ ...page.observations[0], command: 'git show' }],
      }),
      /observations\[0\].*unknown key 'command'/,
    )
  })

  it('provider decisions 必须对 page observations 做无重复、无遗漏、无额外成员的精确分区', () => {
    const second = {
      ...page.observations[0],
      observationId: 'commit:bbbbbbbb',
      title: 'Second commit',
    }
    const observations = [page.observations[0], second]
    const validationContext = { observations, routes, trustedHighCap: 2 }

    expectInvalid(
      validateProviderTriageClassification({
        schemaVersion: 1,
        decisions: [
          { observationId: 'commit:aaaaaaaa', classification: 'watch', rationale: 'Review later.' },
          { observationId: 'commit:aaaaaaaa', classification: 'noise', rationale: 'Duplicate.' },
        ],
      }, validationContext),
      /duplicate partition member 'commit:aaaaaaaa'.*missing partition member 'commit:bbbbbbbb'/s,
    )
    expectInvalid(
      validateProviderTriageClassification({
        schemaVersion: 1,
        decisions: [
          { observationId: 'commit:aaaaaaaa', classification: 'watch', rationale: 'Review later.' },
          { observationId: 'commit:cccccccc', classification: 'noise', rationale: 'Unknown.' },
        ],
      }, validationContext),
      /unknown observation 'commit:cccccccc'.*missing partition member 'commit:bbbbbbbb'/s,
    )
  })

  it('High 只能选 host route 且数量不得超过 trustedHighCap', () => {
    const second = {
      ...page.observations[0],
      observationId: 'commit:bbbbbbbb',
      title: 'Second commit',
    }
    const observations = [page.observations[0], second]
    expectInvalid(
      validateProviderTriageClassification({
        schemaVersion: 1,
        decisions: [
          {
            observationId: 'commit:aaaaaaaa',
            classification: 'high',
            rationale: 'Unknown route.',
            routeId: 'provider-invented',
          },
          { observationId: 'commit:bbbbbbbb', classification: 'noise', rationale: 'No action.' },
        ],
      }, { observations, routes, trustedHighCap: 1 }),
      /unknown host route 'provider-invented'/,
    )
    expectInvalid(
      validateProviderTriageClassification({
        schemaVersion: 1,
        decisions: observations.map((observation) => ({
          observationId: observation.observationId,
          classification: 'high',
          rationale: 'Both look important.',
          routeId: 'default-fix',
        })),
      }, { observations, routes, trustedHighCap: 1 }),
      /high count 2 exceeds trusted host cap 1/,
    )
  })

  it.each(['watch', 'noise'] as const)(
    '%s 不得用 routeId/candidate 偷渡 WorkflowRun candidate',
    (classification) => {
      expectInvalid(
        canonicalizeTriageResult({
          schemaVersion: 1,
          decisions: [{
            observationId: 'commit:aaaaaaaa',
            classification,
            rationale: 'Not a high candidate.',
            routeId: 'default-fix',
          }],
        }, hostContext()),
        /cannot nominate a candidate route/,
      )
      expectInvalid(
        canonicalizeTriageResult({
          schemaVersion: 1,
          decisions: [{
            observationId: 'commit:aaaaaaaa',
            classification,
            rationale: 'Not a high candidate.',
            candidate: { candidateId: 'owned-by-provider' },
          }],
        }, hostContext()),
        /unknown key 'candidate'.*host trust boundary/,
      )
    },
  )

  it('拒绝 provider 提供 provenance、candidate identity、resolved route、path 或 command 字段', () => {
    const privilegedFields: ReadonlyArray<readonly [string, unknown]> = [
      ['candidateId', 'provider-candidate'],
      ['creationKey', 'provider-key'],
      ['changeName', 'provider-change'],
      ['resolved', { workflowId: 'evil', initialStep: 'run' }],
      ['repoPath', '/tmp/other-repo'],
      ['command', 'rm -rf something'],
    ]
    for (const [field, value] of privilegedFields) {
      expectInvalid(
        canonicalizeTriageResult({
          schemaVersion: 1,
          decisions: [{
            observationId: 'commit:aaaaaaaa',
            classification: 'high',
            rationale: 'Provider may classify only.',
            routeId: 'default-fix',
            [field]: value,
          }],
        }, hostContext()),
        new RegExp(`unknown key '${field}'`),
      )
    }
    expectInvalid(
      canonicalizeTriageResult({
        schemaVersion: 1,
        decisions: [{
          observationId: 'commit:aaaaaaaa',
          classification: 'high',
          rationale: 'Provider may classify only.',
          routeId: 'default-fix',
        }],
        provider: { kind: 'claude', model: 'spoofed', invocationId: 'spoofed' },
      }, hostContext()),
      /unknown key 'provider'.*host trust boundary/,
    )
  })

  it('读取 provider 已知字段恰好一次，unknown getter 不执行；之后突变 raw 不影响 canonical', () => {
    const reads = { observationId: 0, classification: 0, rationale: 0, routeId: 0, unknown: 0 }
    const values = {
      observationId: 'commit:aaaaaaaa',
      classification: 'high',
      rationale: 'Read exactly once.',
      routeId: 'default-fix',
    }
    const decision: Record<string, unknown> = {}
    for (const key of Object.keys(values) as Array<keyof typeof values>) {
      Object.defineProperty(decision, key, {
        enumerable: true,
        get() {
          reads[key] += 1
          return values[key]
        },
      })
    }
    Object.defineProperty(decision, 'command', {
      enumerable: true,
      configurable: true,
      get() {
        reads.unknown += 1
        throw new Error('unknown getter must not execute')
      },
    })
    const rejected = canonicalizeTriageResult({ schemaVersion: 1, decisions: [decision] }, hostContext())
    expectInvalid(rejected, /unknown key 'command'/)
    expect(reads).toEqual({ observationId: 1, classification: 1, rationale: 1, routeId: 1, unknown: 0 })

    delete decision.command
    const accepted = canonicalizeTriageResult({ schemaVersion: 1, decisions: [decision] }, hostContext())
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) throw new Error(accepted.errors.join('\n'))
    expect(reads).toEqual({ observationId: 2, classification: 2, rationale: 2, routeId: 2, unknown: 0 })
    values.rationale = 'Mutated after validation.'
    expect(accepted.value.decisions[0]!.rationale).toBe('Read exactly once.')
  })

  it('candidate identity 与 route resolved values 只取 host 派生/目录值，并校验安全 changeName', () => {
    const raw = {
      schemaVersion: 1,
      decisions: [{
        observationId: 'commit:aaaaaaaa',
        classification: 'high',
        rationale: 'Needs a host candidate.',
        routeId: 'default-fix',
      }],
    }
    const canonical = canonicalizeTriageResult(raw, hostContext({
      deriveCandidate: () => ({
        candidateId: 'host:candidate',
        creationKey: 'host:creation:key',
        changeName: 'host_change',
      }),
    }))
    expect(canonical).toMatchObject({
      ok: true,
      value: {
        decisions: [{
          candidate: {
            candidateId: 'host:candidate',
            creationKey: 'host:creation:key',
            changeName: 'host_change',
            route: { resolved: { workflowId: 'default', initialStep: 'open' } },
          },
        }],
      },
    })

    expectInvalid(
      canonicalizeTriageResult(raw, hostContext({
        deriveCandidate: () => ({
          candidateId: 'host:candidate',
          creationKey: 'host:creation:key',
          changeName: '../escape',
        }),
      })),
      /changeName.*single safe change name/,
    )
  })

  it('核心 provenance kind 保持中立，不把 Codex 写成 kernel 闭集', () => {
    const result = canonicalizeTriageResult({
      schemaVersion: 1,
      decisions: [{
        observationId: 'commit:aaaaaaaa',
        classification: 'noise',
        rationale: 'No candidate.',
      }],
    }, hostContext({
      provider: { kind: 'test-provider', model: 'vendor/model:fixture-v1', invocationId: 'fixture/1' },
    }))
    expect(result).toMatchObject({
      ok: true,
      value: { provider: { kind: 'test-provider' } },
    })
  })

  it('canonical decisions 固定按 host page 顺序，不让 provider 重排影响 highIndex', () => {
    const second = {
      ...page.observations[0],
      observationId: 'commit:bbbbbbbb',
      title: 'Second commit',
    }
    const twoItemPage = { ...page, observations: [page.observations[0], second] }
    const seenHighIndexes: number[] = []
    const result = canonicalizeTriageResult({
      schemaVersion: 1,
      decisions: [
        {
          observationId: 'commit:bbbbbbbb',
          classification: 'high',
          rationale: 'Second item is actionable.',
          routeId: 'default-fix',
        },
        { observationId: 'commit:aaaaaaaa', classification: 'watch', rationale: 'First item can wait.' },
      ],
    }, hostContext({
      page: twoItemPage,
      deriveCandidate: ({ observation, highIndex }: {
        observation: { observationId: string }
        highIndex: number
      }) => {
        seenHighIndexes.push(highIndex)
        return {
          candidateId: `host:${observation.observationId}`,
          creationKey: `host:${observation.observationId}:create`,
          changeName: 'host_second',
        }
      },
    }))

    expect(result).toMatchObject({
      ok: true,
      value: {
        decisions: [
          { observationId: 'commit:aaaaaaaa', classification: 'watch' },
          { observationId: 'commit:bbbbbbbb', classification: 'high' },
        ],
      },
    })
    expect(seenHighIndexes).toEqual([0])
  })

  it('TriageRoute 自身是 host-only 闭集，拒绝 command/path 与重复 routeId', () => {
    expect(validateTriageRoutes(routes)).toMatchObject({ ok: true })
    expectInvalid(
      validateTriageRoutes([{ ...routes[0], command: 'tenon transition' }]),
      /unknown key 'command'/,
    )
    expectInvalid(
      validateTriageRoutes([routes[0], { ...routes[0] }]),
      /duplicate routeId 'default-fix'/,
    )
  })
})
