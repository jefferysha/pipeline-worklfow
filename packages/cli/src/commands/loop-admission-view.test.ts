/**
 * evaluateSkillBundleWiring —— H10 §6/§8任务7 唯一 wiring 判定（H11 只消费、不复制判断逻辑；
 * loop-run.ts 的 --dry-run 预览是当前唯一消费点）。三态：
 *   unwired —— skill_bundle_id 字段缺失/null。
 *   invalid —— 具名 profile 不存在（或校验器未装配）/ 静态 resolveSkillBundle 抛错 / 有效 slot
 *              在当前安装面（locator）任一 alternative 均无法定位。
 *   ready   —— 显式 profile 合法（或 `_all`）且 loop 声明的每个 phase 静态解析出的每个 slot 都能
 *              在当前安装面定位（含合法空 slot 集——设计 §2「profile 合法但本 step 解析结果确实
 *              为空，是合法的空快照，不算未接线」）。
 *
 * 只测判定纯逻辑：resolver/locator 全 fake（零真 fs/manifest I/O，符合本模块「纯读面」定位）。
 */
import { describe, expect, it, vi } from 'vitest'
import type { EffectiveSkillResolver, EffectiveSkillSlot, LoopEntry } from '@pipeline-lite/kernel'
import { evaluateSkillBundleWiring, type SkillBundleWiringDeps } from './loop-admission-view.js'

function loop(over: Partial<LoopEntry> = {}): LoopEntry {
  return {
    id: 'loop-be', name: 'BE loop', kind: 'orchestrator', goal: 'x'.repeat(12), cadence: '1h',
    risk: 'medium', runner: 'claude-code', change_prefix: 'loop-be-', phases: ['explore', 'build'],
    human_gates: ['g'], state: '.superpowers/loops/progress.md', design_doc: 'd', status: 'active',
    budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip' }, kill_criteria: ['k'],
    autonomy_level: 'L1', allowlist: [], denylist: [], ...over,
  }
}

/** resolveDefault 恒返回 slots 的 fake resolver（resolveCustom 本评估器不消费，随手实现满足类型）。 */
function fakeResolver(slotsByPhase: Record<string, EffectiveSkillSlot[]> = {}): EffectiveSkillResolver {
  return {
    resolveDefault: (stepId: string) => slotsByPhase[stepId] ?? [],
    resolveCustom: () => [],
  }
}

/** throw 的 resolver：模拟「manifest token 畸形」等静态解析结构性失败。 */
function throwingResolver(message = 'manifest token 畸形'): EffectiveSkillResolver {
  return {
    resolveDefault: () => { throw new Error(message) },
    resolveCustom: () => [],
  }
}

/** `_tag` 携带的 fake 错误（镜像 runtime `locate()` 的真实契约——H10 复审阻断7后，
 *  evaluateSkillBundleWiring 按 `_tag` 区分 not-found（继续试下一候选）与其余错误（立即失败），
 *  fake 必须诚实标出它模拟的是哪一种，不能再用无 `_tag` 的裸 Error 蒙混过关）。 */
function taggedError(tag: string, message: string): Error {
  return Object.assign(new Error(message), { _tag: tag })
}

/** locator：给定「能定位」的 skill id 白名单，其余一律 `SkillContentNotFoundError`（`_tag` 语义
 *  对齐 runtime content-locator.ts::locate()——not-found 是 evaluateSkillBundleWiring 唯一允许
 *  继续试下一候选的错误类型，见 loop-admission-view.ts::locateSlot 头注）。 */
function fakeLocator(locatable: readonly string[]): SkillBundleWiringDeps['locator'] {
  return {
    locate: async (skillId: string) => {
      if (locatable.includes(skillId)) return { skillId, contentDir: `/fake/${skillId}` }
      throw taggedError('SkillContentNotFoundError', `skill '${skillId}' 未找到`)
    },
  }
}

/** locator：首个候选按 `firstTag` 指定的**非 not-found**错误失败，其余候选原本可定位——用于证明
 *  evaluateSkillBundleWiring 遇到 ambiguous/content-invalid 等首候选错误时必须立即判 invalid，
 *  绝不像旧实现那样吞掉错误、悄悄尝试下一候选侥幸成功（H10 复审阻断7：那会把 real-run 必定
 *  fail-closed 的 loop 误报成 ready）。返回的 `locate` mock 供断言调用次数——第二候选绝不该被尝试。 */
function locatorFirstCandidatePoisoned(
  firstTag: string, otherLocatable: readonly string[],
): { locator: SkillBundleWiringDeps['locator']; locate: ReturnType<typeof vi.fn> } {
  const locate = vi.fn(async (skillId: string) => {
    if (otherLocatable.includes(skillId)) return { skillId, contentDir: `/fake/${skillId}` }
    throw taggedError(firstTag, `skill '${skillId}' 定位失败：${firstTag}`)
  })
  return { locator: { locate }, locate }
}

const NO_SLOTS = fakeResolver()

describe('evaluateSkillBundleWiring', () => {
  it('unwired：skill_bundle_id 缺失（undefined）', async () => {
    const r = await evaluateSkillBundleWiring(loop({ skill_bundle_id: undefined }), {
      resolver: NO_SLOTS, locator: fakeLocator([]),
    })
    expect(r.status).toBe('unwired')
    expect(r.bundleId).toBeNull()
  })

  it('unwired：skill_bundle_id 显式 null', async () => {
    const r = await evaluateSkillBundleWiring(loop({ skill_bundle_id: null }), {
      resolver: NO_SLOTS, locator: fakeLocator([]),
    })
    expect(r.status).toBe('unwired')
  })

  it('invalid：具名 profile + isSkillProfileKnown 返回 false（profile 不在合法键空间）', async () => {
    const r = await evaluateSkillBundleWiring(loop({ skill_bundle_id: 'ghost-track' }), {
      resolver: NO_SLOTS, locator: fakeLocator([]), isSkillProfileKnown: () => false,
    })
    expect(r.status).toBe('invalid')
    expect(r.bundleId).toBe('ghost-track')
    expect(r.reason).toMatch(/ghost-track/)
  })

  it('invalid：具名 profile + isSkillProfileKnown 未装配（不是"确定不存在"，但一样不能报 ready）', async () => {
    const r = await evaluateSkillBundleWiring(loop({ skill_bundle_id: 'backend' }), {
      resolver: NO_SLOTS, locator: fakeLocator([]),
    })
    expect(r.status).toBe('invalid')
  })

  it('ready：`_all` 无需 isSkillProfileKnown，且各 phase 解析结果为空 slots（合法空快照）', async () => {
    const r = await evaluateSkillBundleWiring(loop({ skill_bundle_id: '_all' }), {
      resolver: NO_SLOTS, locator: fakeLocator([]),
    })
    expect(r.status).toBe('ready')
    expect(r.bundleId).toBe('_all')
    expect(r.reason).toBeNull()
  })

  it('custom workflow 未提供 host 已编译 StepIR 计划 → fail-closed，绝不偷用同名 default phase', async () => {
    const resolveDefault = vi.fn(() => [])
    const resolveCustom = vi.fn(() => [])
    const r = await evaluateSkillBundleWiring(
      loop({ workflow_id: 'custom-wf', skill_bundle_id: '_all', phases: ['build'] }),
      { resolver: { resolveDefault, resolveCustom }, locator: fakeLocator([]) },
    )

    expect(r.status).toBe('invalid')
    expect(r.reason).toMatch(/custom-wf|custom workflow|StepIR|解析计划/i)
    expect(resolveDefault).not.toHaveBeenCalled()
    expect(resolveCustom).not.toHaveBeenCalled()
  })

  it('ready：具名已知 profile + 每个 slot 至少一个 alternative 可定位', async () => {
    const resolver = fakeResolver({
      explore: [{ token: 'a', alternatives: ['a'] }],
      build: [{ token: 'b|c', alternatives: ['b', 'c'] }],
    })
    const r = await evaluateSkillBundleWiring(loop({ skill_bundle_id: 'backend' }), {
      resolver, locator: fakeLocator(['a', 'c']), isSkillProfileKnown: (id) => id === 'backend',
    })
    expect(r.status).toBe('ready')
  })

  it('invalid：某 slot 的所有 alternative 均无法定位', async () => {
    const resolver = fakeResolver({ build: [{ token: 'b|c', alternatives: ['b', 'c'] }] })
    const r = await evaluateSkillBundleWiring(loop({ skill_bundle_id: 'backend' }), {
      resolver, locator: fakeLocator(['a']), isSkillProfileKnown: () => true,
    })
    expect(r.status).toBe('invalid')
    expect(r.reason).toMatch(/build/)
  })

  // ── H10 复审阻断7：alternative 分类边界必须与 runtime selectFirstLocatable 一致 ────────────────
  // 仅 not-found 允许继续试下一候选；内容损坏/来源歧义必须立即判 invalid，绝不允许悄悄尝试下一
  // 候选侥幸成功——否则 H11/dry-run 会把一个 real-run 必定 fail-closed 的 loop 误报成 ready。

  it('invalid（而非 ready）：首候选 SkillContentSourceAmbiguousError（来源歧义）立即失败，不得尝试下一候选侥幸成功', async () => {
    const resolver = fakeResolver({ build: [{ token: 'b|c', alternatives: ['b', 'c'] }] })
    const { locator, locate } = locatorFirstCandidatePoisoned('SkillContentSourceAmbiguousError', ['c'])
    const r = await evaluateSkillBundleWiring(loop({ skill_bundle_id: 'backend' }), {
      resolver, locator, isSkillProfileKnown: () => true,
    })
    // 旧实现（裸 catch{} 吞掉一切错误）会在 'b' 失败后接着试 'c'，'c' 可定位 → 误判 ready。
    expect(r.status).toBe('invalid')
    expect(r.reason).toMatch(/build/)
    expect(locate).toHaveBeenCalledTimes(1) // 'c' 绝不该被尝试——非 not-found 立即失败，不再往下试
  })

  it('invalid（而非 ready）：首候选 SkillContentInvalidError（内容损坏）立即失败，不得尝试下一候选侥幸成功', async () => {
    const resolver = fakeResolver({ build: [{ token: 'b|c', alternatives: ['b', 'c'] }] })
    const { locator, locate } = locatorFirstCandidatePoisoned('SkillContentInvalidError', ['c'])
    const r = await evaluateSkillBundleWiring(loop({ skill_bundle_id: 'backend' }), {
      resolver, locator, isSkillProfileKnown: () => true,
    })
    expect(r.status).toBe('invalid')
    expect(locate).toHaveBeenCalledTimes(1)
  })

  it('invalid：未识别的错误 `_tag`（既非 not-found 也非已知损坏/歧义类型）同样立即失败，不得当 not-found 继续试下一候选', async () => {
    const resolver = fakeResolver({ build: [{ token: 'b|c', alternatives: ['b', 'c'] }] })
    const { locator, locate } = locatorFirstCandidatePoisoned('SomeFutureUnrecognizedError', ['c'])
    const r = await evaluateSkillBundleWiring(loop({ skill_bundle_id: 'backend' }), {
      resolver, locator, isSkillProfileKnown: () => true,
    })
    expect(r.status).toBe('invalid')
    expect(locate).toHaveBeenCalledTimes(1)
  })

  it('invalid：resolver 对某 phase 静态解析抛错（manifest token 畸形等结构性失败）', async () => {
    const r = await evaluateSkillBundleWiring(loop({ skill_bundle_id: 'backend' }), {
      resolver: throwingResolver(), locator: fakeLocator([]), isSkillProfileKnown: () => true,
    })
    expect(r.status).toBe('invalid')
  })

  it('loop.phases 为空 → 无需任何解析，trivial ready（`_all`）', async () => {
    const r = await evaluateSkillBundleWiring(loop({ skill_bundle_id: '_all', phases: [] }), {
      resolver: NO_SLOTS, locator: fakeLocator([]),
    })
    expect(r.status).toBe('ready')
  })

  it('不改变 loop.phases 顺序以外的判定：resolveDefault 收到的 stepId 恒等于该 phase', async () => {
    const seen: string[] = []
    const resolver: EffectiveSkillResolver = {
      resolveDefault: (stepId) => { seen.push(stepId); return [] },
      resolveCustom: () => [],
    }
    await evaluateSkillBundleWiring(loop({ skill_bundle_id: '_all', phases: ['explore', 'build'] }), {
      resolver, locator: fakeLocator([]),
    })
    expect(seen).toEqual(['explore', 'build'])
  })
})
