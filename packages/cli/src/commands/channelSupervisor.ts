import { rmSync } from 'node:fs'
import { homedir } from 'node:os'
import {
  bucketDir,
  classifyDelivery,
  createChannelStore,
  echoOnlyAdapters,
  enforceSpawnBudget,
  eventsPath,
  formatBudgetOverflowError,
  formatThreadBoard,
  hasLiveWorker,
  matchesEventFilter,
  nodeChannelFs,
  nodeProcessFace,
  normalizeThreadKey,
  parseEventsText,
  projectKey,
  reduceThreads,
  resolveRoot,
  startSupervisor,
  toOverflowFacts,
  workerFile,
  type ChannelEnv,
  type ChannelEvent,
  type ChannelFs,
  type ChannelStore,
  type Clock,
  type DeliveryMode,
  type EventFilterOptions,
  type LivenessDeps,
  type ProcessFace,
  type Scope,
  type ShutdownReason,
  type SupervisorConfig,
  type WorkerGuardPolicy,
} from '@pipeline-lite/channel'
import { splitFlags } from '../argv.js'
import type { CliDeps } from '../deps.js'


import {
  ChannelDie, die, emit, hostEnvVar, hostFs, hostNow, hostProc, hostRmrf, hostSleep,
  intFlag, resolvePolicy, scopeOf, strFlag, numberFlag, csv, defaultLauncher, parseDurationS,
  CLEANUP_SUFFIXES, KILL_GRACE_MS, USAGE_EXIT,
  type ChannelHost, type ParsedArgs,
} from './channelSupport.js'

function decodeSupervisorConfig(value: unknown): SupervisorConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    die('[channel] supervisor config 必须是 JSON object')
  }
  const record = value as Record<string, unknown>
  if (typeof record.provider !== 'string' || record.provider.trim() === '') {
    die('[channel] supervisor config.provider 必须是非空字符串')
  }
  const config: SupervisorConfig = { provider: record.provider }
  const copyString = (key: 'cwd' | 'systemPrompt' | 'model' | 'spawnedBy'): void => {
    const item = record[key]
    if (item === undefined) return
    if (typeof item !== 'string') die(`[channel] supervisor config.${key} 必须是字符串`)
    config[key] = item
  }
  copyString('cwd')
  copyString('systemPrompt')
  copyString('model')
  copyString('spawnedBy')
  for (const key of ['timeoutMs', 'warnBeforeMs', 'idleTimeoutMs'] as const) {
    const item = record[key]
    if (item === undefined) continue
    if (typeof item !== 'number' || !Number.isFinite(item) || item < 0) {
      die(`[channel] supervisor config.${key} 必须是非负数`)
    }
    config[key] = item
  }
  if (record.inboxPolicy !== undefined) {
    if (record.inboxPolicy !== 'explicitOnly' && record.inboxPolicy !== 'broadcastAndExplicit') {
      die('[channel] supervisor config.inboxPolicy 非法')
    }
    config.inboxPolicy = record.inboxPolicy
  }
  if (record.env !== undefined) {
    if (typeof record.env !== 'object' || record.env === null || Array.isArray(record.env)) {
      die('[channel] supervisor config.env 必须是 string map')
    }
    const env: Record<string, string> = {}
    for (const [key, item] of Object.entries(record.env)) {
      if (typeof item !== 'string') die(`[channel] supervisor config.env.${key} 必须是字符串`)
      env[key] = item
    }
    config.env = env
  }
  return config
}

function buildConfig(host: ChannelHost, deps: CliDeps, flags: Record<string, string | true>, policy: WorkerGuardPolicy): SupervisorConfig {
  const cfgFile = strFlag(flags, 'config')
  if (cfgFile) {
    const raw = hostFs(host).readText(cfgFile)
    if (raw === undefined) die(`[channel] --config 读不到: ${cfgFile}`)
    const parsed = decodeSupervisorConfig(JSON.parse(raw))
    if (parsed.idleTimeoutMs === undefined && policy.idleTimeoutMs > 0) parsed.idleTimeoutMs = policy.idleTimeoutMs
    return parsed
  }
  const provider = strFlag(flags, 'provider')
  if (!provider) die('[channel] 需 --config <path> 或 --provider <name>')
  const config: SupervisorConfig = { provider, cwd: strFlag(flags, 'cwd') ?? deps.cwd }
  if (policy.idleTimeoutMs > 0) config.idleTimeoutMs = policy.idleTimeoutMs
  const to = intFlag(flags, 'timeout-ms')
  if (to !== undefined) config.timeoutMs = to
  const ip = strFlag(flags, 'inbox-policy')
  if (ip === 'broadcastAndExplicit' || ip === 'explicitOnly') config.inboxPolicy = ip
  return config
}

/** spawn：桶级预算执行（reject not guess）→ 写 reservation → fork supervisor → 打印 pid。 */
export async function cmdSpawn(deps: CliDeps, host: ChannelHost, p: ParsedArgs): Promise<number> {
  const name = p.positional[0]
  if (!name) die('[channel spawn] 缺 channel 名')
  const worker = strFlag(p.flags, 'as')
  if (!worker) die('[channel spawn] 需 --as <worker>')
  const scope = scopeOf(p.flags)
  const fs = hostFs(host)
  const proc = hostProc(host)
  const policy = resolvePolicy(host, p.flags)
  const livenessDeps: LivenessDeps = { env: host.env, fs, proc }

  // 预算执行（scan→cleanup 过期 idle→重扫→判额）。overflow 只 reject 新 spawn，绝不自动杀。
  const enforce = enforceSpawnBudget(livenessDeps, policy, hostNow(host)(), scope)
  if (!enforce.allowed) {
    deps.io.err(formatBudgetOverflowError(projectKey(host.env), toOverflowFacts(enforce.remaining), policy.maxLiveWorkers))
    return USAGE_EXIT
  }

  const config = buildConfig(host, deps, p.flags, policy)
  // 写 reservation 占位（防 spawned 事件落盘前的 race 漏算），再 fork。
  host.store.ensureDir(name, scope)
  fs.writeText(workerFile(host.env, name, worker, 'reservation', scope), worker + '\n')

  const launcher = host.launchSupervisor ?? defaultLauncher(host)
  const launched = await launcher(name, worker, config, scope)
  if (launched.pid === undefined) {
    fs.remove(workerFile(host.env, name, worker, 'reservation', scope))
    deps.io.err('[channel spawn] supervisor fork 失败')
    return 1
  }
  deps.io.out(String(launched.pid))
  return 0
}

function killCleanup(host: ChannelHost, name: string, worker: string, scope: Scope): void {
  const fs = hostFs(host)
  for (const s of CLEANUP_SUFFIXES) fs.remove(workerFile(host.env, name, worker, s, scope))
}

/** kill：默认 SIGTERM supervisor + grace poll → 仍活 SIGKILL + CLI 补写 killed；--force 直 SIGKILL。 */
export async function cmdKill(deps: CliDeps, host: ChannelHost, p: ParsedArgs): Promise<number> {
  const name = p.positional[0]
  if (!name) die('[channel kill] 缺 channel 名')
  const worker = strFlag(p.flags, 'as')
  if (!worker) die('[channel kill] 需 --as <worker>')
  const scope = scopeOf(p.flags)
  const force = p.flags.force === true
  const fs = hostFs(host)
  const proc = hostProc(host)
  const now = hostNow(host)
  const sleep = hostSleep(host)
  const graceMs = host.killGraceMs ?? KILL_GRACE_MS

  const readPid = (suffix: string): number | undefined => {
    const raw = fs.readText(workerFile(host.env, name, worker, suffix, scope))
    if (raw === undefined) return undefined
    const n = Number.parseInt(raw.trim(), 10)
    return Number.isInteger(n) ? n : undefined
  }
  const supPid = readPid('pid')
  const workerPid = readPid('worker-pid')
  if (supPid === undefined) {
    deps.io.err('[channel kill] 无 pid 文件（worker 未运行？）')
    killCleanup(host, name, worker, scope)
    return USAGE_EXIT
  }
  if (!proc.pidAlive(supPid)) {
    host.store.append(name, { kind: 'error', by: 'cli:kill', worker, message: 'supervisor lost' }, scope)
    killCleanup(host, name, worker, scope)
    return 0
  }
  if (force) {
    if (workerPid !== undefined && proc.pidAlive(workerPid)) proc.kill(workerPid, 'SIGKILL')
    proc.kill(supPid, 'SIGKILL')
    host.store.append(name, { kind: 'killed', by: 'cli:kill', worker, reason: 'explicit-kill', signal: 'SIGKILL' }, scope)
    killCleanup(host, name, worker, scope)
    return 0
  }
  // 非 force：SIGTERM supervisor + grace poll（supervisor 漏斗自写 killed；死于 grace 内则不补写）。
  proc.kill(supPid, 'SIGTERM')
  const deadline = now() + graceMs
  while (now() < deadline && proc.pidAlive(supPid)) await sleep(100)
  if (proc.pidAlive(supPid)) {
    // grace 到仍活 → SIGKILL + CLI 补写 killed（保事件日志真实）。
    if (workerPid !== undefined && proc.pidAlive(workerPid)) proc.kill(workerPid, 'SIGKILL')
    proc.kill(supPid, 'SIGKILL')
    host.store.append(
      name,
      { kind: 'killed', by: 'cli:kill', worker, reason: 'explicit-kill', signal: 'SIGKILL', detail: 'grace expired, supervisor SIGKILL by CLI' },
      scope,
    )
  }
  killCleanup(host, name, worker, scope)
  return 0
}

const PRUNE_SELECTORS = ['ephemeral', 'all', 'empty', 'idle'] as const

/** prune：四 selector 互斥 → 跳 hasLiveWorker → 默认拒删（需 --yes）→ 真删死 worker channel。 */
export function cmdPrune(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const chosen = PRUNE_SELECTORS.filter((s) => p.flags[s] === true || (s === 'idle' && typeof p.flags.idle === 'string'))
  if (chosen.length === 0) die('[channel prune] 需四 selector 之一：--ephemeral|--all|--empty|--idle DUR')
  if (chosen.length > 1) die('[channel prune] selector 互斥（--ephemeral/--all/--empty/--idle 仅给一个）')
  const sel = chosen[0]
  if (sel === undefined) die('[channel prune] selector 缺失')
  const idleS = parseDurationS(strFlag(p.flags, 'idle'), 0)
  const dry = p.flags['dry-run'] === true
  const yes = p.flags.yes === true
  const keep = new Set(csv(strFlag(p.flags, 'keep')))
  const scope = strFlag(p.flags, 'scope') === 'global' ? 'global' : 'project'
  const fs = hostFs(host)
  const proc = hostProc(host)
  const rmrf = hostRmrf(host)
  const now = hostNow(host)
  const bucket = bucketDir(host.env, scope)

  const candidates: { name: string; dir: string }[] = []
  for (const e of fs.listDir(bucket)) {
    if (!e.isDirectory || e.name.startsWith('.')) continue
    if (keep.has(e.name)) continue
    const dir = `${bucket}/${e.name}`
    if (hasLiveWorker(fs, proc, dir)) continue // 跳 hasLiveWorker（不可阉割）
    const evs = parseEventsText(fs.readText(`${dir}/events.jsonl`))
    const first = evs[0]
    const last = evs[evs.length - 1]
    let match = false
    if (sel === 'all') match = true
    else if (sel === 'ephemeral') match = Boolean(first && first.ephemeral)
    else if (sel === 'empty') match = evs.length <= 1
    else if (sel === 'idle') {
      const ts = typeof last?.ts === 'string' ? last.ts : ''
      const t = Date.parse(ts)
      match = !Number.isNaN(t) && (now() - t) / 1000 >= idleS
    }
    if (match) candidates.push({ name: e.name, dir })
  }

  if (dry) {
    for (const c of candidates) deps.io.out(`would remove: ${c.name}`)
    deps.io.out(`would remove ${candidates.length} channel(s)`)
    return 0
  }
  if (!yes) {
    deps.io.err(`Refusing to delete ${candidates.length} channel(s) without --yes`)
    return USAGE_EXIT
  }
  for (const c of candidates) rmrf(c.dir)
  deps.io.out(`removed ${candidates.length} channel(s)`)
  return 0
}

/** 轮询 events.jsonl 到谓词命中或超时（真读盘快照，run 用）。 */
async function pollForEvent(
  host: ChannelHost,
  name: string,
  scope: Scope,
  predicate: (ev: ChannelEvent) => boolean,
  timeoutMs: number,
): Promise<ChannelEvent | undefined> {
  const sleep = hostSleep(host)
  const now = hostNow(host)
  const deadline = now() + timeoutMs
  for (;;) {
    for (const ev of host.store.read(name, scope)) {
      if (predicate(ev)) return ev
    }
    if (now() >= deadline) return undefined
    await sleep(25)
  }
}

/** run：ephemeral create→spawn→send→wait done→rm（成功 stdout 末条 worker body，失败保留 exit 1）。 */
export async function cmdRun(deps: CliDeps, host: ChannelHost, p: ParsedArgs): Promise<number> {
  const by = strFlag(p.flags, 'as')
  if (!by) die('[channel run] 需 --as <by>')
  if (!strFlag(p.flags, 'provider') && !strFlag(p.flags, 'config')) die('[channel run] 需 --provider <name> 或 --config <path>')
  const message = strFlag(p.flags, 'message')
  if (!message) die('[channel run] 需 --message <text>')
  const scope = scopeOf(p.flags)
  const worker = 'runner'
  const name = strFlag(p.flags, 'name') ?? `run-${Math.floor(Math.random() * 0xffffffff).toString(16)}`
  const timeoutMs = Math.round(parseDurationS(strFlag(p.flags, 'timeout'), 300) * 1000)
  const policy = resolvePolicy(host, p.flags)
  const rmrf = hostRmrf(host)

  // create ephemeral（失败保留的 channel 可被 prune --ephemeral 回收，不成永久孤儿）。
  host.store.append(name, { kind: 'create', by: 'main', action: 'create', task: 'run', type: 'chat', ephemeral: true }, scope)
  const config = buildConfig(host, deps, p.flags, policy)
  const launcher = host.launchSupervisor ?? defaultLauncher(host)
  const launched = await launcher(name, worker, config, scope)

  // 等 spawned/error（短窗口）。
  await pollForEvent(host, name, scope, (ev) => ev.kind === 'spawned' || (ev.kind === 'error' && typeof ev.by === 'string' && ev.by.startsWith('supervisor:')), 10_000)
  // send to worker。
  host.store.append(name, { kind: 'message', by, to: worker, text: message }, scope)
  // wait done/error/killed from worker within timeout。
  const outcome = await pollForEvent(host, name, scope, (ev) => ev.by === worker && (ev.kind === 'done' || ev.kind === 'error' || ev.kind === 'killed'), timeoutMs)

  // 收尾：kill supervisor（in-proc handle 优先，否则 SIGTERM pid）。
  if (launched.shutdown) {
    await launched.shutdown('SIGTERM', 'explicit-kill')
    if (launched.done) await launched.done
  } else if (launched.pid !== undefined) {
    hostProc(host).kill(launched.pid, 'SIGTERM')
  }

  if (outcome && outcome.kind === 'done') {
    const msgs = host.store
      .read(name, scope)
      .filter((e) => (e.kind === 'message' || e.kind === 'done') && e.by === worker && typeof e.text === 'string' && e.text)
    const lastMessage = msgs.at(-1)
    if (lastMessage) deps.io.out(String(lastMessage.text))
    rmrf(host.store.channelDir(name, scope))
    return 0
  }
  deps.io.err(`[channel run] worker 未成功完成；channel kept for inspection: ${host.store.channelDir(name, scope)}`)
  return 1
}

/** __supervisor：隐藏子命令（spawn detached fork 的入口）——起真 supervisor 主循环，SIGTERM 漏斗收口。 */
export async function cmdSupervisor(deps: CliDeps, host: ChannelHost, p: ParsedArgs): Promise<number> {
  const [channel, worker, cfgPath] = p.positional
  if (!channel || !worker || !cfgPath) {
    deps.io.err('usage: channel __supervisor <channel> <worker> <config-path>')
    return USAGE_EXIT
  }
  const fs = hostFs(host)
  const raw = fs.readText(cfgPath)
  const config: SupervisorConfig = raw ? decodeSupervisorConfig(JSON.parse(raw)) : { provider: 'echo' }
  const scope = scopeOf(p.flags)
  const handle = await startSupervisor(channel, worker, config, {
    store: host.store,
    proc: hostProc(host),
    fs,
    env: host.env,
    resolveAdapter: echoOnlyAdapters,
    scope,
  })
  // 信号漏斗：早到的 SIGTERM/SIGINT/SIGHUP 都 funnel 进 shutdown（防孤儿）。
  const onSig = (signalName: string): void => {
    void handle.shutdown(signalName, 'explicit-kill')
  }
  process.on('SIGTERM', () => onSig('SIGTERM'))
  process.on('SIGINT', () => onSig('SIGINT'))
  process.on('SIGHUP', () => onSig('SIGHUP'))
  await handle.done
  return 0
}
