/**
 * afk <sub> —— AFK 自动化 CLI 入口（BACKLOG 收敛复查 iteration-29：#29 automation 包此前
 * 无 CLI 可达性，本命令补上）。enqueue/scan/status 操作 kernel 状态、**不需 docker**；
 * 真容器执行（run 的落地面）需部署接线 #29-wire（预构建 sandcastle 镜像），本命令的 run
 * 只做 report（列就绪队列 + 明示需部署接线），绝不伪装 docker 已就绪。
 *
 * 默认 L1 report-only（#29/#38）：enqueue 只挂队不自动跑；升档走 loops graduation。
 */
import { createAutomation } from '@pipeline-lite/automation'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, changesRoot, isValidChangeName } from '../paths.js'
import { str } from '../render.js'

const AUTOMATION_STATES = ['off', 'queued', 'scheduled', 'running', 'merged', 'failed', 'conflict', 'paused'] as const

interface AfkOpts { json?: boolean }

export async function cmdAfk(deps: CliDeps, sub: string, name: string | undefined, opts: AfkOpts): Promise<number> {
  const auto = createAutomation({ repoRoot: deps.cwd, store: deps.store, clock: deps.clock })

  switch (sub) {
    case 'enqueue': {
      if (!name || !isValidChangeName(name)) {
        deps.io.err(`ERROR: enqueue 需合法 change 名: '${name ?? ''}'`)
        return 1
      }
      try {
        const queued = await auto.enqueue(name)
        if (opts.json) deps.io.out(JSON.stringify({ change: name, queued }))
        else deps.io.err(queued ? `[AFK] ${name} 已挂队（automation=queued，默认 L1 report-only）` : `[AFK] ${name} 未挂队（非 spec-complete / PM 轨 / 已在队 / 未 opt-in）`)
        return queued ? 0 : 3 // 3=未入队（非错误，可判别）
      } catch (e) {
        deps.io.err(`ERROR: ${errMsg(e)}`)
        return 1
      }
    }
    case 'scan': {
      try {
        const ready = await auto.scanReady()
        if (opts.json) deps.io.out(JSON.stringify({ ready }))
        else if (ready.length === 0) deps.io.out('AFK 就绪队列空——无 queued 且依赖满足的 change')
        else { deps.io.out(`AFK 就绪队列（${ready.length}）:`); for (const n of ready) deps.io.out(`  - ${n}`) }
        return 0
      } catch (e) {
        deps.io.err(`ERROR: ${errMsg(e)}`)
        return 1
      }
    }
    case 'status': {
      // 聚合各 change 的 automation_* 字段 → 泳道（同 server /api/afk/snapshot 口径，本地 CLI 版）
      const root = changesRoot(deps.cwd)
      const lanes: Record<string, string[]> = Object.fromEntries(AUTOMATION_STATES.map((s) => [s, []]))
      let names: string[]
      try { names = await deps.listChanges(root) } catch { names = [] }
      for (const n of name ? [name] : names) {
        try {
          const fields = (await deps.store.read(changeDir(deps.cwd, n))).fields
          const a = str(fields.automation) || 'off'
          if (a in lanes) lanes[a]!.push(n)
        } catch { /* 坏 change 跳过 */ }
      }
      const active = Object.fromEntries(Object.entries(lanes).filter(([, v]) => v.length > 0))
      if (opts.json) { deps.io.out(JSON.stringify({ lanes: active })); return 0 }
      const entries = Object.entries(active)
      if (entries.length === 0) { deps.io.out('无 AFK 活跃 change（全 off）'); return 0 }
      deps.io.out('AFK 泳道:')
      for (const [s, ns] of entries) deps.io.out(`  ${s.padEnd(10)} ${ns.join(', ')}`)
      return 0
    }
    case 'run': {
      // 真容器执行需部署接线 #29-wire（docker 镜像）——不伪装，只 report 就绪队列 + 明示
      const ready = await auto.scanReady().catch(() => [] as string[])
      deps.io.err(`[AFK] run 需部署接线 #29-wire（预构建 sandcastle docker 镜像 + CLAUDE_CODE_OAUTH_TOKEN）。就绪队列 ${ready.length} 项${ready.length ? '：' + ready.join(', ') : ''}。当前环境不执行容器（诚实门：不伪装 docker 就绪）。`)
      return 0
    }
    default:
      deps.io.err(`ERROR: 未知 afk 子命令: ${sub}（支持: enqueue <name> / scan / status [name] / run）`)
      return 1
  }
}
