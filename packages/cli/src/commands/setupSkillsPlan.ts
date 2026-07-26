import { dirname, join, resolve } from 'node:path'
import { readAutomationJson } from '@tenon/automation'
import { PREREQ_HINTS } from '@tenon/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { nodeExecDocker, probeAfkReadiness, type AfkReadiness, type CredLight, type ExecDockerFn } from '../afkReadiness.js'
import { REAL_RUNTIME_INSTALLER, type RuntimeInstaller } from '../runtime/installer.js'
import { resolveRuntimePaths } from '../runtime/paths.js'
import { loadSkillSources, type SkillSource, type SkillSourcesResult, type SkillTier } from '../skillSources.js'
import { REAL_RELEASED_DASHBOARD_STARTER, type ReleasedDashboardStarter } from './dashboard.js'
import {
  hostFlag,
  installedPipelineRoot,
  isNativePipelineHost,
  nativeInstallPlan,
  selectPipelineHost,
  type NativePipelineHost,
  type PipelineHost,
  type PipelineHostFlags,
} from './plugin-host.js'

// ── 注入面（测试注入临时 HOME / spy;真实现 = node:fs + os.homedir）──────────────────

import type { SetupEnv } from './setupEnvironment.js'
export type CmdGroup = 'codex-marketplace-add' | 'codex-plugin' | 'marketplace-add' | 'claude-plugin' | 'skills-cli' | 'npm'

/** 一条待执行命令 + 计划呈现所需元信息（官方/第三方、受影响全局目录、覆盖 token、tier）。 */
export interface PlannedCommand {
  group: CmdGroup
  cmd: string
  args: string[]
  /** 本命令覆盖的 registry token（去重/dedup 后可能多个,如 commit-commands 两 token 共一插件）。 */
  tokens: string[]
  /** skills-cli 的 `--skill` 名（bare-add 或非 skills-cli 时空）——计划里「装哪几个」列出可见。 */
  names: string[]
  /** skills-cli 精确请求项；用于命令 exit 0 后按真实用户级目录复核，防部分匹配假成功。 */
  skillRequests?: Array<{ token: string; name: string; tier: SkillTier }>
  /** 单技能仓 bare `npx skills add <source>`（无 --skill;仅白名单单技能源）。 */
  bareAdd: boolean
  source: string
  /** Anthropic 官方源 → true;第三方 → false（计划标注）。 */
  official: boolean
  /** 覆盖 token 里的最高裁决级（失败汇总红字与退出码用）。 */
  tier: SkillTier
  /** 受影响全局目录（~/.claude / ~/.agents/skills / 全局 npm）。 */
  globalDir: string
  /** skills-cli 装前核 id 的 `--list` 命令（应对上游改名漂移;bare-add 无）。 */
  listCmd?: { cmd: string; args: string[] }
  note?: string
}

/** registry → 分组命令计划 + 已装跳过 + 内置/本仓自带（无需安装）差集。 */
export interface SkillsPlan {
  commands: PlannedCommand[]
  alreadyInstalled: Array<{ token: string; where: string }>
  noInstall: Array<{ token: string; tool: string }>
}

/** 本机已注册的 marketplace（无需 `marketplace add`）——claude-plugins-official 随 CC 自带。 */
const REGISTERED_MARKETPLACES: ReadonlySet<string> = new Set(['claude-plugins-official'])
const TIER_RANK: Record<SkillTier, number> = { mandatory: 3, recommended: 2, conditional: 1, optional: 0 }
export const higherTier = (a: SkillTier, b: SkillTier): SkillTier => (TIER_RANK[a] >= TIER_RANK[b] ? a : b)

/** source → marketplace repo（`agents-inc` → `agents-inc/skills`;已含 '/' 原样）。 */
function marketplaceRepo(source: string): string {
  return source.includes('/') ? source : `${source}/skills`
}

/**
 * 幂等探测:~/.claude/skills、~/.agents/skills（单层子目录名）或 ~/.claude/plugins/cache 任一在位即已装。
 * plugin-cache 真实布局是**双层** cache/<marketplace>/<plugin>（对齐 main.ts scanInstalledSkillNames），
 * 故逐 marketplace 扫「有无同名 plugin」——旧单层探测 cache/<name> 恒 miss → 插件每次 setup 重装。
 */
export function skillInstalled(env: SetupEnv, name: string): boolean {
  const home = env.homeDir()
  if (env.pathExists(join(home, '.codex', 'skills', name))) return true
  if (env.pathExists(join(home, '.claude', 'skills', name))) return true
  if (env.pathExists(join(home, '.agents', 'skills', name))) return true
  const cache = join(home, '.claude', 'plugins', 'cache')
  for (const marketplace of env.listDir(cache)) {
    if (env.pathExists(join(cache, marketplace, name))) return true // marketplace/plugin 命中即已装
  }
  return false
}

function pluginInstalled(env: SetupEnv, runner: 'codex' | 'claude', source: string, id: string): boolean {
  const base = runner === 'codex' ? '.codex' : '.claude'
  return env.pathExists(join(env.homeDir(), base, 'plugins', 'cache', source, id))
}

function marketplaceInstalled(env: SetupEnv, runner: 'codex' | 'claude', source: string): boolean {
  if (REGISTERED_MARKETPLACES.has(source)) return true
  const home = env.homeDir()
  if (runner === 'codex') {
    return env.pathExists(join(home, '.codex', '.tmp', 'marketplaces', source))
      || env.pathExists(join(home, '.codex', 'plugins', 'cache', source))
  }
  return env.pathExists(join(home, '.claude', 'plugins', 'marketplaces', source))
    || env.pathExists(join(home, '.claude', 'plugins', 'cache', source))
}

/** 命令可读串（计划/汇总用）。 */
export function cmdStr(c: { cmd: string; args: string[] }): string {
  return [c.cmd, ...c.args].join(' ')
}

/**
 * 读 registry → 按 tool 分组生成命令 + 幂等差集（纯函数,只经 env.pathExists 读、绝不写/exec）。
 *   claude-plugin:Codex-first 双装：`codex plugin add` + `claude plugin install`；两侧各自按 cache
 *                 幂等，非官方 marketplace 各自先 add。同 <id>@<source> 多 token dedup 成一条。
 *   skills-cli   :按 source 聚合 `--skill <名…>`（名=skill||token);单技能仓（1 token 且无 skill 字段）→ bare add（白名单）;
 *                 已装 token 从 --skill 剔除,整组已装则整条剔除。附 `--list` 核 id 命令。
 *   npm          :`npm install -g <source>`；registry 声明 bin 且该命令已在 PATH 时幂等剔除。
 *   builtin/bundled:不生成命令（记入 noInstall）。
 *   engine       :任何 token 的 engine（如 browser-qa→playwright@claude-plugins-official）→ 附加 claude-plugin 命令,dedup。
 */
export function buildSkillsPlan(sources: SkillSource[], env: SetupEnv): SkillsPlan {
  const alreadyInstalled: Array<{ token: string; where: string }> = []
  const noInstall: Array<{ token: string; tool: string }> = []
  const codexMarketplaceAdds = new Map<string, PlannedCommand>()
  const marketplaceAdds = new Map<string, PlannedCommand>()
  const codexPluginCmds = new Map<string, PlannedCommand>()
  const pluginCmds = new Map<string, PlannedCommand>()
  const skillsBySource = new Map<string, SkillSource[]>() // source → tokens（保序）
  const npmCmds = new Map<string, PlannedCommand>() // key: source

  const ensureMarketplace = (runner: 'codex' | 'claude', source: string, official: boolean): void => {
    if (official || marketplaceInstalled(env, runner, source)) return
    const repo = marketplaceRepo(source)
    const target = runner === 'codex' ? codexMarketplaceAdds : marketplaceAdds
    if (target.has(repo)) return
    target.set(repo, runner === 'codex'
      ? {
          group: 'codex-marketplace-add', cmd: 'codex', args: ['plugin', 'marketplace', 'add', repo],
          tokens: [], names: [], bareAdd: false, source, official: false, tier: 'optional',
          globalDir: '~/.codex', note: 'Codex 非官方 marketplace',
        }
      : {
          group: 'marketplace-add', cmd: 'claude', args: ['plugin', 'marketplace', 'add', repo],
          tokens: [], names: [], bareAdd: false, source, official: false, tier: 'optional',
          globalDir: '~/.claude', note: 'Claude 非官方 marketplace',
        })
  }

  const addPluginCommand = (
    target: Map<string, PlannedCommand>, runner: 'codex' | 'claude', id: string, source: string,
    official: boolean, tier: SkillTier, tokenLabel: string, engineNote?: string,
  ): void => {
    ensureMarketplace(runner, source, official)
    const key = `${id}@${source}`
    const existing = target.get(key)
    if (existing) {
      existing.tokens.push(tokenLabel)
      existing.tier = higherTier(existing.tier, tier)
      if (engineNote) existing.note = existing.note ? `${existing.note}；${engineNote}` : engineNote
      return
    }
    target.set(key, runner === 'codex'
      ? {
          group: 'codex-plugin', cmd: 'codex', args: ['plugin', 'add', key],
          tokens: [tokenLabel], names: [], bareAdd: false, source, official, tier,
          globalDir: '~/.codex', note: engineNote,
        }
      : {
          group: 'claude-plugin', cmd: 'claude', args: ['plugin', 'install', key],
          tokens: [tokenLabel], names: [], bareAdd: false, source, official, tier,
          globalDir: '~/.claude', note: engineNote,
        })
  }

  const addPlugin = (
    id: string, source: string, official: boolean, tier: SkillTier, tokenLabel: string, engineNote?: string,
  ): void => {
    const codexReady = pluginInstalled(env, 'codex', source, id)
    const claudeReady = pluginInstalled(env, 'claude', source, id)
    if (codexReady && claudeReady) {
      alreadyInstalled.push({ token: tokenLabel, where: `Codex + Claude plugin cache:${id}` })
      return
    }
    if (!codexReady) addPluginCommand(codexPluginCmds, 'codex', id, source, official, tier, tokenLabel, engineNote)
    if (!claudeReady) addPluginCommand(pluginCmds, 'claude', id, source, official, tier, tokenLabel, engineNote)
  }

  for (const s of sources) {
    if (s.unavailable === true) {
      noInstall.push({ token: s.token, tool: 'unavailable-upstream' })
      continue
    }
    if (s.tool === 'builtin' || s.tool === 'bundled') { noInstall.push({ token: s.token, tool: s.tool }); continue }
    if (s.tool === 'claude-plugin') {
      addPlugin(s.skill ?? s.token, s.source, s.official, s.tier, s.token)
      continue
    }
    if (s.tool === 'skills-cli') {
      const g = skillsBySource.get(s.source) ?? []
      g.push(s)
      skillsBySource.set(s.source, g)
      continue
    }
    if (s.tool === 'npm') {
      if (s.bin !== undefined && env.commandExists(s.bin)) {
        alreadyInstalled.push({ token: s.token, where: `PATH:${s.bin}` })
        continue
      }
      const existing = npmCmds.get(s.source)
      if (existing) { existing.tokens.push(s.token); existing.tier = higherTier(existing.tier, s.tier); continue }
      npmCmds.set(s.source, {
        group: 'npm', cmd: 'npm', args: ['install', '-g', s.source],
        tokens: [s.token], names: [], bareAdd: false, source: s.source, official: s.official, tier: s.tier,
        globalDir: '全局 npm（npm root -g）',
      })
    }
  }

  // 引擎:任何 token 的 engine 字段 → 附加 claude-plugin 命令（去重进 pluginCmds;playwright 与显式 token 天然合并）。
  for (const s of sources) {
    if (s.unavailable === true) continue
    if (!s.engine) continue
    const at = s.engine.lastIndexOf('@')
    if (at <= 0) continue
    addPlugin(s.engine.slice(0, at), s.engine.slice(at + 1), REGISTERED_MARKETPLACES.has(s.engine.slice(at + 1)),
      s.tier, `${s.engine.slice(0, at)}(引擎)`, `附加 MCP 引擎(${s.token} 需要)`)
  }

  // skills-cli 聚合成命令（按 source;剔除已装 token）。
  const skillsCliCmds: PlannedCommand[] = []
  for (const [source, group] of skillsBySource) {
    const firstSource = group[0]
    if (!firstSource) continue
    const bareAdd = group.length === 1 && firstSource.skill === undefined // 单技能仓 bare add（白名单）
    const toInstall: SkillSource[] = []
    for (const t of group) {
      if (skillInstalled(env, t.skill ?? t.token)) alreadyInstalled.push({ token: t.token, where: '~/.agents/skills 或 ~/.claude/skills' })
      else toInstall.push(t)
    }
    if (toInstall.length === 0) continue // 整组已装 → 整条剔除
    let tier: SkillTier = 'optional'
    for (const t of toInstall) tier = higherTier(tier, t.tier)
    if (bareAdd) {
      skillsCliCmds.push({
        group: 'skills-cli', cmd: 'npx', args: ['skills', 'add', source, '-g', '-y'],
        tokens: toInstall.map((t) => t.token), names: [], bareAdd: true, source, official: firstSource.official, tier,
        globalDir: '~/.agents/skills',
      })
    } else {
      const names = toInstall.map((t) => t.skill ?? t.token)
      skillsCliCmds.push({
        group: 'skills-cli', cmd: 'npx',
        args: ['skills', 'add', source, ...names.flatMap((n) => ['--skill', n]), '-g', '-y'],
        tokens: toInstall.map((t) => t.token), names, bareAdd: false, source, official: firstSource.official, tier,
        skillRequests: toInstall.map((t) => ({ token: t.token, name: t.skill ?? t.token, tier: t.tier })),
        globalDir: '~/.agents/skills',
        listCmd: { cmd: 'npx', args: ['skills', 'add', source, '--list'] },
      })
    }
  }

  // Codex-first；每个 runtime 的 marketplace add 都严格先于其 plugin install。
  const commands = [
    ...codexMarketplaceAdds.values(), ...codexPluginCmds.values(),
    ...marketplaceAdds.values(), ...pluginCmds.values(),
    ...skillsCliCmds, ...npmCmds.values(),
  ]
  return { commands, alreadyInstalled, noInstall }
}

/** 计划呈现:分组列命令 + 官方/第三方 + 受影响全局目录 + 差集 + skills-cli 装哪几个列出可见。 */
export function renderSkillsPlan(deps: CliDeps, plan: SkillsPlan): void {
  const dirs = [...new Set(plan.commands.map((c) => c.globalDir))]
  deps.io.out(
    `[setup skills] 技能安装计划 —— 待装 ${plan.commands.length} 条命令 / 已装跳过 ${plan.alreadyInstalled.length} / ` +
      `无需或上游不可安装 ${plan.noInstall.length}`,
  )
  if (dirs.length > 0) deps.io.out(`  受影响全局目录:${dirs.join('、')}`)

  const sections: Array<[CmdGroup, string]> = [
    ['codex-marketplace-add', 'Codex 插件 · marketplace add'],
    ['codex-plugin', 'Codex 插件安装'],
    ['marketplace-add', 'claude 插件 · marketplace add（非官方源需先添加）'],
    ['claude-plugin', 'claude 插件安装'],
    ['skills-cli', 'skills CLI · 按名选装（禁整装）'],
    ['npm', 'npm 全局'],
  ]
  for (const [g, title] of sections) {
    const cs = plan.commands.filter((c) => c.group === g)
    if (cs.length === 0) continue
    deps.io.out(`  ── ${title} ──`)
    for (const c of cs) {
      const tag = c.official ? '[官方]' : '[第三方]'
      deps.io.out(`   ${cmdStr(c)}   ${tag} → ${c.globalDir}${c.note ? `  （${c.note}）` : ''}`)
      if (c.group === 'skills-cli' && !c.bareAdd) deps.io.out(`      技能(${c.names.length}):${c.names.join(', ')}`)
      else if (c.tokens.length > 0) deps.io.out(`      token:${c.tokens.join(', ')}`)
    }
  }
  if (plan.alreadyInstalled.length > 0) {
    deps.io.out(`  已装·跳过（${plan.alreadyInstalled.length}）:${plan.alreadyInstalled.map((a) => a.token).join(', ')}`)
  }
}
