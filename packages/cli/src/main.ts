#!/usr/bin/env node
/**
 * bin 入口：装配 kernel 实现 + fs 副作用，交给 buildProgram。
 *
 * ⚠️ 集成接缝（T7）：createStateStore / createFlowEngine / loadManifest 由 T2/T3 落地后
 * 从 '@pipeline-lite/kernel' re-export——在那之前本文件编译失败是预期的（plan T4 明示）。
 * 若 kernel 侧签名不同（如 loadManifest 需要 manifest.yaml 路径参数），仅调整此处装配，
 * 命令模块与测试不受影响。
 */
import { execFile } from 'node:child_process'
import { accessSync, constants as fsConstants, readdirSync, readFileSync, statSync } from 'node:fs'
import { access, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CommanderError } from 'commander'
import {
  createFlowEngine, createHistoryWriter, createStateStore, loadManifest,
  projectRegistryPath, readSecrets, registerProjectRoot, secretsPath,
} from '@pipeline-lite/kernel'
import { readAutomationJson } from '@pipeline-lite/automation'
import { tapStatus } from '@pipeline-lite/tap'
import type { GuardContext } from '@pipeline-lite/kernel'
import type { CliDeps, DoctorProbes, GateMarkerInfo } from './deps.js'
import { probeAfkReadiness } from './afkReadiness.js'
import { buildProgram, CliExit } from './program.js'

/** ISO8601 UTC 秒级（对齐老内核 date -u +%Y-%m-%dT%H:%M:%SZ 口径） */
function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * `git rev-parse HEAD` 的 stdout（失败也取 stdout——对齐老内核
 * `$(git rev-parse HEAD 2>/dev/null || echo "")`：unborn 仓捕获字面 "HEAD"，T6 实测怪癖）。
 */
function gitHeadSha(cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', 'HEAD'], { cwd }, (_err, stdout) => {
      resolve((stdout ?? '').trim())
    })
  })
}

async function listChanges(changesRoot: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(changesRoot, { withFileTypes: true })
  } catch {
    return []
  }
  const names: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'archive') continue
    try {
      await access(join(changesRoot, entry.name, '.pipeline.yaml'))
      names.push(entry.name)
    } catch {
      // 无 .pipeline.yaml 的目录不算 pipeline change
    }
  }
  return names.sort()
}

/** 项目根三门 marker（缺失即不在收件箱；新鲜判定归 inbox 命令） */
async function readGateMarkers(cwd: string): Promise<GateMarkerInfo[]> {
  const out: GateMarkerInfo[] = []
  for (const kind of ['confirm', 'review', 'interaction'] as const) {
    try {
      const p = join(cwd, `.pipeline-pending-${kind}`)
      const st = await stat(p)
      out.push({ kind, ageMs: Date.now() - st.mtimeMs, raw: await readFile(p, 'utf8') })
    } catch {
      // 缺失 = 无该门等待
    }
  }
  return out
}

/**
 * check 命令的 guard 文件面（BACKLOG #12）：GuardContext 的 node:fs 落地。
 * 老 guard 在项目根跑 bash `[ -f ]` 等谓词——此处以 cwd 为根做同义解析；
 * 谓词为同步纯读（guardCheck 是纯函数签名），任何 fs 异常一律按「不存在」处理。
 */
function makeGuardCtx(cwd: string): (name: string) => GuardContext {
  const abs = (relPath: string) => join(cwd, relPath)
  return (name: string): GuardContext => ({
    changeDirRel: `openspec/changes/${name}`,
    fileExists: (p) => {
      try { return statSync(abs(p)).isFile() } catch { return false }
    },
    fileNonempty: (p) => {
      try { const st = statSync(abs(p)); return st.isFile() && st.size > 0 } catch { return false }
    },
    readFile: (p) => {
      try { return readFileSync(abs(p), 'utf8') } catch { return undefined }
    },
    dirExists: (p) => {
      try { return statSync(abs(p)).isDirectory() } catch { return false }
    },
    // 老 guard：find openspec/changes/archive -mindepth 1 -maxdepth 1 -type d -name "*-<dep>"
    changeArchived: (dep) => {
      try {
        return readdirSync(abs('openspec/changes/archive'), { withFileTypes: true })
          .some((e) => e.isDirectory() && e.name.endsWith(`-${dep}`))
      } catch { return false }
    },
    // 调度器执行路径旁路（老 guard PIPELINE_AUTOMATION_RUNNER=1 语义）
    automationRunner: process.env.PIPELINE_AUTOMATION_RUNNER === '1',
  })
}

/**
 * 运行期定位插件仓根：编译产物在 packages/cli/dist/main.js，
 * 根 = 其上三级（dist → cli → packages → 根）。loadManifest 不猜仓库根（T3 约定）。
 */
function pluginRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
}

function manifestPath(): string {
  return join(pluginRoot(), 'templates', 'manifest.yaml')
}

/** 读 .claude-plugin/plugin.json 的版本（sync cliVersion 真相源；失败 → 'unknown'） */
function readPluginVersion(): string {
  try {
    const raw = readFileSync(join(pluginRoot(), '.claude-plugin', 'plugin.json'), 'utf8')
    return (JSON.parse(raw) as { version?: string }).version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/** readdir 只取子目录/符号链接名（缺目录/无权限 → []，fail-safe）；skill 常以 symlink 装入，故含 symlink。 */
function safeReaddirDirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() || e.isSymbolicLink())
      .map((e) => e.name)
  } catch {
    return []
  }
}

/**
 * 本机已安装技能/插件「能力名」扫描（full-install 批2 A1；对齐老仓 pipeline-doctor.sh:121 口径）：
 *   · ~/.claude/skills、~/.agents/skills 的直接子目录名 = skill 名（`npx skills add` 默认落 .agents/skills）
 *   · ~/.claude/plugins/cache/<marketplace>/<plugin> 的插件名 + 其 skills/ 子目录名
 * 纯目录扫描（本批口径；enabledPlugins=false 精确排除后续再补，设计 spec §Phase2 已登记）。
 * 全程 fail-safe（缺根目录跳过），供 doctor checkSkills 判在位。
 */
function scanInstalledSkillNames(): Set<string> {
  const home = homedir()
  const names = new Set<string>()
  for (const n of safeReaddirDirs(join(home, '.claude', 'skills'))) names.add(n)
  for (const n of safeReaddirDirs(join(home, '.agents', 'skills'))) names.add(n)
  const cache = join(home, '.claude', 'plugins', 'cache')
  for (const marketplace of safeReaddirDirs(cache)) {
    const mktDir = join(cache, marketplace)
    for (const plugin of safeReaddirDirs(mktDir)) {
      names.add(plugin) // 插件名（superpowers / commit-commands / frontend-design …）
      for (const skill of safeReaddirDirs(join(mktDir, plugin, 'skills'))) names.add(skill)
    }
  }
  return names
}

/**
 * doctor 探针（BACKLOG #26b）：环境/fs 事实采集的 node 落地，裁决归 cmdDoctor。
 * 各探针独立 fail-safe（fs 异常按「不存在/不可执行」处理）——doctor 要能在坏环境里跑完。
 */
function makeDoctorProbes(): DoctorProbes {
  const root = pluginRoot()
  return {
    nodeVersion: () => process.version,
    gitAvailable: () =>
      new Promise((resolve) => {
        execFile('git', ['--version'], (err) => resolve(!err))
      }),
    pluginRoot: root,
    manifestError: () => {
      try {
        loadManifest(manifestPath())
        return null
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    },
    fileExists: (p) => {
      try { return statSync(p).isFile() } catch { return false }
    },
    fileExecutable: (p) => {
      try { accessSync(p, fsConstants.X_OK); return true } catch { return false }
    },
    dirExists: (p) => {
      try { return statSync(p).isDirectory() } catch { return false }
    },
    env: (name) => process.env[name],
    // 接入判定与 statusline.sh 头注释的接入方式同口径：settings.json 里引用了该脚本即算接入
    statuslineConfigured: () => {
      try {
        return readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8').includes('statusline.sh')
      } catch {
        return false
      }
    },
    runVerifySkills: () =>
      new Promise((resolve) => {
        execFile(
          'bash',
          [join(root, 'tools', 'verify-skills.sh'), '--quiet'],
          { timeout: 30_000 },
          (err, stdout, stderr) => {
            const errCode = (err as { code?: unknown } | null)?.code
            const code = err ? (typeof errCode === 'number' ? errCode : 1) : 0
            resolve({ code, output: `${stdout ?? ''}${stderr ?? ''}` })
          },
        )
      }),
    // BACKLOG #34e：tap 敏感能力状态供 doctor 明示（读 tap 本地状态，无副作用）
    tapStatus: () => {
      const s = tapStatus()
      return { intercepting: s.intercepting, captureEnabled: s.captureEnabled, message: s.message }
    },
    // 缺技能检测（批2 A1）：本机安装位扫描 + manifest 两表派生（bundle 里正确路径锚在此）
    installedSkillNames: () => scanInstalledSkillNames(),
    manifestSkills: () => {
      try {
        const m = loadManifest(manifestPath())
        return { mandatory: m.mandatorySkills, recommended: m.recommendedSkills }
      } catch {
        return null // 解析失败 → checkSkills 出 yellow「无法核技能」，不误报 green
      }
    },
    // AFK 运行时就绪探测（R1）：真 execFile docker（超时/spawn 失败降级不抛）+ 凭证注入——
    // 镜像同 afk run 口径（.pipeline/automation.json 的 image ?? sandcastle:local，读 process.cwd()）；
    // 凭证 secretsEnv 走机器级 secrets（readSecrets 自身 fail-open），hostEnv 走 process.env（宿主>文件）；
    // 值永不回显（探针只回 set+source）。docker 缺是常态：doctor checkAfk 据 available 出 yellow 非 red。
    afkReadiness: () =>
      probeAfkReadiness({
        image: readAutomationJson(process.cwd()).image ?? 'sandcastle:local',
        secretsEnv: readSecrets(secretsPath(homedir())).keys,
        hostEnv: process.env,
      }),
  }
}

/**
 * 从原始 argv 里手工切出 `-- <passthrough...>` 段，绕开 commander 一个真实 bug（见 deps.ts
 * passthroughArgv 顶注）：交给 commander 解析的数组**不含** `--` 本身，故它自己的内部状态机
 * 不会有机会误吞；passthrough 段整体经 CliDeps 单独传递，`--` 之前的部分才走 commander。
 */
function splitPassthroughArgv(argv: readonly string[]): { toParse: string[]; passthrough?: string[] } {
  const idx = argv.indexOf('--', 2) // 跳过 argv[0]=node、argv[1]=脚本路径，只在真实参数区找
  if (idx === -1) return { toParse: [...argv] }
  return { toParse: argv.slice(0, idx), passthrough: argv.slice(idx + 1) }
}

async function main(): Promise<void> {
  const manifest = loadManifest(manifestPath())
  const { toParse, passthrough } = splitPassthroughArgv(process.argv)
  const deps: CliDeps = {
    store: createStateStore(),
    flow: createFlowEngine(manifest),
    cwd: process.cwd(),
    io: {
      out: (line: string) => process.stdout.write(`${line}\n`),
      err: (line: string) => process.stderr.write(`${line}\n`),
    },
    clock: isoNow,
    listChanges,
    guardCtx: makeGuardCtx(process.cwd()),
    doctor: makeDoctorProbes(),
    readGateMarkers: () => readGateMarkers(process.cwd()),
    writeBreadcrumb: (dir, content) => writeFile(join(dir, '.breadcrumb'), content, 'utf8'),
    history: createHistoryWriter(),
    // 决策 D（v5 T2）：init 成功后 best-effort 登记项目根到 ~/.claude/pipeline-projects.json
    registerProject: async (repoRoot) => {
      await registerProjectRoot(projectRegistryPath(homedir()), repoRoot)
    },
    // v6 T2：afk run 凭证注入——机器级 secrets 读成 env 形状（kernel readSecrets 自身 fail-open，
    // 缺失/损坏 → 空 keys）；值不落日志。
    readSecretsEnv: async () => readSecrets(secretsPath(homedir())).keys,
    readHistoryRaw: async (dir) => {
      try {
        return await readFile(join(dir, '.pipeline-history.jsonl'), 'utf8')
      } catch {
        return ''
      }
    },
    gitHeadSha: () => gitHeadSha(process.cwd()),
    writeReviewMarker: (content) => writeFile(join(process.cwd(), '.pipeline-pending-review'), content, 'utf8'),
    pluginVersion: readPluginVersion(),
    readInstalledPlugins: async () => {
      for (const p of [join(pluginRoot(), '..', 'installed_plugins.json'), join(process.env.HOME ?? '', '.claude', 'installed_plugins.json')]) {
        try { return await readFile(p, 'utf8') } catch { /* 试下一个 */ }
      }
      return undefined
    },
    passthroughArgv: passthrough,
  }

  try {
    await buildProgram(deps).parseAsync(toParse)
  } catch (e) {
    if (e instanceof CliExit) {
      process.exitCode = e.code
    } else if (e instanceof CommanderError) {
      // usage error / help 展示；commander 已把消息写去 stderr（configureOutput）
      process.exitCode = e.exitCode
    } else {
      process.stderr.write(`ERROR: ${e instanceof Error ? e.message : String(e)}\n`)
      process.exitCode = 1
    }
  }
}

void main()
