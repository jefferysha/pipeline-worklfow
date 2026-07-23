/**
 * default workflow artifact declaration 查询层（G2 P4，手写）——default 轨运行时从只读生成表
 * DEFAULT_ARTIFACT_DECLARATIONS（default-workflow.generated.ts，由 tools/generate-default-workflow.mjs
 * 从 templates/workflows/default.yaml 生成）按 step/track 取「本 step/track 有哪些 file artifact、其
 * producer policy」。
 *
 * 边界（codex P4 定稿 D5）：本层只读生成表 + 用 matchesTrackPredicate 过滤 requiredWhen，返回只读声明。
 * 不读 outputs、不解析模板文件、不校验 producer 的具体 skill、不写 state——producer 的具体 skill id
 * 归一化（含 manifest 的 a|b 备选 token）与 artifact 登记是 G2 P5 artifact register 经
 * EffectiveSkillResolver 的职责，本层只提供 declaration 接缝。生成物只含数据不含判定函数（判定集中
 * 在本层），P5 的 artifact register 只经本 API 取 default declaration，不再读 YAML 或复制字段表。
 */
import { matchesTrackPredicate, type TrackPredicate } from './predicates.js'
import type { FieldName } from '../types.js'
import type { ArtifactProducerPolicy } from './types.js'
import { DEFAULT_ARTIFACT_DECLARATIONS } from './default-workflow.generated.js'

/** 生成表单条 artifact 声明的形状（生成物 `as const satisfies Readonly<Record<string, readonly
 *  DefaultArtifactDeclaration[]>>` 钉死本类型）。 */
export interface DefaultArtifactDeclaration {
  readonly kind: 'file'
  readonly field: FieldName
  readonly type: 'file_path'
  readonly producerPolicy: ArtifactProducerPolicy
  readonly requiredWhen?: TrackPredicate
}

const TABLE: Readonly<Record<string, readonly DefaultArtifactDeclaration[]>> = DEFAULT_ARTIFACT_DECLARATIONS

/**
 * default 轨某 step/track 适用的 file artifact 声明（只读）。requiredWhen 缺省 = 全轨适用；有则经
 * matchesTrackPredicate 过滤。default 的 spec `plan` artifact 沿用原流程，仅非 PM track 适用；PM 的
 * OpenSpec document ledger 仍要求可审计的 plan 文档，但不借此强加 legacy state artifact。无 artifact
 * 的 step（open/build/ship/archive）→ 空数组。
 */
export function defaultArtifactsForStep(stepId: string, track: string): readonly DefaultArtifactDeclaration[] {
  const decls = TABLE[stepId] ?? []
  return decls.filter((d) => d.requiredWhen === undefined || matchesTrackPredicate(d.requiredWhen, track))
}

/** 某 step/track 下某 field 的 artifact 声明；该 step 无此 field 的 artifact、或 track 被 requiredWhen
 *  排除 → undefined。 */
export function defaultArtifactForField(
  stepId: string,
  field: FieldName,
  track: string,
): DefaultArtifactDeclaration | undefined {
  return defaultArtifactsForStep(stepId, track).find((d) => d.field === field)
}

/**
 * 该 step 是否**声明**了该 field 的 artifact（不经 requiredWhen/track 过滤，G2 P5）。artifact register
 * 用它区分两类拒绝：declared-but-track-excluded（defaultArtifactForField 返 undefined 但本函数 true →
 * 「对 track 不适用」）vs never-declared（两者皆假 → 「step 未声明」）。纯存在性判定，不返回声明体。
 */
export function defaultArtifactDeclaredForField(stepId: string, field: FieldName): boolean {
  return (TABLE[stepId] ?? []).some((d) => d.field === field)
}
