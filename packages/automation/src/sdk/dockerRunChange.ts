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
 *
 * store（可选，Task 1 收尾缺口修复——见 .superpowers/sdd/task-1-report.md「Concerns」）：注入真
 * kernel StateStore 后，把 createLifecyclePorts 的 setStateField 适配到
 * store.set(join(hostRepoDir, 'openspec', 'changes', name), field, value)——changeDir 解析同
 * sdk.ts::storeWriter 同款约定，供 lifecycle.ts::runChangeInSandbox 运行期真写回
 * automation_sandbox/automation_worktree（下游取消/详情靠这两个字段定位容器/worktree）。真部署
 * 接线：packages/cli/src/commands/afk.ts 的 cmdAfk 传 deps.store。未注入 → ports.ts 既有 no-op
 * 缺省接管（不 throw、不阻断 run，静默跳过写回）。
 */
import { join } from 'node:path'
import type { StateStore } from '@pipeline-lite/kernel'
import { runChangeInSandbox } from '../lifecycle/lifecycle.js'
import { createLifecyclePorts } from '../lifecycle/ports.js'
import { nodeExec, type ExecFn } from '../runner/exec.js'
import { sanitizePath, type RunChange } from '../scheduler/scheduler.js'
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
  /** 额外注入沙箱的 env（真部署接线：CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_BASE_URL 等）。 */
  readonly extraEnv?: Readonly<Record<string, string>>
  /**
   * 真 kernel StateStore（可选）：注入后运行期真写回 automation_sandbox/automation_worktree
   * （changeDir 解析 = join(hostRepoDir, 'openspec', 'changes', name)，同 sdk.ts::storeWriter
   * 同款约定）。未注入 → createLifecyclePorts 走既有 no-op 缺省，不 throw、不阻断 run。
   *
   * 四闸安全（Task 1 复查 Fix 2）：automation_worktree 的值 = join(hostRepoDir, '.sandcastle',
   * 'worktrees', <branch>)（worktree.ts::worktreePathFor）——hostRepoDir 是真机器路径，可含任意
   * 子串（如 "repo #2" 这类去重目录名），直写会撞 kernel 四闸（parse.ts::quoteGate 禁换行/
   * ": "/" #"/首引号）同步 throw QuoteGateError，且该错误无 _tag，classifyFailure 只当瞬态
   * retry 处理——同一 hostRepoDir 永不可能好转，直到 attempts 耗尽 failed。故写前复用
   * scheduler.ts::sanitizePath()（四闸清洗的同一份实现，不分叉出第二份；**不截断**——真机验收
   * P1：深路径项目 worktree 全路径 > 200 字符被 sanitize 的 slice(0,200) 截成残路径，server 侧
   * cancelAfkRun 按残路径写 .cancel-requested → ENOENT → dashboard cancel 永远 500）。
   * automation_sandbox 不需要：containerName 由 container.ts::createDockerSandbox
   * 生成，定长安全字符集 [0-9a-z-]（sandcastle-<base36 时间戳>-<6 位 hex 随机>），不可能含
   * 四闸任何一种禁串。
   */
  readonly store?: StateStore
  /**
   * loop denylist 解析器（T4 决议 #12，可选）：change 名 → 生效的 denylist glob 清单。调用方按
   * change_prefix 归属从 loops registry 派生（现成帮手：denylist.ts::denylistForChange +
   * kernel loadRegistry，见 packages/cli/src/commands/afk.ts 的接线）。返回非空 → run 结算时
   * git diff --name-only 对 glob 匹配，违规判 conflict 保留现场。返回 [] / 未传 / resolver 自身
   * throw → 无 loop 语境，检查跳过（best-effort：registry 读故障绝不阻断 run）。
   */
  readonly resolveDenylist?: (name: string) => Promise<readonly string[]>
  /**
   * loop runner 解析器（v5 T20 双 runner，可选）：change 名 → loop 声明的 runner。调用方按
   * change_prefix 归属从 loops registry 派生（现成帮手：runnerFor.ts::runnerForChange +
   * kernel loadRegistry，接线见 packages/cli/src/commands/afk.ts）。返回 'codex' → 沙箱命令
   * 构造点注入 PIPELINE_RUNNER=codex（buildAfkRunCommand），起 codex exec 无头会话；返回
   * 其余值 / 未传 / resolver 自身 throw → 缺省 Claude 路径（best-effort：registry 读故障绝不
   * 阻断 run）。codex CLI 不可用时沙箱脚本非零退出并打清晰错误 → automation_last_error。
   */
  readonly resolveRunner?: (name: string) => Promise<string | undefined>
}

/** 构造绑真 docker/git 的 RunChange（喂给 automation.runRound）。 */
export const createDockerRunChange = (opts: DockerRunChangeOptions): RunChange => {
  const exec = opts.exec ?? nodeExec
  const { store, hostRepoDir } = opts
  const changeDir = (name: string): string => join(hostRepoDir, 'openspec', 'changes', name)
  // 仅 automation_worktree 需要四闸消毒（见上方 store 字段注释）；automation_sandbox 值域天然安全，
  // 不误消毒不该消毒的字段。
  const setStateField = store
    ? (name: string, field: string, value: string): Promise<void> =>
        store.set(changeDir(name), field as never, field === 'automation_worktree' ? sanitizePath(value) : value)
    : undefined
  const ports = createLifecyclePorts({
    exec,
    hostRepoDir: opts.hostRepoDir,
    image: opts.image,
    uid: opts.uid,
    gid: opts.gid,
    cpus: opts.cpus,
    idleMs: opts.idleMs,
    graceMs: opts.graceMs,
    setStateField,
  })
  const autoMerge = opts.level === 'L3'
  return async (name, signal) => {
    // T4 决议 #12：每次 run 现解析该 change 的 loop denylist（loops.yaml 可能被编辑，不缓存）；
    // resolver 故障 → []（best-effort，registry 读坏不阻断 run，也不误判违规）。
    const denylist = opts.resolveDenylist ? await opts.resolveDenylist(name).catch(() => [] as string[]) : []
    // v5 T20：每次 run 现解析该 change 的 loop runner（同 denylist 的不缓存/best-effort 口径）；
    // resolver 故障 → undefined（缺省 Claude 路径，绝不因 registry 读坏阻断 run）。
    const runner = opts.resolveRunner ? await opts.resolveRunner(name).catch(() => undefined) : undefined
    return runChangeInSandbox(
      ports,
      { hostRepoDir: opts.hostRepoDir, name, base: opts.base, autoMerge, extraEnv: opts.extraEnv, denylist, runner },
      signal,
    )
  }
}
