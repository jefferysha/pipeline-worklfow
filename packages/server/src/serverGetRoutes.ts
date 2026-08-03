import type { IncomingMessage, ServerResponse } from 'node:http'
import { lstatSync } from 'node:fs'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  builtinWorkflow,
  listAutomationPolicyTemplates,
  loadTrackRegistry,
  stateStorageExistsSync,
  validateWorkflowTrackReferences,
  withTrackRegistryLock,
  type StateStore,
  type TrackRegistry,
  type TrackValidationContext,
  type TransitionRecordStore,
} from '@tenon/kernel'
import { buildAfkLog, buildAfkSnapshot, readAfkRunLog } from './afk.js'
import { buildAfkReadiness } from './afkReadiness.js'
import { readAutomationSettings } from './automationConfig.js'
import type { CadenceScheduler } from './cadence.js'
import { readConfigSnapshot } from './config.js'
import { listDockerImages } from './dockerImages.js'
import { HOOK_METAS, readHooksConfig } from './hooksConfig.js'
import { buildLoopsSnapshot } from './loops.js'
import { buildRunDetail } from './runDetail.js'
import { buildSecretsResponse } from './secrets.js'
import { listAllSkillsDetailed } from './skillsRegistry.js'
import { dedupeRoots, type SnapshotDeps } from './snapshot.js'
import { readChangeHistory } from './transition.js'
import type { DashboardServerOptions, ServerPaths } from './types.js'
import {
  assertWorkflowRootAnchor,
  ensureWorkflowProjectCoordinationPath,
  listWorkflowNames,
  readWorkflowForApi,
  WorkflowNotFoundError,
  type WorkflowRootAnchor,
} from './workflows.js'
import { handleGetActivityRoutes } from './serverGetActivityRoutes.js'
import { handleGetTraceRoutes } from './serverGetTraceRoutes.js'
import type { TraceStoreReader } from './traces.js'
import { resolveHostTargetPlanRoute } from './serverGetHostTargetPlanRoutes.js'
import { resolveOrchestrationRoutes } from './serverOrchestrationRoutes.js'

type WorkflowRootCheck =
  | { ok: true; anchor: WorkflowRootAnchor }
  | { ok: false; code: 403 | 404; error: string }

export interface GetRouteDeps {
  cadenceScheduler: CadenceScheduler | null
  sendJson: (res: ServerResponse, code: number, body: unknown) => void
  sendHtml: (res: ServerResponse, code: number, body: string) => void
  serveIndexWithToken: (res: ServerResponse) => boolean
  serveAsset: (req: IncomingMessage, res: ServerResponse, path: string) => boolean
  indexHtml: (token: string) => string
  token: string
  version: string
  releaseId?: string
  transactionId?: string
  stateScopeId: string
  isLocalHost: (host: string | undefined, port: number) => boolean
  boundPort: () => number
  snapshotDeps: (nowMs?: number) => SnapshotDeps
  handleStream: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  isRegisteredRoot: (root: string) => boolean
  clock: () => string
  store: StateStore
  recordStore: TransitionRecordStore
  loopLedger: Parameters<typeof buildRunDetail>[3]['ledger']
  registry: () => string[]
  traceStore?: TraceStoreReader
  workflowRootForRequest: (root: string) => WorkflowRootCheck
  trackValidationContextFor: (anchor: WorkflowRootAnchor) => TrackValidationContext
  trackRegistryBody: (registry: TrackRegistry) => Record<string, unknown>
  manifestPath?: string
  paths: ServerPaths
  hostHome: string; operationsAvailable: boolean; hostTargetPlanRuntime: import('./serverGetHostTargetPlanRoutes.js').HostTargetPlanRuntime
  options: DashboardServerOptions; operationRunner: import('./operations.js').PipelineCliRunner
  resolveSessionLink: (root: string, name: string) => Promise<Record<string, unknown>>
  errMsg: (error: unknown) => string
}

function repoRootForSkills(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
}
function isWorkflowName(name: string): boolean {
  return name !== '' && /^[\p{L}\p{N}\p{M}_-]+$/u.test(name)
}

export async function handleGet(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  deps: GetRouteDeps,
): Promise<void> {
  const {
    cadenceScheduler, sendJson, sendHtml, serveIndexWithToken, serveAsset, indexHtml, token,
    version, releaseId, transactionId, stateScopeId, isLocalHost, snapshotDeps, handleStream, isRegisteredRoot,
    clock, store, recordStore, loopLedger, registry, traceStore, workflowRootForRequest,
    trackValidationContextFor, trackRegistryBody, manifestPath, paths, hostHome, operationsAvailable,
    hostTargetPlanRuntime, options, operationRunner, resolveSessionLink, errMsg,
  } = deps
  const boundPort = deps.boundPort()
  await handleGetActivityRoutes(req, res, path, deps)
  if (res.headersSent) return
  if (handleGetTraceRoutes(req, res, path, { clock, sendJson, traceStore })) return
  const hostPlan = await resolveHostTargetPlanRoute(req.url ?? '/', path, { hostHome, operationsAvailable, operationRunner, runtime: hostTargetPlanRuntime })
  if (hostPlan !== null) return sendJson(res, hostPlan.status, hostPlan.body)
  const orchestration = await resolveOrchestrationRoutes(req.url ?? '/', path, {
    workflowRootForRequest, snapshotDeps, store,
  })
  if (orchestration !== null) return sendJson(res, orchestration.status, orchestration.body)
    // ── loops 治理面数据端：跨项目聚合 loops.yaml ──
    if (path === '/api/loops/snapshot') {
      try {
        const snap = await buildLoopsSnapshot({ registry: () => dedupeRoots(registry()), now: () => new Date(clock()) })
        return sendJson(res, 200, snap)
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
    //    仓内两个消费方同批改，无仓外第三方）；「已装」三源检测只按显式 hostHome（hermetic 可覆盖）。──
    if (path === '/api/skills/registry') {
      try {
        return sendJson(res, 200, { skills: listAllSkillsDetailed(repoRootForSkills(), join(hostHome, '.claude')) })
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
      const rootCheck = workflowRootForRequest(root)
      if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error })
      try {
        const { matrix, promptSkipKeyword } = readHooksConfig(rootCheck.anchor)
        return sendJson(res, 200, { ok: true, hooks: HOOK_METAS, matrix, prompt_skip_keyword: promptSkipKeyword })
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
      const segment = mWfGet[1]
      if (segment === undefined) return sendJson(res, 400, { ok: false, error: '非法 workflow 路径' })
      const wfName = decodeURIComponent(segment)
      if (!isWorkflowName(wfName)) {
        return sendJson(res, 400, { ok: false, error: '非法 workflow 名（允许中文、字母、数字、- 与 _；不允许空格、点或路径符号）' })
      }
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      const rootCheck = workflowRootForRequest(root)
      if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error })
      const builtin = builtinWorkflow(wfName)
      if (builtin !== null) {
        // Built-ins are immutable plugin assets. They are readable by the same client contract as
        // custom workflows, but never resolved from or shadowed by a project file.
        return sendJson(res, 200, builtin)
      }
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
        defaultCodexHome: join(hostHome, '.codex'),
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
