/**
 * TS 全局 dashboard server —— 全机唯一 Global server（对位老仓 dashboard-server.py）。
 * Node stdlib http，零第三方运行时依赖；只依赖 @pipeline-lite/kernel（消费方，只 import 不改）。
 *
 * 端点：
 *   GET  /                          前端落地页（同源注入本 server token，B5 交付；#26 前端重构承接）
 *   GET  /api/health                存活探针 + 本 server 版本（B4）
 *   GET  /api/snapshot              聚合本机所有注册 Project 的 canonical state → JSON
 *   GET  /api/change/<name>/run-detail       canonical Run/revision/ledger 审计投影
 *   GET  /api/stream                SSE：canonical current 变化即推新快照 + 心跳
 *   GET  /api/config?root=          Settings 数据源：mandatory_skills + 项目 effective Track Registry
 *   POST /api/change/<name>/transition        写回转换（B5 token 鉴权 + Host 守卫 + application/json）
 *   POST /api/config/mandatory-skills         写回一条 phase.track 强制 skill（同 B5 鉴权；M3 可选增量收编，
 *                                              全机唯一 manifest.yaml、无 root/name，见 config.ts 头注释）
 *
 * 安全模型（B5，修老仓「写端点无鉴权，已接受风险」CONTEXT.md L33 / 欠账 #4）：
 *   · GET 只读端点：绑 127.0.0.1，不鉴权（本机回环）。
 *   · 所有 POST 写端点：三道纵深——(1) Host 头 DNS 重绑定守卫；(2) **一次性 token 强制校验**
 *     （Authorization: Bearer / X-Pipeline-Token，缺/错 → 401）；(3) 强制 application/json（借同源策略）。
 *   token 启动生成、写 0600 握手文件、同源注入前端；较老仓「仅靠同源 + 无 token」是净收紧。
 */
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ABSENT_REGISTRY_EPOCH, applyLevelChange, assertTrackDeletable, assertUpdatePreservesReferences, assertWorkflowAllowed,
  BUILTIN_TRACK_DEFINITIONS, BuiltinTrackDeleteError, BuiltinTrackPolicyError, ChangeScanFailedError, createBreadcrumbWriter, createFlowEngine,
  createEffectiveSkillResolver, createHistoryWriter, createLoopLedgerStore, createReviewMarkerWriter, createStateStore,
  createTrack, createTransitionRecordStore, createWorkflowRunRepository, deleteTrack, firstStep, listMemSessions, loadManifest,
  listAutomationPolicyTemplates, loadRegistry, loadTrackRegistry, loadWorkflow, mutateTrackRegistry, nodeMemFs, readRegistrySnapshot, RegistryRevisionConflictError,
  requireTrack, TrackAlreadyExistsError, TrackNotFoundError, TrackReferencedError, TrackReferencesInvalidatedError, updateTrack,
  validateWorkflow,
  stateStorageExistsSync, validateWorkflowTrackReferences, withRegistryGovernanceLock, withTrackRegistryLock,
  writeRegistryWithGovernance,
} from '@pipeline-lite/kernel'
import { createRunnerSkillContentLocator, evaluateLoopExecutionWiring } from '@pipeline-lite/automation'
import type {
  ChangeRefScan, CreateTrackSpec, ExtendedManifestData, FlowEngine, GraduationFs, MemFs, StateStore, TrackDefinition,
  TrackRegistry, TrackValidationContext, UpdateTrackPatch, WorkflowDef,
} from '@pipeline-lite/kernel'
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
import type { DashboardServer, DashboardServerOptions } from './types.js'
import { SERVER_VERSION } from './version.js'

const MAX_POST_BODY = 64 * 1024
const WORKFLOW_NAME_RE = /^[\p{L}\p{N}\p{M}_-]+$/u

function isWorkflowName(name: string): boolean {
  return name !== '' && WORKFLOW_NAME_RE.test(name)
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// ── #38 graduation 真 node fs（登记 + run-log + LOOP.md 镜像 + loops.yaml 原文读写）──
const REAL_GRADUATION_FS: GraduationFs = {
  loadRegistry: (repoRoot) => loadRegistry(repoRoot),
  readRunLog: (repoRoot) => {
    try {
      return readFileSync(join(repoRoot, '.superpowers', 'loops', 'progress.md'), 'utf8')
    } catch {
      return null
    }
  },
  readLoopDoc: (repoRoot) => {
    try {
      return readFileSync(join(repoRoot, 'LOOP.md'), 'utf8')
    } catch {
      return null
    }
  },
  // Stage B 返工 #3#4：level set 写回走 governance 锁 + 字节 epoch-CAS + atomic writer（与 admission
  // 复验/cli init/level、/api/loops/update 同锁串行，绝不非治理旁路覆盖）。
  readRegistrySnapshot: async (repoRoot) => {
    const snap = await readRegistrySnapshot(repoRoot)
    return snap.epoch === ABSENT_REGISTRY_EPOCH ? null : { text: snap.text, epoch: snap.epoch }
  },
  writeRegistryGoverned: async (repoRoot, expectedEpoch, produce) => {
    const r = await writeRegistryWithGovernance(repoRoot, expectedEpoch, (cur) => produce(cur))
    return { ok: r.ok, error: r.ok ? null : r.error }
  },
}

/** 从 packages/server/dist/server.js 位置往上定位到仓库根（对位 main.ts 的 manifestPath 写法）。 */
function repoRootForSkills(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * POSIX 单引号转义（codex review 终稿 P2）：resumeCmd 拼接的 dir/sessionId 唯一安全通道——
 * 原先 `cd "<dir>"` 双引号挡不住 `"`、反引号、`$()`。语义与前端
 * dashboard-app/src/shared/shellQuote.ts 同款（两端拼法必须一致，改动请两处同步）：
 * 仅含安全集 [A-Za-z0-9_@%+=:,./-] 原样返回（可读性），否则整体包单引号且内部 `'` → `'\''`。
 */
function shQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** DNS-rebinding guard（老仓 core._host_is_local 逐条对位）：仅 loopback（± :port）放行。 */
export function isLocalHost(host: string | undefined, port: number): boolean {
  if (!host) return false
  const h = host.trim().toLowerCase()
  const allowed = new Set([
    '127.0.0.1', 'localhost', '[::1]',
    `127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`,
  ])
  return allowed.has(h)
}

function indexHtml(token: string): string {
  // 最小落地页 —— 同源前端读取注入的 token 后带 header 调写端点（B5）。信息架构重构见 BACKLOG #26。
  // token 作 JS 字符串注入；转义 `<` 防 `</script>` 断出（纵深防护，token 本就 server 生成可信）。
  const jsToken = JSON.stringify(token).replace(/</g, '\\u003c')
  return `<!doctype html><meta charset="utf-8"><title>Pipeline Dashboard</title>
<h1>Pipeline Global Dashboard</h1>
<p>TS 全局 server 已就绪。只读数据见 <code>/api/snapshot</code> / <code>/api/stream</code>；健康探针 <code>/api/health</code>。</p>
<p>写端点需带一次性 token（B5）。前端信息架构重构：BACKLOG #26。</p>
<script>window.__PIPELINE_DASHBOARD_TOKEN__ = ${jsToken};</script>`
}

export function createDashboardServer(options: DashboardServerOptions = {}): DashboardServer {
  const version = options.version ?? SERVER_VERSION
  const token = options.token ?? generateToken()
  const clock = options.clock ?? isoNow
  const paths = resolveServerPaths({ home: options.home })
  const registry: () => string[] = options.registry ?? (() => readRegistry(paths.registryPath))
  const store: StateStore = options.store ?? createStateStore()
  const recordStore = createTransitionRecordStore()
  const loopLedger = createLoopLedgerStore()
  const runRepo = createWorkflowRunRepository({ store, recordStore, clock })
  const history = createHistoryWriter()
  const breadcrumb = createBreadcrumbWriter()
  const reviewMarker = createReviewMarkerWriter()
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
  const snapshotDeps = (): SnapshotDeps => ({ registry, store, version, clock, capabilities })

  function trackRegistryBody(trackRegistry: TrackRegistry): Record<string, unknown> {
    return {
      ok: true,
      revision: trackRegistry.revision,
      source: trackRegistry.source,
      tracks: trackRegistry.ordered,
    }
  }

  async function scanActiveTrackChanges(root: string): Promise<ChangeRefScan> {
    const changesRoot = join(root, 'openspec', 'changes')
    let entries
    try {
      entries = await readdir(changesRoot, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { refs: [], unreadable: [] }
      return { refs: [], unreadable: [`<changes-root>: ${errMsg(error)}`] }
    }
    const names = entries
      .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
      .map((entry) => entry.name)
      .sort()
    const refs: Array<{ name: string; track: string; workflow: string }> = []
    const unreadable: string[] = []
    for (const name of names) {
      try {
        const state = await store.read(join(changesRoot, name))
        const track = state.fields.track
        const workflow = state.fields.workflow
        refs.push({
          name,
          track: Array.isArray(track) ? track.join(',') : (track ?? ''),
          workflow: Array.isArray(workflow) ? workflow.join(',') : (workflow ?? ''),
        })
      } catch {
        unreadable.push(name)
      }
    }
    return { refs, unreadable }
  }

  function sendTrackError(res: ServerResponse, error: unknown): void {
    if (error instanceof RegistryRevisionConflictError) {
      return sendJson(res, 409, {
        ok: false, code: 'TRACK_REVISION_CONFLICT', error: error.message,
        expected: error.expected, actual: error.actual,
      })
    }
    if (error instanceof TrackReferencedError) {
      return sendJson(res, 409, { ok: false, code: 'TRACK_REFERENCED', error: error.message, references: error.references })
    }
    if (error instanceof TrackReferencesInvalidatedError) {
      return sendJson(res, 409, { ok: false, code: 'TRACK_REFERENCES_INVALIDATED', error: error.message, references: error.offending })
    }
    if (error instanceof ChangeScanFailedError) {
      return sendJson(res, 409, { ok: false, code: 'TRACK_REFERENCE_SCAN_FAILED', error: error.message, blockers: error.unreadable })
    }
    if (error instanceof TrackAlreadyExistsError) {
      return sendJson(res, 409, { ok: false, code: 'TRACK_ALREADY_EXISTS', error: error.message })
    }
    if (error instanceof TrackNotFoundError) {
      return sendJson(res, 404, { ok: false, code: 'TRACK_NOT_FOUND', error: error.message })
    }
    if (error instanceof BuiltinTrackDeleteError || error instanceof BuiltinTrackPolicyError) {
      return sendJson(res, 400, { ok: false, code: 'TRACK_BUILTIN_LOCKED', error: error.message })
    }
    const message = errMsg(error)
    if (message.startsWith('mutateTrackRegistry: next 未过完整校验')) {
      return sendJson(res, 400, { ok: false, code: 'TRACK_INVALID', error: message })
    }
    return sendJson(res, 500, { ok: false, error: message })
  }

  async function mutateTrackForApi<T>(
    anchor: WorkflowRootAnchor,
    expectedRevision: string,
    mutate: Parameters<typeof mutateTrackRegistry<T>>[2],
  ): Promise<ReturnType<typeof mutateTrackRegistry<T>>> {
    assertWorkflowRootAnchor(anchor)
    ensureWorkflowProjectCoordinationPath(anchor)
    return mutateTrackRegistry(anchor.path, trackValidationContextFor(anchor), async (snapshot) => {
      if (snapshot.registry.revision !== expectedRevision) {
        throw new RegistryRevisionConflictError(expectedRevision, snapshot.registry.revision)
      }
      return mutate(snapshot)
    })
  }

  const fileExists = (root: string, relPath: string): boolean => {
    try {
      return statSync(join(root, relPath)).isFile()
    } catch {
      return false
    }
  }

  // 信任锚单源：19 处「两侧规范化再比较」的唯一落点——注册表条目经 dedupeRoots 已 resolve
  // （且过滤空条目，防 resolvePath('')=cwd 混入可信集），提交的 root 此处同样 resolvePath，
  // 两侧规范化后再比对，防止「同一路径的非规范写法（如结尾多一个斜杠）」被误判为未注册。
  // 纯读谓词：判定失败后的响应（404 + 各自 error 文案）仍由调用点自持——transition 端点的
  // 文案与其余 18 处不同，收敛响应会破坏行为保持。
  const isRegisteredRoot = (root: string): boolean =>
    dedupeRoots(registry()).includes(resolvePath(root))

  async function executeOperation(
    res: ServerResponse,
    root: string,
    args: readonly string[],
  ): Promise<void> {
    if (!operationsAvailable) {
      return sendJson(res, 503, { ok: false, error: 'Operations 未接线：pipeline CLI bundle 不存在' })
    }
    if (!root || !isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
    }
    try {
      const result = await operationRunner(resolvePath(root), args)
      return sendJson(res, cliExitHttpStatus(result.exitCode), {
        ok: result.exitCode === 0,
        exit_code: result.exitCode,
        command: ['pipeline', ...args],
        result: parsePipelineCliJson(result.stdout),
        stdout: result.stdout.trimEnd(),
        stderr: result.stderr.trimEnd(),
      })
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: errMsg(error) })
    }
  }

  // workflow CRUD 的注册根是能力锚，不是每请求可重新学习的 pathname。启动时只捕获当下已注册、
  // 且确为非 symlink 目录的 inode；注册表在进程外新增的条目不会在首个业务请求上补锚（那会把
  // 已被换位的路径误认成可信），须经 POST /api/projects 显式注册或重启 server。
  const workflowRootAnchors = new Map<string, WorkflowRootAnchor>()
  try {
    for (const root of dedupeRoots(registry())) {
      try { workflowRootAnchors.set(root, captureWorkflowRootAnchor(root)) } catch { /* 陈旧/不安全条目隔离 */ }
    }
  } catch {
    // 注册表读取本就具 best-effort 语义；读取失败时 workflow CRUD 没有锚，统一 fail-closed。
  }

  type WorkflowRootCheck =
    | { ok: true; anchor: WorkflowRootAnchor }
    | { ok: false; code: 403 | 404; error: string }

  const workflowRootForRequest = (root: string): WorkflowRootCheck => {
    const normalized = resolvePath(root)
    if (!dedupeRoots(registry()).includes(normalized)) {
      const stale = workflowRootAnchors.get(normalized)
      if (stale) {
        closeWorkflowRootAnchor(stale)
        workflowRootAnchors.delete(normalized)
      }
      return { ok: false, code: 404, error: 'root 未在机器级项目注册表中' }
    }
    const anchor = workflowRootAnchors.get(normalized)
    if (!anchor) {
      return { ok: false, code: 403, error: 'registered root 未在 server 启动/显式注册时建立可信 inode 锚' }
    }
    try {
      assertWorkflowRootAnchor(anchor)
      return { ok: true, anchor }
    } catch (e) {
      return { ok: false, code: 403, error: errMsg(e) }
    }
  }

  const trackValidationContextFor = (anchor: WorkflowRootAnchor): TrackValidationContext => ({
    workflowExists: (id) => {
      if (id === 'default') return true
      try {
        readWorkflowForApi(anchor, id)
        return true
      } catch {
        return false
      }
    },
    skillProfiles: trackSkillProfiles,
  })

  let boundPort = 0

  // ── SSE 推送引擎 ──
  const clients = new Set<ServerResponse>()
  let lastFp = ''
  let lastBeat = Date.now()
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function broadcast(event: string, data: string): void {
    lastBeat = Date.now()
    const frame = `event: ${event}\ndata: ${data}\n\n`
    for (const res of clients) {
      try { res.write(frame) } catch { /* 断开的连接会在 close 事件里清理 */ }
    }
  }

  function stopPoll(): void {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  async function pollTick(): Promise<void> {
    if (clients.size === 0) {
      stopPoll() // 零客户端不空转
      return
    }
    let fp: string
    try {
      fp = await computeFingerprint(registry())
    } catch {
      return
    }
    if (fp !== lastFp) {
      lastFp = fp
      try {
        broadcast('snapshot', JSON.stringify(await buildSnapshot(snapshotDeps())))
      } catch {
        /* 一次失败下轮再试 */
      }
    } else if (Date.now() - lastBeat > heartbeatMs) {
      lastBeat = Date.now()
      for (const res of clients) {
        try { res.write(': ping\n\n') } catch { /* ignore */ }
      }
    }
  }

  function startPoll(): void {
    if (pollTimer) return
    pollTimer = setInterval(() => { void pollTick() }, pollIntervalMs)
    pollTimer.unref?.()
  }

  // ── 响应工具 ──
  function sendJson(res: ServerResponse, code: number, obj: unknown): void {
    const body = Buffer.from(JSON.stringify(obj), 'utf8')
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    })
    res.end(body)
  }

  function sendHtml(res: ServerResponse, code: number, html: string): void {
    const body = Buffer.from(html, 'utf8')
    res.writeHead(code, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    })
    res.end(body)
  }

  function readJsonBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
      let done = false
      const finish = (v: unknown): void => { if (!done) { done = true; resolve(v) } }
      const len = Number.parseInt(String(req.headers['content-length'] ?? ''), 10)
      if (Number.isFinite(len) && len > MAX_POST_BODY) return finish(undefined)
      let data = ''
      let size = 0
      req.setEncoding('utf8')
      req.on('data', (c: string) => {
        size += Buffer.byteLength(c)
        if (size > MAX_POST_BODY) { finish(undefined); req.destroy(); return }
        data += c
      })
      req.on('end', () => {
        try { finish(JSON.parse(data)) } catch { finish(undefined) }
      })
      req.on('error', () => finish(undefined))
    })
  }

  // ── SSE 端点 ──
  async function handleStream(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    clients.add(res)
    try {
      lastFp = await computeFingerprint(registry())
      res.write(`event: snapshot\ndata: ${JSON.stringify(await buildSnapshot(snapshotDeps()))}\n\n`)
    } catch {
      /* 初始快照失败不影响后续推送 */
    }
    startPoll()
    req.on('close', () => {
      clients.delete(res)
      if (clients.size === 0) stopPoll()
    })
  }

  // ── SPA 静态供给（BACKLOG #26c）：webRoot 存在则服务 dashboard-app 产物 ──
  const webRoot = options.webRoot
  const STATIC_TYPES: Record<string, string> = {
    '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  }
  function serveIndexWithToken(res: ServerResponse): boolean {
    if (!webRoot) return false
    try {
      let html = readFileSync(join(webRoot, 'index.html'), 'utf8')
      const jsToken = JSON.stringify(token).replace(/</g, '\\u003c')
      const inject = `<script>window.__PIPELINE_DASHBOARD_TOKEN__ = ${jsToken};</script>`
      html = html.includes('</head>') ? html.replace('</head>', `${inject}</head>`) : `${inject}${html}`
      sendHtml(res, 200, html)
      return true
    } catch { return false }
  }
  /** /assets/* 静态供给：限 webRoot/assets 子树（防路径穿越），命中返回 true。 */
  function serveAsset(res: ServerResponse, path: string): boolean {
    if (!webRoot || !path.startsWith('/assets/')) return false
    const rel = path.slice(1) // 去前导 /
    if (rel.includes('..')) return false
    const abs = join(webRoot, rel)
    if (!abs.startsWith(join(webRoot, 'assets'))) return false
    try {
      const body = readFileSync(abs)
      const ext = abs.slice(abs.lastIndexOf('.'))
      res.writeHead(200, {
        'Content-Type': STATIC_TYPES[ext] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'public, max-age=31536000, immutable',
      })
      res.end(body)
      return true
    } catch { return false }
  }

  /** v9-I/J：session-link 核心查询 —— 单条端点与批量端点共用（不复制粘贴）。查 automation_worktree
   *  →回落 root→listMemSessions→拼 resumeCmd；入参 root/name 假定已过校验（名字格式/root 信任锚/
   *  change 存在），此函数只管查询与降级，不做 400/404 判断。查询异常收敛 found:false（不外抛），
   *  同 /api/afk/readiness「查不到是常态不是故障」的恒 200 哲学。 */
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
  async function handleGet(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    if (path === '/api/cadence/status') {
      if (cadenceScheduler === null) {
        return sendJson(res, 404, { ok: false, error: 'cadence scheduler 未启用（capabilities.cadence=false）' })
      }
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root')
      const status = cadenceScheduler.snapshot()
      return sendJson(res, 200, root === null ? status : {
        ...status,
        loops: status.loops.filter((row) => row.root === resolvePath(root)),
      })
    }
    if (path === '/' || path === '/index.html') {
      if (serveIndexWithToken(res)) return // SPA 产物存在 → 服务真前端
      return sendHtml(res, 200, indexHtml(token)) // 回退最小落地页
    }
    if (serveAsset(res, path)) return
    if (path === '/api/health') {
      return sendJson(res, 200, { ok: true, scope: 'global', version, pid: process.pid })
    }
    // ── DNS 重绑定守卫（Bug 修复）：除落地页 / 静态 /assets / health 探针（以上均已 return）外，
    //    所有 /api 只读数据端点统一挡伪造 Host。此前仅 secrets/docker/readiness 三个端点各自 inline
    //    了这道校验，其余（snapshot / afk log / change history / workflows / config / loops / traces /
    //    hooks / automation / skills）全无 → evil.com 经 DNS 重绑定到 127.0.0.1 后，受害者浏览器可同源
    //    读走全部项目路径、状态、run-log（可能含 token）、yaml。统一在此施加，语义同 handlePost 首道守卫；
    //    下方 secrets/docker/readiness 的 inline 守卫遂归并至此（不再各自重复）。
    if (!isLocalHost(req.headers.host, boundPort)) {
      return sendJson(res, 403, { ok: false, error: 'Host header 不合法（疑似 DNS 重绑定攻击）' })
    }
    if (path === '/api/snapshot') {
      try {
        return sendJson(res, 200, await buildSnapshot(snapshotDeps()))
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    if (path === '/api/stream') return handleStream(req, res)
    // ── H11 starter gallery：直接投影 kernel 版本化模板目录，不在前端手抄七份。──
    if (path === '/api/operations/starters') {
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      return sendJson(res, 200, {
        ok: true,
        templates: listAutomationPolicyTemplates(),
        defaults: { runner: 'codex', workflow: 'default' },
      })
    }
    // ── #29d AFK 指挥面数据端：聚合 automation_* → 泳道 + 调度器 doctor 灯 + 流水 ──
    if (path === '/api/afk/snapshot') {
      try {
        return sendJson(res, 200, buildAfkSnapshot(await buildSnapshot(snapshotDeps()), clock))
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    if (path === '/api/afk/log') {
      try {
        return sendJson(res, 200, buildAfkLog(await buildSnapshot(snapshotDeps()), clock))
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    // ── afk-workbench Task 6：GET /api/afk/:name/log —— 单个 change 的原始运行日志文本
    //    （.sandcastle-run.log 原样读取，见 afk.ts::readAfkRunLog）。与上面字面量路由
    //    /api/afk/log（聚合时间线）语义、路径结构均不同，正则要求 /log 前必有 change 名段，
    //    故不会误吞不带名字的旧路由——仍把参数化路由放在字面量判断之后，减少认知负担。
    //    校验顺序同 /api/afk/<name>/cancel、/api/afk/<name>/retry：先 change 名格式、
    //    再 root 信任锚（两侧 resolvePath 规范化再比对注册表）、最后 changeDir 存在性
    //    （ENOENT 前置校验，避免把「change 真不存在」误报成「还没日志」的 200 null）。
    //    读端点本身对齐 /api/config、/api/skills/registry：本机回环 GET 不鉴权。
    const logMatch = /^\/api\/afk\/([^/]+)\/log$/.exec(path)
    if (logMatch) {
      const name = decodeURIComponent(logMatch[1]!)
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      // 信任锚：同 /api/afk/<name>/cancel、/api/afk/<name>/retry 共用的「两侧规范化再比较」模式。
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const dir = join(root, 'openspec', 'changes', name)
      // ENOENT 前置校验（同 cancelAfkRun/retryAfkRun 的存在性前置）：change 真不存在时给 400，
      // 不与「change 存在但还没日志」的 200 { log: null } 混为一谈。这里刻意用 400 而非看似更
      // "RESTful" 的 404——三个同由 root+name 寻址的兄弟端点（cancel/retry/log）在这条完全相同
      // 的“canonical current 与 legacy YAML 都不存在”判断上必须给同一状态码：cancel/retry 经
      // `sendJson(res, result.ok ? 200 : 400, result)` 把这个条件统一收敛成 400（见下方两个
      // handlePost 分支），log 若单独选 404 会让共享这三个端点错误处理逻辑的前端踩坑（review
      // finding）。root 未注册（上面那个分支）仍是 404，因为那是三端点另一个真正统一使用 404
      // 的既有约定，与此处无关。
      if (!stateStorageExistsSync(dir)) {
        return sendJson(res, 400, { ok: false, error: '找不到该 change（无 canonical/legacy 状态）' })
      }
      return sendJson(res, 200, { log: await readAfkRunLog(dir) })
    }
    // ── v5 T1（G21）：GET /api/change/:name/history —— change 阶段时间线数据源
    //    （.pipeline-history.jsonl 按 ts 升序回放，见 transition.ts::readChangeHistory）。
    //    校验顺序同 /api/afk/<name>/log 兄弟端点：先 change 名格式（防路径穿越）、再 root
    //    信任锚（两侧 resolvePath 规范化再比对注册表 → 404）、最后 changeDir 存在性（ENOENT
    //    前置校验 → 400，同 cancel/retry/log 三兄弟对这条完全相同判断的统一状态码约定——
    //    不与「change 存在但还没记录」的 200 { entries: [] } 混为一谈）。
    //    读端点对齐 /api/config、/api/skills/registry：本机回环 GET 不鉴权。
    const mHistory = /^\/api\/change\/([^/]+)\/history$/.exec(path)
    if (mHistory) {
      const name = decodeURIComponent(mHistory[1]!)
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const dir = join(root, 'openspec', 'changes', name)
      if (!stateStorageExistsSync(dir)) {
        return sendJson(res, 400, { ok: false, error: '找不到该 change（无 canonical/legacy 状态）' })
      }
      return sendJson(res, 200, { entries: await readChangeHistory(dir, { store, recordStore }) })
    }
    // ── Control Room：canonical WorkflowRun + TransitionRecord + 关联 loop ledger 审计真相源。──
    const mRunDetail = /^\/api\/change\/([^/]+)\/run-detail$/.exec(path)
    if (mRunDetail) {
      const name = decodeURIComponent(mRunDetail[1]!)
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const dir = join(root, 'openspec', 'changes', name)
      if (!stateStorageExistsSync(dir)) {
        return sendJson(res, 400, { ok: false, error: '找不到该 change（无 canonical/legacy 状态）' })
      }
      try {
        return sendJson(res, 200, await buildRunDetail(root, dir, name, {
          store,
          recordStore,
          ledger: loopLedger,
        }))
      } catch (error) {
        return sendJson(res, 500, { ok: false, error: errMsg(error) })
      }
    }
    // ── loops 治理面数据端：跨项目聚合 loops.yaml ──
    if (path === '/api/loops/snapshot') {
      try {
        const snap = await buildLoopsSnapshot({ registry: () => dedupeRoots(registry()), now: () => new Date(clock()) })
        return sendJson(res, 200, snap)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    // ── #34d traffic 查看器数据端：TraceStore.listSessions / readRecords（#34e 只读本地、不外发）──
    if (path === '/api/traces/sessions') {
      if (!traceStore) return sendJson(res, 404, { ok: false, error: 'traces 数据端未装（capabilities.traffic=false）' })
      try {
        return sendJson(res, 200, listTraceSessions(traceStore, clock))
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    if (path === '/api/traces/records') {
      if (!traceStore) return sendJson(res, 404, { ok: false, error: 'traces 数据端未装（capabilities.traffic=false）' })
      const session = new URL(req.url ?? '/', 'http://localhost').searchParams.get('session')
      if (!session) return sendJson(res, 400, { ok: false, error: '缺 session 查询参数' })
      try {
        return sendJson(res, 200, readTraceRecords(traceStore, session, clock))
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    // ── v3 Studio Track Registry：独立只读端点，不依赖 manifest/config capability。──
    if (path === '/api/tracks') {
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      const rootCheck = workflowRootForRequest(root)
      if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error })
      try {
        assertWorkflowRootAnchor(rootCheck.anchor)
        let pipelineExists = true
        try { lstatSync(join(rootCheck.anchor.path, '.pipeline')) } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') pipelineExists = false
          else throw error
        }
        if (pipelineExists) ensureWorkflowProjectCoordinationPath(rootCheck.anchor)
        const trackRegistry = loadTrackRegistry(rootCheck.anchor.path, trackValidationContextFor(rootCheck.anchor))
        assertWorkflowRootAnchor(rootCheck.anchor)
        return sendJson(res, 200, trackRegistryBody(trackRegistry))
      } catch (error) {
        return sendJson(res, 500, { ok: false, error: errMsg(error) })
      }
    }
    // ── G3/T-R5 config 数据端：manifest 强制 skill 表 + 项目 effective Track Registry。──
    if (path === '/api/config') {
      if (!manifestPath) return sendJson(res, 404, { ok: false, error: 'config 数据端未装（capabilities.config=false）' })
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      if (root === '') return sendJson(res, 400, { ok: false, error: '缺少 root 参数' })
      const rootCheck = workflowRootForRequest(root)
      if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error })
      try {
        assertWorkflowRootAnchor(rootCheck.anchor)
        // 缺 `.pipeline` 是 builtin-only 的合法纯读路径，不能为 GET 凭空创建目录；目录一旦存在，
        // 则先复用 G6 的 O_NOFOLLOW/inode 校验，拒绝 `.pipeline` 或 tracks.yaml 外部 symlink。
        let pipelineExists = true
        try {
          lstatSync(join(rootCheck.anchor.path, '.pipeline'))
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'ENOENT') pipelineExists = false
          else throw e
        }
        if (pipelineExists) ensureWorkflowProjectCoordinationPath(rootCheck.anchor)
        const snapshot = readConfigSnapshot({
          manifestPath,
          repoRoot: rootCheck.anchor.path,
          trackValidationContext: trackValidationContextFor(rootCheck.anchor),
          generatedAt: clock(),
        })
        assertWorkflowRootAnchor(rootCheck.anchor)
        return sendJson(res, 200, snapshot)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    // ── skills registry 数据端：本仓 skills 目录 + EXTERNAL-SKILLS.md 合并明细（GET 只读，本机回环不鉴权）。
    //    T6：响应体从 {skills:string[]} 破坏性升级为 {skills:SkillEntry[]}（研究报告 §4.2 方案 a，
    //    仓内两个消费方同批改，无仓外第三方）；「已装」三源检测按 paths.claudeDir（hermetic 可覆盖）。──
    if (path === '/api/skills/registry') {
      try {
        return sendJson(res, 200, { skills: listAllSkillsDetailed(repoRootForSkills(), paths.claudeDir) })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    // ── v5 T5（决议#2）：GET /api/hooks —— hook 元数据 + 阶段×hook 开关矩阵 ──
    //    数据源 <root>/.pipeline/hooks.json（只存禁用项；缺文件/损坏 → 空矩阵 = 缺省全启用，
    //    fail-open，见 hooksConfig.ts 头注释）。root 信任锚同 /api/workflows；读端点对齐
    //    /api/config、/api/skills/registry：本机回环 GET 不鉴权。
    if (path === '/api/hooks') {
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      try {
        return sendJson(res, 200, { ok: true, hooks: HOOK_METAS, matrix: readHooksMatrix(root) })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    // ── T21：GET /api/automation —— AFK 执行参数（.pipeline/automation.json）──
    //    缺文件/损坏 → 全默认（fail-open，见 automationConfig.ts 头注释）。root 信任锚 +
    //    本机回环 GET 不鉴权，全部对齐 /api/hooks 先例。
    if (path === '/api/automation') {
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      try {
        return sendJson(res, 200, { ok: true, settings: readAutomationSettings(root) })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    // ── workflow 编辑器（GOAL E8）：GET /api/workflows —— 列出自定义 workflow（排除 default）──
    if (path === '/api/workflows') {
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      const rootCheck = workflowRootForRequest(root)
      if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error })
      try {
        return sendJson(res, 200, { names: listWorkflowNames(rootCheck.anchor) })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }

    // ── workflow 编辑器（GOAL E8）：GET /api/workflows/:name —— 读单个 workflow ──
    // 校验顺序同 /api/afk/<name>/log、/api/afk/<name>/cancel、/api/afk/<name>/retry：
    // 先 name 格式（防路径穿越：拒 '..' 等非法段落入安全读取层的 child lookup），
    // 再 root 信任锚，最后真读+解析。
    const mWfGet = /^\/api\/workflows\/([^/]+)$/.exec(path)
    if (mWfGet) {
      const wfName = decodeURIComponent(mWfGet[1]!)
      if (!isWorkflowName(wfName)) {
        return sendJson(res, 400, { ok: false, error: '非法 workflow 名（允许中文、字母、数字、- 与 _；不允许空格、点或路径符号）' })
      }
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      const rootCheck = workflowRootForRequest(root)
      if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error })
      try {
        // 先用 G6 安全读区分真 404/结构损坏；目标存在后才准备 project lock，避免 GET ghost
        // 为纯查询凭空创建 `.pipeline`。
        readWorkflowForApi(rootCheck.anchor, wfName)
        ensureWorkflowProjectCoordinationPath(rootCheck.anchor)
      } catch (e) {
        return sendJson(res, e instanceof WorkflowNotFoundError ? 404 : 500, { ok: false, error: errMsg(e) })
      }
      try {
        const checked = await withTrackRegistryLock(
          rootCheck.anchor.path,
          trackValidationContextFor(rootCheck.anchor),
          async ({ registry }) => {
            assertWorkflowRootAnchor(rootCheck.anchor)
            const workflow = readWorkflowForApi(rootCheck.anchor, wfName)
            return { workflow, errors: validateWorkflowTrackReferences(workflow, registry) }
          },
        )
        if (checked.errors.length > 0) {
          return sendJson(res, 409, {
            ok: false,
            code: 'WORKFLOW_TRACK_REFERENCES_INVALID',
            workflow: wfName,
            errors: checked.errors,
          })
        }
        return sendJson(res, 200, checked.workflow)
      } catch (e) {
        if (e instanceof WorkflowNotFoundError) return sendJson(res, 404, { ok: false, error: errMsg(e) })
        // registry 本身损坏/引用缺失同样不能把 workflow 伪装成健康 200；显式 degraded 409。
        return sendJson(res, 409, {
          ok: false,
          code: 'WORKFLOW_REFERENCE_CONTEXT_DEGRADED',
          workflow: wfName,
          errors: [errMsg(e)],
        })
      }
    }
    // ── v6 T1：GET /api/secrets —— 机器级凭证存储只读探测（掩码，永不回明文）──
    //    不要求 root（机器级资源，与 GET /api/skills/registry、B 节 GET /api/docker/images
    //    同类「无信任锚分支」的端点，proposal C.3 明确本端点无 root 概念）；不要求 token
    //    （维持 GET 惯例，同 B.2 判断）；Host 头 DNS 重绑定守卫已由 handleGet 顶部统一施加
    //    （本端点碰凭证子系统本就该有，proposal 决策点 C.3——现在全部只读 GET 都有了）。
    if (path === '/api/secrets') {
      try {
        return sendJson(res, 200, buildSecretsResponse(paths.secretsPath))
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    // ── v6 T3：GET /api/docker/images —— 本机 docker 镜像列表（repo:tag，过滤悬空）。──
    //    无 root 概念（单机资源，同 /api/secrets 一类）；不要求 token（Host 头 DNS 重绑定守卫
    //    已由 handleGet 顶部统一施加，决策 B.2）。docker 不可用/超时(5s) → 200 + available:false
    //    （ok 恒 true——「没装 docker」是常态不是 HTTP 错误，前端据此降级纯文本框，B.1/B.3）。
    if (path === '/api/docker/images') {
      const r = await listDockerImages(options.execDocker)
      return sendJson(res, 200, { ok: true, ...r })
    }
    // ── v6 T4：GET /api/afk/readiness?root= —— AFK 就绪三灯(docker/镜像/凭证)。──
    //    root 必填(镜像检查要读该 root 的 automation.json;显式缺失 400,未注册 404 信任锚);
    //    Host 头 DNS 重绑定守卫已由 handleGet 顶部统一施加;「没装/没建/没配」是常态不是错误
    //    → 恒 200,永不回凭证值(D.1 契约,与 /api/secrets 同条红线)。
    if (path === '/api/afk/readiness') {
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      if (root === '') return sendJson(res, 400, { ok: false, error: '缺少 root 参数' })
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const image = readAutomationSettings(root).image || 'sandcastle:local'
      const r = await buildAfkReadiness({
        image,
        secretsPath: paths.secretsPath,
        exec: options.execDocker,
        defaultCodexHome: join(homedir(), '.codex'),
      })
      return sendJson(res, 200, r)
    }
    // ── v9-I：GET /api/mem/session-link?root=&name= —— change ↔ 终端会话关联（恢复命令）。──
    //    读 change 快照字段 automation_worktree（空则回落 root）作 cwd，经 kernel mem
    //    listMemSessions 查该目录最近的持久化会话（platform all，recency 首条）；claude/codex
    //    给真实恢复命令（`claude --resume <id>` / `codex resume <id>`，二者拼法均已在宿主机
    //    实测 --help 确认），opencode/pi 无把握的恢复拼法 → resumeCmd:null（UI 只显示 id+目录，
    //    不造假命令）。「查不到会话」是常态不是错误（AFK 沙箱内 claude 会话随容器 HOME=/tmp
    //    销毁，宿主机本就查不到）→ 恒 200 { found:false, dir, reason }，对齐 /api/afk/readiness
    //    的恒 200 哲学；查询异常同样收敛 found:false（不 500 裸抛、reason 不带原始路径）。
    //    校验顺序同 /api/change/:name/history：name 格式 400 → root 信任锚 404 → change 存在 400。
    if (path === '/api/mem/session-link') {
      const sp = new URL(req.url ?? '/', 'http://localhost').searchParams
      const name = sp.get('name') ?? ''
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      const root = sp.get('root') ?? ''
      if (root === '') return sendJson(res, 400, { ok: false, error: '缺少 root 参数' })
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const changeDir = join(root, 'openspec', 'changes', name)
      if (!stateStorageExistsSync(changeDir)) {
        return sendJson(res, 400, { ok: false, error: '找不到该 change（无 canonical/legacy 状态）' })
      }
      return sendJson(res, 200, await resolveSessionLink(root, name))
    }
    // ── v9-J：GET /api/mem/session-links?root=&name=&root=&name=... —— 批量版 session-link。──
    //    进度视图 failed 行「回终端」chip 一次预取全部失败行的恢复命令（产品决策：批量端点而非
    //    逐行发请求，也不是等用户点开抽屉才有数据——行内 chip 在需要时批量出现，逐条查询不理想）。
    //    参数用重复键（URLSearchParams.getAll），按下标配对；长度不等 → 400。上限 50 对（超出→400，
    //    防御性上限，非并发预算——批量查询本身够快，避免离谱请求体拖垮单进程 kernel mem 查询循环）。
    //    单个 pair 校验不过（名字非法/root 未注册/change 不存在）→ 该 key fail-soft 为
    //    { found:false, reason:'invalid' }，不让一个坏 pair 拖累整批 400 ——呼应本端点家族
    //    「查不到是常态不是故障」的哲学（同 /api/afk/readiness 恒 200 先例）。成功恒 200，
    //    body = { links: Record<string, SessionLinkResult> }，key=`${name}@${root}`
    //    （与前端 ProgressView rowKeyOf 同款拼法，不要用别的分隔符）。核心查询复用 resolveSessionLink
    //    （单条端点同款 helper，不复制粘贴）。
    if (path === '/api/mem/session-links') {
      const sp = new URL(req.url ?? '/', 'http://localhost').searchParams
      const roots = sp.getAll('root')
      const names = sp.getAll('name')
      if (roots.length !== names.length) {
        return sendJson(res, 400, { ok: false, error: 'root/name 参数数量不匹配' })
      }
      if (roots.length > 50) {
        return sendJson(res, 400, { ok: false, error: 'items 过多（上限 50）' })
      }
      const links: Record<string, unknown> = {}
      await Promise.all(
        roots.map(async (root, i) => {
          const name = names[i] ?? ''
          const key = `${name}@${root}`
          const valid =
            name !== '' &&
            /^[a-zA-Z0-9_-]+$/.test(name) &&
            !name.includes('..') &&
            root !== '' &&
            isRegisteredRoot(root) &&
            stateStorageExistsSync(join(root, 'openspec', 'changes', name))
          links[key] = valid ? await resolveSessionLink(root, name) : { found: false, reason: 'invalid' }
        }),
      )
      return sendJson(res, 200, { links })
    }
    return sendJson(res, 404, { ok: false, error: '未知端点' })
  }

  async function handlePost(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    // (1) DNS-rebinding 守卫
    if (!isLocalHost(req.headers.host, boundPort)) {
      return sendJson(res, 403, { ok: false, error: 'Host header 不合法（疑似 DNS 重绑定攻击）' })
    }
    // (2) B5：所有写端点强制 token 鉴权
    const provided = tokenFromHeaders(req.headers)
    if (!provided || !tokensMatch(provided, token)) {
      return sendJson(res, 401, { ok: false, error: '缺少或无效 token（写端点需鉴权）' })
    }
    // (3) 强制 application/json（借同源策略：跨源 JSON POST 触发预检，本 server 零 CORS 头 → 被阻断）
    const ctype = String(req.headers['content-type'] ?? '').split(';', 1)[0]!.trim().toLowerCase()
    if (ctype !== 'application/json') {
      return sendJson(res, 400, { ok: false, error: '写回端点要求 Content-Type: application/json' })
    }

    // ── Track Router 公共预览：消费 effective registry，生产默认 scorer 真执行 grep -ciE。──
    // 虽然不写盘，仍走 POST：prompt 可能较长且携带用户意图，不放 URL/query；统一受 token、Host、
    // JSON 三闸保护。响应保留全部候选分数，suppressed_reason 非空时 winner=null，显式创建 UI 仍可手选。
    if (path === '/api/router/preview') {
      const raw = await readJsonBody(req)
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
      }
      const body = raw as Record<string, unknown>
      const root = typeof body.root === 'string' ? body.root : ''
      const prompt = typeof body.prompt === 'string' ? body.prompt : ''
      if (prompt.trim() === '') return sendJson(res, 400, { ok: false, error: 'prompt 不得为空' })
      const rootCheck = workflowRootForRequest(root)
      if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error })
      try {
        assertWorkflowRootAnchor(rootCheck.anchor)
        let pipelineExists = true
        try { lstatSync(join(rootCheck.anchor.path, '.pipeline')) } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') pipelineExists = false
          else throw error
        }
        if (pipelineExists) ensureWorkflowProjectCoordinationPath(rootCheck.anchor)
        const registry = loadTrackRegistry(rootCheck.anchor.path, trackValidationContextFor(rootCheck.anchor))
        const draft = body.draft_track === undefined ? null : parseRouterDraft(body.draft_track)
        const candidates = draft === null ? registry.ordered : applyRouterDraft(registry.ordered, draft)
        const preview = await previewTrackRouting(prompt, candidates, routerPatternScorer)
        assertWorkflowRootAnchor(rootCheck.anchor)
        return sendJson(res, 200, { ok: true, revision: registry.revision, source: registry.source, ...preview })
      } catch (error) {
        return sendJson(res, 400, { ok: false, error: errMsg(error) })
      }
    }

    // ── H11-H14/G2 Operations：HTTP 只负责严格校验 + argv 映射；执行语义复用 built CLI。──
    if (path === '/api/operations/loops/init') {
      const raw = await readJsonBody(req)
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
      }
      const body = raw as Record<string, unknown>
      const root = typeof body.root === 'string' ? body.root : ''
      const id = typeof body.id === 'string' ? body.id.trim() : ''
      const template = typeof body.template === 'string' ? body.template : ''
      const workflow = typeof body.workflow === 'string' && body.workflow.trim() !== '' ? body.workflow.trim() : 'default'
      const runner = typeof body.runner === 'string' && body.runner.trim() !== '' ? body.runner.trim() : 'codex'
      const skillBundle = typeof body.skill_bundle === 'string' ? body.skill_bundle.trim() : ''
      const goal = typeof body.goal === 'string' ? body.goal.trim() : ''
      if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) {
        return sendJson(res, 400, { ok: false, error: 'id 须为 2-64 位 kebab-case' })
      }
      if (!listAutomationPolicyTemplates().some((item) => item.id === template)) {
        return sendJson(res, 400, { ok: false, error: 'template 不在版本化 starter 目录中' })
      }
      if (runner !== 'codex' && runner !== 'claude-code') {
        return sendJson(res, 400, { ok: false, error: 'runner 仅允许 codex 或 claude-code' })
      }
      const args = [
        'loops', 'init', '--id', id, '--template', template, '--workflow', workflow,
        ...(skillBundle === '' ? [] : ['--skill-bundle', skillBundle]),
        '--runner', runner,
        ...(goal === '' ? [] : ['--goal', goal]),
        '--yes', '--json',
      ]
      return executeOperation(res, root, args)
    }

    if (path === '/api/operations/loops/run') {
      const raw = await readJsonBody(req)
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
      }
      const body = raw as Record<string, unknown>
      const root = typeof body.root === 'string' ? body.root : ''
      const selector = typeof body.selector === 'string' ? body.selector.trim() : ''
      const level = typeof body.level === 'string' ? body.level : 'L1'
      const dryRun = body.dry_run !== false
      const commit = body.commit === true
      if (selector === '' || !['L1', 'L2', 'L3'].includes(level)) {
        return sendJson(res, 400, { ok: false, error: 'selector 必填，level 仅允许 L1/L2/L3' })
      }
      if (!dryRun && body.confirm_run !== true) {
        return sendJson(res, 400, { ok: false, error: '真实运行须显式 confirm_run=true' })
      }
      if (!dryRun && level === 'L3' && body.confirm_l3 !== true) {
        return sendJson(res, 400, { ok: false, error: 'L3 自动合并须额外 confirm_l3=true' })
      }
      const args = [
        'loops', 'run', selector,
        ...(dryRun ? ['--dry-run'] : []),
        '--level', level,
        ...(!dryRun && commit ? ['--commit'] : []),
        '--json',
      ]
      return executeOperation(res, root, args)
    }

    if (path === '/api/operations/loops/sync') {
      const raw = await readJsonBody(req)
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
      }
      const body = raw as Record<string, unknown>
      const root = typeof body.root === 'string' ? body.root : ''
      const loopId = typeof body.loop_id === 'string' ? body.loop_id.trim() : ''
      const mode = body.mode === 'apply' ? 'apply' : body.mode === 'dry-run' ? 'dry-run' : ''
      if (loopId === '' || mode === '') {
        return sendJson(res, 400, { ok: false, error: 'loop_id 必填，mode 仅允许 dry-run/apply' })
      }
      if (mode === 'apply' && body.confirm_apply !== true) {
        return sendJson(res, 400, { ok: false, error: 'sync apply 须显式 confirm_apply=true' })
      }
      const registrySha = typeof body.expected_registry_sha === 'string' ? body.expected_registry_sha.trim() : ''
      const workflowSha = typeof body.expected_workflow_sha === 'string' ? body.expected_workflow_sha.trim() : ''
      const args = [
        'loops', 'sync', loopId, mode === 'apply' ? '--apply' : '--dry-run',
        ...(registrySha === '' ? [] : ['--expected-registry-sha', registrySha]),
        ...(workflowSha === '' ? [] : ['--expected-workflow-sha', workflowSha]),
        '--json',
      ]
      return executeOperation(res, root, args)
    }

    if (path === '/api/operations/triage') {
      const raw = await readJsonBody(req)
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
      }
      const body = raw as Record<string, unknown>
      const root = typeof body.root === 'string' ? body.root : ''
      const source = body.source === 'git-commits' || body.source === 'loop-run-terminals' ? body.source : ''
      if (source === '') return sendJson(res, 400, { ok: false, error: 'source 仅允许 git-commits/loop-run-terminals' })
      if (body.confirm_apply !== true) {
        return sendJson(res, 400, { ok: false, error: 'triage 会创建 WorkflowRun 并提交 checkpoint，须显式 confirm_apply=true' })
      }
      const positiveInt = (value: unknown, fallback: number): number =>
        typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback
      const model = typeof body.model === 'string' ? body.model.trim() : ''
      const args = [
        'triage', source, '--provider', 'codex',
        ...(model === '' ? [] : ['--model', model]),
        '--page-size', String(positiveInt(body.page_size, 20)),
        '--max-pages', String(positiveInt(body.max_pages, 4)),
        '--max-high-candidates', String(positiveInt(body.max_high_candidates, 10)),
        '--json',
      ]
      return executeOperation(res, root, args)
    }

    if (path === '/api/operations/artifact/register') {
      const raw = await readJsonBody(req)
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
      }
      const body = raw as Record<string, unknown>
      const root = typeof body.root === 'string' ? body.root : ''
      const change = typeof body.change === 'string' ? body.change.trim() : ''
      const field = typeof body.field === 'string' ? body.field.trim() : ''
      const artifactPath = typeof body.path === 'string' ? body.path : ''
      const producer = typeof body.producer === 'string' ? body.producer.trim() : ''
      if (!/^[a-zA-Z0-9_-]+$/.test(change) || field === '' || artifactPath === '' || producer === '') {
        return sendJson(res, 400, { ok: false, error: 'change/field/path/producer 均为必填且 change 名须合法' })
      }
      return executeOperation(res, root, [
        'artifact', 'register', change, field, artifactPath, '--producer', producer,
      ])
    }

    // ── G1 canonical/projection 显式修复面。默认拒绝把 legacy 重新提升为真相源。──
    const projectionMatch = /^\/api\/change\/([^/]+)\/projection$/.exec(path)
    if (projectionMatch) {
      const name = decodeURIComponent(projectionMatch[1]!)
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      const raw = await readJsonBody(req)
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
      }
      const body = raw as Record<string, unknown>
      const root = typeof body.root === 'string' ? body.root : ''
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const dir = join(root, 'openspec', 'changes', name)
      if (!stateStorageExistsSync(dir)) {
        return sendJson(res, 400, { ok: false, error: '找不到该 change（无 canonical/legacy 状态）' })
      }
      try {
        if (body.action === 'repair-projection') {
          const projection = await store.repairProjection(dir, { forceCanonical: body.force_canonical === true })
          return sendJson(res, 200, { ok: true, action: body.action, projection })
        }
        if (body.action === 'import-legacy') {
          if (body.confirm_import !== true) {
            return sendJson(res, 400, { ok: false, error: 'import-legacy 须显式 confirm_import=true' })
          }
          const imported = await store.importLegacyProjection(dir)
          return sendJson(res, 200, { ok: true, action: body.action, projection: imported.projection })
        }
        return sendJson(res, 400, { ok: false, error: 'action 仅允许 repair-projection/import-legacy' })
      } catch (error) {
        return sendJson(res, 409, { ok: false, error: errMsg(error) })
      }
    }

    // ── G18：POST /api/projects —— 注册项目进机器级注册表 ──
    //    全仓唯一豁免第四层信任锚的写端点（职责就是把 root 放进注册表，"必须已注册"逻辑
    //    不成立）；补偿校验（路径存在/是目录/规范化判重）在 projects.ts 内完成。
    if (path === '/api/projects') {
      const body = await readJsonBody(req)
      const rawRoot = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).root : undefined
      let pendingAnchor: WorkflowRootAnchor | undefined
      if (typeof rawRoot === 'string' && rawRoot) {
        try {
          pendingAnchor = captureWorkflowRootAnchor(rawRoot)
        } catch (e) {
          // projects.ts 历来用 stat 跟随 symlink；workflow 能力锚必须更严：最终词法段本身若是
          // symlink，不能先把它写进注册表再在业务请求上学习其目标 inode。
          try {
            if (lstatSync(resolvePath(rawRoot)).isSymbolicLink()) {
              return sendJson(res, 400, { ok: false, error: `registered root 不得是 symlink：${resolvePath(rawRoot)}` })
            }
          } catch {
            // 不存在/不可访问/非目录继续交给 projects.ts，以保持既有 404 文案与状态码。
          }
        }
      }
      const result = await addProjectToRegistry(paths.registryPath, rawRoot)
      if (!result.ok) {
        if (pendingAnchor) closeWorkflowRootAnchor(pendingAnchor)
        return sendJson(res, result.code, { ok: false, error: result.error })
      }
      if (!pendingAnchor || pendingAnchor.path !== result.root) {
        if (pendingAnchor) closeWorkflowRootAnchor(pendingAnchor)
        await removeProjectFromRegistry(paths.registryPath, result.root).catch(() => undefined)
        return sendJson(res, 400, { ok: false, error: 'registered root 在注册期间未能建立稳定 inode 锚' })
      }
      try {
        assertWorkflowRootAnchor(pendingAnchor)
      } catch (e) {
        closeWorkflowRootAnchor(pendingAnchor)
        await removeProjectFromRegistry(paths.registryPath, result.root).catch(() => undefined)
        return sendJson(res, 400, { ok: false, error: errMsg(e) })
      }
      const previous = workflowRootAnchors.get(result.root)
      if (previous) closeWorkflowRootAnchor(previous)
      workflowRootAnchors.set(result.root, pendingAnchor)
      return sendJson(res, 200, { ok: true, root: result.root })
    }

    // ── G18：POST /api/changes —— pipeline init 的 HTTP 化 ──
    //    校验序全部先于任何落盘（同 cli/commands/init.ts 的"先校验后写"纪律）：body 形状 →
    //    root 信任锚（本端点要求已注册）→ name 字符集 → track 枚举 → workflow 真加载校验。
    //    preset 固定 'full'（dashboard 语境无 preset 选择需求，YAGNI）；history 记账对齐
    //    cli/commands/init.ts（G19① 升级收编）：kind=init 单行，best-effort——失败仅 WARN，
    //    绝不影响主写已成功的 200。
    if (path === '/api/changes') {
      const rawBody = await readJsonBody(req)
      if (typeof rawBody !== 'object' || rawBody === null) {
        return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
      }
      const b = rawBody as Record<string, unknown>
      const root = typeof b.root === 'string' ? b.root : ''
      const rootCheck = workflowRootForRequest(root)
      if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error })
      const name = typeof b.name === 'string' ? b.name : ''
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        return sendJson(res, 400, { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      const taskPrompt = parseChangeTaskPrompt(b.task_prompt)
      if (!taskPrompt.ok) return sendJson(res, 400, { ok: false, error: taskPrompt.error })
      const activation = parseChangeSessionActivation(b.activate_session, taskPrompt.value !== null)
      if (!activation.ok) return sendJson(res, 400, { ok: false, error: activation.error })
      // track/workflow 绑定改走 Track Registry（GOAL.md 清单 T · R2）：缺省仍是不可删内建轨 'chat'；
      // 按 root 现载 registry（缺 tracks.yaml → 内建四轨，requireTrack 与旧 TRACKS 枚举校验等价），
      // 再校验「该 track 是否允许该 workflow」（assertWorkflowAllowed）。全部先于任何落盘。
      const trackId = typeof b.track === 'string' && b.track ? b.track : 'chat'
      const workflowRaw = typeof b.workflow === 'string' && b.workflow ? b.workflow : ''
      try {
        ensureWorkflowProjectCoordinationPath(rootCheck.anchor)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }

      type CreateChangeOutcome =
        | { readonly ok: true; readonly created: string; readonly taskPromptSaved: boolean }
        | { readonly ok: false; readonly code: 400 | 404 | 500; readonly error: string }
      let outcome: CreateChangeOutcome
      try {
        outcome = await withTrackRegistryLock(
          rootCheck.anchor.path,
          trackValidationContextFor(rootCheck.anchor),
          async ({ registry }): Promise<CreateChangeOutcome> => {
            assertWorkflowRootAnchor(rootCheck.anchor)
            let track: TrackDefinition
            let workflowId: string
            try {
              track = requireTrack(registry, trackId)
              workflowId = workflowRaw || track.workflow.default
              assertWorkflowAllowed(track, workflowId)
            } catch (e) {
              return { ok: false, code: 400, error: errMsg(e) }
            }

            let customStart: { workflow: string; phase: string; openspecContract?: boolean } | undefined
            if (workflowId !== 'default') {
              let workflow: WorkflowDef
              try {
                workflow = readWorkflowForApi(rootCheck.anchor, workflowId)
              } catch (e) {
                return e instanceof WorkflowNotFoundError
                  ? { ok: false, code: 404, error: `workflow '${workflowId}' 未找到（期望 .pipeline/workflows/${workflowId}.yaml）` }
                  : { ok: false, code: 400, error: errMsg(e) }
              }
              const referenceErrors = validateWorkflowTrackReferences(workflow, registry)
              if (referenceErrors.length > 0) {
                return { ok: false, code: 400, error: referenceErrors.join('；') }
              }
              const first = firstStep(workflow)
              if (!first) return { ok: false, code: 400, error: `workflow '${workflowId}' 未声明任何 step` }
              customStart = {
                workflow: workflowId,
                phase: first.id,
                ...(workflow.openspecContract === 'required' ? { openspecContract: true } : {}),
              }
            }

            try {
              // project registry 锁保持到 state 独占发布完成；DELETE 持同锁扫描，二者不再有
              // “workflow 已校验但引用尚未落盘”的窗口。
              const initResult = await runRepo.initChange({
                repoRoot: root, name, track: track.id, reviewSeed: track.policyProfile.reviewSeed,
                preset: 'full', clock, initialWorkflow: customStart,
              })
              if (taskPrompt.value !== null) {
                try {
                  await writeChangeTaskPrompt(initResult.changeDir, taskPrompt.value)
                } catch (error) {
                  return {
                    ok: false,
                    code: 500,
                    error: `Change 已创建，但任务提示词未保存：${errMsg(error)}`,
                  }
                }
              }
              return { ok: true, created: initResult.changeDir, taskPromptSaved: taskPrompt.value !== null }
            } catch (e) {
              return { ok: false, code: 400, error: errMsg(e) }
            }
          },
        )
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: errMsg(e) })
      }
      if (!outcome.ok) return sendJson(res, outcome.code, { ok: false, error: outcome.error })
      const created = outcome.created
      // best-effort（CONTRACT §1 语义同 CLI recordHistory）：server 全源无 console，WARN 走
      // stderr——daemon 日志可见且不污染任何 HTTP 响应。
      try {
        await history.append(created, { ts: clock(), kind: 'init' })
      } catch (e) {
        process.stderr.write(`WARN: history 写入失败: ${errMsg(e)}\n`)
      }
      const session = activation.value
        ? await activateChangeSession({
          available: operationsAvailable,
          runner: operationRunner,
          repoRoot: rootCheck.anchor.path,
          changeName: name,
        })
        : notRequestedSessionActivation()
      return sendJson(res, 200, {
        ok: true,
        name,
        path: created,
        task_prompt_saved: outcome.taskPromptSaved,
        session,
      })
    }

    // ── M3 config 写端点：全机唯一 manifest.yaml，无 root/name（不是按 Project 分立的资源）──
    if (path === '/api/config/mandatory-skills') {
      if (!manifestPath) return sendJson(res, 404, { ok: false, error: 'config 数据端未装（capabilities.config=false）' })
      const body = await readJsonBody(req)
      const validated = validateMandatorySkillsBody(body)
      if (!validated.ok) return sendJson(res, 400, { ok: false, error: validated.error })
      const { phase, track, skills } = validated.value
      try {
        await writeMandatorySkills(manifestPath, phase, track, skills)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
      return sendJson(res, 200, { ok: true, phase, track, skills })
    }

    // ── loops 升降档写端点：POST /api/loops/level ──
    if (path === '/api/loops/level') {
      const body = await readJsonBody(req)
      const root = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).root : undefined
      const id = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).id : undefined
      const target = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).target : undefined
      if (typeof root !== 'string' || typeof id !== 'string' || typeof target !== 'string' || !root || !id || !target) {
        return sendJson(res, 400, { ok: false, error: 'root/id/target 必填' })
      }
      // 信任锚：与 /api/change/<name>/transition 同一「两侧规范化再比较」模式——注册表条目
      // （dedupeRoots 已 resolve）与提交的 root（此处同样 resolvePath）都规范化后再比较，
      // 防止「同一路径的非规范写法（如结尾多一个斜杠）」被误判为未注册。
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const result = await applyLevelChange(root, id, target, { now: new Date(clock()), confirm: true }, REAL_GRADUATION_FS)
      // exitCode 0 = 已应用 或 合法 noop（如目标档已达到，dry-run 语义）；2 = 逻辑拒绝（跨级/
      // 就绪未达标）；3 = 载入/未知 loop/写回错误——只有前者是「请求本身处理成功」，非 0 必须
      // 映射非 2xx，否则前端只看 res.ok 会把一次真实拒绝误当成功（同 cancel/retry 两个兄弟
      // 端点的 `result.ok ? 200 : 400` 处置一致，这里字段名是 exitCode 不是 ok，语义对齐）。
      return sendJson(res, result.exitCode === 0 ? 200 : 400, result)
    }

    // ── loops 字段写端点：POST /api/loops/update（v5 T3 / 决议 #3 #12 存储侧）──
    //    只 patch 已存在 loop 的标量/字符串数组字段（cadence/goal/budget.*/human_gates/
    //    kill_criteria/allowlist/denylist 等，全集见 kernel loops/update.ts）；autonomy_level
    //    不收——升降档必须走上面的 /api/loops/level 毕业制裁决，本端点是它的旁路禁区。
    //    写回逻辑（文本手术 + 整文档 schema 重校验 + 读-判-写 CAS）见 loops.ts::applyLoopsUpdate。
    if (path === '/api/loops/update') {
      const rawBody = await readJsonBody(req)
      // 同 /api/workflows/:name 的 body 形状前置校验：空/非对象 body 不提前拦会在属性访问处
      // 抛 TypeError 走味成 500。
      if (typeof rawBody !== 'object' || rawBody === null) {
        return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
      }
      const b = rawBody as Record<string, unknown>
      const root = typeof b.root === 'string' ? b.root : ''
      const id = typeof b.id === 'string' ? b.id : ''
      if (!root || !id) {
        return sendJson(res, 400, { ok: false, error: 'root/id 必填' })
      }
      const patch = b.patch
      if (typeof patch !== 'object' || patch === null || Array.isArray(patch) || Object.keys(patch).length === 0) {
        return sendJson(res, 400, { ok: false, error: 'patch 须为非空 JSON 对象（字段名 → 新值）' })
      }
      // 信任锚：同 /api/loops/level、/api/change/<name>/transition 共用的「两侧规范化再比较」模式。
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const result = await applyLoopsUpdate(root, id, patch as Record<string, unknown>, {
        validateActivation: validateLoopActivation,
      })
      return sendJson(res, result.ok ? 200 : 400, result)
    }

    // ── v5 T5（决议#2）：POST /api/hooks —— 阶段×hook 开关写回（.pipeline/hooks.json）──
    //    gate / interactive-skill-gate 强制常开：validateHookToggleBody 直接 400（决议#2
    //    「server 写端点拒绝、sh 侧忽略」的前半句）。enabled=true 删键、false 写键（矩阵只存
    //    禁用项），落盘 canonical 一键一行供热路径 sh 纯 bash grep（CONTRACT §5.4）。
    if (path === '/api/hooks') {
      const rawBody = await readJsonBody(req)
      const validated = validateHookToggleBody(rawBody)
      if (!validated.ok) return sendJson(res, 400, { ok: false, error: validated.error })
      const root = typeof (rawBody as Record<string, unknown>).root === 'string'
        ? (rawBody as Record<string, unknown>).root as string
        : ''
      if (!root) {
        return sendJson(res, 400, { ok: false, error: 'root 必填' })
      }
      // 信任锚：同 /api/loops/level、/api/workflows/:name 共用的「两侧规范化再比较」模式。
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      try {
        writeHookToggle(root, validated.value)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
      return sendJson(res, 200, { ok: true, ...validated.value })
    }

    // ── T21：POST /api/automation —— AFK 执行参数写回（.pipeline/automation.json）──
    //    校验序对齐 /api/hooks：body 形状+值域（automationConfig.ts fail-loud 400）→ root 必填
    //    400 → 信任锚 404 → 真写（canonical + tmp+rename 原子写）。写完回 settings 归一值，
    //    UI 保存后再 GET 回读对账。
    if (path === '/api/automation') {
      const rawBody = await readJsonBody(req)
      const validated = validateAutomationSettingsBody(rawBody)
      if (!validated.ok) return sendJson(res, 400, { ok: false, error: validated.error })
      const root = typeof (rawBody as Record<string, unknown>).root === 'string'
        ? (rawBody as Record<string, unknown>).root as string
        : ''
      if (!root) {
        return sendJson(res, 400, { ok: false, error: 'root 必填' })
      }
      // 信任锚：同 /api/hooks、/api/loops/level 共用的「两侧规范化再比较」模式。
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      try {
        writeAutomationSettings(root, validated.value)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
      return sendJson(res, 200, { ok: true, settings: validated.value })
    }

    // ── workflow 编辑器（GOAL E8）：POST /api/workflows/:name —— 新建/覆盖 ──
    const mWfPost = /^\/api\/workflows\/([^/]+)$/.exec(path)
    if (mWfPost) {
      const wfName = decodeURIComponent(mWfPost[1]!)
      // 防路径穿越（同 GET /api/workflows/:name、/api/afk/<name>/log、/api/afk/<name>/cancel、
      // /api/afk/<name>/retry 共用的 name 校验模式）：写端点比读端点更需要这道门——不挡住的话，
      // 恶意 name 能让 writeWorkflowForApi 内部的 join(dir, `${name}.yaml`) 写到
      // .pipeline/workflows/ 之外的任意文件。必须先于下面的 'default' 检查执行。
      if (!isWorkflowName(wfName)) {
        return sendJson(res, 400, { ok: false, error: '非法 workflow 名（允许中文、字母、数字、- 与 _；不允许空格、点或路径符号）' })
      }
      if (wfName === 'default') {
        return sendJson(res, 400, { ok: false, error: 'default workflow 不可通过编辑器创建/覆盖（运行时不读这个文件）' })
      }
      const rawBody = await readJsonBody(req)
      // 同 /api/change/<name>/transition 共用的 body 形状校验：空/非对象 body（如空字符串
      // JSON.parse 失败后 readJsonBody 回落的 undefined）若不提前拦，下面的属性访问会直接
      // 抛 TypeError，被最外层 handler.catch 兜成 500——本文件其余写端点（/api/loops/level、
      // /api/afk/<name>/cancel、/api/afk/<name>/retry、/api/change/<name>/transition）都对此
      // 有前置校验，这里补齐保持一致（清晰的 400 而非属性访问抛错的 500）。
      if (typeof rawBody !== 'object' || rawBody === null) {
        return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
      }
      const body = rawBody as Record<string, unknown>
      if (body.name !== wfName) {
        return sendJson(res, 400, { ok: false, error: 'URL workflow name 必须与 body.name 完全一致' })
      }
      const root = typeof body.root === 'string' ? body.root : ''
      const rootCheck = workflowRootForRequest(root)
      if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error })
      const workflow = body as unknown as WorkflowDef
      const shapeErrors = validateWorkflow(workflow)
      if (shapeErrors.length > 0) return sendJson(res, 400, { ok: false, errors: shapeErrors })
      try {
        ensureWorkflowProjectCoordinationPath(rootCheck.anchor)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
      let enteredRegistrySnapshot = false
      try {
        const result = await withTrackRegistryLock(
          rootCheck.anchor.path,
          trackValidationContextFor(rootCheck.anchor),
          async ({ registry }) => {
            enteredRegistrySnapshot = true
            assertWorkflowRootAnchor(rootCheck.anchor)
            const referenceErrors = validateWorkflowTrackReferences(workflow, registry)
            if (referenceErrors.length > 0) return { ok: false as const, errors: referenceErrors }
            return writeWorkflowForApi(rootCheck.anchor, wfName, workflow)
          },
        )
        return sendJson(res, result.ok ? 200 : 400, result)
      } catch (e) {
        // 无法形成 effective registry 快照时不能保存未经引用校验的 workflow。
        return enteredRegistrySnapshot
          ? sendJson(res, 500, { ok: false, error: errMsg(e) })
          : sendJson(res, 400, { ok: false, errors: [errMsg(e)] })
      }
    }

    // ── afk-workbench Task 4：POST /api/afk/:name/cancel —— 取消运行中的 automation 任务
    //    （落 .cancel-requested 标记 + docker kill 容器，见 afk.ts::cancelAfkRun）──
    const cancelMatch = /^\/api\/afk\/([^/]+)\/cancel$/.exec(path)
    if (cancelMatch) {
      const name = decodeURIComponent(cancelMatch[1]!)
      // 同 /api/change/<name>/transition 的 change 名校验（防路径穿越：拒 '..' 等非法段落入 join）。
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      const body = await readJsonBody(req)
      const root = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).root : undefined
      if (typeof root !== 'string' || !root) {
        return sendJson(res, 400, { ok: false, error: 'root 须为非空字符串' })
      }
      // 信任锚：同 /api/loops/level、/api/change/<name>/transition 共用的「两侧规范化再比较」模式。
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const dir = join(root, 'openspec', 'changes', name)
      const result = await cancelAfkRun(store, dir)
      return sendJson(res, result.ok ? 200 : 400, result)
    }

    // ── afk-workbench Task 5：POST /api/afk/:name/retry —— 重试 failed/conflict/paused 任务
    //    （CAS automation→queued + automation_attempts 清零，见 afk.ts::retryAfkRun）──
    const retryMatch = /^\/api\/afk\/([^/]+)\/retry$/.exec(path)
    if (retryMatch) {
      const name = decodeURIComponent(retryMatch[1]!)
      // 同 /api/change/<name>/transition、/api/afk/<name>/cancel 的 change 名校验（防路径穿越：拒 '..' 等非法段落入 join）。
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      const body = await readJsonBody(req)
      const root = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).root : undefined
      if (typeof root !== 'string' || !root) {
        return sendJson(res, 400, { ok: false, error: 'root 须为非空字符串' })
      }
      // 信任锚：同 /api/loops/level、/api/change/<name>/transition、/api/afk/<name>/cancel 共用的「两侧规范化再比较」模式。
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const dir = join(root, 'openspec', 'changes', name)
      const result = await retryAfkRun(store, dir)
      return sendJson(res, result.ok ? 200 : 400, result)
    }

    // ── v5-T11（决议 #4）：POST /api/afk/:name/dismiss —— 放弃 failed/conflict 任务
    //    （CAS automation→off，现场保留不清 automation_* 尸检字段，见 afk.ts::dismissAfkRun）──
    const dismissMatch = /^\/api\/afk\/([^/]+)\/dismiss$/.exec(path)
    if (dismissMatch) {
      const name = decodeURIComponent(dismissMatch[1]!)
      // 同 /api/afk/<name>/cancel、/api/afk/<name>/retry 的 change 名校验（防路径穿越：拒 '..' 等非法段落入 join）。
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      const body = await readJsonBody(req)
      const root = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).root : undefined
      if (typeof root !== 'string' || !root) {
        return sendJson(res, 400, { ok: false, error: 'root 须为非空字符串' })
      }
      // 信任锚：同 /api/afk/<name>/cancel、/api/afk/<name>/retry 共用的「两侧规范化再比较」模式。
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const dir = join(root, 'openspec', 'changes', name)
      const result = await dismissAfkRun(store, dir)
      return sendJson(res, result.ok ? 200 : 400, result)
    }

    // ── afk-workbench 缺口修复：POST /api/afk/:name/enqueue —— 挂入 AFK 队列
    //    （automation=off/未设 → queued，见 afk.ts::enqueueAfkRun）──
    const enqueueMatch = /^\/api\/afk\/([^/]+)\/enqueue$/.exec(path)
    if (enqueueMatch) {
      const name = decodeURIComponent(enqueueMatch[1]!)
      // 同 /api/afk/<name>/cancel、/api/afk/<name>/retry 的 change 名校验（防路径穿越）。
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      const body = await readJsonBody(req)
      const root = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).root : undefined
      if (typeof root !== 'string' || !root) {
        return sendJson(res, 400, { ok: false, error: 'root 须为非空字符串' })
      }
      // 信任锚：同 /api/afk/<name>/cancel、/api/afk/<name>/retry 共用的「两侧规范化再比较」模式。
      if (!isRegisteredRoot(root)) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const dir = join(root, 'openspec', 'changes', name)
      // 先保留旧端点对不存在 change 的精确 400 语义；只有真 state 才进 registry 解析。
      if (!stateStorageExistsSync(dir)) {
        return sendJson(res, 400, { ok: false, error: '找不到该 change（无 canonical/legacy 状态）' })
      }
      let track: TrackDefinition
      try {
        const rawTrack = await store.get(dir, 'track')
        const trackId = Array.isArray(rawTrack) ? rawTrack.join(',') : (rawTrack ?? '')
        const trackCtx: TrackValidationContext = {
          workflowExists: (id) => {
            if (id === 'default') return true
            try {
              return loadWorkflow(root, id) !== null
            } catch {
              return false
            }
          },
          skillProfiles: trackSkillProfiles,
        }
        track = requireTrack(loadTrackRegistry(root, trackCtx), trackId)
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: errMsg(e) })
      }
      const result = await enqueueAfkRun(store, dir, clock, {
        automationEligible: track.policyProfile.automationEligible,
        trackLabel: track.label,
      })
      return sendJson(res, result.ok ? 200 : 400, result)
    }

    // ── v6 T1：POST /api/secrets —— 写入单个凭证键（值只进文件，不落 HTTP 响应/日志）──
    //    body：{ key: 'CLAUDE_CODE_OAUTH_TOKEN' | 'OPENAI_API_KEY', value: string }，每次只写
    //    一个键（不是整份表覆盖式写，见 proposal C.3）。不需要 root——机器级资源，与其余写端点
    //    「①格式→②root 信任锚→③业务校验→④真读写」四步顺序不同：本端点压根没有 root 概念，
    //    第②步不存在（同 POST /api/projects 是另一个没有信任锚概念的写端点，但原因不同：
    //    projects 是信任锚本身；secrets 是机器级资源，与项目注册无关）。
    if (path === '/api/secrets') {
      const rawBody = await readJsonBody(req)
      const validated = validateSecretWriteBody(rawBody)
      if (!validated.ok) return sendJson(res, 400, { ok: false, error: validated.error })
      try {
        const info = await writeSecret(paths.secretsPath, validated.value.key, validated.value.value)
        return sendJson(res, 200, { ok: true, key: validated.value.key, ...info })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }

    // ── v3 Studio：POST /api/tracks 创建额外 Track。revision 在 registry 锁内比较。──
    if (path === '/api/tracks') {
      const rawBody = await readJsonBody(req)
      if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
        return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
      }
      const trackBody = rawBody as Record<string, unknown>
      const root = typeof trackBody.root === 'string' ? trackBody.root : ''
      const revision = typeof trackBody.revision === 'string' ? trackBody.revision : ''
      const track = trackBody.track
      if (revision === '' || typeof track !== 'object' || track === null || Array.isArray(track)) {
        return sendJson(res, 400, { ok: false, error: 'revision 与 track 对象为必填' })
      }
      const rootCheck = workflowRootForRequest(root)
      if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error })
      try {
        const mutation = await mutateTrackForApi(rootCheck.anchor, revision, async ({ config }) => ({
          next: createTrack(config, track as CreateTrackSpec),
          result: undefined,
        }))
        return sendJson(res, 200, trackRegistryBody(mutation.registry))
      } catch (error) {
        return sendTrackError(res, error)
      }
    }

    const mTr = /^\/api\/change\/([^/]+)\/transition$/.exec(path)
    if (!mTr) return sendJson(res, 404, { ok: false, error: '未知写回端点' })

    const body = await readJsonBody(req)
    if (typeof body !== 'object' || body === null) {
      return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
    }
    const b = body as Record<string, unknown>
    const root = b.root
    const event = b.event
    if (typeof root !== 'string' || typeof event !== 'string') {
      return sendJson(res, 400, { ok: false, error: 'root / event 须为字符串' })
    }
    // 信任锚：root 必须是已注册 Project（挡路径穿越到任意目录）——对位老仓 resolve_change_worktree。
    // 统一用 dedupeRoots 规范化（同下面四个写端点），而不是本地重新拼一遍 Set——inline 版本
    // 对注册表里的空字符串条目会解析成 resolvePath('')=cwd 当一个"可信"条目，dedupeRoots 已
    // 显式过滤掉空条目（whole-branch review 抓出的真实不一致，两者对合法注册表行为等价，
    // 仅在这个边界输入上有差异）。
    if (!isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: 'root 非已知 Project（未注册或不可信）' })
    }
    const name = decodeURIComponent(mTr[1]!)
    // history 注入（G20 / v5-T1）：转换成功 → .pipeline-history.jsonl 记账，guard 拒绝零记账。
    const outcome = await performTransition(
      { store, runRepo, flow, clock, fileExists, gitHeadSha, history, breadcrumb, reviewMarker }, root, name, event,
    )
    return sendJson(res, outcome.code, outcome.body)
  }

  async function handlePatch(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    if (!isLocalHost(req.headers.host, boundPort)) {
      return sendJson(res, 403, { ok: false, error: 'Host header 不合法（疑似 DNS 重绑定攻击）' })
    }
    const provided = tokenFromHeaders(req.headers)
    if (!provided || !tokensMatch(provided, token)) {
      return sendJson(res, 401, { ok: false, error: '缺少或无效 token（写端点需鉴权）' })
    }
    const ctype = String(req.headers['content-type'] ?? '').split(';', 1)[0]!.trim().toLowerCase()
    if (ctype !== 'application/json') {
      return sendJson(res, 400, { ok: false, error: '写回端点要求 Content-Type: application/json' })
    }
    const match = /^\/api\/tracks\/([^/]+)$/.exec(path)
    if (!match) return sendJson(res, 404, { ok: false, error: '未知写回端点' })
    const id = decodeURIComponent(match[1]!)
    const rawBody = await readJsonBody(req)
    if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
      return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
    }
    const body = rawBody as Record<string, unknown>
    const root = typeof body.root === 'string' ? body.root : ''
    const revision = typeof body.revision === 'string' ? body.revision : ''
    const patch = body.patch
    if (revision === '' || typeof patch !== 'object' || patch === null || Array.isArray(patch) || Object.keys(patch).length === 0) {
      return sendJson(res, 400, { ok: false, error: 'revision 与非空 patch 对象为必填' })
    }
    const rootCheck = workflowRootForRequest(root)
    if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error })
    try {
      const mutation = await mutateTrackForApi(rootCheck.anchor, revision, async ({ config }) => {
        const next = updateTrack(config, id, patch as UpdateTrackPatch)
        await assertUpdatePreservesReferences(next, id, () => scanActiveTrackChanges(rootCheck.anchor.path))
        return { next, result: undefined }
      })
      return sendJson(res, 200, trackRegistryBody(mutation.registry))
    } catch (error) {
      return sendTrackError(res, error)
    }
  }

  async function handleDelete(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    // (1)(2) 同 handlePost 的 Host 守卫 + token 鉴权，DELETE 无请求体不需要 Content-Type 校验。
    if (!isLocalHost(req.headers.host, boundPort)) {
      return sendJson(res, 403, { ok: false, error: 'Host header 不合法（疑似 DNS 重绑定攻击）' })
    }
    const provided = tokenFromHeaders(req.headers)
    if (!provided || !tokensMatch(provided, token)) {
      return sendJson(res, 401, { ok: false, error: '缺少或无效 token（写端点需鉴权）' })
    }

    // ── G18：DELETE /api/projects?root= —— 注销项目（注册的对称操作）──
    if (path === '/api/projects') {
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root')
      const result = await removeProjectFromRegistry(paths.registryPath, root)
      if (!result.ok) return sendJson(res, result.code, { ok: false, error: result.error })
      const normalized = resolvePath(root!)
      const anchor = workflowRootAnchors.get(normalized)
      if (anchor) {
        closeWorkflowRootAnchor(anchor)
        workflowRootAnchors.delete(normalized)
      }
      return sendJson(res, 200, { ok: true })
    }

    // ── v3 Studio：DELETE /api/tracks/:id，活跃 Change 引用与不可读候选均 fail-closed。──
    const trackDelete = /^\/api\/tracks\/([^/]+)$/.exec(path)
    if (trackDelete) {
      const id = decodeURIComponent(trackDelete[1]!)
      const query = new URL(req.url ?? '/', 'http://localhost').searchParams
      const root = query.get('root') ?? ''
      const revision = query.get('revision') ?? ''
      if (revision === '') return sendJson(res, 400, { ok: false, error: '缺少 revision 参数' })
      const rootCheck = workflowRootForRequest(root)
      if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error })
      try {
        const mutation = await mutateTrackForApi(rootCheck.anchor, revision, async ({ config }) => {
          const next = deleteTrack(config, id)
          await assertTrackDeletable(id, () => scanActiveTrackChanges(rootCheck.anchor.path))
          return { next, result: undefined }
        })
        return sendJson(res, 200, trackRegistryBody(mutation.registry))
      } catch (error) {
        return sendTrackError(res, error)
      }
    }

    // ── workflow 编辑器（GOAL E8）：DELETE /api/workflows/:name ──
    const mWfDelete = /^\/api\/workflows\/([^/]+)$/.exec(path)
    if (mWfDelete) {
      const wfName = decodeURIComponent(mWfDelete[1]!)
      // 防路径穿越（同 POST /api/workflows/:name、GET /api/workflows/:name 共用的 name 校验
      // 模式）：必须先于下面的 'default' 检查执行——不挡住的话，恶意 name 能让
      // deleteWorkflowForApi 内部的 join(dir, `${name}.yaml`) 删到 .pipeline/workflows/ 之外
      // 的任意文件（DELETE 比 POST 更危险：一次成功调用即不可逆地抹掉目标文件）。
      if (!isWorkflowName(wfName)) {
        return sendJson(res, 400, { ok: false, error: '非法 workflow 名（允许中文、字母、数字、- 与 _；不允许空格、点或路径符号）' })
      }
      if (wfName === 'default') {
        return sendJson(res, 400, { ok: false, error: 'default workflow 不可通过编辑器删除' })
      }
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      const rootCheck = workflowRootForRequest(root)
      if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error })
      let permit: ReturnType<typeof captureWorkflowDeletePermit>
      try {
        // 先安全打开并钉住目标 inode；不存在不创建任何协调目录。随后准备两把现有跨进程锁的
        // 真实父目录，拒绝 symlink/换位，保留 G6 O_NOFOLLOW/root identity 边界。
        permit = captureWorkflowDeletePermit(rootCheck.anchor, wfName)
        if (!permit) return sendJson(res, 404, { ok: false, error: `workflow '${wfName}' 不存在` })
        ensureWorkflowGovernanceCoordinationPath(rootCheck.anchor)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }

      type DeleteWorkflowOutcome =
        | { readonly kind: 'deleted' }
        | { readonly kind: 'referenced'; readonly references: ReturnType<typeof scanWorkflowReferencesForApi>['references'] }
        | {
            readonly kind: 'scan-failed'
            readonly references: ReturnType<typeof scanWorkflowReferencesForApi>['references']
            readonly blockers: ReturnType<typeof scanWorkflowReferencesForApi>['blockers']
          }
      let enteredGovernance = false
      let enteredTrackSnapshot = false
      try {
        const outcome = await withRegistryGovernanceLock(rootCheck.anchor.path, async (): Promise<DeleteWorkflowOutcome> => {
          enteredGovernance = true
          assertWorkflowRootAnchor(rootCheck.anchor)
          return withTrackRegistryLock(
            rootCheck.anchor.path,
            trackValidationContextFor(rootCheck.anchor),
            async ({ registry }): Promise<DeleteWorkflowOutcome> => {
              enteredTrackSnapshot = true
              assertWorkflowRootAnchor(rootCheck.anchor)
              const scan = scanWorkflowReferencesForApi(rootCheck.anchor, wfName, registry)
              if (scan.blockers.length > 0) {
                return { kind: 'scan-failed', references: scan.references, blockers: scan.blockers }
              }
              if (scan.references.length > 0) return { kind: 'referenced', references: scan.references }
              deleteWorkflowForApi(rootCheck.anchor, wfName, permit!)
              return { kind: 'deleted' }
            },
          )
        })
        if (outcome.kind === 'scan-failed') {
          return sendJson(res, 409, {
            ok: false,
            code: 'WORKFLOW_REFERENCE_SCAN_FAILED',
            workflow: wfName,
            references: outcome.references,
            blockers: outcome.blockers,
          })
        }
        if (outcome.kind === 'referenced') {
          return sendJson(res, 409, {
            ok: false,
            code: 'WORKFLOW_REFERENCED',
            workflow: wfName,
            references: outcome.references,
          })
        }
        return sendJson(res, 200, { ok: true })
      } catch (e) {
        if (e instanceof WorkflowDeleteConflictError) {
          return sendJson(res, 409, {
            ok: false,
            code: 'WORKFLOW_DELETE_STALE',
            workflow: wfName,
            error: errMsg(e),
          })
        }
        if (enteredGovernance && !enteredTrackSnapshot) {
          return sendJson(res, 409, {
            ok: false,
            code: 'WORKFLOW_REFERENCE_SCAN_FAILED',
            workflow: wfName,
            references: [],
            blockers: [{ source: 'track-registry', detail: errMsg(e) }],
          })
        }
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }

    // ── v6 T1：DELETE /api/secrets?key= —— 删单键（同现有 DELETE 惯例：query string 传参，
    //    对齐 DELETE /api/projects?root=、DELETE /api/workflows/:name?root= 的传参风格）──
    if (path === '/api/secrets') {
      const key = new URL(req.url ?? '/', 'http://localhost').searchParams.get('key') ?? ''
      if (!isValidSecretKey(key)) {
        return sendJson(res, 400, { ok: false, error: `非法 key（仅允许 ${SECRET_KEY_LIST}）` })
      }
      try {
        await removeSecret(paths.secretsPath, key)
        return sendJson(res, 200, { ok: true })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }

    return sendJson(res, 404, { ok: false, error: '未知端点' })
  }

  const httpServer: Server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?', 1)[0]!
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
          boundPort = (httpServer.address() as AddressInfo).port
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
        ;(httpServer as unknown as { closeAllConnections?: () => void }).closeAllConnections?.()
      })
    },
  }
}
