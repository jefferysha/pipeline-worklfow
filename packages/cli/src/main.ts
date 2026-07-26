#!/usr/bin/env node
/**
 * bin 入口：装配 kernel 实现 + fs 副作用，交给 buildProgram。
 *
 * ⚠️ 集成接缝（T7）：createStateStore / createFlowEngine / loadManifest 由 T2/T3 落地后
 * 从 '@tenon/kernel' re-export——在那之前本文件编译失败是预期的（plan T4 明示）。
 * 若 kernel 侧签名不同（如 loadManifest 需要 manifest.yaml 路径参数），仅调整此处装配，
 * 命令模块与测试不受影响。
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, constants as fsConstants, readdirSync, readFileSync, statSync } from 'node:fs'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CommanderError } from 'commander'
import {
  BUILTIN_TRACK_DEFINITIONS, createEffectiveSkillResolver, createFlowEngine, createHistoryWriter, createStateStore,
  createTransitionRecordStore, createWorkflowRunRepository, loadManifest, loadTrackRegistry, loadWorkflow,
  fingerprintWorkspace, mutateTrackRegistry, readSecrets, registerProjectRoot,
  withTrackRegistryLock,
} from '@tenon/kernel'
import { readAutomationJson } from '@tenon/automation'
import { tapStatus } from '@tenon/tap'
import type { ExtendedManifestData, TrackRegistry, TrackValidationContext } from '@tenon/kernel'
import type { CliDeps, DoctorProbes, GateMarkerInfo } from './deps.js'
import { probeAfkReadiness } from './afkReadiness.js'
import { splitPassthroughArgv } from './argv.js'
import { buildProgram, CliExit } from './program.js'
import { createProductionTriageRuntime } from './commands/triage.js'
import { listChangeDirs, listChanges, makeGuardCtx } from './guardContext.js'
import { REAL_RUNTIME_INSTALLER } from './runtime/installer.js'
import { resolveRuntimePaths } from './runtime/paths.js'

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
 * 运行期定位插件仓根：编译产物在 packages/cli/dist/main.js，
 * 根 = 其上三级（dist → cli → packages → 根）。loadManifest 不猜仓库根（T3 约定）。
 */
function pluginRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
}

function manifestPath(): string {
  return join(pluginRoot(), 'templates', 'manifest.yaml')
}

/**
 * Track Registry 校验上下文（GOAL.md 清单 T · R2）：
 *  - workflowExists 复用 loadWorkflow（'default' 恒存在，其余按 .pipeline/workflows/<id>.yaml 是否可载）；
 *  - skillProfiles = 内建轨 skill profile（pm/frontend/backend，即 manifest 现行 skill 表 track 键）
 *    ∪ manifest 两表已声明的非 '_all' 键。缺 tracks.yaml 时 registry=内建 Track、本上下文不会被查
 *    （validateTrackRegistry 只在 tracks.yaml 存在时跑），此处仍如实构造，让自定义 tracks.yaml 能过校验。
 * skill profile 键空间改名属清单 T 的 R5 阶段（见 GOAL.md）——R2 不改 manifest 结构，只按现行键派生。
 */
function trackValidationContext(repoRoot: string, manifest: ExtendedManifestData): TrackValidationContext {
  const skillProfiles = new Set<string>()
  for (const t of BUILTIN_TRACK_DEFINITIONS) {
    if (t.policyProfile.skills.profile !== '_all') skillProfiles.add(t.policyProfile.skills.profile)
  }
  for (const table of [manifest.mandatorySkills, manifest.recommendedSkills]) {
    for (const row of Object.values(table)) {
      for (const key of Object.keys(row)) if (key !== '_all') skillProfiles.add(key)
    }
  }
  return {
    workflowExists: (id) => {
      if (id === 'default') return true
      try {
        return loadWorkflow(repoRoot, id) !== null
      } catch {
        return false
      }
    },
    skillProfiles,
  }
}

/**
 * Read the release version from the native host manifests. Codex is preferred because it is the
 * canonical marketplace package; Claude remains a compatibility fallback for an older checkout.
 */
function readPluginVersion(): string {
  for (const rel of [
    ['.codex-plugin', 'plugin.json'],
    ['.claude-plugin', 'plugin.json'],
  ]) {
    try {
      const raw = readFileSync(join(pluginRoot(), ...rel), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      const version = typeof parsed === 'object' && parsed !== null && 'version' in parsed
        ? parsed.version
        : undefined
      if (typeof version === 'string' && version.trim() !== '') return version
    } catch {
      // Try the compatibility manifest before falling back to unknown.
    }
  }
  return 'unknown'
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
 * 读 ~/.claude/settings.json 的 enabledPlugins 里**被显式禁用**（值 === false）的插件键集合
 * （对齐老仓 pipeline-doctor.sh:120-134 _disabled_cache_dirs）。键形如 `<plugin>@<marketplace>`
 * （如 ecc@ecc / figma@claude-plugins-official）。禁用插件的 cache 目录仍在盘上，但 CC **不加载**，
 * 算进「已装」是假阳性（典型:verify/verification-loop 只躺被禁的 ECC cache → 实际加载不到）。
 * fail-safe:文件缺失/坏 JSON/无 enabledPlugins → 空集（不过滤，优雅退化为旧行为，同老脚本 python3 缺则不过滤）。
 */
function readDisabledPluginKeys(): Set<string> {
  const disabled = new Set<string>()
  try {
    const raw = readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    const ep = typeof parsed === 'object' && parsed !== null && 'enabledPlugins' in parsed
      ? parsed.enabledPlugins
      : undefined
    if (ep !== null && typeof ep === 'object') {
      for (const [key, val] of Object.entries(ep)) if (val === false) disabled.add(key)
    }
  } catch {
    // settings.json 缺失/坏 JSON/无 enabledPlugins → 不过滤（同老脚本优雅退化）
  }
  return disabled
}

/**
 * 本机已安装技能/插件「能力名」扫描（full-install 批2 A1 + 批2 S3；对齐老仓 pipeline-doctor.sh:121/120-141 口径）：
 *   · ~/.claude/skills、~/.agents/skills 的直接子目录名 = skill 名（`npx skills add` 默认落 .agents/skills）
 *   · ~/.claude/plugins/cache/<marketplace>/<plugin> 的插件名 + 其 skills/ 子目录名
 *     ——被 settings.json enabledPlugins.<plugin@marketplace>=false 显式禁用的插件**整个排除**（CC 不加载，
 *       算在位即假 green;禁用键 = `<plugin>@<marketplace>`，对上 cache/<marketplace>/<plugin> 目录）。
 * 全程 fail-safe（缺根目录/坏 settings.json 跳过），供 doctor checkSkills 判在位。
 */
function scanInstalledSkillNames(): Set<string> {
  const home = homedir()
  const names = new Set<string>()
  for (const n of safeReaddirDirs(join(home, '.claude', 'skills'))) names.add(n)
  for (const n of safeReaddirDirs(join(home, '.agents', 'skills'))) names.add(n)
  const cache = join(home, '.claude', 'plugins', 'cache')
  const disabledPlugins = readDisabledPluginKeys() // enabledPlugins.<plugin@marketplace>=false → 排除
  for (const marketplace of safeReaddirDirs(cache)) {
    const mktDir = join(cache, marketplace)
    for (const plugin of safeReaddirDirs(mktDir)) {
      if (disabledPlugins.has(`${plugin}@${marketplace}`)) continue // 被禁插件 CC 不加载 → 不算在位（避假 green）
      names.add(plugin) // 插件名（superpowers / commit-commands / frontend-design …）
      for (const skill of safeReaddirDirs(join(mktDir, plugin, 'skills'))) names.add(skill)
    }
  }
  return names
}

/**
 * Codex discovers skills from an installed native plugin as well as an explicit project adapter;
 * it does not execute arbitrary cache contents merely because a source happens to be on disk.
 * Keep this probe separate from the broad cross-host cache scanner: package root and project
 * adapter are discovery surfaces, cache directories alone are not.
 */
function scanCodexProjectSkillNames(cwd: string, root: string): Set<string> {
  const names = new Set<string>()
  for (const skillsRoot of [join(root, 'skills'), join(cwd, '.agents', 'skills')]) {
    for (const name of safeReaddirDirs(skillsRoot)) {
      try {
        if (statSync(join(skillsRoot, name, 'SKILL.md')).isFile()) names.add(name)
      } catch {
        // A dangling/unreadable link is not an installed Codex skill.
      }
    }
  }
  return names
}

function scanSkillDigests(skillsRoot: string): Map<string, string> {
  const digests = new Map<string, string>()
  for (const name of safeReaddirDirs(skillsRoot)) {
    try {
      const skillPath = join(skillsRoot, name, 'SKILL.md')
      if (!statSync(skillPath).isFile()) continue
      digests.set(name, createHash('sha256').update(readFileSync(skillPath)).digest('hex'))
    } catch {
      // Unreadable/dangling entries are not active Skills; missing coverage remains visible.
    }
  }
  return digests
}

/**
 * doctor 探针（BACKLOG #26b）：环境/fs 事实采集的 node 落地，裁决归 cmdDoctor。
 * 各探针独立 fail-safe（fs 异常按「不存在/不可执行」处理）——doctor 要能在坏环境里跑完。
 */
function makeDoctorProbes(runtimePaths: ReturnType<typeof resolveRuntimePaths>): DoctorProbes {
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
    nativeRuntimeHost: async () => {
      const host = (await REAL_RUNTIME_INSTALLER.inspect(homedir())).active?.source.host
      return host === 'codex' || host === 'claude' ? host : null
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
    codexProjectSkillNames: () => scanCodexProjectSkillNames(process.cwd(), root),
    codexSkillDiscovery: () => ({
      selectedRoot: root,
      projectRoot: join(process.cwd(), '.agents', 'skills'),
      selected: scanSkillDigests(join(root, 'skills')),
      project: scanSkillDigests(join(process.cwd(), '.agents', 'skills')),
    }),
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
        secretsEnv: readSecrets(runtimePaths.secretsPath).keys,
        hostEnv: process.env,
        defaultCodexHome: join(homedir(), '.codex'),
      }),
  }
}

async function main(): Promise<void> {
  const runtimePaths = resolveRuntimePaths({ env: process.env, homeDir: homedir() })
  const manifest = loadManifest(manifestPath())
  const { toParse, passthrough } = splitPassthroughArgv(process.argv)
  const store = createStateStore()
  // Track Registry：装配处构造上下文，**每次从盘 fresh-load、不跨命令记忆化**（R3 D4）。只读
  // 命令走 loadRegistry；init/fields 组合校验走 withRegistryLock（registry 锁内 fresh-load）；
  // tracks CRUD 走 mutateRegistry（mutate-under-lock）。坏 tracks.yaml 只 fail-loud 到相关命令。
  const trackCtx = trackValidationContext(process.cwd(), manifest)
  const runRepo = createWorkflowRunRepository({
    store,
    recordStore: createTransitionRecordStore(),
    clock: isoNow,
  })
  const deps: CliDeps = {
    // H10 §1/§8任务7：skill_bundle_id 存在性语义校验器——直接复用上面 trackCtx.skillProfiles
    // （T 线 tracks/validate.ts::profileOk 消费的同一份集合：BUILTIN_TRACK_DEFINITIONS 非 `_all`
    // policy profile ∪ manifest 两表已声明的非 `_all` track 键），零额外 manifest 解析/新正则。
    // afk.ts 的 cmdAfk('run') 装配 createLoopAdmission 时转发本字段；loop-run.ts 的 --dry-run
    // wiring 预览同样消费（见 deps.ts 头注）。
    isSkillProfileKnown: (id) => trackCtx.skillProfiles.has(id),
    store,
    runRepo,
    loadRegistry: () => loadTrackRegistry(process.cwd(), trackCtx),
    withRegistryLock: (cb) => withTrackRegistryLock(process.cwd(), trackCtx, cb),
    mutateRegistry: (cb) => mutateTrackRegistry(process.cwd(), trackCtx, cb),
    flow: createFlowEngine(manifest),
    // T-R6：artifact 按现载 track registry 映射 skill profile；loader 每次 fresh-read，避免同进程
    // tracks CRUD 后复用旧快照。H10 skill bundle 走 resolver 的显式 profile 入口，不受此映射干扰。
    resolver: createEffectiveSkillResolver({
      registry: () => loadTrackRegistry(process.cwd(), trackCtx),
      manifest,
    }),
    cwd: process.cwd(),
    env: (name) => process.env[name],
    io: {
      out: (line: string) => process.stdout.write(`${line}\n`),
      err: (line: string) => process.stderr.write(`${line}\n`),
    },
    clock: isoNow,
    listChanges,
    listChangeDirs,
    guardCtx: makeGuardCtx(process.cwd()),
    doctor: makeDoctorProbes(runtimePaths),
    readGateMarkers: () => readGateMarkers(process.cwd()),
    writeBreadcrumb: (dir, content) => writeFile(join(dir, '.breadcrumb'), content, 'utf8'),
    history: createHistoryWriter(),
    // init 成功后 best-effort 登记项目根到 Tenon config root 的 projects.json
    registerProject: async (repoRoot) => {
      await registerProjectRoot(runtimePaths.registryPath, repoRoot)
    },
    // v6 T2：afk run 凭证注入——机器级 secrets 读成 env 形状（kernel readSecrets 自身 fail-open，
    // 缺失/损坏 → 空 keys）；值不落日志。
    readSecretsEnv: async () => readSecrets(runtimePaths.secretsPath).keys,
    readHistoryRaw: async (dir) => {
      try {
        return await readFile(join(dir, '.pipeline-history.jsonl'), 'utf8')
      } catch {
        return ''
      }
    },
    gitHeadSha: () => gitHeadSha(process.cwd()),
    workspaceFingerprint: () => fingerprintWorkspace(process.cwd()),
    writeReviewMarker: (content) => writeFile(join(process.cwd(), '.pipeline-pending-review'), content, 'utf8'),
    clearReviewMarker: () => rm(join(process.cwd(), '.pipeline-pending-review'), { force: true }),
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
    await buildProgram(deps, {
      triage: createProductionTriageRuntime({
        repoRoot: deps.cwd,
        store,
        runRepository: runRepo,
        clock: isoNow,
      }),
    }).parseAsync(toParse)
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
