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
  // ── T7（loop 卡审阅面重构）：server LoopRow 镜像同步，三方关系条数据面 ──
  /** change_prefix 实际匹配到的 openspec/changes 目录名（已保存真值）；change_prefix 为 null 时恒为 []。 */
  matched_changes: string[]
  /** 登记表原值透传——全仓无运行时消费者，纯声明标签，UI 不得暗示会做 workflow join 校验。 */
  phases: string[]
  // ── loop-init L4（P2 草稿审阅协议）：server LoopRow.draft 镜像同步 ──
  /** 该 loop 是否为「agent 草稿·待你审阅」（.pipeline/loops.drafts.json 标记，fail-open→false）；L5 据此渲染徽章与批准/驳回动作行。 */
  draft: boolean
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

// ── T21：「AFK 执行」卡的数据面（GET/POST /api/automation）──

/** server/automationConfig.ts::AutomationSettings 的跨 HTTP 手抄（同 WbHookMeta 的零耦合纪律）。 */
export interface WbAutomationSettings {
  /** 并发沙箱上限（1-8）。 */
  max_parallel: number
  /** 失败自动重试次数（0-3）。 */
  max_retries: number
  /** spec-complete 的 change 是否默认入 AFK 队列。 */
  default_opt_in: boolean
  /** 沙箱镜像；空串 = 用内置 sandcastle:local。 */
  image: string
}

/** T21：AFK 执行参数（GET /api/automation?root=；缺文件 server 已回默认值，UI 直接吃）。 */
export async function fetchAutomationSettings(root: string): Promise<WbAutomationSettings> {
  let res: Response
  try {
    res = await fetch(`/api/automation?root=${encodeURIComponent(root)}`, { headers: { Accept: 'application/json' } })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, 'AFK 执行配置获取失败')
  return ((await res.json()) as { settings: WbAutomationSettings }).settings
}

/** T21：AFK 执行参数写回（POST /api/automation；值域越界 server 400 原文抛 ApiError）。 */
export async function postAutomationSettings(input: { root: string } & WbAutomationSettings): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/automation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(input),
    })
  } catch (err) {
    wrapNetwork(err)
  }
  if (!res.ok) await throwApiError(res, 'AFK 执行配置写回失败')
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

/** 失败卡动作共用 POST（/api/afk/:name/retry|dismiss，body { root }；写端点带 token）——
 *  请求本体经 postAfkCommand 单点（接缝收拢），本函数只保留 ApiError 包装语义。 */
async function postAfkAction(name: string, root: string, action: 'retry' | 'dismiss', fallback: string): Promise<void> {
  let res: Response
  try {
    res = await postAfkCommand(name, root, action)
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

// ── T6(v6 计划):GET /api/skills/registry 明细化后的共享类型(server SkillEntry 镜像)。
//    installed 是标注型提示(三源检测,gate 硬拦不做);installCmd 仅未装且存在真实命令时给。──
export interface WbSkillEntry {
  name: string
  installed: boolean
  source: 'local-plugin' | 'external-marketplace' | 'builtin' | 'user'
  installCmd?: string
}

// ── v6 T9：单机资源探测两端点(GET 不鉴权;server 侧 isLocalHost 已守)。──
export interface WbDockerImages {
  available: boolean
  images: string[]
}
export async function fetchDockerImages(): Promise<WbDockerImages> {
  const res = await fetch('/api/docker/images', { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`(${res.status})`)
  const body = (await res.json()) as { ok: boolean } & WbDockerImages
  return { available: body.available, images: body.images }
}

export interface WbCredLight {
  set: boolean
  source?: 'host-env' | 'secrets-file'
}
export interface WbAfkReadiness {
  docker: { available: boolean }
  image: { configured: string; present: boolean; build_hint: string }
  credentials: {
    'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: WbCredLight }
    codex: { OPENAI_API_KEY: WbCredLight; CODEX_HOME: WbCredLight }
  }
}
/**
 * Bug3：readiness 曾盲 `as WbAfkReadiness` 强转——体形错误的 200（如缺 credentials.codex）进 .then 落态后，
 * AutomationCard 渲染期深访问 `readiness.credentials.codex.OPENAI_API_KEY.set` 抛 undefined 访问 → 白屏。
 * 修：接缝处对组件真正深访问的路径做浅层形状校验，形不对即 throw → 消费方既有 .catch(setReadiness(null))
 * 整区不渲染（诚实降级，不谎报）。顶层 ErrorBoundary 是第二道兜底（见 App.tsx）。
 */
function isValidReadiness(b: unknown): b is WbAfkReadiness {
  if (typeof b !== 'object' || b === null) return false
  const r = b as Record<string, unknown>
  const okBool = (v: unknown): v is { set: boolean } =>
    typeof v === 'object' && v !== null && typeof (v as { set?: unknown }).set === 'boolean'
  const docker = r.docker as { available?: unknown } | undefined
  const image = r.image as { present?: unknown } | undefined
  const creds = r.credentials as { 'claude-code'?: { CLAUDE_CODE_OAUTH_TOKEN?: unknown }; codex?: { OPENAI_API_KEY?: unknown; CODEX_HOME?: unknown } } | undefined
  if (!docker || typeof docker.available !== 'boolean') return false
  if (!image || typeof image.present !== 'boolean') return false
  if (!creds || !creds['claude-code'] || !creds.codex) return false
  if (!okBool(creds['claude-code'].CLAUDE_CODE_OAUTH_TOKEN)) return false
  if (!okBool(creds.codex.OPENAI_API_KEY) || !okBool(creds.codex.CODEX_HOME)) return false
  return true
}

export async function fetchAfkReadiness(root: string): Promise<WbAfkReadiness> {
  const res = await fetch(`/api/afk/readiness?root=${encodeURIComponent(root)}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`(${res.status})`)
  const body = (await res.json()) as unknown
  if (!isValidReadiness(body)) throw new Error('malformed readiness payload')
  return body
}

// ── v6 T8：机器级凭证端点(GET 掩码只读;POST/DELETE 走 Bearer 三道纵深)。──
export interface WbSecretLight {
  set: boolean
  masked?: string
}
export type WbSecretsKeys = Record<'CLAUDE_CODE_OAUTH_TOKEN' | 'OPENAI_API_KEY', WbSecretLight>
export async function fetchSecrets(): Promise<WbSecretsKeys> {
  const res = await fetch('/api/secrets', { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`(${res.status})`)
  const body = (await res.json()) as { ok: boolean; keys: WbSecretsKeys }
  return body.keys
}
export async function postSecret(key: string, value: string): Promise<void> {
  const res = await fetch('/api/secrets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ key, value }),
  })
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(detail?.error ?? `(${res.status})`)
  }
}
export async function deleteSecret(key: string): Promise<void> {
  const res = await fetch(`/api/secrets?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(detail?.error ?? `(${res.status})`)
  }
}

// ── 接缝收拢（dashboard-client-seam，2026-07-13）：以下 wrapper 只把「URL/method/headers/body
//    （写端点含 Bearer）」收进本接缝，一律返回原始 Response——各站点的错误文案/降级语义
//    （i18n 包装、fail-soft 回落、自建 errors[] 信封）留在消费侧原地不动：收拢是搬运不是改进，
//    这些语义属站点呈现层，强行统一会改变可观测行为。──

/** GET /api/skills/registry（SkillChain / SkillTransferModal / SkillHealthPanel 三处共用；
 *  成功体 { skills: WbSkillEntry[] }；非 2xx 的 { error } 信封由站点自读——三站 fallback 文案不同）。 */
export function fetchSkillsRegistry(): Promise<Response> {
  return fetch('/api/skills/registry', { headers: { Accept: 'application/json' } })
}

/** GET /api/workflows/:name?root=（WorkbenchView 定义加载 + workflowModel.fetchRules 两处共用；
 *  两站错误 fallback 文案不同，故返回原始 Response 各自保形）。 */
export function fetchWorkflow(name: string, root: string): Promise<Response> {
  return fetch(`/api/workflows/${encodeURIComponent(name)}?root=${encodeURIComponent(root)}`, {
    headers: { Accept: 'application/json' },
  })
}

/** GET /api/afk/:name/log?root=（useAfkLog 轮询）。原站点 fetch 不带任何 headers——逐字节保持，
 *  不补 Accept；{ error } 信封读取与 i18n 文案留在 hook 内。 */
export function fetchAfkLog(name: string, root: string): Promise<Response> {
  return fetch(`/api/afk/${encodeURIComponent(name)}/log?root=${encodeURIComponent(root)}`)
}

/** GET /api/config（SkillChain default 模式的 manifest 强制技能矩阵探测）。非 2xx / 网络失败的
 *  { capable:false } fail-soft 回落（静态镜像兜底、不谎报能力）是站点语义，留在 SkillChain。 */
export function fetchConfig(): Promise<Response> {
  return fetch('/api/config', { headers: { Accept: 'application/json' } })
}

/** POST /api/afk/:name/(cancel|retry|dismiss)（Bearer 单点）。ProgressView 三动作直接消费原始
 *  Response（{ error } 信封读取 + i18n 兜底文案在站点）；本文件 postAfkRetry/postAfkDismiss
 *  的请求也经由此发出（外层再包 ApiError，语义不变）。 */
export function postAfkCommand(name: string, root: string, action: 'cancel' | 'retry' | 'dismiss'): Promise<Response> {
  return fetch(`/api/afk/${encodeURIComponent(name)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ root }),
  })
}

/** POST /api/workflows/:name（T13 保存；body 由调用方拼好——{ ...def, root }——原样序列化）。
 *  kernel validate 拒绝时的 { errors: string[] } 信封解析（readSaveErrors）留在 WorkbenchView。 */
export function postWorkflowDef(name: string, payload: Record<string, unknown>): Promise<Response> {
  return fetch(`/api/workflows/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(payload),
  })
}

/** POST /api/config/mandatory-skills（default 模式穿梭框保存）。成功体 { skills } 回读、
 *  错误文案（body.error || i18n 状态兜底）与 cfgCache 推进都在 SkillChain。 */
export function postMandatorySkills(input: { phase: string; track: string; skills: string[] }): Promise<Response> {
  return fetch('/api/config/mandatory-skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(input),
  })
}

// ── tap 流量查看器数据面（#34d，自 advanced/trafficData.ts 整体迁入的完整客户端函数——
//    形状逐字镜像 server/src/traces.ts；#34e 护栏：只读本地捕获、GET-only。错误风格为该数据面
//    既有 plain Error 专属文案，迁移原样保持（不改抛 ApiError）。trafficData.ts re-export
//    这些名字，消费方 TrafficPanel 的 import 面不变。──

export interface TraceSessionRow {
  id: string
  started_at: string
  updated_at: string
  date_key: string
  client: string
  proxy_mode: string
  status: string
  record_count: number
  summary: Record<string, unknown> | null
}

export interface TraceSessionsResponse {
  generated_at: string
  outbound: string
  count: number
  sessions: TraceSessionRow[]
}

export interface TraceRecordsResponse {
  generated_at: string
  outbound: string
  session: string
  count: number
  records: Array<Record<string, unknown>>
}

/** 列本地捕获会话（同源 GET）。 */
export async function fetchTraceSessions(): Promise<TraceSessionsResponse> {
  const res = await fetch('/api/traces/sessions', { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`traces 会话获取失败（${res.status}）`)
  return (await res.json()) as TraceSessionsResponse
}

/** 读某会话的本地记录（同源 GET）。 */
export async function fetchTraceRecords(session: string): Promise<TraceRecordsResponse> {
  const res = await fetch(`/api/traces/records?session=${encodeURIComponent(session)}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`traces 记录获取失败（${res.status}）`)
  return (await res.json()) as TraceRecordsResponse
}

// ── v9-I：change ↔ 终端会话关联（SessionResumeRow 自取数）──

/** GET /api/mem/session-link 响应（镜像 server 端点契约，手抄保零耦合，同 Snapshot 纪律）。
 *  resumeCmd:null = 平台恢复拼法无把握（opencode/pi），UI 只显示 id+目录、不给假命令。 */
export interface SessionLink {
  found: boolean
  platform?: string
  sessionId?: string
  dir?: string
  resumeCmd?: string | null
  mtime?: string
  reason?: string
}

/** GET /api/mem/session-link?root=&name=——查该 change 现场目录（automation_worktree，空则 root）
 *  最近的持久化终端会话 + 恢复命令。非 2xx 收敛 found:false（「查不到会话」是常态不是错误，
 *  不走 ApiError 弹层）；网络失败让 reject 流出，由消费方 catch 后按 found:false 渲染。 */
export async function fetchSessionLink(root: string, name: string): Promise<SessionLink> {
  const res = await fetch(
    `/api/mem/session-link?root=${encodeURIComponent(root)}&name=${encodeURIComponent(name)}`,
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) return { found: false, reason: `http-${res.status}` }
  return (await res.json()) as SessionLink
}

/** GET /api/mem/session-links 服务端硬上限（server.ts 里 `roots.length > 50` 那道校验的同款数字，
 *  两处独立维护——这个模块一贯手抄 server 契约保零耦合，同文件里其它接口的既有纪律，不额外引入
 *  跨包依赖）。分片的「条数」维度——另一维度「字节数」见下面 SESSION_LINKS_CHUNK_MAX_URL_CHARS。 */
const SESSION_LINKS_CHUNK_SIZE = 50

/** 单批编码后查询串长度安全上限——留在 Node --max-http-header-size 默认 16KB（覆盖整个请求行
 *  +全部请求头，不只是这一个查询串）之下留足安全边际，同时兼顾常见反代/中间件对请求行更保守的
 *  长度限制（如 Apache 默认 LimitRequestLine ~8KB）。codex review 第二轮 P2：root 是绝对路径，
 *  每一项都要在查询串里完整重复一次，URLSearchParams 序列化又会把路径里的 `/` 编码成 %2F 之类，
 *  条数远没到 SESSION_LINKS_CHUNK_SIZE 时字节数可能已经先超限——纯按条数分片堵不住这个口子。 */
const SESSION_LINKS_CHUNK_MAX_URL_CHARS = 6000

/** 按「条数」与「编码后查询串长度」两个维度切片，遍历时任一维度先达到上限就切下一批。
 *  `current.length > 0` 这个判断保证「当前批已有内容时才因为超长切下一批」——哪怕单项本身编码后
 *  就超过 SESSION_LINKS_CHUNK_MAX_URL_CHARS（root 长到离谱的极端情况），也会被单独放进自己的一批
 *  发出去，不会死循环、也不会拖累其它正常长度的项一起失败（这一条本身能不能被 server 接受是另一
 *  回事，不在本函数职责内）。 */
function chunkSessionLinkItems(
  items: Array<{ root: string; name: string }>,
): Array<Array<{ root: string; name: string }>> {
  const chunks: Array<Array<{ root: string; name: string }>> = []
  let current: Array<{ root: string; name: string }> = []
  let currentChars = 0
  for (const it of items) {
    // 'root=' + 'name=' 两个键名 + 分隔符的近似开销，一并算进单项估算，不用追求逐字节精确。
    const itemChars =
      encodeURIComponent(it.root).length + encodeURIComponent(it.name).length + 'root='.length + 'name='.length + 2
    const wouldExceedCount = current.length >= SESSION_LINKS_CHUNK_SIZE
    const wouldExceedChars = current.length > 0 && currentChars + itemChars > SESSION_LINKS_CHUNK_MAX_URL_CHARS
    if (wouldExceedCount || wouldExceedChars) {
      chunks.push(current)
      current = []
      currentChars = 0
    }
    current.push(it)
    currentChars += itemChars
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

/** GET /api/mem/session-links（批量）——进度视图 failed 行「回终端」chip 一次预取全部失败行
 *  （产品决策：批量端点而非逐行发请求）。items 可能超过 server 端硬上限（SESSION_LINKS_CHUNK_SIZE，
 *  见上）——不分片会「谁超限、大家一起 400」：单次超限请求被 server 整体拒绝，非 2xx 又被静默吃成
 *  {}，于是全部失败行（不只是超出上限的那部分）集体退化成静态兜底命令，一个只该影响极端边界的
 *  上限被放大成全或无的功能丢失。这里按 chunkSessionLinkItems 的条数+字节数双维度切片、
 *  Promise.all 并发发出各批、结果合并——单批「非 2xx 或网络异常」只让那一批对应的 key 缺席
 *  （调用方 cmdChipOf 本就有查不到 key 时退化静态命令的兜底分支，天然兼容），不拖累其它批。 */
export async function fetchSessionLinks(items: Array<{ root: string; name: string }>): Promise<Record<string, SessionLink>> {
  if (items.length === 0) return {}
  const chunks = chunkSessionLinkItems(items)
  const results = await Promise.all(chunks.map(fetchSessionLinksOneChunk))
  const merged: Record<string, SessionLink> = {}
  for (const r of results) Object.assign(merged, r)
  return merged
}

/** 单批请求：非 2xx 静默降级空表（同原单批语义）。fetch() 网络异常也在这里用 try/catch 兜住降级
 *  为空表，不让它 reject 出去——否则 Promise.all 会因一批网络异常整体 reject，把其它已成功批的
 *  结果也一并丢掉，违背「单批失败不拖累其它批」。 */
async function fetchSessionLinksOneChunk(items: Array<{ root: string; name: string }>): Promise<Record<string, SessionLink>> {
  const params = new URLSearchParams()
  for (const it of items) { params.append('root', it.root); params.append('name', it.name) }
  try {
    const res = await fetch(`/api/mem/session-links?${params.toString()}`, { headers: { Accept: 'application/json' } })
    if (!res.ok) return {}
    return ((await res.json()) as { links: Record<string, SessionLink> }).links
  } catch {
    return {}
  }
}
