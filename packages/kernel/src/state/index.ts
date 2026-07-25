/**
 * kernel/state 公共出口 —— StateStore 工厂 + 供 oracle/cli 复用的解析/锁原语。
 * 本 barrel 由根 src/index.ts re-export（见 CONTRACT §4）。
 */
export { atomicWriteFile, createStateStore, StateProjectionDriftError, STATE_FILE_NAME } from './store.js'
export { atomicLinkPublish, atomicReplaceFile } from './atomic-publish.js'
export { ensureTrustedProjectDirectory } from './trusted-project-path.js'
export type { StateStoreOptions } from './store.js'
export { defaultOpenSpecScaffoldFiles } from './default-openspec-scaffold.js'
export type { DefaultOpenSpecScaffoldFile } from './default-openspec-scaffold.js'
export {
  DOCUMENT_LOCALE_FILE, ensureDocumentLocalePin, readDocumentLocalePin,
} from './document-locale.js'
export type { DocumentLocalePin } from './document-locale.js'
export {
  WORKFLOW_GOVERNANCE_BINDING_FILE, attachWorkflowGovernanceBinding,
  ensureWorkflowGovernanceBinding, readWorkflowGovernanceBinding,
  withoutWorkflowGovernanceBinding,
} from './workflow-governance-binding.js'
export type { WorkflowGovernanceBinding } from './workflow-governance-binding.js'
export {
  WORKFLOW_PLAN_SNAPSHOT_FILE, attachWorkflowPlanSnapshot, ensureWorkflowPlanSnapshot,
  readWorkflowPlanSnapshot, workflowPlanSnapshotContent,
} from './workflow-plan-snapshot.js'
export {
  DOCUMENT_LEDGER_FILE, DocumentLedgerError, ensureDocumentLedger, initialDocumentLedgerContent,
  migrateLegacyDeltaDocument, readDocumentLedger, recordDocument, recordDocumentReads,
} from './document-ledger.js'
export type {
  DocumentLedger, DocumentReadReceipt, DocumentRecord, MigrateLegacyDeltaDocumentInput,
  ReadDocumentsInput, RecordDocumentInput,
} from './document-ledger.js'
export { evaluateDocumentEvidence } from './document-evidence.js'
export type {
  DocumentEvidenceItem, DocumentEvidenceItemStatus, DocumentEvidenceReport, DocumentEvidenceScope,
} from './document-evidence.js'
export { evaluateSpecMigrationEvidence } from './spec-migration-evidence.js'
export { parsePipeline, serializePipeline, quoteGate, unquoteScalar, emptyFields } from './parse.js'
export { withLock, LOCK_DIR_NAME, STALE_LOCK_MS } from './lock.js'
export { createHistoryWriter, HISTORY_FILE, transitionRecordToHistoryEntry } from './history.js'
export {
  createBreadcrumbWriter, formatReviewMarker, parseReviewMarker, reviewHint,
  BREADCRUMB_FILE, REVIEW_MARKER_FILE, REVIEW_MARKER_PROTOCOL,
} from './markers.js'
export type { BreadcrumbWriter, ReviewMarkerReceipt } from './markers.js'
export {
  clearReviewGatePatch, reviewGateApprovedFor, reviewGateApprovalPatch, reviewGateEvent, reviewGateMatches,
  reviewGatePendingFor, reviewGateRequestPatch, reviewGateStatus, REVIEW_GATE_APPROVED, REVIEW_GATE_PENDING,
} from './review-gate.js'
export type { ReviewGateStatus } from './review-gate.js'
export { applyBreadcrumbTail } from './transitionTail.js'
export type { BreadcrumbTailArgs, TailWriteOutcome } from './transitionTail.js'
// WorkflowRun 持久化提交接缝（W1 第二增量，2026-07-16 codex 范围评估）
export { diffFieldsToEffects, parseRunMetadataLines, serializeRunMetadataLines } from './run-metadata.js'
export {
  createTransitionRecordStore, InvalidRecordIdentityError, RecordAlreadyExistsError, TRANSITION_RECORDS_DIR,
} from './transition-record-store.js'
export type { TransitionRecordStore } from './transition-record-store.js'
export { createWorkflowRunRepository } from './workflow-run-repository.js'
export type { WorkflowRunRepositoryDeps } from './workflow-run-repository.js'
export {
  projectionMetadataFor, readCurrentRunRevision, readCurrentRunRevisionFromSync,
  readCurrentRunRevisionSync, readImmutableRunRevision,
  RunStateCorruptError, RUN_CURRENT_FILE, RUN_REVISIONS_DIR, RUN_STATE_DIR,
  stateStorageExistsSync, stateStorageSourcePathSync, validateCanonicalRevisionHistory,
} from './run-revision-store.js'
export type { RunHookState, RunRevision, RunRevisionTextReader, RunStateMutation } from './run-revision-store.js'
// 机器级项目注册表（v5 T2 决策 D）——init 自动登记 + server 项目发现同源
export { projectRegistryPath, readProjectRegistry, registerProjectRoot, writeProjectRegistry, PROJECT_REGISTRY_FILE } from './projectRegistry.js'
// 机器级凭证存储（v6 T1，proposal C 节）——CLAUDE_CODE_OAUTH_TOKEN/OPENAI_API_KEY 白名单，0600+原子写
export { secretsPath, readSecrets, writeSecretKey, deleteSecretKey, SECRET_KEYS, SECRETS_FILE_NAME } from './secrets.js'
export type { SecretKey, SecretsStore } from './secrets.js'
export { parseLegacyHistory, stripLegacyHistory } from './legacy.js'
// task lifecycle（BACKLOG #15）——依赖图 / children / cascade / canonical
export {
  normalizeDeps, addDependency, removeDependency, taskNameMatches, directChildren,
  cascadeDependents, projectCanonical, loadTaskTree, resolveChangeDir,
  canonicalChildNames, stateSubtasks, stateRelatedFiles,
} from './tasks.js'
export type { AddDepResult, ChangeNode, ChildRef, CanonicalTask, CanonicalInput } from './tasks.js'
// living-spec（BACKLOG #16）——specs / set-spec-scope / inject-jsonl
export {
  listSpecEntries, injectJsonl, jsonlRelPath, resolveSpecsDir, specScopeWriteValue, parseJsonlLine,
} from './spec.js'
export type { SpecEntry, SpecListing, JsonlEntry, InjectOutcome, InjectChunk, InjectKind } from './spec.js'
// session（BACKLOG #17）——activate / route-context
export {
  validateChangeName, relatedFilesFromField, parseProjectPackages, normalizeRelPath,
  pathInSubtree, packageForPath, routeContext, routeBucketsToObject, renderRouteContextText,
} from './session.js'
export type { ValidName, InvalidName, PackageDecl, RouteBucket } from './session.js'
// 所有权 hash 追踪 + sync/uninstall 决策（BACKLOG #24）
export * from './ownership.js'
