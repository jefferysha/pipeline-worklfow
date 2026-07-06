/**
 * kernel/state 公共出口 —— StateStore 工厂 + 供 oracle/cli 复用的解析/锁原语。
 * （根 src/index.ts 的 re-export 由 integrate 阶段接线，见 CONTRACT §4。）
 */
export { createStateStore, STATE_FILE_NAME } from './store.js'
export { parsePipeline, serializePipeline, quoteGate, unquoteScalar, emptyFields } from './parse.js'
export { withLock, LOCK_DIR_NAME, STALE_LOCK_MS } from './lock.js'
export { createHistoryWriter, HISTORY_FILE } from './history.js'
export { parseLegacyHistory, stripLegacyHistory } from './legacy.js'
// task lifecycle（BACKLOG #15）——依赖图 / children / cascade / canonical
export {
  normalizeDeps, addDependency, removeDependency, taskNameMatches, directChildren,
  cascadeDependents, projectCanonical, loadTaskTree, resolveChangeDir,
  canonicalChildNames, stateSubtasks, stateRelatedFiles,
} from './tasks.js'
export type { AddDepResult, ChangeNode, ChildRef, CanonicalTask, CanonicalInput } from './tasks.js'
