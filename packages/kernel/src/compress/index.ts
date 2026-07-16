/**
 * compress —— 上下文压缩子系统出口（BACKLOG #30 / GOAL B13·D11）。
 * 本 barrel 由根 kernel src/index.ts re-export；消费方经 '@pipeline-lite/kernel' 包名导入。
 */
export type { CompressOptions, CompressStats, CompressedDoc, KeyField } from './types.js'
export type { FrontMatter, Heading } from './markdown.js'
export {
  isConstraint,
  isDecision,
  isDoneTodo,
  isHeading,
  openTodoText,
  parseFrontMatter,
  stripLeadMarkers,
} from './markdown.js'
export { compressDocument, ratioOf, renderHandoffSummary, statsFor } from './compress.js'
export {
  buildHandoff,
  nodeHandoffFs,
  phaseHandoffDocs,
  type DocKind,
  type HandoffDocResult,
  type HandoffDocSpec,
  type HandoffFs,
  type HandoffInput,
  type HandoffResult,
} from './handoff.js'
