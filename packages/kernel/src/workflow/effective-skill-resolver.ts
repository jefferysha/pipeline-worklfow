/**
 * EffectiveSkillResolver（G2 P5）——artifact register 校验「谁产出了这条 artifact」的领域接缝。
 *
 * 两种解析能力，一一对应 artifact 的两种 producer policy（见 types.ts::ArtifactProducerPolicy）：
 *   · resolveDefault(stepId, track) —— default 轨（producerPolicy: effective-phase-skills）：产出者
 *     值域 = 当前 phase×track 的 manifest 有效 skill 集 = mandatory（前）＋ recommended（后），
 *     经 skillsFor 三级回退（per-track → `_all` → 空）取值，按 token 稳定去重、逐 token 以 `|`
 *     拆成具体 alternatives。default step id 即 phase（default.yaml 的 step id = open/explore/...）。
 *   · resolveCustom(step, track) —— custom 轨（producerPolicy: effective-step-skills）：产出者值域
 *     = 本 step 声明的 skill 集（step.skills[].id），稳定去重、**每个 id 是具体 skill、不把 `|`
 *     隐式当 alternative**（custom SkillRef.id 语义是实际 id，`a|b` 备选只存在于 manifest 契约；
 *     且 validateWorkflow 的 SKILL_IDENT_RE 本就不许 id 含 `|`）。
 *
 * slot 保留 alternative 关系（不扁平成 string[]/Set）：调用方（artifact register）据此判定
 * `--producer` 是否精确命中「某个有效 skill 槽的某个具体 alternative」，而不能把整个 `a|b` token
 * 当合法 producer（那是从未被实际调用的伪 id）。
 *
 * T-R6 生产装配使用 createEffectiveSkillResolver({ registry, manifest })：default artifact 分支先从
 * track.policyProfile.skills.profile 得 profile，再走 profile → `_all` → []。registry 可传快照或 fresh-load
 * 函数，CLI 采用后者，保证同进程 CRUD 后不复用旧 registry。H10 的 skill_bundle_id 本身就是 profile，
 * 走 resolveDefaultProfile，避免把 `_all` 等 profile 错当 track id。
 */
import { skillsFor, skillTokenAlternatives, type SkillTable } from '../flow/manifest.js'
import type { TrackRegistry } from '../tracks/types.js'
import type { Phase } from '../types.js'
import type { EffectiveWorkflowPlan } from './effective-plan.js'
import type { StepIR } from './ir.js'

/** 一个「有效 skill 槽」：token 是原始 manifest/step 记法，alternatives 是其具体可选 skill id
 *  （default 的 `a|b` 拆分产物 / custom 的单元素 [id]）；`--producer` 须精确等于某 alternative。 */
export interface EffectiveSkillSlot {
  readonly token: string
  readonly alternatives: readonly string[]
}

export interface EffectiveSkillResolver {
  /** Explicit Review classification for dispatch gates; false/undefined means ordinary work. */
  reviewLaneFor?(
    capability: EffectiveWorkflowPlan['capabilities']['skills'],
    stepId: string,
    skillId: string,
  ): string | undefined
  /**
   * Resolve the mandatory exit requirements declared by an EffectiveWorkflowPlan.  Runtime
   * consumers use this one entrypoint for every execution model; source dispatch is contained
   * inside the resolver and is driven exclusively by the frozen capability.
   */
  resolveRequired?(
    capability: EffectiveWorkflowPlan['capabilities']['skills'],
    stepId: string,
  ): readonly EffectiveSkillSlot[]
  /** Resolve every declared producer/orchestration slot (mandatory plus recommended overlays). */
  resolveAvailable?(
    capability: EffectiveWorkflowPlan['capabilities']['skills'],
    stepId: string,
  ): readonly EffectiveSkillSlot[]
  /** default 轨当前 step 的硬阻断 skill 槽；不含 recommended。 */
  resolveDefaultMandatory(stepId: string, track: string): readonly EffectiveSkillSlot[]
  /** default 轨 step/track 的有效 skill 槽（manifest mandatory＋recommended，稳定去重＋a|b 拆分）。 */
  resolveDefault(stepId: string, track: string): readonly EffectiveSkillSlot[]
  /** 已解析 profile 的入口（H10 skill bundle）；缺省仅供兼容手写 resolver，由适配层回退 resolveDefault。 */
  resolveDefaultProfile?(stepId: string, profile: string): readonly EffectiveSkillSlot[]
  /** custom 轨 step/track 的有效 skill 槽（step.skills[].id，稳定去重，不拆 `|`）。 */
  resolveCustom(step: StepIR, track: string): readonly EffectiveSkillSlot[]
}

/** 兼容装配面：调用方已持有 profile 时可直接注入 manifest。 */
export interface EffectiveSkillResolverManifest {
  readonly mandatorySkills: SkillTable
  readonly recommendedSkills: SkillTable
  readonly reviewSkillLanes?: Readonly<Record<string, string>>
}

/** T-R6 装配面：effective registry 决定 track 使用哪个 manifest skill profile。 */
export interface EffectiveSkillResolverOptions {
  /** CLI 传 fresh loader；短生命周期/不可变上下文也可传快照。 */
  readonly registry: TrackRegistry | (() => TrackRegistry)
  readonly manifest: EffectiveSkillResolverManifest
}

/**
 * Compatibility bridge for injected resolvers created before EffectiveWorkflowPlan existed.
 * Capability dispatch remains centralized here; transition/check adapters never reconstruct it.
 */
export function resolveRequiredSkillSlots(
  resolver: EffectiveSkillResolver | undefined,
  capability: EffectiveWorkflowPlan['capabilities']['skills'],
  stepId: string,
): readonly EffectiveSkillSlot[] {
  if (resolver?.resolveRequired !== undefined) return resolver.resolveRequired(capability, stepId)
  if (capability.source === 'manifest-overlay') {
    if (!capability.trackOverlay.matrix || resolver === undefined) return []
    return resolver.resolveDefaultMandatory(stepId, capability.trackOverlay.profile)
  }
  const step = capability.steps.find((candidate) => candidate.stepId === stepId)
  return (step?.requiredSkillIds ?? []).map((id) => ({ token: id, alternatives: [id] }))
}

export function resolveAvailableSkillSlots(
  resolver: EffectiveSkillResolver,
  capability: EffectiveWorkflowPlan['capabilities']['skills'],
  stepId: string,
): readonly EffectiveSkillSlot[] {
  if (resolver.resolveAvailable !== undefined) return resolver.resolveAvailable(capability, stepId)
  if (capability.source === 'manifest-overlay') {
    if (!capability.trackOverlay.matrix) return []
    return resolver.resolveDefaultProfile?.(stepId, capability.trackOverlay.profile)
      ?? resolver.resolveDefault(stepId, capability.trackOverlay.profile)
  }
  const step = capability.steps.find((candidate) => candidate.stepId === stepId)
  return (step?.requiredSkillIds ?? []).map((id) => ({ token: id, alternatives: [id] }))
}

/** 稳定去重（保留首次出现顺序）。 */
function dedupeStable(tokens: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tokens) {
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

export function createEffectiveSkillResolver(options: EffectiveSkillResolverOptions): EffectiveSkillResolver
/** 兼容 P5 外部调用；仓内生产装配使用 registry-aware 形态。 */
export function createEffectiveSkillResolver(manifest: EffectiveSkillResolverManifest): EffectiveSkillResolver
export function createEffectiveSkillResolver(
  input: EffectiveSkillResolverOptions | EffectiveSkillResolverManifest,
): EffectiveSkillResolver {
  const registry = 'registry' in input ? input.registry : undefined
  const manifest = 'manifest' in input ? input.manifest : input
  const resolveProfile = (stepId: string, profile: string): readonly EffectiveSkillSlot[] => {
    const mandatory = skillsFor(manifest.mandatorySkills, stepId as Phase, profile)
    const recommended = skillsFor(manifest.recommendedSkills, stepId as Phase, profile)
    return dedupeStable([...mandatory, ...recommended]).map((token) => ({
      token,
      alternatives: skillTokenAlternatives(token),
    }))
  }
  return {
    reviewLaneFor(capability, stepId, skillId) {
      if (capability.source === 'manifest-overlay') return manifest.reviewSkillLanes?.[skillId]
      const step = capability.steps.find((candidate) => candidate.stepId === stepId)
      return step?.declared.find((skill) => skill.id === skillId && skill.kind === 'review')?.reviewLane
    },
    resolveRequired(capability, stepId) {
      if (capability.source === 'manifest-overlay') {
        if (!capability.trackOverlay.matrix) return []
        const profile = capability.trackOverlay.profile
        return dedupeStable(skillsFor(manifest.mandatorySkills, stepId as Phase, profile)).map((token) => ({
          token,
          alternatives: skillTokenAlternatives(token),
        }))
      }
      const step = capability.steps.find((candidate) => candidate.stepId === stepId)
      return dedupeStable(step?.requiredSkillIds ?? []).map((id) => ({ token: id, alternatives: [id] }))
    },
    resolveAvailable(capability, stepId) {
      if (capability.source === 'manifest-overlay') {
        if (!capability.trackOverlay.matrix) return []
        return resolveProfile(stepId, capability.trackOverlay.profile)
      }
      const step = capability.steps.find((candidate) => candidate.stepId === stepId)
      return dedupeStable(step?.requiredSkillIds ?? []).map((id) => ({ token: id, alternatives: [id] }))
    },
    resolveDefaultMandatory(stepId, track) {
      const currentRegistry = typeof registry === 'function' ? registry() : registry
      const profile = currentRegistry === undefined ? track : currentRegistry.byId.get(track)?.policyProfile.skills.profile
      if (profile === undefined) throw new Error(`unknown track '${track}' in effective skill resolver`)
      return dedupeStable(skillsFor(manifest.mandatorySkills, stepId as Phase, profile)).map((token) => ({
        token,
        alternatives: skillTokenAlternatives(token),
      }))
    },
    resolveDefault(stepId, track) {
      const currentRegistry = typeof registry === 'function' ? registry() : registry
      const profile = currentRegistry === undefined ? track : currentRegistry.byId.get(track)?.policyProfile.skills.profile
      if (profile === undefined) throw new Error(`unknown track '${track}' in effective skill resolver`)
      return resolveProfile(stepId, profile)
    },
    resolveDefaultProfile: resolveProfile,
    // track 目前不参与 custom 解析（step.skills 固定）——保留在签名里供 T-R6 track-条件 custom skill 接线。
    resolveCustom(step, _track) {
      // custom id 是具体 skill：token===id、alternatives=[id]，**不**按 `|` 拆分（不扩大未声明 DSL）。
      return dedupeStable(step.skills.map((s) => s.id)).map((id) => ({ token: id, alternatives: [id] }))
    },
  }
}
