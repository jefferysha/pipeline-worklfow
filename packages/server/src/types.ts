/**
 * server 契约类型 —— dashboard server 的公共形状。
 * server 是 @pipeline-lite/kernel 的消费方（只 import 不改）+ node stdlib http，零第三方运行时依赖。
 */
import type { FieldName, FlowEngine, Phase, StateStore } from '@pipeline-lite/kernel'

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
