/**
 * 生产 LifecyclePorts 装配（BACKLOG #29c）—— 把真 docker/git/worktree 实现接进 #29 lifecycle 的注入面。
 *
 * #29 的 runChangeInSandbox 是纯编排 + 注入 port；本工厂提供**真实现**（不改 lifecycle 编排核心）：
 *   worktree      → 真 git worktree add/remove（worktree.ts）
 *   createSandbox → 真 docker 容器 + git 双挂载（container.ts + gitMounts.ts）
 *   runWork       → 沙箱内 pipeline-afk-run + 三路 race（idle/grace/abort）+ 结构化握手解析（race.ts + runner.ts）
 *                   + 结算（成功/失败）落盘完整 stdout+stderr 到 worktree 内 .sandcastle-run.log
 *                   （afk-workbench Task 2；不是 automation_last_error 里那 200 字符截断片段）
 *   collectCommits→ 真 git rev-list 命名分支（mergeback.ts）
 *   mergeToBase   → 真 git merge DELIVERY + 冲突留现场（mergeback.ts）—— 仅 L3 调
 *   git           → 真 git rev-parse（barrier build_sha 派生）
 *
 * 主会话在 packages/cli / server 侧把它接进 sdk.runRound（见报告接线清单）。默认 L1 report-only
 * （autoMerge=false → 不调 mergeToBase）。
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BoundedTail, MAX_TAIL_CHARS } from '../runner/boundedTail.js'
import { createDockerSandbox } from '../runner/container.js'
import type { ExecFn, ExecResult } from '../runner/exec.js'
import { resolveGitMounts } from '../runner/gitMounts.js'
import {
  DEFAULT_COMPLETION_SIGNAL,
  DEFAULT_COMPLETION_TIMEOUT_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
  invokeWithRace,
} from '../runner/race.js'
import { buildAfkRunCommand, parseSandboxReport } from '../runner/runner.js'
import type { LifecyclePorts } from './lifecycle.js'
import { collectCommitsReal, mergeBackToBase, realGitFace } from './mergeback.js'
import { realWorktreePort } from './worktree.js'

export interface LifecyclePortsDeps {
  readonly exec: ExecFn
  readonly hostRepoDir: string
  /** 沙箱镜像名；缺省 sandcastle:local（主会话按 repo 派生）。 */
  readonly image?: string
  /** 容器 --user uid:gid；缺省取 host uid/gid（防污染 host worktree，DESIGN §7-item5）。 */
  readonly uid?: number
  readonly gid?: number
  /** --cpus 限额（防单 change 吃满 CPU 饿死其余，DESIGN §3.2）。 */
  readonly cpus?: number
  readonly idleMs?: number
  readonly graceMs?: number
  readonly completionSignals?: readonly string[]
  /**
   * 运行期状态字段写回注入（automation_sandbox/automation_worktree 等）。真接线 = kernel
   * StateStore.set 经 changeDir(name) 适配（同 sdk.ts::storeWriter 同款模式，由调用方按需接线，
   * 例如把 name 解析成 join(hostRepoDir, 'openspec', 'changes', name) 再转发给真 StateStore）。
   * 缺省 no-op：调用方尚未接线真 store 时写回静默跳过，不 throw、不阻断 run。
   */
  readonly setStateField?: (name: string, field: string, value: string) => Promise<void>
}

export const createLifecyclePorts = (deps: LifecyclePortsDeps): LifecyclePorts => {
  const { exec, hostRepoDir } = deps
  const image = deps.image ?? 'sandcastle:local'
  const uid = deps.uid ?? process.getuid?.()
  const gid = deps.gid ?? process.getgid?.()
  const idleMs = deps.idleMs ?? DEFAULT_IDLE_TIMEOUT_MS
  const graceMs = deps.graceMs ?? DEFAULT_COMPLETION_TIMEOUT_MS
  const completionSignals = deps.completionSignals ?? [DEFAULT_COMPLETION_SIGNAL]

  return {
    worktree: realWorktreePort(exec),

    async createSandbox({ env, worktreePath }) {
      // git 双挂载：worktree 的 .git 是 gitdir: 指针 → 需父 .git 目录在同一绝对路径可解析。
      const gitMounts = await resolveGitMounts(join(worktreePath, '.git')).catch(() => [])
      // 沙箱内工具（pipeline-afk-run 的 git commit / pipeline get）要看得见 worktree 的**工作文件**，
      // 故挂 worktree 目录本身（host==sandbox）；它已含 .git 指针文件，故丢掉 resolveGitMounts 里那条
      // 冗余的 .git 文件挂载，只保留父 .git 目录挂载（gitdir: 绝对路径经它解析）。
      const dotGit = join(worktreePath, '.git')
      const parentGitMounts = gitMounts.filter((m) => m.hostPath !== dotGit)
      const mounts = [{ hostPath: worktreePath, sandboxPath: worktreePath }, ...parentGitMounts]
      return createDockerSandbox(exec, { image, worktreePath, env, gitMounts: mounts, uid, gid, cpus: deps.cpus })
    },

    async runWork(sandboxExec, name, worktreePath, signal) {
      const cmd = buildAfkRunCommand(name)
      const logPath = join(worktreePath, '.sandcastle-run.log')
      // afk-workbench Task 2：结算（成功/失败）落盘完整 stdout+stderr（不是 automation_last_error
      // 里那 200 字符截断片段）。invokeWithRace 有两种质地不同的"结算"：resolve（含 exitCode!==0
      // 的沙箱内命令真失败，此时有完整 res 可读）和 reject（idle-timeout/abort/sandboxExec 自己
      // 抛错——invokeWithRace 直接 reject，压根没有 res）。若只在 resolve 之后才读 res.stdout 落盘，
      // reject 这条路径的日志会整个丢失——BoundedTail 的生命周期得提到 invokeWithRace 外面自己用
      // onLine 攒一份兜底尾部，catch 分支才拿得到东西（64KiB 上限，复用现成 BoundedTail，不新造
      // 一套累积机制）。
      const fallbackTail = new BoundedTail(MAX_TAIL_CHARS, '\n')

      let res: ExecResult
      try {
        // 三路 race：沙箱内 pipeline-afk-run 跑 build→verify→ship，idle/grace/abort 收口。
        res = await invokeWithRace(
          (onLine) =>
            sandboxExec(cmd, {
              onLine: (line) => {
                fallbackTail.push(line)
                onLine(line)
              },
            }),
          { idleMs, graceMs, completionSignals, signal },
        )
      } catch (err) {
        // reject 路径唯一能拿到的内容：onLine 逐行攒的尾部（stderr 不走 onLine，这条路径上确实
        // 拿不到，天然限制，不伪造）。落盘失败不掩盖真错误——best-effort，同 setStateField/
        // worktree.remove 既有的 .catch(() => {}) 风格。
        await writeFile(logPath, fallbackTail.toString(), 'utf8').catch(() => {})
        throw err
      }

      // resolve 路径：res.stdout/res.stderr 已经是权威全量（真 sandboxExec 走 exec.ts 自己的
      // 64KiB BoundedTail），直接落盘，不再从 fallbackTail 拼凑。
      const fullLog = [res.stdout, res.stderr].filter((s) => s.length > 0).join('\n')
      await writeFile(logPath, fullLog, 'utf8').catch(() => {})

      if (res.exitCode !== 0) {
        throw new Error(`pipeline afk-run failed (exit ${res.exitCode}): ${res.stderr.slice(0, 200)}`)
      }
      return parseSandboxReport(res.stdout) // 非零/畸形握手真抛错，绝不伪造 pass
    },

    collectCommits: (input) =>
      collectCommitsReal(exec, { hostRepoDir, branch: input.branch, base: input.base }),

    mergeToBase: (input) =>
      mergeBackToBase(exec, { hostRepoDir, worktreePath: input.worktreePath, branch: input.branch, base: input.base }),

    git: realGitFace(exec, hostRepoDir),

    setStateField: deps.setStateField ?? (async () => {}),
  }
}
