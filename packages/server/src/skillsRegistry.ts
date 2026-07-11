// List all registered skills from local dirs + external registry
// Merges: skills/*/SKILL.md and skills/EXTERNAL-SKILLS.md
//
// T6(v6 计划):在纯名录之上加「已装」三源检测(口径抄老仓 pipeline-doctor.sh:121-149,
// 研究报告 §4.1)与来源分类(§4.2)。检测是标注型提示不是判据(gate 硬拦不做,拍板已定):
//   源① <claudeDir>/skills/<name>/SKILL.md —— 用户自备技能(本机全是 symlink,statSync 天然跟随);
//   源② <claudeDir>/plugins/installed_plugins.json 各插件 installPath 下 skills/*/SKILL.md,
//       排除 <claudeDir>/settings.json enabledPlugins=false 的插件(「装了但被关掉」≠已装,
//       老仓踩过的坑);明确不查 plugins/marketplaces/(市场索引缓存≠已装,同一条注释的另一坑);
//   源③ builtin 短名单(EXTERNAL-SKILLS.md「验证」段标 builtin 的四个,不落盘只能写死)。
// 命名空间 token(superpowers:brainstorming)按插件名前缀匹配判已装——装了 superpowers@* 即视为
// 其命名空间全部可用,不校验插件包内是否真含该技能(精度换实现成本,计划风险节已登记)。
// 全部探测 fail-open:任何文件缺失/损坏都按「未检出」处理,绝不让 registry 端点 500。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type SkillSource = 'local-plugin' | 'external-marketplace' | 'builtin' | 'user'

export interface SkillEntry {
  name: string
  installed: boolean
  source: SkillSource
  installCmd?: string
}

/** builtin 四件套(EXTERNAL-SKILLS.md「验证」段落标 builtin):随 Claude Code 自带,无从扫描。 */
const BUILTIN_SKILLS = new Set(['verify', 'run', 'code-review', 'security-review'])

function skillDirsIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir).filter((name) => {
      const p = join(dir, name)
      try {
        return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'))
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

function localSkillDirs(repoRoot: string): string[] {
  return skillDirsIn(join(repoRoot, 'skills'))
}

/** EXTERNAL-SKILLS.md 声明行 → { name → 所属小节标题 }(小节 = `**…**` 行,用于来源分类)。 */
function externalSkillSections(repoRoot: string): Map<string, string> {
  const p = join(repoRoot, 'skills', 'EXTERNAL-SKILLS.md')
  const out = new Map<string, string>()
  if (!existsSync(p)) return out
  let section = ''
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim()
    const h = /^\*\*(.+)\*\*$/.exec(line)
    if (h?.[1]) {
      section = h[1]
      continue
    }
    const m = /^-\s+(\S+)/.exec(line)
    if (m?.[1]) out.set(m[1], section)
  }
  return out
}

/** 三源探测结果:已检出技能名集合 + 已启用插件的名字前缀集合(命名空间 token 匹配用)。 */
export function detectInstalled(claudeDir: string): { skills: Set<string>; pluginBases: Set<string> } {
  const skills = new Set<string>(skillDirsIn(join(claudeDir, 'skills')))
  const pluginBases = new Set<string>()

  // 源②:installed_plugins.json(v2:{version, plugins: {"name@mkt": [{installPath,…}]}})
  try {
    const raw = readFileSync(join(claudeDir, 'plugins', 'installed_plugins.json'), 'utf8')
    const parsed = JSON.parse(raw) as { plugins?: Record<string, Array<{ installPath?: string }>> }
    let disabled: Record<string, unknown> = {}
    try {
      const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf8')) as {
        enabledPlugins?: Record<string, unknown>
      }
      disabled = settings.enabledPlugins ?? {}
    } catch {
      /* settings 缺失/损坏 → 视为无禁用项(fail-open) */
    }
    for (const [key, entries] of Object.entries(parsed.plugins ?? {})) {
      if (disabled[key] === false) continue // 装了但被关掉 ≠ 已装
      pluginBases.add(key.split('@')[0]!)
      for (const entry of entries ?? []) {
        if (!entry?.installPath) continue
        for (const name of skillDirsIn(join(entry.installPath, 'skills'))) skills.add(name)
      }
    }
  } catch {
    /* installed_plugins.json 缺失/损坏 → 无插件源(fail-open) */
  }

  return { skills, pluginBases }
}

/** installCmd 只给「真实可执行」的命令;user 类无标准安装命令(UI 层按 source 提示 find-skills)。 */
function installCmdFor(source: SkillSource, name: string, repoRoot: string): string | undefined {
  if (source === 'local-plugin') return `claude --plugin-dir ${repoRoot}`
  if (source === 'external-marketplace') return `claude plugin install ${name.split(':')[0]}`
  return undefined
}

export function listAllSkillsDetailed(repoRoot: string, claudeDir: string): SkillEntry[] {
  const detected = detectInstalled(claudeDir)
  const locals = new Set(localSkillDirs(repoRoot))
  const external = externalSkillSections(repoRoot)

  const names = new Set<string>([...locals, ...external.keys()])
  const entries: SkillEntry[] = []
  for (const name of [...names].sort()) {
    let source: SkillSource
    if (BUILTIN_SKILLS.has(name)) {
      source = 'builtin'
    } else if (locals.has(name)) {
      source = 'local-plugin'
    } else {
      const section = external.get(name) ?? ''
      source = /superpowers 系|commit-commands 系/.test(section) ? 'external-marketplace' : 'user'
    }

    let installed: boolean
    if (source === 'builtin') {
      installed = true
    } else if (name.includes(':')) {
      installed = detected.pluginBases.has(name.split(':')[0]!)
    } else {
      installed = detected.skills.has(name)
    }

    entries.push({
      name,
      installed,
      source,
      ...(installed ? {} : { installCmd: installCmdFor(source, name, repoRoot) }),
    })
  }
  return entries
}

export function listAllSkills(repoRoot: string): string[] {
  const merged = new Set([...localSkillDirs(repoRoot), ...externalSkillSections(repoRoot).keys()])
  return [...merged].sort()
}
