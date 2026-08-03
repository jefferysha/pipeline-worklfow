import {
  ManagedRuntimeIndeterminateError,
  type ManagedReleaseJournalRecord,
} from './installer.js'

export const HOST_OBSERVATION_LIMIT = 1_000_000
export const HOST_REPLAY_POLICY = 'observe-before-replay-v1' as const

export function assertManagedHostObservation(value: string, label: string): void {
  if (value === '' || value.length > HOST_OBSERVATION_LIMIT) {
    throw new ManagedRuntimeIndeterminateError(
      `${label} 必须是非空且不超过 ${HOST_OBSERVATION_LIMIT} 字符的规范化宿主 observation`,
    )
  }
}

export type ManagedHostRecoveryDecision = 'checkpoint' | 'execute'

export interface ManagedHostStepExecution {
  readonly desired: string
  /** Optional domain-owned identity comparison. Generic callers remain byte-exact by default. */
  isEquivalentDesired?(persistedDesired: string): boolean
  observe(): string | Promise<string>
  isDesired(observation: string): boolean
  execute(): string | Promise<string>
}

/**
 * Recovery has exactly two safe states. Anything else may include a concurrent host mutation and
 * therefore cannot authorize either replay or checkpoint completion.
 */
export function decideManagedHostRecovery(
  before: string,
  observed: string,
  isDesired: (observation: string) => boolean,
): ManagedHostRecoveryDecision {
  if (isDesired(observed)) return 'checkpoint'
  if (observed === before) return 'execute'
  throw new ManagedRuntimeIndeterminateError(
    '宿主 observation 既不满足 desired，也不精确等于 before；拒绝猜测或重放 mutation',
  )
}

export function createManagedHostStepRunner(context: {
  journal(): ManagedReleaseJournalRecord
  commit(record: ManagedReleaseJournalRecord): Promise<void>
  now(): string
}): (id: string, step: ManagedHostStepExecution) => Promise<string> {
  return async (id, step) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`host step id 非法：${id}`)
    assertManagedHostObservation(step.desired, `host step '${id}' desired`)
    let journal = context.journal()
    const existing = journal.hostSteps?.find((item) => item.id === id)
    const desiredMatches = (persistedDesired: string): boolean =>
      persistedDesired === step.desired
      || step.isEquivalentDesired?.(persistedDesired) === true
    if (existing?.state === 'completed') {
      if (existing.desired === undefined
        || !desiredMatches(existing.desired)
        || existing.replayPolicy !== HOST_REPLAY_POLICY
        || existing.observedAfter === undefined
        || !step.isDesired(existing.observedAfter)) {
        throw new ManagedRuntimeIndeterminateError(
          `host step '${id}' completed checkpoint 缺少或不匹配 desired-state proof`,
        )
      }
      const observed = await step.observe()
      assertManagedHostObservation(observed, `host step '${id}' completed recovery observation`)
      if (!step.isDesired(observed)) {
        throw new ManagedRuntimeIndeterminateError(
          `host step '${id}' completed checkpoint 后的权威 inventory 已不满足 desired；拒绝继续或重放`,
        )
      }
      return existing.result ?? ''
    }

    let decision: ManagedHostRecoveryDecision = 'execute'
    if (existing === undefined) {
      const before = await step.observe()
      assertManagedHostObservation(before, `host step '${id}' before`)
      journal = {
        ...journal,
        hostSteps: [...(journal.hostSteps ?? []), {
          id,
          state: 'started',
          before,
          desired: step.desired,
          replayPolicy: HOST_REPLAY_POLICY,
        }],
        updatedAt: context.now(),
      }
      await context.commit(journal)
      decision = step.isDesired(before) ? 'checkpoint' : 'execute'
    } else {
      if (existing.before === undefined
        || existing.desired === undefined
        || existing.replayPolicy !== HOST_REPLAY_POLICY) {
        throw new ManagedRuntimeIndeterminateError(
          `host step '${id}' 是缺少 before/desired/replayPolicy 的旧 pending WAL；拒绝自动重放`,
        )
      }
      if (!desiredMatches(existing.desired)) {
        throw new ManagedRuntimeIndeterminateError(
          `host step '${id}' 当前 desired 与 WAL 不一致；拒绝重解释 pending mutation`,
        )
      }
      const observed = await step.observe()
      assertManagedHostObservation(observed, `host step '${id}' recovery observation`)
      decision = decideManagedHostRecovery(existing.before, observed, step.isDesired)
    }

    const result = decision === 'execute' ? await step.execute() : ''
    if (result.length > HOST_OBSERVATION_LIMIT) {
      throw new Error(`host step '${id}' 结果超过 journal 上限`)
    }
    const observedAfter = await step.observe()
    assertManagedHostObservation(observedAfter, `host step '${id}' observed-after`)
    if (!step.isDesired(observedAfter)) {
      throw new ManagedRuntimeIndeterminateError(
        `host step '${id}' 执行后未证明 desired postcondition`,
      )
    }
    journal = {
      ...journal,
      hostSteps: (journal.hostSteps ?? []).map((item) =>
        item.id === id
          ? { ...item, state: 'completed' as const, observedAfter, result }
          : item),
      updatedAt: context.now(),
    }
    await context.commit(journal)
    return result
  }
}
