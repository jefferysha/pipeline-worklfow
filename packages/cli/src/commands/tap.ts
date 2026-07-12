/**
 * tap <sub> [args...] —— tap 流量代理的 CLI 入口（BACKLOG #34-wire：daemon 启动器，此前 tap 包
 * 零 CLI 可达性——只有测试直接 import @pipeline-lite/tap，没有真实用户能启动它）。
 *
 * `pipeline tap start <client...> [--ca [dir]] [--forward] [--json] [-- <command> [args...]]`：
 *   `--forward`：把列出的 client 强制抬成 forward-MITM（覆盖 defaultProxyMode）。codex 默认 reverse
 *   （OPENAI_BASE_URL），但 ChatGPT OAuth 态 codex 静默无视该 env（reverse 假捕获，实测坐实）——唯
 *   forward（HTTPS_PROXY + CA）能真拦，故 `pipeline tap start codex --forward --ca` 是 OAuth codex
 *   的唯一真捕获路径（sandcastle codex 分支即用此）。--forward 下须配 --ca（forward 硬门）。
 *   真装配 @pipeline-lite/tap 的 launchTap（detectTarget 定位真实上游 + reverseEnvMap/
 *   forwardEnvMap 组装注入 env + 可选 CertificateAuthority.fromDir 真 TLS MITM）。
 *   · 带 `-- <command>`：把组装好的 env 合并进当前 env，前台 spawn 该命令（stdio 继承），
 *     子进程退出后真关 daemon，以子进程 exit code 收尾——一条命令跑完全程，无需手动 eval。
 *   · 不带：daemon 模式——打印可 `source` 的 `export K=V` 行到 stdout，前台常驻直到
 *     SIGINT/SIGTERM 才真关 daemon（同 `pipeline server` 的前台常驻风格）。
 *
 * `-- <command>` 段不经 commander/`args` 传入——main.ts 已从原始 argv 手工切出（见 deps.ts
 * passthroughArgv 顶注：commander 的 variadic 捕获在裸 `--` 前一个 token 是普通位置参数时会
 * 静默吞掉那个 `--`，是其内部真实缺陷，穷举 argv 验证过），本命令经 deps.passthroughArgv 读取。
 *
 * 跨进程可见性诚实说明：tap 的 intercept 登记（security.ts activeIntercepts）只在当前进程内存，
 * 不落盘——`pipeline doctor` 的 security:tap 灯只反映**运行 doctor 那个进程**里的状态，看不到
 * 另一个终端里 `tap start` 常驻进程的登记（这是 tap 模块自 #34e 起的既有特性，非本命令引入的缺口）。
 */
import { spawn } from 'node:child_process'
import { createTraceStore, launchTap, type ClientLaunchInfo } from '@pipeline-lite/tap'
import { errMsg, type CliDeps } from '../deps.js'

interface ParsedStart {
  clients: string[]
  caDir?: string
  json: boolean
  forward: boolean
}

function parseStartArgs(own: string[]): ParsedStart {
  const clients: string[] = []
  let caDir: string | undefined
  let caRequested = false
  let json = false
  let forward = false
  let i = 0
  while (i < own.length) {
    const a = own[i]!
    if (a === '--ca') {
      caRequested = true
      const nxt = own[i + 1]
      if (nxt !== undefined && !nxt.startsWith('--')) { caDir = nxt; i += 1 }
    } else if (a === '--json') {
      json = true
    } else if (a === '--forward') {
      // 强制把列出的 client 抬成 forward-MITM。codex 默认 reverse（OPENAI_BASE_URL），但
      // ChatGPT OAuth 态 codex 无视该 env（reverse 假捕获）→ 唯 forward 能真拦，须配 --ca。
      forward = true
    } else {
      clients.push(...a.split(',').map((s) => s.trim()).filter(Boolean))
    }
    i += 1
  }
  return { clients, caDir: caRequested ? (caDir ?? '') : undefined, json, forward }
}

function envLines(clients: ClientLaunchInfo[]): string[] {
  const merged: Record<string, string> = {}
  for (const c of clients) Object.assign(merged, c.env)
  return Object.entries(merged).map(([k, v]) => `export ${k}=${JSON.stringify(v)}`)
}

export async function cmdTap(deps: CliDeps, sub: string, args: string[]): Promise<number> {
  switch (sub) {
    case 'start': {
      const command = deps.passthroughArgv ?? []
      const { clients, caDir, json, forward } = parseStartArgs(args)
      if (clients.length === 0) {
        deps.io.err('ERROR: tap start 需至少一个 client（如 pipeline tap start claude）')
        return 1
      }

      let result: Awaited<ReturnType<typeof launchTap>>
      try {
        result = await launchTap({
          clients,
          store: createTraceStore(),
          ca: caDir !== undefined ? { dir: caDir || undefined } : undefined,
          // --forward：把列出的 client 全抬成 forward-MITM（codex OAuth 态唯一真捕获路径）。
          forceForward: forward ? clients : undefined,
        })
      } catch (e) {
        deps.io.err(`ERROR: ${errMsg(e)}`)
        return 1
      }

      if (json) {
        deps.io.out(JSON.stringify({ clients: result.clients.map(({ client, mode, port, target }) => ({ client, mode, port, target })) }))
      } else {
        for (const c of result.clients) deps.io.err(`[tap] ${c.client} (${c.mode}) → 127.0.0.1:${c.port}（真实上游 ${c.target}）`)
      }

      if (command.length > 0) {
        const merged: Record<string, string> = {}
        for (const c of result.clients) Object.assign(merged, c.env)
        const code = await new Promise<number>((resolve) => {
          const child = spawn(command[0]!, command.slice(1), {
            stdio: 'inherit',
            env: { ...process.env, ...merged },
          })
          child.on('exit', (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)))
          child.on('error', () => resolve(1))
        })
        await result.daemon.stop()
        return code
      }

      for (const line of envLines(result.clients)) deps.io.out(line)
      await new Promise<void>((resolve) => {
        const stop = (): void => { void result.daemon.stop().then(resolve) }
        process.once('SIGINT', stop)
        process.once('SIGTERM', stop)
      })
      return 0
    }
    default:
      deps.io.err(`ERROR: 未知 tap 子命令: ${sub}（支持: start <client...> [--ca [dir]] [--json] [-- <command> ...]）`)
      return 1
  }
}
