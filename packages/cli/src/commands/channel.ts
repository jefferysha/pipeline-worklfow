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
} from '@tenon/channel'
import { splitFlags } from '../argv.js'
import type { CliDeps } from '../deps.js'


import {
  ChannelDie, nodeChannelHost, USAGE_EXIT, type ChannelHost,
} from './channelSupport.js'
import {
  cmdContext, cmdCreate, cmdDir, cmdForum, cmdInterrupt, cmdList, cmdMessages,
  cmdRegistry, cmdSend, cmdThread, cmdTitle, cmdWait,
} from './channelMessaging.js'
import { cmdKill, cmdPrune, cmdRun, cmdSpawn, cmdSupervisor } from './channelSupervisor.js'

const USAGE = `tenon channel — event-sourced worker 总线（正交持久层，绝不触 barrier/三门/build_sha）

结构:
  create  <name> --task T [--type chat|forum] [--scope project|global] [--description D]
  title   <name> (--set <title> | --clear) [--scope ...]
  context <name> --add|--delete (--file <ABS> | --raw <text>) [--thread K] [--scope ...]
  dir     <name> [--scope project|global]
消息/中断:
  send      <name> <text> --as <by> [--to CSV] [--delivery-mode appendOnly|requireKnownWorker|requireRunningWorker]
  wait      <name> --as <self> [--from CSV] [--kind K] [--to T] [--since SEQ] [--all]   # 无匹配 exit 124
  messages  <name> [--last N] [--since SEQ] [--kind K] [--from CSV] [--to T]
  interrupt <name> --as <by> --to <worker> <text>                                       # 只写事件
  registry  <name>                                                                       # worker 注册表投影
forum:
  thread post   <name> --as <by> --action opened|comment|status|labels|assignees|summary|processed [--thread K]
  thread rename <name> --as <by> --thread OLD --new-thread NEW
  forum list    <name> [--json]
  list          [--json] [--all] [--all-projects]
进程层（真 fork / OS 信号 / liveness，正交持久 worker 层）：
  spawn <name> --as <worker> (--provider echo | --config <path>) [--max-live-workers N] [--idle-timeout MS]
  kill  <name> --as <worker> [--force] [--scope]                                # SIGTERM supervisor + grace
  run   [--name N] --as <by> (--provider echo | --config <path>) --message M [--timeout D]   # ephemeral 端到端
  prune (--ephemeral|--all|--empty|--idle DUR) [--dry-run] [--yes] [--keep CSV] [--scope]    # 跳 hasLiveWorker`

/**
 * channel 子命令分派（纯函数 + deps 注入 + host 注入面）。
 * host 缺省真 fs + 真 env（读用户 channel root）；集成层注入指向临时 root 的 host、mock 层注入 fake。
 * ★只用 deps.io + deps.cwd——绝不碰 deps.store / deps.flow / 三门 / build_sha / git（正交红线）。
 */
export async function cmdChannel(
  deps: CliDeps,
  sub: string,
  args: string[],
  host: ChannelHost = nodeChannelHost(deps.cwd),
): Promise<number> {
  if (sub === '' || sub === 'help' || sub === '--help' || sub === '-h') {
    deps.io.out(USAGE)
    return 0
  }
  const p = splitFlags(args)
  try {
    switch (sub) {
      case 'create':
        return cmdCreate(deps, host, p)
      case 'title':
        return cmdTitle(deps, host, p)
      case 'context':
        return cmdContext(deps, host, p)
      case 'send':
        return cmdSend(deps, host, p)
      case 'wait':
        return cmdWait(deps, host, p)
      case 'messages':
        return cmdMessages(deps, host, p)
      case 'registry':
        return cmdRegistry(deps, host, p)
      case 'interrupt':
        return cmdInterrupt(deps, host, p)
      case 'thread':
        return cmdThread(deps, host, p)
      case 'forum':
        return cmdForum(deps, host, p)
      case 'list':
        return cmdList(deps, host, p)
      case 'dir':
        return cmdDir(deps, host, p)
      case 'spawn':
        return await cmdSpawn(deps, host, p)
      case 'kill':
        return await cmdKill(deps, host, p)
      case 'run':
        return await cmdRun(deps, host, p)
      case 'prune':
        return cmdPrune(deps, host, p)
      case '__supervisor':
        return await cmdSupervisor(deps, host, p)
      default:
        deps.io.err(`[channel] 未知子命令: ${sub}`)
        return USAGE_EXIT
    }
  } catch (e) {
    if (e instanceof ChannelDie) {
      deps.io.err(e.message)
      return e.code
    }
    if (e instanceof Error) {
      deps.io.err(`[channel] ${e.message}`)
      return 1
    }
    throw e
  }
}
