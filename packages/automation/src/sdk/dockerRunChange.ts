/**
 * createDockerRunChange（BACKLOG #29-wire）—— 把 #29c 的生产 LifecyclePorts 装配成一个
 * scheduler 可喂的 RunChange，接通 `automation.runRound` 与真 docker 执行。
 *
 * 这是交接文档描述的接线点：
 *   runChange = (name, signal) => runChangeInSandbox(
 *     createLifecyclePorts({ exec: nodeExec, hostRepoDir, image, uid, gid, cpus }),
 *     { hostRepoDir, name, base, autoMerge: level === 'L3' }, signal)
 *
 * autoMerge 严格由 level 派生（L3 → true 真 merge-back；L1/L2 → false report-only 安全默认），
 * 与 scheduler settleSuccess 的分级落态（L3 merged / L1·L2 paused）同源——两处都读同一 level，
 * 不会出现「settle 说 merged 但 lifecycle 没 merge」的口径漂移。
 *
 * exec 缺省 nodeExec（真 docker/git 子进程）；测试可注入 fake exec 断言 argv 而不起容器。
 */
import { runChangeInSandbox } from '../lifecycle/lifecycle.js'
import { createLifecyclePorts } from '../lifecycle/ports.js'
import { nodeExec, type ExecFn } from '../runner/exec.js'
import type { RunChange } from '../scheduler/scheduler.js'
import type { AutomationLevel } from '../types.js'

export interface DockerRunChangeOptions {
  /** host 仓库根（命名分支从它 fork、merge 回它；worktree 落在其 .sandcastle/worktrees/）。 */
  readonly hostRepoDir: string
  /** host 当前 base 分支（命名分支从它 fork、L3 merge 回它）。 */
  readonly base: string
  /** 分级放权档位——L3 真自动 merge-back；L1/L2 report-only 不合并（安全默认）。 */
  readonly level: AutomationLevel
  /** 沙箱镜像名；缺省 sandcastle:local（真部署镜像）。 */
  readonly image?: string
  /** 子进程 exec 面；缺省 nodeExec（真 docker/git）。测试注入 fake。 */
  readonly exec?: ExecFn
  readonly uid?: number
  readonly gid?: number
  readonly cpus?: number
  readonly idleMs?: number
  readonly graceMs?: number
}

/** 构造绑真 docker/git 的 RunChange（喂给 automation.runRound）。 */
export const createDockerRunChange = (opts: DockerRunChangeOptions): RunChange => {
  const exec = opts.exec ?? nodeExec
  const ports = createLifecyclePorts({
    exec,
    hostRepoDir: opts.hostRepoDir,
    image: opts.image,
    uid: opts.uid,
    gid: opts.gid,
    cpus: opts.cpus,
    idleMs: opts.idleMs,
    graceMs: opts.graceMs,
  })
  const autoMerge = opts.level === 'L3'
  return (name, signal) =>
    runChangeInSandbox(
      ports,
      { hostRepoDir: opts.hostRepoDir, name, base: opts.base, autoMerge },
      signal,
    )
}
