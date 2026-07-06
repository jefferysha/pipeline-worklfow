/**
 * kernel/flow 公共面（T3）：
 *   · loadManifest(path)            —— templates/manifest.yaml 窄解析 → ManifestData
 *   · createFlowEngine(manifest)    —— types.ts::FlowEngine 实现（+ ReviewGate.isReviewPhase）
 * integrate 阶段由 packages/kernel/src/index.ts re-export。
 */
export { loadManifest, ManifestError } from './manifest.js'
export { createFlowEngine } from './engine.js'
export type { ReviewGate } from './engine.js'
// manifest 全派生面（BACKLOG #18）——供 router hook #19 / guard skill 面消费
export { skillsFor, genRouterSh } from './manifest.js'
export type { ExtendedManifestData, SkillTable, SkillTrackKey, RouterPatterns } from './manifest.js'
// transition 单一真相源（BACKLOG #25b / GOAL B2）——事件表 + 前置校验 + 副作用，供 cli/server 共消费
export { TRANSITION_EVENTS, eventEdge, checkTransitionPreconditions, applyTransitionEffects } from './transition-table.js'
export type { EventEdge, EventName, TransitionContext, TransitionEffectResult } from './transition-table.js'
