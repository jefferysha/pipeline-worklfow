/**
 * kernel/flow 公共面（T3）：
 *   · loadManifest(path)            —— templates/manifest.yaml 窄解析 → ManifestData
 *   · createFlowEngine(manifest)    —— types.ts::FlowEngine 实现（+ ReviewGate.isReviewPhase）
 * integrate 阶段由 packages/kernel/src/index.ts re-export。
 */
export { loadManifest, ManifestError } from './manifest.js'
export { createFlowEngine } from './engine.js'
export type { ReviewGate } from './engine.js'
