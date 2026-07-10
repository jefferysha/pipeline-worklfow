/**
 * server 端点客户端（严格同源）——消费 packages/server：
 *   GET  /api/snapshot                 整机聚合快照
 *   GET  /api/stream                   SSE：snapshot 事件 + 心跳
 *   POST /api/change/<name>/transition  写回转换（B5 token 鉴权）
 *
 * token 从 server 同源注入的 window.__PIPELINE_DASHBOARD_TOKEN__ 读取（#25）；缺省空串
 * （dev / 独立预览下只读端点可用，写端点会 401——符合安全模型）。
 */
import type { Snapshot } from '../types'

declare global {
  interface Window {
    __PIPELINE_DASHBOARD_TOKEN__?: string
  }
}

export function getToken(): string {
  if (typeof window === 'undefined') return ''
  return window.__PIPELINE_DASHBOARD_TOKEN__ ?? ''
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function fetchSnapshot(): Promise<Snapshot> {
  let res: Response
  try {
    res = await fetch('/api/snapshot', { headers: { Accept: 'application/json' } })
  } catch (err) {
    throw new ApiError(`网络错误：${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) throw new ApiError(`快照获取失败（${res.status}）`, res.status)
  return (await res.json()) as Snapshot
}

/**
 * 写回一次阶段转换。server 契约：body { root, event }；写端点强制 token（Authorization: Bearer）。
 * 失败抛 ApiError（含 server 的 error 文案），调用方 toast 呈现。
 */
export async function postTransition(name: string, root: string, event: string): Promise<void> {
  const url = `/api/change/${encodeURIComponent(name)}/transition`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ root, event }),
    })
  } catch (err) {
    throw new ApiError(`网络错误：${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { error?: string; detail?: unknown }
      // guard 前置失败时 server 给 { error: lines[0], detail: lines }——全量透传，只显示
      // 第一条会让用户「修一条→再撞下一条」（评审 P1-5）。单条时两者等价，仍走 error。
      if (body && Array.isArray(body.detail) && body.detail.length > 1) {
        detail = body.detail.filter((l): l is string => typeof l === 'string').join('；')
      } else if (body && typeof body.error === 'string') {
        detail = body.error
      }
    } catch {
      /* 无 JSON 体 */
    }
    throw new ApiError(detail || `转换失败（${res.status}）`, res.status)
  }
}

/** 非 2xx 响应统一读 server 的 { error } 信封抛 ApiError（G18 写函数共用）。 */
async function throwApiError(res: Response, fallback: string): Promise<never> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: string }
    if (body && typeof body.error === 'string') detail = body.error
  } catch {
    /* 无 JSON 体 */
  }
  throw new ApiError(detail || `${fallback}（${res.status}）`, res.status)
}

function wrapNetwork(err: unknown): never {
  throw new ApiError(`网络错误：${err instanceof Error ? err.message : String(err)}`)
}

/** G18：注册项目进机器级注册表（POST /api/projects）。返回 server 规范化后的 root。 */
export async function registerProject(root: string): Promise<{ root: string }> {
  let res: Response
  try {
    res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ root }),
    })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, '注册项目失败')
  return (await res.json()) as { root: string }
}

/** G18：注销项目（DELETE /api/projects?root=）。DELETE 无请求体，不带 Content-Type。 */
export async function unregisterProject(root: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`/api/projects?root=${encodeURIComponent(root)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, '注销项目失败')
}

/** G18：新建 change（POST /api/changes，pipeline init 的 HTTP 化）。 */
export async function createChange(input: { root: string; name: string; workflow?: string; track?: string }): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(input),
    })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, '新建 change 失败')
}

/** 自定义 workflow 名列表（GET /api/workflows?root=，排除 default——server 语义）。 */
export async function fetchWorkflowNames(root: string): Promise<string[]> {
  let res: Response
  try {
    res = await fetch(`/api/workflows?root=${encodeURIComponent(root)}`, { headers: { Accept: 'application/json' } })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, 'workflow 列表获取失败')
  return ((await res.json()) as { names: string[] }).names
}

// ── T15：Hook 会话时序线的数据面（消费 T5 的 GET/POST /api/hooks）──

/** hook 时机（Claude Code plugin 注册的四事件）——server/hooksConfig.ts::HookMeta 的跨 HTTP 手抄。 */
export type WbHookEvent = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse'
export interface WbHookMeta {
  id: string
  event: WbHookEvent
  matcher: string
  script: string
  /** false = 强制常开/暂不可配：server 写端点 400，前端渲染禁用态（区分文案由 HookTimeline 判定）。 */
  configurable: boolean
}
export interface WbHooksConfig {
  hooks: WbHookMeta[]
  /** 禁用矩阵（只存禁用项）：键 `<hook>.<阶段>`，缺键 = 启用（fail-open，与 server 同语义）。 */
  matrix: Record<string, false>
}

/** T15：hook 元数据 + 阶段×hook 禁用矩阵（GET /api/hooks?root=）。 */
export async function fetchHooksConfig(root: string): Promise<WbHooksConfig> {
  let res: Response
  try {
    res = await fetch(`/api/hooks?root=${encodeURIComponent(root)}`, { headers: { Accept: 'application/json' } })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, '钩子配置获取失败')
  const body = (await res.json()) as { hooks: WbHookMeta[]; matrix: Record<string, false> }
  return { hooks: body.hooks, matrix: body.matrix }
}

/** T15：写回单个 (hook, 阶段) 开关（POST /api/hooks）。enabled=true 删禁用键、false 写键。 */
export async function postHookToggle(input: { root: string; hook: string; phase: string; enabled: boolean }): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/hooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(input),
    })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, '钩子开关写回失败')
}

// ── T16：「自动运行(Loop)」卡的数据面（GET /api/loops/snapshot + POST /api/loops/update|level）──

/**
 * server/loops.ts::LoopRow 的跨 HTTP 手抄（同 WbHookMeta 的零耦合纪律）。
 * budget_decl = loops.yaml 原始预算声明（滑杆初值）；budget = kernel computeBudgetStatus
 * 计算结果（今日轮次/熔断），两者字段面不同，勿混用。
 */
export interface WbLoopBudgetDecl {
  max_runs_per_day: number
  max_in_flight: number
  on_exceed: string
  max_tokens_per_day?: number
  tokens_per_run?: number
}
export interface WbLoopRow {
  root: string
  id: string
  name: string
  autonomy_level: 'L1' | 'L2' | 'L3'
  status: string
  cadence: string
  goal: string
  design_doc: string
  change_prefix: string | null
  risk: 'low' | 'medium' | 'high'
  runner: string
  human_gates: string[]
  kill_criteria: string[]
  allowlist: string[]
  denylist: string[]
  budget_decl: WbLoopBudgetDecl
  readiness: { score: number; band: string }
  budget: { breaker: 'ok' | 'warn' | 'tripped'; runsToday: number; spentToday: number; remaining: number | null; hasBudget?: boolean; maxTokensPerDay?: number | null }
}
export interface WbLoopsSnapshot {
  generated_at: string
  rows: WbLoopRow[]
}

/** T16：跨项目 loop 聚合快照（GET /api/loops/snapshot；消费方按 row.root 过滤当前项目）。 */
export async function fetchLoopsSnapshot(): Promise<WbLoopsSnapshot> {
  let res: Response
  try {
    res = await fetch('/api/loops/snapshot', { headers: { Accept: 'application/json' } })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, 'loop 快照获取失败')
  return (await res.json()) as WbLoopsSnapshot
}

/** 非 2xx 统一读 { error, errors } 双信封（loops 两写端点都可能给 errors[]——原文合并上抛）。 */
async function throwLoopsError(res: Response, fallback: string): Promise<never> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: string; errors?: string[] }
    if (Array.isArray(body?.errors) && body.errors.length > 0) {
      detail = body.errors.filter((e): e is string => typeof e === 'string').join('；')
    } else if (typeof body?.error === 'string') {
      detail = body.error
    }
  } catch {
    /* 无 JSON 体 */
  }
  throw new ApiError(detail || `${fallback}（${res.status}）`, res.status)
}

/**
 * T16：loops.yaml 字段写回（POST /api/loops/update；patch = 字段名→新值，只带被改字段——
 * server 侧文本手术 + 整文档 schema 重校验 + CAS，拒绝时 error/errors 原文抛 ApiError）。
 */
export async function postLoopUpdate(input: { root: string; id: string; patch: Record<string, unknown> }): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/loops/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(input),
    })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwLoopsError(res, '自动运行配置写回失败')
}

/**
 * T16：自主级别升降档（POST /api/loops/level——毕业制裁决端点，autonomy_level 的唯一写口；
 * 升档条件不满足时 server 的 errors[]（plan.reason + blockers）原文抛出，UI 原样展示）。
 */
export async function postLoopLevel(input: { root: string; id: string; target: string }): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/loops/level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(input),
    })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwLoopsError(res, '自主级别切换失败')
}

/**
 * change 历史记账单条（T8 消费 T1 端点）——镜像 kernel types.ts HistoryEntry 的可选面
 * （无 npm 跨包依赖，手抄保零耦合，同本文件头 Snapshot 契约的既有纪律）。
 * transition-kind 不变式：raw = 触发它的 event 名（server/cli 两写入口同口径）。
 */
export interface ChangeHistoryEntry {
  ts: string
  kind: string
  field?: string
  from?: string
  to?: string
  by?: string
  raw?: string
}

/**
 * T8：GET /api/change/:name/history?root= → { entries }（ts 升序，server readChangeHistory 已排好）。
 * 无文件（老 change 只有 legacy opaqueTail 历史）→ 200 空数组——「早期记录不可用」的展示判据
 * 由消费方负责（决议 #10）。读端点同 fetchSnapshot 不带 token。
 */
export async function getHistory(name: string, root: string): Promise<ChangeHistoryEntry[]> {
  let res: Response
  try {
    res = await fetch(`/api/change/${encodeURIComponent(name)}/history?root=${encodeURIComponent(root)}`, {
      headers: { Accept: 'application/json' },
    })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, '历史获取失败')
  return ((await res.json()) as { entries: ChangeHistoryEntry[] }).entries
}

// ── T9：收件箱失败卡动作（计划决议 #4/#13）──

/** 失败卡动作共用 POST（/api/afk/:name/retry|dismiss，body { root }；写端点带 token）。 */
async function postAfkAction(name: string, root: string, action: 'retry' | 'dismiss', fallback: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`/api/afk/${encodeURIComponent(name)}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ root }),
    })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, fallback)
}

/** T9：失败卡「↻ 重试」——清零计数重新挂队（server 既有 retryAfkRun，CAS failed/conflict/paused → queued）。 */
export async function postAfkRetry(name: string, root: string): Promise<void> {
  await postAfkAction(name, root, 'retry', '重试失败')
}

/** T9：失败卡「✕ 放弃」——退出自动化，现场与 worktree 保留（决议 #4：failed/conflict → off；
 *  server 端点由 T11 落地，本客户端先按 retry 同款契约接线）。 */
export async function postAfkDismiss(name: string, root: string): Promise<void> {
  await postAfkAction(name, root, 'dismiss', '放弃失败')
}

/**
 * 订阅 SSE 快照流。返回退订函数。onSnapshot 每收到一帧 'snapshot' 事件即回调解析后的 Snapshot。
 * 走真 EventSource（测试用 test-setup 的可驱动 stub，组件真注册监听 + 真更新）。
 */
export function subscribeSnapshot(
  onSnapshot: (s: Snapshot) => void,
  onError?: () => void,
): () => void {
  const es = new EventSource('/api/stream')
  const handler = (e: MessageEvent): void => {
    try {
      onSnapshot(JSON.parse(e.data) as Snapshot)
    } catch {
      /* 坏帧忽略 */
    }
  }
  es.addEventListener('snapshot', handler as EventListener)
  if (onError) es.addEventListener('error', onError as EventListener)
  return () => {
    es.removeEventListener('snapshot', handler as EventListener)
    es.close()
  }
}
