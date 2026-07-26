/** Global loopback dashboard server assembly; bounded route handlers live in sibling modules. */
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  builtinWorkflow,
  ABSENT_REGISTRY_EPOCH, applyLevelChange, assertTrackDeletable, assertUpdatePreservesReferences, assertWorkflowAllowed,
  BUILTIN_TRACK_DEFINITIONS, BuiltinTrackDeleteError, BuiltinTrackPolicyError, ChangeScanFailedError, createBreadcrumbWriter, createFlowEngine,
  decodeWorkflowDef, createEffectiveSkillResolver, createHistoryWriter, createLoopLedgerStore, createStateStore, machineStateScopeId,
  createTrack, createTransitionRecordStore, createWorkflowRunRepository, deleteTrack, firstStep, listMemSessions, loadManifest,
  listAutomationPolicyTemplates, loadRegistry, loadTrackRegistry, loadWorkflow, mutateTrackRegistry, nodeMemFs, readRegistrySnapshot, RegistryRevisionConflictError,
  requireTrack, TrackAlreadyExistsError, TrackNotFoundError, TrackReferencedError, TrackReferencesInvalidatedError, updateTrack,
  validateWorkflow,
  stateStorageExistsSync, validateWorkflowTrackReferences, withRegistryGovernanceLock, withTrackRegistryLock,
  writeRegistryWithGovernance,
} from '@tenon/kernel'
import { createRunnerSkillContentLocator, evaluateLoopExecutionWiring } from '@tenon/automation'
import type {
  ChangeRefScan, CreateTrackSpec, ExtendedManifestData, FlowEngine, GraduationFs, MemFs, StateStore, TrackDefinition,
  ProjectTrackConfig, TrackRegistry, TrackValidationContext, UpdateTrackPatch, WorkflowDef,
} from '@tenon/kernel'
import { buildAfkLog, buildAfkSnapshot, cancelAfkRun, dismissAfkRun, enqueueAfkRun, readAfkRunLog, retryAfkRun } from './afk.js'
import { applyLoopsUpdate, buildLoopsSnapshot, type LoopActivationValidator } from './loops.js'
import { readConfigSnapshot, validateMandatorySkillsBody, writeMandatorySkills } from './config.js'
import { readAutomationSettings, validateAutomationSettingsBody, writeAutomationSettings } from './automationConfig.js'
import { HOOK_METAS, readHooksMatrix, validateHookToggleBody, writeHookToggle } from './hooksConfig.js'
import { resolveServerPaths } from './paths.js'
import { addProjectToRegistry, removeProjectFromRegistry } from './projects.js'
import {
  assertWorkflowRootAnchor, captureWorkflowDeletePermit, captureWorkflowRootAnchor, closeWorkflowRootAnchor,
  deleteWorkflowForApi, ensureWorkflowGovernanceCoordinationPath, ensureWorkflowProjectCoordinationPath,
  listWorkflowNames, readWorkflowForApi, scanWorkflowReferencesForApi, writeWorkflowForApi,
  WorkflowDeleteConflictError, WorkflowNotFoundError,
  type WorkflowRootAnchor,
} from './workflows.js'
import { readRegistry } from './registry.js'
import { buildSecretsResponse, isValidSecretKey, removeSecret, SECRET_KEY_LIST, validateSecretWriteBody, writeSecret } from './secrets.js'
import { listAllSkillsDetailed } from './skillsRegistry.js'
import { buildSnapshot, computeFingerprint, dedupeRoots, type SnapshotDeps } from './snapshot.js'
import { generateToken, tokenFromHeaders, tokensMatch } from './token.js'
import { buildAfkReadiness } from './afkReadiness.js'
import { listDockerImages } from './dockerImages.js'
import { listTraceSessions, readTraceRecords } from './traces.js'
import { performTransition, readChangeHistory } from './transition.js'
import { buildRunDetail } from './runDetail.js'
import {
  activateChangeSession, notRequestedSessionActivation, parseChangeSessionActivation,
  parseChangeTaskPrompt, writeChangeTaskPrompt,
} from './changeLaunch.js'
import {
  cliExitHttpStatus, parsePipelineCliJson, pipelineCliAvailable, runPipelineCli,
  type PipelineCliRunner,
} from './operations.js'
import { applyRouterDraft, parseRouterDraft, previewTrackRouting, scoreRouterPatternWithGrep } from './routerPreview.js'
import { createCadenceScheduler } from './cadence.js'
import { handleGet as handleGetRoute } from './serverGetRoutes.js'
import { handleDeleteRoute, handlePatchRoute } from './serverMutationRoutes.js'
import { handlePostRoute } from './serverPostRoutes.js'
import {
  errMsg,
  indexHtml,
  isoNow,
  isLocalHost,
  REAL_GRADUATION_FS,
  repoRootForSkills,
  shQuote,
} from './serverSupport.js'
import { createServerTransport } from './serverTransport.js'
import { createServerGovernance } from './serverGovernance.js'
import type { DashboardServer, DashboardServerOptions } from './types.js'
import { SERVER_VERSION } from './version.js'

const MAX_POST_BODY = 64 * 1024
const WORKFLOW_NAME_RE = /^[\p{L}\p{N}\p{M}_-]+$/u

function isWorkflowName(name: string): boolean {
  return name !== '' && WORKFLOW_NAME_RE.test(name)
}

export { isLocalHost } from './serverSupport.js'

export function createDashboardServer(options: DashboardServerOptions = {}): DashboardServer {
  const version = options.version ?? SERVER_VERSION
  const releaseId = options.releaseId
  const token = options.token ?? generateToken()
  const clock = options.clock ?? isoNow
  const paths = options.paths ?? resolveServerPaths()
  const stateScopeId = machineStateScopeId(paths.stateRoot)
  const registry: () => string[] = options.registry ?? (() => readRegistry(paths.registryPath))
  const store: StateStore = options.store ?? createStateStore()
  const recordStore = createTransitionRecordStore()
  const loopLedger = createLoopLedgerStore()
  const runRepo = createWorkflowRunRepository({ store, recordStore, clock })
  const history = createHistoryWriter()
  const breadcrumb = createBreadcrumbWriter()
  const loadedManifest: ExtendedManifestData | undefined =
    options.manifestPath ? loadManifest(options.manifestPath) : undefined
  const flow: FlowEngine = options.flow
    ?? (loadedManifest
      ? createFlowEngine(loadedManifest)
      : (() => { throw new Error('createDashboardServer: 需注入 flow 或 manifestPath') })())
  // Track Registry 校验用 skill profile 集合（GOAL.md 清单 T · R2）：内建轨 profile（pm/frontend/
  // backend，即 manifest 现行 skill 表 track 键）∪ manifest 两表已声明的非 '_all' 键。仅在项目
  // tracks.yaml 存在且含自定义 track 时被 validateTrackRegistry 查；POST /api/changes 每请求按 root
  // 现载 registry（多项目 server 无单一 root，不能装配处一次性 load）。profile 键空间改名属 R5。
  const trackSkillProfiles: ReadonlySet<string> = (() => {
    const s = new Set<string>()
    for (const t of BUILTIN_TRACK_DEFINITIONS) {
      if (t.policyProfile.skills.profile !== '_all') s.add(t.policyProfile.skills.profile)
    }
    if (loadedManifest) {
      for (const table of [loadedManifest.mandatorySkills, loadedManifest.recommendedSkills]) {
        for (const row of Object.values(table)) {
          for (const k of Object.keys(row)) if (k !== '_all') s.add(k)
        }
      }
    }
    return s
  })()
  const validateLoopActivation: LoopActivationValidator | undefined = options.validateLoopActivation
    ?? (loadedManifest === undefined
      ? undefined
      : async ({ root, loopId, candidate }) => {
          const loop = candidate.loops.find((entry) => entry.id === loopId)
          if (loop === undefined) return { ok: false, error: `候选 registry 中找不到 loop "${loopId}"` }
          const resolver = createEffectiveSkillResolver({
            registry: () => {
              const rootCheck = workflowRootForRequest(root)
              if (!rootCheck.ok) throw new Error(rootCheck.error)
              return loadTrackRegistry(root, trackValidationContextFor(rootCheck.anchor))
            },
            manifest: loadedManifest,
          })
          const wiringForRunner = (runner: string) => ({
            resolver,
            locator: createRunnerSkillContentLocator({
              runner,
              home: options.home ?? homedir(),
              bundledRoot: join(repoRootForSkills(), 'skills'),
            }),
            isSkillProfileKnown: (profileId: string) => profileId === '_all' || trackSkillProfiles.has(profileId),
          })
          const wiring = await evaluateLoopExecutionWiring(loop, candidate.loops, {
            repoRoot: root,
            skillBundleWiring: wiringForRunner(loop.runner),
            skillBundleWiringForLoop: (entry) => wiringForRunner(entry.runner),
          })
          return wiring.status === 'ready'
            ? { ok: true }
            : { ok: false, error: `${wiring.dimension}: ${wiring.reason}` }
        })
  const pollIntervalMs = options.pollIntervalMs ?? 1000
  const heartbeatMs = options.heartbeatMs ?? 15000
  const gitHeadSha = options.gitHeadSha
  const workspaceFingerprint = options.workspaceFingerprint
  const traceStore = options.traceStore
  // v9-I：mem 会话检索 fs（只读用户会话历史根，绝不写）；测试注 nodeMemFs(fakeHome) 指 fixture 树。
  const memFs: MemFs = options.memFs ?? nodeMemFs()
  // config 写端点（M3 可选增量）数据源：manifest.yaml 路径。未注入（如测试只传 flow 而非
  // manifestPath）→ capabilities.config=false，GET/POST config 端点降级 404（不谎报，同 traffic 手法）。
  const manifestPath = options.manifestPath

  // 能力声明（GOAL B6）：afk 数据端始终已接线（读同一 registry+store 的 automation_* 字段）；
  // traffic 仅注入 traceStore 时为真（未装 → 前端 Advanced 仍占位，不谎报）；
  // loops 数据端始终已接线（无可选运行时依赖）。#29d / #34d。
  const operationRunner: PipelineCliRunner = options.runPipelineCli ?? runPipelineCli
  const operationsAvailable = options.runPipelineCli !== undefined || pipelineCliAvailable()
  const cadenceScheduler = options.cadence === undefined || options.cadence === false
    ? null
    : createCadenceScheduler({
        ...options.cadence,
        roots: registry,
        clock,
        runPipelineCli: operationRunner,
      })
  const routerPatternScorer = options.scoreRouterPattern ?? scoreRouterPatternWithGrep
  const capabilities: Record<string, boolean> = {
    afk: true,
    loops: true,
    operations: operationsAvailable,
    traffic: Boolean(traceStore),
    config: Boolean(manifestPath),
    router_preview: true,
    cadence: cadenceScheduler !== null,
  }
  const snapshotDeps = (nowMs?: number): SnapshotDeps => ({
    registry,
    store,
    version,
    clock,
    capabilities,
    ...(nowMs === undefined ? {} : { now: () => nowMs }),
  })

  const {
    clients,
    stopPoll,
    sendJson,
    sendHtml,
    readJsonBody,
    handleStream,
    serveIndexWithToken,
    serveAsset,
  } = createServerTransport({
    registry,
    snapshotDeps,
    heartbeatMs,
    pollIntervalMs,
    webRoot: options.webRoot,
    token,
  })
  const {
    trackRegistryBody,
    scanActiveTrackChanges,
    sendTrackError,
    mutateTrackForApi,
    fileExists,
    isRegisteredRoot,
    executeOperation,
    workflowRootAnchors,
    workflowRootForRequest,
    trackValidationContextFor,
  } = createServerGovernance({
    registry,
    store,
    sendJson,
    trackSkillProfiles,
    operationsAvailable,
    operationRunner,
  })

  let boundPort = 0
  async function resolveSessionLink(root: string, name: string): Promise<Record<string, unknown>> {
    const changeDir = join(root, 'openspec', 'changes', name)
    try {
      const wtRaw = await store.get(changeDir, 'automation_worktree')
      const wt = Array.isArray(wtRaw) ? wtRaw.join(',') : (wtRaw ?? '')
      // 老内核 cmd_get 口径：空串 / 字面 'null' 算未设 → 回落 root（本机直跑会话的 cwd）。
      const lookupDir = wt !== '' && wt !== 'null' ? wt : root
      // codex review 第七轮 P2：第六轮「fetched 范围内（limit 3）优先选可恢复平台」的修法仍有数量
      // 上限——limit 是跨平台合并之后才生效的硬 cap，同目录下 ≥3 条比目标 claude/codex 会话更新的
      // opencode/pi 会话就能把 limit 名额占满，可恢复会话连被 fetch 到的机会都没有，.find() 自然还是
      // 落空、静态退化。改用不依赖任何数量上限的策略：claude/codex 是仅有的两个「有把握拼 resumeCmd」
      // 的平台，分别单独查询各自最新一条——platform 限定单个平台时 listAll 只 fan-out 那一个适配器
      // （kernel mem/sessions.ts listAll 逐平台 push 前先判 f.platform），压根不会取到 opencode/pi
      // 的会话，天然不受它们数量影响。两个平台都有 → 选更新的那条；只有一个 → 用那个；两个都没有 →
      // 退回全平台最新一条（既有 found:true + resumeCmd:null 诚实降级，SessionResumeRow 既有分支
      // 正确处理，不是新增行为）。
      const claudeTop = listMemSessions(memFs, { filter: { cwd: lookupDir, platform: 'claude', limit: 1 } })[0]
      const codexTop = listMemSessions(memFs, { filter: { cwd: lookupDir, platform: 'codex', limit: 1 } })[0]
      // recency key 手抄 kernel mem/sessions.ts 私有的 recencyKey/recencyDesc 契约（未导出，不为
      // 复用一个两行比较器去改 kernel 导出面）：updated 优先 created，两者都缺退空串——同 resolveSessionLink
      // 原有 `s.updated || s.created` 降级顺序（见下方 return 里的 mtime 字段）。四个平台适配器
      // （claude/codex/opencode/pi）产出的 updated 一律经 `new Date(ms).toISOString()`（kernel
      // mem/fs.ts mtimeIso 及各 adapters 的 msToIso 同款），定长 UTC ISO-8601，字典序比较等价于
      // 时间序，两条都有时直接字符串比较取较新；相等则（同 recencyDesc 的稳定排序语义）优先 claude。
      const s =
        claudeTop && codexTop
          ? (codexTop.updated || codexTop.created || '') > (claudeTop.updated || claudeTop.created || '')
            ? codexTop
            : claudeTop
          : (claudeTop ?? codexTop ?? listMemSessions(memFs, { filter: { cwd: lookupDir, platform: 'all', limit: 1 } })[0])
      if (!s) return { found: false, dir: lookupDir, reason: 'no-session' }
      // cd 目标用会话自己的 cwd（可能是 lookupDir 的后代目录）——claude --resume 按 cwd 派生
      // 项目目录找会话，cd 错目录会找不到；缺 cwd 才回落查询目录。
      const dir = s.cwd || lookupDir
      // dir 与 sessionId 都过 shQuote（codex 终稿 P2）：安全字符原样、特殊字符单引号转义。
      const resumeCmd =
        s.platform === 'claude'
          ? `cd ${shQuote(dir)} && claude --resume ${shQuote(s.id)}`
          : s.platform === 'codex'
            ? `cd ${shQuote(dir)} && codex resume ${shQuote(s.id)}`
            : null
      return {
        found: true,
        platform: s.platform,
        sessionId: s.id,
        dir,
        resumeCmd,
        ...(s.updated || s.created ? { mtime: s.updated || s.created } : {}),
      }
    } catch {
      return { found: false, dir: root, reason: 'lookup-error' }
    }
  }

  // ── 路由 ──
  const mutateTrackForRoutes = async (
    anchor: WorkflowRootAnchor,
    revision: string,
    mutate: (snapshot: { config: ProjectTrackConfig }) => Promise<{
      next: ProjectTrackConfig
      result: undefined
    }>,
  ): Promise<{ registry: TrackRegistry }> =>
    mutateTrackForApi(anchor, revision, async ({ config }) => mutate({ config }))

  const handleGet = (req: IncomingMessage, res: ServerResponse, path: string): Promise<void> =>
    handleGetRoute(req, res, path, {
      cadenceScheduler, sendJson, sendHtml, serveIndexWithToken, serveAsset, indexHtml, token,
      version, releaseId, stateScopeId, isLocalHost, boundPort: () => boundPort, snapshotDeps,
      handleStream, isRegisteredRoot, clock, store, recordStore, loopLedger, registry, traceStore,
      workflowRootForRequest, trackValidationContextFor, trackRegistryBody, manifestPath, paths,
      options, resolveSessionLink, errMsg,
    })
  const handlePost = (req: IncomingMessage, res: ServerResponse, path: string): Promise<void> =>
    handlePostRoute(req, res, path, {
      isLocalHost, boundPort: () => boundPort, sendJson, token, readJsonBody, routerPatternScorer,
      workflowRootForRequest, trackValidationContextFor, executeOperation, operationRunner,
      operationsAvailable, isRegisteredRoot, store, clock, history, workflowRootAnchors,
      trackSkillProfiles, loadedManifest, runRepo, flow, fileExists, gitHeadSha,
      workspaceFingerprint, breadcrumb, manifestPath, paths, validateLoopActivation,
      mutateTrackForApi: mutateTrackForRoutes, trackRegistryBody, sendTrackError, errMsg,
      realGraduationFs: REAL_GRADUATION_FS,
    })
  const mutationRouteDeps = {
    isLocalHost,
    boundPort: () => boundPort,
    sendJson,
    token,
    readJsonBody,
    workflowRootForRequest,
    mutateTrackForApi: mutateTrackForRoutes,
    scanActiveTrackChanges,
    trackRegistryBody,
    sendTrackError,
    paths,
    workflowRootAnchors,
    trackValidationContextFor,
    errMsg,
  }
  const handlePatch = (req: IncomingMessage, res: ServerResponse, path: string): Promise<void> =>
    handlePatchRoute(req, res, path, mutationRouteDeps)
  const handleDelete = (req: IncomingMessage, res: ServerResponse, path: string): Promise<void> =>
    handleDeleteRoute(req, res, path, mutationRouteDeps)
  const httpServer: Server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?', 1)[0] ?? '/'
    const method = req.method ?? 'GET'
    const handler = method === 'GET'
      ? handleGet(req, res, path)
      : method === 'POST'
        ? handlePost(req, res, path)
        : method === 'PATCH'
          ? handlePatch(req, res, path)
          : method === 'DELETE'
            ? handleDelete(req, res, path)
            : Promise.resolve(sendJson(res, 405, { ok: false, error: 'method not allowed' }))
    handler.catch((e) => {
      try { sendJson(res, 500, { ok: false, error: errMsg(e) }) } catch { /* 已写头 */ }
    })
  })

  return {
    token,
    version,
    httpServer,
    listen(port = 0, host = '127.0.0.1'): Promise<{ port: number; host: string }> {
      return new Promise((resolve, reject) => {
        const onError = (e: Error): void => reject(e)
        httpServer.once('error', onError)
        httpServer.listen(port, host, () => {
          httpServer.removeListener('error', onError)
          const address = httpServer.address()
          if (address === null || typeof address === 'string') {
            reject(new Error('dashboard server 未返回 TCP address'))
            return
          }
          boundPort = address.port
          cadenceScheduler?.start()
          resolve({ port: boundPort, host })
        })
      })
    },
    close(): Promise<void> {
      return new Promise((resolve) => {
        stopPoll()
        cadenceScheduler?.stop()
        for (const anchor of workflowRootAnchors.values()) closeWorkflowRootAnchor(anchor)
        workflowRootAnchors.clear()
        for (const res of clients) {
          try { res.end() } catch { /* ignore */ }
        }
        clients.clear()
        httpServer.close(() => resolve())
        const closeAllConnections = Reflect.get(httpServer, 'closeAllConnections')
        if (typeof closeAllConnections === 'function') closeAllConnections.call(httpServer)
      })
    },
  }
}
