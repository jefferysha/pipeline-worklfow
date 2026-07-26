/**
 * guard —— worker 只读事实 + spawn 预算裁决（纯决策核心）。
 * 老仓真相源：skills/pipeline/scripts/channel/guard.py（is_idle_cleanup_eligible:206
 *   / enforce_spawn_budget:259 的 allowed 判据 / format_budget_overflow_error:306 / _parse_iso_ms:67）。
 *
 * ★正交不变量（不可阉割，与 supervisor 同律）：guard 是【正交持久 worker 层】——
 *   · 只读地为 barrier 提供 worker 事实（有几个活 worker、预算是否耗尽）；
 *   · 绝不 import state store、不读写 .pipeline.yaml 的 phase/gate/build_sha、不碰 git commit；
 *   · budget overflow 只 reject 新 spawn，主线 build/verify/ship barrier 完全不经此路径；
 *   · killed 事件由 supervisor 幂等漏斗发（guard 从不自己 append killed）。
 *
 * ── 模块边界（为什么只有纯谓词）─────────────────────────────────────────────────
 *   本文件只放不碰 OS 的纯决策：durable 投影的活 worker 事实（判定①）、idle 清理谓词、预算裁决、
 *     overflow 文本。这样 barrier 能零副作用地读 worker 事实。
 *   需 OS 探针/信号的执行面在同目录 liveness.ts：scanLiveWorkers 的判定②③④（pid 文件 / os.kill /
 *     ps cmdline 验证）、cleanupExpiredIdleWorkers（写 shutdown-reason 侧车 + SIGTERM supervisor）、
 *     enforceSpawnBudget 的 scan→cleanup→重扫——对应 guard.py:133/224/259/282。
 *   policy（manifest 四级链）由调用方解析后注入：见 cli/commands/channel.ts::resolvePolicy。
 */
import type { WorkerState } from './types.js'

/** terminal 生命周期集（guard.py:34）。 */
export const TERMINAL_LIFECYCLES: ReadonlySet<string> = new Set(['done', 'error', 'killed', 'crashed'])

/**
 * 判定①（durable 真相、可重放、跨机一致）：从 reduceWorkerRegistry 的 workers 里取非 terminal 的。
 * 这是 scanLiveWorkers 四重判定的第一重，也是 barrier 能读的纯事实（其余三重是 OS 探针，
 * 在 liveness.ts::scanLiveWorkers 里叠加）。
 */
export function liveWorkerCandidates(workers: WorkerState[]): WorkerState[] {
  return workers.filter((w) => !w.terminal && !TERMINAL_LIFECYCLES.has(w.lifecycle))
}

/** ISO8601 (…Z) → epoch ms；解析失败 → undefined（guard.py:67）。 */
export function parseIsoMs(s: string | undefined): number | undefined {
  if (!s || typeof s !== 'string') return undefined
  const t = Date.parse(s)
  return Number.isNaN(t) ? undefined : t
}

/**
 * isIdleCleanupEligible 消费的 live 记录：只要 durable state 必有的字段，故本文件不依赖 OS 探针。
 * liveness.ts 的 LiveWorker 是其超集（另带 supervisorPid/supervisorVerified/workerPid），可直接传入。
 */
export interface LiveWorkerRecord {
  state: Pick<WorkerState, 'activity' | 'idleSince' | 'terminal'>
  channel?: string
  workerId?: string
}

/**
 * 两条「永不杀」铁律 + idle 超时判定（guard.py:206）。
 *   · idleTimeoutMs<=0 → false（禁用）。
 *   · activity != idle（mid-turn）→ false（永不杀）。
 *   · 无 idleSince → false（没干净 spawn / reservation 占位）。
 *   · terminal → false。
 *   · now - idleSince >= idleTimeoutMs → true。
 */
export function isIdleCleanupEligible(live: LiveWorkerRecord, idleTimeoutMs: number, nowMs: number): boolean {
  if (idleTimeoutMs <= 0) return false
  const st = live.state ?? ({} as LiveWorkerRecord['state'])
  if (st.activity !== 'idle') return false
  if (!st.idleSince) return false
  if (st.terminal) return false
  const idleSince = parseIsoMs(st.idleSince)
  if (idleSince === undefined) return false
  return nowMs - idleSince >= idleTimeoutMs
}

/**
 * spawn 预算裁决（guard.py:278：allowed = maxLiveWorkers<=0 或 live < max）。
 * maxLiveWorkers<=0 → 禁用预算（恒 allowed）；否则活 worker 数 < 上限才 allowed。
 * ★reject not guess：overflow 只拒新 spawn，绝不自动选一个 worker 杀。
 */
export function spawnBudgetVerdict(liveCount: number, maxLiveWorkers: number): { allowed: boolean } {
  return { allowed: maxLiveWorkers <= 0 || liveCount < maxLiveWorkers }
}

/** formatBudgetOverflowError 消费的活跃 worker 事实行。 */
export interface OverflowLiveFact {
  channel: string
  workerId: string
  provider?: unknown
  lifecycle?: string
  activity?: string
  supervisorPid?: number
  supervisorVerified?: boolean
}

/**
 * overflow 多行错误：header + 每活跃 worker 一行 + 三提示（guard.py:306）。
 * ★绝不自动选一个杀（reject not guess）——只列出活跃 worker + 手动腾位提示。
 */
export function formatBudgetOverflowError(
  projectKey: string,
  live: OverflowLiveFact[],
  limit: number,
): string {
  const header = `Live worker budget exhausted for project '${projectKey}': ${live.length}/${limit} live worker(s).`
  const rows = live
    .map(
      (w) =>
        `  • channel='${w.channel}' worker='${w.workerId}' ` +
        `provider=${w.provider ?? '?'} lifecycle=${w.lifecycle ?? '?'} activity=${w.activity ?? '?'} ` +
        `pid=${w.supervisorPid ?? '?'}` +
        (w.supervisorVerified === false ? ' supervisor=unverified' : ''),
    )
    .join('\n')
  const hint = [
    'Free a slot before spawning, e.g.:',
    '  tenon channel kill <channel> --as <worker>',
    'Or override per spawn:',
    `  tenon channel spawn ... --max-live-workers ${live.length + 1}`,
    'Or raise the default in .pipeline/manifest.yaml under channel.worker_guard.max_live_workers.',
  ].join('\n')
  const parts = [header]
  if (rows) parts.push(rows)
  parts.push(hint)
  return parts.join('\n')
}
