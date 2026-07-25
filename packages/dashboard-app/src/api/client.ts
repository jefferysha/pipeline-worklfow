/**
 * Dashboard HTTP/SSE public facade.
 *
 * Endpoint behavior lives in bounded-context clients; protocol types and runtime decoders stay
 * beside their owning context. Existing consumers keep importing this stable module.
 */
export { ApiError, getToken } from './transport'

export { fetchSnapshot, postTransition, subscribeSnapshot } from './snapshotClient'

export {
  deleteTrackDefinition,
  deleteWorkflowDef,
  fetchConfig,
  fetchHooksConfig,
  fetchSkillsRegistry,
  fetchWorkflow,
  fetchWorkflowNames,
  getHistory,
  patchTrackDefinition,
  postCreateChange,
  postHookToggle,
  postMandatorySkills,
  postRouterPreview,
  postTrackDefinition,
  postWorkflowDef,
  registerProject,
  unregisterProject,
} from './governanceClient'

export { fetchLoopsSnapshot, postLoopLevel, postLoopUpdate } from './loopsClient'

export {
  deleteSecret,
  fetchAfkLog,
  fetchAfkReadiness,
  fetchAutomationSettings,
  fetchAutomationStarters,
  fetchCadenceStatus,
  fetchDockerImages,
  fetchSecrets,
  postAfkCommand,
  postAfkDismiss,
  postAfkEnqueue,
  postAfkRetry,
  postArtifactRegister,
  postAutomationSettings,
  postLoopRun,
  postLoopStarterInit,
  postLoopSync,
  postProjectionAction,
  postSecret,
  postTriage,
} from './automationClient'

export {
  fetchRunDetail,
  fetchSessionLink,
  fetchSessionLinks,
  fetchTraceRecords,
  fetchTraceSessions,
} from './auditClient'

export type {
  ChangeHistoryEntry,
  ChangeSessionLaunch,
  ChangeSessionStatus,
  CreatedChange,
  WbConfigSnapshot,
  WbHookEvent,
  WbHookMeta,
  WbHooksConfig,
  WbRouterPreview,
  WbRouterPreviewCandidate,
  WbSkillEntry,
  WbTrackDefinition,
} from './governanceTypes'

export type {
  AutomationStarterTemplate,
  OperationResponse,
  WbAfkReadiness,
  WbAutomationSettings,
  WbCadenceLoopState,
  WbCadenceLoopStatus,
  WbCadenceStatus,
  WbCredLight,
  WbDockerImages,
  WbLoopBudgetDecl,
  WbLoopGraduation,
  WbLoopLedgerSnapshot,
  WbLoopRow,
  WbLoopsSnapshot,
  WbSecretLight,
  WbSecretsKeys,
} from './automationTypes'

export type {
  SessionLink,
  TraceRecordsResponse,
  TraceSessionRow,
  TraceSessionsResponse,
  WbAttemptContext,
  WbLedgerRecord,
  WbRunDetail,
  WbRunIdentity,
  WbRunRevision,
  WbTransitionRecord,
} from './auditTypes'
