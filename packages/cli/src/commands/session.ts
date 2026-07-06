/**
 * session 子命令 —— activate（激活当前 change）+ route-context（related_files 按包路由）。
 * 老仓真相源：skills/pipeline/scripts/state-session.sh（语义盘点 + [PLACEHOLDER] 占位见
 * kernel/src/state/session.ts 顶注含老仓行号）。
 *   activate <change>            绑定本 session 活跃指针（degraded 不报错），无 stdout；[OK]/WARN 走 stderr
 *   route-context <change> [--json]  把 related_files 按声明 package path 路由到归属包，分组走 stdout
 * stdout/exit 对齐老仓：数据（route-context header/分组/JSON）走 stdout（老仓 echo/python print）；
 * 状态与错误（activate [OK]/WARN、ERROR）走 stderr（老仓 red/green/yellow 均 >&2，state-lib.sh:5-7）。
 * exit：错误/非法/缺状态 = 1；成功 = 0；activate 指针写失败 = degraded-safe rc=0（绝不 exit 1）。
 *
 * 老仓亦未实现 / 未移植（诚实标注，GOAL C 精神——不臆造实现）：
 *   · activate 的持久化端在老仓委托 session_store.py（R20 per-session context-keyed 指针，解析
 *     CC session id / Cursor ticket / single-session fallback）；该 context_key 解析子系统本仓尚未移植。
 *     本移植把 activate 落到「repo 级 .pipeline-active 平指针」（老仓 state-session.sh:18 记载的设计意图）
 *     作为真实副作用；per-session context-key 定向是文档化的待移植项（未来 R20 换 SessionFs.bindPointer 即可）。
 *   · 老仓 route-context 的「python3/monorepo.py 不可达」降级分支在 TS 侧不适用（无子进程依赖）；
 *     等价降级 = .pipeline-project.yaml 缺失/解析失败 → 视为单仓（packages=null，全未归属），fail-open。
 *   · 老仓 state-session.sh:238-253 三项 [PLACEHOLDER]（package-validation / Cursor ticket 写端 /
 *     init-context-deprecation）是老仓自己都未实现的空占位——本移植同样不实现（见 kernel 顶注）。
 *
 * 接线备注（收编前的临时桥，需主会话收编，见报告接线清单）：kernel barrel 尚未导出 session.ts，
 * 故 PackageDecl/纯逻辑用相对 import 直取 kernel 源（tsc -b/vitest/esbuild 三路可解，已实测）。
 * 主会话收编时：① 在 kernel state/index.ts + index.ts 加 session 导出；② 把本文件相对 import 换成
 * '@pipeline-lite/kernel'；③ 在 program.ts 注册 `session` 命令。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  parseProjectPackages,
  relatedFilesFromField,
  renderRouteContextText,
  routeBucketsToObject,
  routeContext,
  validateChangeName,
  type PackageDecl,
} from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir } from '../paths.js'

/** repo 级平指针文件名（老仓 state-session.sh:18 记载的设计意图 `.pipeline-active`）。 */
export const ACTIVE_POINTER_FILE = '.pipeline-active'
/** 项目根 package 声明文件（老仓 monorepo.py PROJECT_CONFIG_FILE）。 */
export const PROJECT_CONFIG_FILE = '.pipeline-project.yaml'

/**
 * session fs 注入面（默认真 fs；mock 层注入 fake，见 session.test.ts）。
 *   loadPackages: 读项目根 .pipeline-project.yaml → package 声明（缺失/解析失败 → null 单仓，fail-open）。
 *   bindPointer:  绑定本 session 活跃指针（默认写 <cwd>/.pipeline-active；未来 R20 可换 per-session 指针）。
 */
export interface SessionFs {
  loadPackages: (cwd: string) => Promise<PackageDecl[] | null>
  bindPointer: (cwd: string, name: string) => Promise<void>
}

const REAL_FS: SessionFs = {
  loadPackages: async (cwd) => {
    let text: string
    try {
      text = await readFile(join(cwd, PROJECT_CONFIG_FILE), 'utf8')
    } catch {
      return null // 缺 .pipeline-project.yaml → 单仓（老仓 _load_config fail-open → {} → get_packages None）
    }
    try {
      return parseProjectPackages(text)
    } catch {
      return null
    }
  },
  bindPointer: async (cwd, name) => {
    await writeFile(join(cwd, ACTIVE_POINTER_FILE), `${name}\n`, 'utf8')
  },
}

/** change 名校验（老仓 validate_change_name）：非法/空 → stderr ERROR + false。 */
function checkName(deps: CliDeps, name: string | undefined): name is string {
  const v = validateChangeName(name)
  if (v.ok) return true
  deps.io.err(v.error)
  return false
}

/** ensure_state_exists（老仓 state-lib.sh:42-49）：读不到 .pipeline.yaml → stderr 两行 ERROR + null。 */
async function ensureState(deps: CliDeps, name: string): Promise<string | null> {
  const dir = changeDir(deps.cwd, name)
  try {
    await deps.store.read(dir)
    return dir
  } catch {
    deps.io.err(`ERROR: 状态文件不存在: openspec/changes/${name}/.pipeline.yaml`)
    deps.io.err(`  先执行: pipeline init ${name} --track <track> --preset <preset>`)
    return null
  }
}

/**
 * activate（老仓 cmd_activate state-session.sh:28-45）：validate 名 + ensure 状态存在 → 绑定活跃指针。
 * degraded-safe：指针写失败仅 WARN、rc=0（绝不 exit 1），绝不动 phase/phase_status/assignee。
 */
async function cmdActivate(deps: CliDeps, name: string | undefined, fs: SessionFs): Promise<number> {
  if (!checkName(deps, name)) return 1
  if ((await ensureState(deps, name)) === null) return 1
  try {
    await fs.bindPointer(deps.cwd, name)
  } catch (e) {
    // 老仓语义：session_store degraded（context_key 缺/落盘失败）→ 仅 WARN、回退对话上下文、rc=0。
    deps.io.err(`[activate] 活跃指针写入失败 → degraded（回退对话上下文），未落 session 指针: ${errMsg(e)}`)
    return 0
  }
  deps.io.err(`[OK] activate ${name}（本 session 活跃指针已绑定 .pipeline-active；phase/phase_status 未改动）`)
  return 0
}

/**
 * route-context（老仓 cmd_route_context state-session.sh:192-236）：读 related_files → 按声明 package
 * path 路由到归属包。单仓（无 packages 声明）全落未归属桶；--json 透传 {package:[paths]}（null 桶键→"null"）。
 */
async function cmdRouteContext(deps: CliDeps, args: string[], fs: SessionFs): Promise<number> {
  const name = args[0]
  const json = args.includes('--json')
  if (!checkName(deps, name)) return 1
  const dir = await ensureState(deps, name)
  if (dir === null) return 1
  let related: string[]
  try {
    const state = await deps.store.read(dir)
    related = relatedFilesFromField(state.fields.related_files)
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }
  const packages = await fs.loadPackages(deps.cwd)
  const obj = routeBucketsToObject(routeContext(related, packages))
  if (json) {
    deps.io.out(JSON.stringify(obj))
    return 0
  }
  for (const line of renderRouteContextText(name, obj)) deps.io.out(line)
  return 0
}

/**
 * session 子命令分派（纯函数 + deps 注入，风格同 task.ts/fields.ts）。
 * fs 缺省真 fs（integration 走真路径）；mock 层注入 fake SessionFs 快速回归。
 */
export async function cmdSession(
  deps: CliDeps,
  sub: string,
  args: string[],
  fs: SessionFs = REAL_FS,
): Promise<number> {
  switch (sub) {
    case 'activate':
      return cmdActivate(deps, args[0], fs)
    case 'route-context':
      return cmdRouteContext(deps, args, fs)
    default:
      deps.io.err(`ERROR: 未知 session 子命令: ${sub}（支持: activate route-context）`)
      return 1
  }
}
