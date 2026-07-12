/**
 * setup 命令 —— 安装后「全功能就绪」引导（full-install F3 · 骨架批）。
 *
 * 本批只落两件事:
 *   ① ensurePipelineOnPath():把 CLI bundle 软链到 ~/.local/bin/pipeline（让用户终端能敲 pipeline）;
 *   ② 打印全流程计划骨架（技能安装 / 运行时检查 / 就绪清单 三段标题 + Phase 2/3 TODO 锚点）。
 * 真正的技能安装段（Phase 2,计划 S2）与运行时检查段（Phase 3,计划 R1）本批留占位分派
 * （打印「待实现」exit 0 不报错）+ 清晰 TODO 锚点,不实现。
 *
 * 注入面 SetupEnv（home/bin 定位 + fs 原语）:测试注入 fake（临时 HOME/内存 spy），
 * 真实现 REAL_SETUP_ENV 走 node:fs + os.homedir()——对齐 loops.ts InitEnv/REAL_INIT_ENV 先例,
 * 不写死 os.homedir()、不新增 deps.ts 必填字段（软链自带注入面,与 io 注入面正交）。
 * best-effort:软链任何失败只 WARN 不让 setup 崩（对齐 init.ts「注册表故障只 WARN」精神）。
 */
import { chmodSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { errMsg, type CliDeps } from '../deps.js'

// ── 注入面（测试注入临时 HOME / spy;真实现 = node:fs + os.homedir）──────────────────
export interface SetupEnv {
  /** 用户 home（真实现 os.homedir();~/.local/bin 定位锚）。 */
  homeDir(): string
  /** $CLAUDE_PLUGIN_ROOT（插件安装根）;未设 → null（dev 回退 selfPath）。 */
  pluginRoot(): string | null
  /** 本 CLI bundle 自身路径（真实现 resolve(process.argv[1]);pluginRoot 缺失时的 dev 回退源）。 */
  selfPath(): string
  /** mkdir -p。 */
  mkdirp(dir: string): void
  /** 读软链目标;不是软链 / 不存在 → null（EINVAL/ENOENT 均归 null）。 */
  readSymlink(path: string): string | null
  /** lstat 存在性（软链本身也算存在,含悬空软链;判「存在但非软链」用）。 */
  pathExists(path: string): boolean
  /** 建软链 target→linkPath。 */
  makeSymlink(target: string, linkPath: string): void
  /** 删文件/软链（覆盖异源/非软链前置）。 */
  removePath(path: string): void
  /** chmod +x（源 bundle 带 shebang,置可执行位;best-effort 补位）。 */
  chmodExec(path: string): void
}

export const REAL_SETUP_ENV: SetupEnv = {
  homeDir: () => homedir(),
  pluginRoot: () => {
    const r = process.env.CLAUDE_PLUGIN_ROOT
    return r !== undefined && r.trim() !== '' ? r : null
  },
  selfPath: () => resolve(process.argv[1] ?? ''),
  mkdirp: (dir) => { mkdirSync(dir, { recursive: true }) },
  readSymlink: (path) => {
    try {
      return readlinkSync(path)
    } catch {
      return null // ENOENT（不存在）或 EINVAL（存在但非软链）均归 null,由 pathExists 二次判别
    }
  },
  pathExists: (path) => {
    try {
      lstatSync(path)
      return true
    } catch {
      return false
    }
  },
  makeSymlink: (target, linkPath) => { symlinkSync(target, linkPath) },
  removePath: (path) => { unlinkSync(path) },
  chmodExec: (path) => { chmodSync(path, 0o755) },
}

// ── 软链源解析 + 上 PATH ────────────────────────────────────────────────────────────

/** 软链源:$CLAUDE_PLUGIN_ROOT/packages/cli/dist/pipeline.mjs 优先,否则 dev 回退 selfPath()。 */
export function resolvePipelineSource(env: SetupEnv): string {
  const root = env.pluginRoot()
  if (root !== null) return join(root, 'packages', 'cli', 'dist', 'pipeline.mjs')
  return env.selfPath()
}

/**
 * 把 CLI bundle 软链到 ~/.local/bin/pipeline（让用户终端能敲 pipeline）。
 * 幂等:已存在且指向同源 → 跳过;指向异源(或存在但非软链)→ 告警覆盖（自定:新装覆盖旧指向）。
 * best-effort:任何失败只 WARN 不让 setup 崩。软链本身不改 $PATH——若 ~/.local/bin 不在 PATH,附一行提示。
 */
export function ensurePipelineOnPath(deps: CliDeps, env: SetupEnv = REAL_SETUP_ENV): void {
  try {
    const source = resolvePipelineSource(env)
    const binDir = join(env.homeDir(), '.local', 'bin')
    const link = join(binDir, 'pipeline')
    env.mkdirp(binDir) // 缺 ~/.local/bin 时建目录

    const existing = env.readSymlink(link)
    if (existing === source) {
      chmodExecBestEffort(env, source) // 幂等确保源可执行,失败不阻断
      deps.io.out(`[setup] pipeline 已在 PATH:${link} → ${source}（同源,跳过）`)
      return
    }
    if (existing !== null) {
      deps.io.err(`WARN: ${link} 原指向 ${existing},本次覆盖为 ${source}（本次安装的 bundle）。`)
      env.removePath(link)
    } else if (env.pathExists(link)) {
      deps.io.err(`WARN: ${link} 已存在且非软链,本次覆盖为指向 ${source} 的软链。`)
      env.removePath(link)
    }
    env.makeSymlink(source, link)
    chmodExecBestEffort(env, source)
    deps.io.out(`[setup] 已把 pipeline 软链到 PATH:${link} → ${source}`)
    deps.io.out('  若终端仍找不到 pipeline,请确认 ~/.local/bin 在 $PATH（如 export PATH="$HOME/.local/bin:$PATH"）。')
  } catch (e) {
    deps.io.err(`WARN: 软链 pipeline 到 PATH 失败（不影响其余安装步骤,可手动软链）:${errMsg(e)}`)
  }
}

/** chmod +x 补位:bundle 构建时已 `chmod +x`,此处仅幂等补位——失败不阻断（不掩盖已成功的软链）。 */
function chmodExecBestEffort(env: SetupEnv, source: string): void {
  try {
    env.chmodExec(source)
  } catch {
    // 源可执行位无法设置（如只读挂载）也不阻断:bundle 打包时已置 +x
  }
}

// ── 计划骨架 + Phase 2/3 占位 ─────────────────────────────────────────────────────────

export interface SetupOpts {
  dryRun?: boolean
  yes?: boolean
}

/** 计划骨架三段标题（技能安装/运行时检查/就绪清单）——Phase 2/3 填真逻辑,本批仅标题 + 锚点。 */
function printPlanSkeleton(deps: CliDeps, opts: SetupOpts): void {
  deps.io.out('[setup] 全功能就绪引导 —— 计划骨架')
  deps.io.out('  1. PATH 软链:把 pipeline 软链到 ~/.local/bin（本批已实现）')
  deps.io.out('  2. 技能安装（Phase 2 待实现）:按 manifest 装齐 mandatory/recommended 技能（计划 S2）')
  deps.io.out('  3. 运行时检查（Phase 3 待实现）:docker 探测 + 缺镜像一键构建提示（计划 R1）')
  deps.io.out('  4. 全功能就绪清单（待聚合）:逐项在位/降级 红黄绿汇总')
  if (opts.dryRun) deps.io.out('  （--dry-run:仅打印计划,未软链、未写任何文件）')
}

/**
 * TODO(Phase 2 填):技能安装段——读 registry → 按 tool 分组生成命令
 * （claude-plugin / skills-cli --skill / npm / agents-inc marketplace-add）→ 装前 --list 核最新
 * → 幂等差集（扫 ~/.claude/skills + ~/.agents/skills + plugins/cache）→ 逐条容错 → 末尾汇总（强制缺红）。
 * 本批仅占位:打印待实现,exit 0 不报错。
 */
function cmdSetupSkills(deps: CliDeps, opts: SetupOpts): number {
  const suffix = opts.yes ? '（--yes 已透传,将来跳交互确认位）' : ''
  deps.io.out(`[setup skills] 技能安装段待实现（Phase 2,计划 S2）。${suffix}`)
  return 0
}

/**
 * TODO(Phase 3 填):运行时检查段——docker 探测（CLI 侧直调 `docker info`）+ 缺镜像给一键
 * `bash tools/sandcastle/build.sh` 构建提示（两 runner）。本批仅占位:打印待实现,exit 0 不报错。
 */
function cmdSetupRuntime(deps: CliDeps, opts: SetupOpts): number {
  const suffix = opts.yes ? '（--yes 已透传,将来跳交互确认位）' : ''
  deps.io.out(`[setup runtime] 运行时检查段待实现（Phase 3,计划 R1）。${suffix}`)
  return 0
}

/**
 * `pipeline setup [sub]` —— 安装后全功能就绪引导（骨架批 F3）。
 *   空 sub:① ensurePipelineOnPath（软链到 PATH;--dry-run 时跳过一切写）② 打印计划骨架。
 *   sub=skills/runtime:分派到 Phase 2/3 占位（打印待实现,exit 0）。
 *   未知 sub:stderr + exit 1（对齐 loops 未知子命令口径）。
 * --dry-run:零副作用（不软链/不写文件）;--yes:跳确认位（本批无真安装,仅透传占位）。
 * env 缺省 REAL_SETUP_ENV（真 node:fs);测试注入临时 HOME / spy 快速回归。
 */
export function cmdSetup(
  deps: CliDeps,
  sub: string | undefined,
  opts: SetupOpts,
  env: SetupEnv = REAL_SETUP_ENV,
): number {
  const o: SetupOpts = { dryRun: opts.dryRun ?? false, yes: opts.yes ?? false }
  switch (sub) {
    case undefined:
    case '':
      // 全流程骨架:先把 pipeline 弄上 PATH（dry-run 不软链）,再打印计划骨架。
      if (!o.dryRun) ensurePipelineOnPath(deps, env)
      printPlanSkeleton(deps, o)
      return 0
    case 'skills':
      return cmdSetupSkills(deps, o)
    case 'runtime':
      return cmdSetupRuntime(deps, o)
    default:
      deps.io.err(`ERROR: 未知 setup 子命令: ${sub}（支持: skills runtime,或不带子命令走全流程）`)
      return 1
  }
}
