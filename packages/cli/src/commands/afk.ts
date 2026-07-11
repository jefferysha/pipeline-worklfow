/**
 * afk <sub> —— AFK 自动化 CLI 入口（BACKLOG 收敛复查 iteration-29：#29 automation 包此前
 * 无 CLI 可达性，本命令补上；#29-wire 收敛：run 真接 docker 执行，不再只 report）。
 *
 * run 的真容器执行需要：① docker daemon 可用 ② 预构建的 sandcastle 镜像（--image 覆盖，缺省
 * sandcastle:local）。无 docker → 诚实报告就绪队列 + 明示原因，绝不伪装已执行（诚实门）。
 * 有 docker → 真调 automation.runRound(createDockerRunChange(...))：真 git worktree、真容器、
 * 真 pipeline-afk-run 握手回读、真 barrier build_sha 派生、L3 真 merge-back（L1/L2 report-only
 * 安全默认，成功也只停 paused）。createDockerRunChange 传 deps.store，运行期真写回
 * automation_sandbox/automation_worktree（Task 1 收尾缺口修复：此前只有 lifecycle 编排层写这
 * 两个字段的能力，没有一条真调用链把真 StateStore 接进来，见
 * .superpowers/sdd/task-1-report.md「Concerns」）。
 *
 * 默认 L1 report-only（#29/#38）：enqueue 只挂队不自动跑；--level 覆盖仅影响本次 run 的分级
 * （升档的持久化决策仍走 loops graduation，本命令不改 .pipeline.yaml 之外的任何 level 状态）。
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  createAutomation, createDockerRunChange, denylistForChange, dockerAvailable, nodeExec, readAutomationJson,
  runnerForChange, AUTOMATION_LEVELS, type AutomationLevel,
} from '@pipeline-lite/automation'
import { loadRegistry } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, changesRoot, isValidChangeName } from '../paths.js'
import { str } from '../render.js'

const AUTOMATION_STATES = ['off', 'queued', 'scheduled', 'running', 'merged', 'failed', 'conflict', 'paused'] as const
const DEFAULT_SANDCASTLE_IMAGE = 'sandcastle:local'
const execFileAsync = promisify(execFile)

interface AfkOpts { json?: boolean; level?: string; image?: string }

function isAutomationLevel(v: string): v is AutomationLevel {
  return (AUTOMATION_LEVELS as readonly string[]).includes(v)
}

/** 当前 checkout 分支（`git branch --show-current`，非 git 仓/detached HEAD → 空串）。 */
async function currentBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd })
    return stdout.trim()
  } catch {
    return ''
  }
}

export async function cmdAfk(deps: CliDeps, sub: string, name: string | undefined, opts: AfkOpts): Promise<number> {
  const level: AutomationLevel = opts.level && isAutomationLevel(opts.level) ? opts.level : 'L1'
  if (opts.level && !isAutomationLevel(opts.level)) {
    deps.io.err(`ERROR: --level 需 L1|L2|L3，收到 '${opts.level}'`)
    return 1
  }
  const auto = createAutomation({ repoRoot: deps.cwd, store: deps.store, clock: deps.clock, config: { level } })

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
      const ready = await auto.scanReady().catch(() => [] as string[])
      if (ready.length === 0) {
        deps.io.out('AFK run: 就绪队列空——无 queued 且依赖满足的 change')
        return 0
      }
      const hasDocker = await dockerAvailable((file, args) => nodeExec(file, args))
      if (!hasDocker) {
        deps.io.err(`[AFK] run 需 docker daemon（未检测到）。就绪队列 ${ready.length} 项：${ready.join(', ')}。当前环境不执行容器（诚实门：不伪装 docker 就绪）。`)
        return 0
      }
      const base = await currentBranch(deps.cwd)
      if (!base) {
        deps.io.err('[AFK] run 需在 git 仓库内、非 detached HEAD（取不到当前分支名，命名分支/merge-back 无锚点）')
        return 1
      }
      // T21 image 同源：--image 显式覆盖 > .pipeline/automation.json 的 image > 内置默认
      // （与 createAutomation 内 maxParallel/maxRetries/defaultOptIn 吃同一个文件——UI 编排页
      // 保存的沙箱镜像在真 run 路径真实生效，不是假输入框）。
      const image = opts.image ?? readAutomationJson(deps.cwd).image ?? DEFAULT_SANDCASTLE_IMAGE
      // store 真接线（Task 1 收尾缺口修复）：runChangeInSandbox 运行期真写回 automation_sandbox/
      // automation_worktree 靠 createDockerRunChange 把 deps.store 转发给 createLifecyclePorts 的
      // setStateField；此前一直没传，字段在真 CLI 路径里永远停在 init 时的 ""（见
      // .superpowers/sdd/task-1-report.md「Concerns」）。
      // loop denylist 真实生效（v5 T4 决议 #12）：按 change_prefix 归属从 .pipeline/loops.yaml 派生
      // 该 change 的 denylist glob；run 结算时 git diff --name-only 对其匹配，违规判 conflict 保留
      // 现场。registry 缺失/损坏/schema 校验失败 → data null → []（best-effort，无 loop 语境跳过检查，
      // 绝不阻断 run）。每次 run 现读（loops.yaml 可能被编辑，不缓存）。
      const resolveDenylist = async (changeName: string): Promise<readonly string[]> =>
        denylistForChange(loadRegistry(deps.cwd).data?.loops ?? [], changeName)
      // runner 双支持（v5 T20）：按 change_prefix 归属派生 loop 声明的 runner（'codex' → 沙箱起
      // codex exec 无头会话；其余/无归属 → 缺省 Claude 路径）。同 denylist 的现读/best-effort 口径。
      const resolveRunner = async (changeName: string): Promise<string | undefined> =>
        runnerForChange(loadRegistry(deps.cwd).data?.loops ?? [], changeName)
      const runChange = createDockerRunChange({ hostRepoDir: deps.cwd, base, level, image, store: deps.store, resolveDenylist, resolveRunner })
      await auto.runRound(runChange)
      deps.io.out(`AFK run: 跑完一轮（${ready.length} 项候选，level=${level}，image=${image}）`)
      return 0
    }
    default:
      deps.io.err(`ERROR: 未知 afk 子命令: ${sub}（支持: enqueue <name> / scan / status [name] / run [--level] [--image]）`)
      return 1
  }
}
