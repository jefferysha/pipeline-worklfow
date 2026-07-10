/**
 * init <name> --track --preset [--user] [--workflow] —— 初始化 change（CONTRACT §3，
 * 2026-07-06 oracle 实测回写：老内核 init stdout 为空，创建路径改走 stderr 信息行）。
 * stdout：无；exit 0/1。
 *
 * --workflow（GOAL E，whole-branch review 补：此前没有任何支持的命令能把一个 change 摆到
 * 自定义 workflow 的首个 step 上，除非该 step 恰好叫 open——`pipeline set phase <custom-id>`
 * 被 manifest 派生的 7 相位枚举挡下，`migrate-workflow` 只处理已存在的 change。此处新增的
 * `--workflow` 选项省略/传 'default' 时行为与此前完全一致（未提供本选项的既有调用零回归）；
 * 显式传非 default 名字时，真加载 + 校验该 workflow（复用 loadWorkflow，Fix E5 已经接的
 * validateWorkflow 在这里同样生效——非法 workflow 文件在 init 这一步就 fail-loud，不会让
 * 一个引用了坏 workflow 的 change 先被创建出来），再把 workflow 字段设成该名字、phase 字段
 * 种到它 steps[0] 的 id（而不是硬编码的 'open'）。这里故意绕开 CLI `set` 子命令那层的
 * enumOk（对齐 manifest.phases 的老内核枚举校验，仅对 `pipeline set phase ...` 这一入口生效）
 * ——直接调用 kernel StateStore.setMany，其闸门只做 quoteGate（YAML 安全字符集），不做语义
 * 枚举校验，custom workflow 的任意合法 step id 在这里天然放行，且完全不触碰 enumOk/cmdSet
 * 共享代码路径（zero 改动、zero 回归风险 to oracle 覆盖的 default workflow 主线）。
 */
import { loadWorkflow, TRACKS } from '@pipeline-lite/kernel'
import type { Track } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { recordHistory } from './fields.js'
import { isValidChangeName } from '../paths.js'

export interface InitCmdOpts {
  track: string
  preset: string
  user?: string
  workflow?: string
}

export async function cmdInit(deps: CliDeps, name: string, opts: InitCmdOpts): Promise<number> {
  if (!isValidChangeName(name)) {
    deps.io.err(`ERROR: change-name 非法: '${name}' (仅允许 a-z A-Z 0-9 - _)`)
    return 1
  }
  if (!(TRACKS as readonly string[]).includes(opts.track)) {
    deps.io.err(`ERROR: 非法 track '${opts.track}'，允许: ${TRACKS.join(' | ')}`)
    return 1
  }
  if (!opts.preset) {
    deps.io.err('ERROR: preset 不能为空')
    return 1
  }

  // --workflow 校验先于任何落盘：workflow 文件不存在/非法都不应该先建出一个引用坏 workflow
  // 的 change 再报错（同 transition.ts Task 8 的"先校验后写"纪律）。
  let customStart: { workflow: string; phase: string } | undefined
  if (opts.workflow && opts.workflow !== 'default') {
    let wf: ReturnType<typeof loadWorkflow>
    try {
      wf = loadWorkflow(deps.cwd, opts.workflow)
    } catch (e) {
      deps.io.err(errMsg(e))
      return 1
    }
    if (!wf) {
      deps.io.err(`ERROR: workflow '${opts.workflow}' 未找到（期望 .pipeline/workflows/${opts.workflow}.yaml）`)
      return 1
    }
    const first = wf.steps[0]
    if (!first) {
      deps.io.err(`ERROR: workflow '${opts.workflow}' 未声明任何 step`)
      return 1
    }
    customStart = { workflow: opts.workflow, phase: first.id }
  }

  try {
    const created = await deps.store.init({
      repoRoot: deps.cwd,
      name,
      track: opts.track as Track,
      preset: opts.preset,
      user: opts.user,
      clock: deps.clock,
    })
    if (customStart) {
      await deps.store.setMany(created, { workflow: customStart.workflow, phase: customStart.phase })
    }
    await recordHistory(deps, created, {
      ts: deps.clock(),
      kind: 'init',
      ...(opts.user ? { by: opts.user } : {}),
    })
    // 决策 D（v5 T2）：init 成功后 best-effort 登记 repoRoot 到机器级项目注册表——
    // 铁律：注册表任何故障（损坏/目录不可写）只 WARN，绝不让已成功的 init 失败。
    if (deps.registerProject) {
      try {
        await deps.registerProject(deps.cwd)
      } catch (e) {
        deps.io.err(`WARN: 项目注册表登记失败: ${errMsg(e)}`)
      }
    }
    deps.io.err(`[INIT] ${created}`)
    return 0
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }
}
