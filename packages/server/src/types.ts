/**
 * server 契约类型 —— dashboard server 的公共形状。
 * server 是 @pipeline-lite/kernel 的消费方（只 import 不改）+ node stdlib http，零第三方运行时依赖。
 */
import type {
  DocumentEvidenceItemStatus,
  FieldName,
  FlowEngine,
  MemFs,
  Phase,
  PipelineTodoProjection,
  StateStore,
} from '@pipeline-lite/kernel'
import type { TraceStoreReader } from './traces.js'
import type { LoopActivationValidator } from './loops.js'

/** 机器级路径锚（可经 PIPELINE_DASHBOARD_HOME 覆盖——仅供 hermetic 测试隔离）。 */
export interface ServerPaths {
  home: string
  claudeDir: string
  /** ~/.claude/pipeline-projects.json —— 机器级项目注册表（老仓 project_model 同址）。 */
  registryPath: string
  /** ~/.claude/.pipeline-dashboard-token —— B5 一次性 token 握手文件（0600）。 */
  tokenPath: string
  /** ~/.claude/.pipeline-dashboard.server —— pidfile（pid/port/version，B4 版本抢占用）。 */
  pidfilePath: string
  /**
   * ~/.claude/pipeline-secrets.json —— 机器级凭证存储（v6 T1，0600+原子写，白名单仅
   * CLAUDE_CODE_OAUTH_TOKEN/OPENAI_API_KEY，见 @pipeline-lite/kernel 的 secretsPath）。
   */
  secretsPath: string
}

/** snapshot 里单个 change 的投影（.pipeline.yaml 全字段 + 常读字段提升到顶层）。 */
export interface ChangeSnapshot {
  name: string
  path: string
  phase: string
  phase_status: string
  track: string
  preset: string
  archived: string
  updated_at: string
  fields: Record<FieldName, string | string[]>
  /** OpenSpec tasks.md projected onto the workflow stages; omitted only for an older server response. */
  todo?: PipelineTodoProjection
  /** Governed OpenSpec artifact/reader evidence, calculated from the immutable document ledger. */
  documents?: DocumentEvidenceSnapshot
  /**
   * Fresh host-hook heartbeat for an explicitly bound terminal session. This is dashboard-only
   * observability, not canonical workflow state; omitted as soon as its short lease expires.
   */
  terminalActivity?: TerminalActivitySnapshot
}

export interface TerminalActivitySnapshot {
  sessionId: string
  heartbeatAt: string
  expiresAt: string
  turnId?: string
}

export interface DocumentEvidenceSnapshot {
  governed: boolean
  phase?: string
  ledgerPresent?: boolean
  pass?: boolean
  blockers: string[]
  items: Array<{
    kind: string
    status: DocumentEvidenceItemStatus
    requiredRead: boolean
    paths: string[]
    producers: string[]
  }>
}

/** 单个已注册 Project 的聚合（openspec/changes/* 下所有活跃 change）。 */
export interface ProjectSnapshot {
  root: string
  ok: boolean
  changes: ChangeSnapshot[]
  error?: string
}

/** GET /api/snapshot 的完整响应体：聚合本机所有注册 Project。 */
export interface Snapshot {
  version: string
  generated_at: string
  /** 能力声明（GOAL B6 起步）：前端按声明渲染，未接线域不谎报。 */
  capabilities: Record<string, boolean>
  project_count: number
  change_count: number
  projects: ProjectSnapshot[]
}

/** GET /api/health 响应体：轻量存活探针 + 本 server 版本（B4）。 */
export interface HealthInfo {
  ok: boolean
  scope: 'global'
  version: string
  /** Present when the server runs from a managed immutable release payload. */
  releaseId?: string
  /** Opaque identity of the canonical machine-state Home served by this process. */
  stateScopeId?: string
  pid?: number
}

export type PreemptDecision = 'bind' | 'reuse' | 'preempt'

export interface Pidfile {
  pid: number
  port: number
  version: string
  started?: number
}

export interface DashboardServerOptions {
  version?: string
  /** Immutable managed-release identity used to refresh a same-semver dashboard safely. */
  releaseId?: string
  home?: string
  /** 覆盖注册表读取（默认读 registryPath 的 JSON 字符串数组）。 */
  registry?: () => string[]
  /** 覆盖 token（默认启动生成一次性随机 token）。 */
  token?: string
  /** ISO8601 UTC 注入时钟（业务码禁散落 new Date()）。 */
  clock?: () => string
  /** SSE 变更轮询间隔（ms，默认 1000；测试传小值加速）。 */
  pollIntervalMs?: number
  /** SSE 心跳间隔（ms，默认 15000）。 */
  heartbeatMs?: number
  store?: StateStore
  flow?: FlowEngine
  /** flow 未注入时从此 manifest 构造（bin 用；测试通常直接注入 flow）。 */
  manifestPath?: string
  /** `git rev-parse HEAD` 注入（build-complete 冻结 SHA 用；缺省跳过 SHA 面）。 */
  gitHeadSha?: (cwd: string) => Promise<string>
  /** in-place build 的内容寻址工作区基线；生产装配为 kernel fingerprintWorkspace。 */
  workspaceFingerprint?: (cwd: string, changeName: string) => Promise<string>
  /**
   * v6 T3：docker CLI 注入面（GET /api/docker/images 等单机资源探测用；缺省真 execFile docker）。
   * 测试喂 fake（hermetic，不起真 docker）；生产零接线。
   */
  execDocker?: import('./dockerImages.js').ExecDockerFn
  /**
   * dashboard-app 构建产物目录（含 index.html + assets/）。设了则 GET / 服务真 SPA
   * （token 注入进 index.html）+ GET /assets/* 静态供给；未设则回退最小落地页（BACKLOG #26c）。
   */
  webRoot?: string
  /**
   * tap 流量查看器数据源（BACKLOG #34d）：注入 @pipeline-lite/tap 的 TraceStore（只读 listSessions/
   * readRecords）则 GET /api/traces/* 供给本地捕获 + capabilities.traffic=true；未注入则占位（不谎报）。
   * 结构化注入面（不 import tap，守 server 零第三方 + 构建不耦合）；bin 装配见主会话接线清单。
   */
  traceStore?: TraceStoreReader
  /**
   * v9-I：kernel mem 会话检索的 fs 注入面（GET /api/mem/session-link 用；缺省 nodeMemFs() 读真
   * ~/.claude / ~/.codex 等会话根）。测试注入 nodeMemFs(fakeHome) 指向 fixture 树（hermetic）。
   */
  memFs?: MemFs
  /** H11：starter 激活候选的完整运行接线校验；缺省由 manifest + runner roots 生产装配。 */
  validateLoopActivation?: LoopActivationValidator
  /**
   * H11-H14/G1/G2 Operations 生产 CLI 接缝。缺省执行当前仓已构建的真实
   * `packages/cli/dist/pipeline.mjs`；测试注入 fake 只核 HTTP/argv 映射。
   */
  runPipelineCli?: import('./operations.js').PipelineCliRunner
  /**
   * H15：Global server 的真实 finite-cadence 时钟。缺省不启用，避免把嵌入式/测试 server
   * 静默变成执行器；生产 main.ts 显式传入配置。执行仍复用 runPipelineCli。
   */
  cadence?: false | Omit<import('./cadence.js').CadenceSchedulerOptions, 'roots' | 'clock' | 'runPipelineCli'>
  /** Track Router 预览计分器；缺省真执行 `grep -ciE`，测试可注入 hermetic scorer。 */
  scoreRouterPattern?: import('./routerPreview.js').RouterPatternScorer
}

export interface DashboardServer {
  /** 一次性 token（同源前端注入 + 写端点校验的真相源）。 */
  readonly token: string
  readonly version: string
  /** 底层 http.Server（真起真监听，测试用 listen(0) 随机端口）。 */
  readonly httpServer: import('node:http').Server
  listen(port?: number, host?: string): Promise<{ port: number; host: string }>
  close(): Promise<void>
}

export type { FieldName, FlowEngine, Phase, StateStore }
