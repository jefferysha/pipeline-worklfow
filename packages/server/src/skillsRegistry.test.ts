import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectInstalled, listAllSkills, listAllSkillsDetailed } from './skillsRegistry.js'

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'skills-reg-'))
  await mkdir(join(root, 'skills', 'pipeline-open'), { recursive: true })
  await writeFile(join(root, 'skills', 'pipeline-open', 'SKILL.md'), '# pipeline-open\n', 'utf8')
  await mkdir(join(root, 'skills', 'pipeline-build'), { recursive: true })
  await writeFile(join(root, 'skills', 'pipeline-build', 'SKILL.md'), '# pipeline-build\n', 'utf8')
  await writeFile(
    join(root, 'skills', 'EXTERNAL-SKILLS.md'),
    '# External\n\n## 已声明依赖\n\n- superpowers:brainstorming\n- grill-with-docs\n',
    'utf8',
  )
  return root
}

describe('listAllSkills', () => {
  it('合并本地 skills/*/SKILL.md 目录名 + EXTERNAL-SKILLS.md 已声明依赖列表，去重排序', async () => {
    const root = await makeRepo()
    const result = listAllSkills(root)
    expect(result).toEqual(['grill-with-docs', 'pipeline-build', 'pipeline-open', 'superpowers:brainstorming'])
  })

  it('EXTERNAL-SKILLS.md 不存在时不报错，只返回本地目录', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skills-reg-nolocal-'))
    await mkdir(join(root, 'skills', 'pipeline-open'), { recursive: true })
    await writeFile(join(root, 'skills', 'pipeline-open', 'SKILL.md'), '# x\n', 'utf8')
    expect(listAllSkills(root)).toEqual(['pipeline-open'])
  })
})

// ── T6(v6 计划):skills「已装」三源检测 + registry 明细化 ──
// 真 fs 测试(mkdtemp 临时目录,零 mock)。三源口径抄老仓 pipeline-doctor.sh:121-149
// (研究报告 §4.1):① ~/.claude/skills/<name>/SKILL.md(跟随 symlink);
// ② installed_plugins.json 各插件 installPath 下 skills/*/SKILL.md,排除 settings.json
//   enabledPlugins=false 的插件(「装了但被关掉」不算已装);
// ③ builtin 短名单 verify/run/code-review/security-review(不落盘,只能写死)。
// 命名空间 token(superpowers:*)按插件前缀匹配判已装——badge 是标注不是判据,
// 精度换实现成本(计划 T6 设计决策,风险节已登记)。

let base: string
let repoRoot: string
let claudeDir: string

function seedRepoSync(): void {
  for (const name of ['pipeline-open', 'openspec-propose']) {
    mkdirSync(join(repoRoot, 'skills', name), { recursive: true })
    writeFileSync(join(repoRoot, 'skills', name, 'SKILL.md'), '# skill\n')
  }
  writeFileSync(
    join(repoRoot, 'skills', 'EXTERNAL-SKILLS.md'),
    [
      '# EXTERNAL-SKILLS — 外部 skill 依赖显式清单',
      '',
      '## 已声明依赖',
      '',
      '**superpowers 系（工作流方法论）**',
      '- superpowers:brainstorming — 深度设计/需求对话',
      '',
      '**commit-commands 系**',
      '- commit-commands:commit-push-pr — 提交+push+PR',
      '',
      '**调研 / 提问**',
      '- grill-with-docs — 领域知识压测（一次一问）',
      '',
      '**验证**',
      '- browser-qa — 浏览器走查',
      '- verify — 真跑 app 验证（builtin）',
      '- run — 启动 app（builtin）',
      '- security-review — 安全专项（builtin）',
      '- code-review — 代码评审（builtin）',
      '',
    ].join('\n'),
  )
}

function seedClaudeDir(): void {
  // 源①:用户自备技能目录(真目录一个 + symlink 一个——本机 17 条全是 symlink,必须跟随)
  mkdirSync(join(claudeDir, 'skills', 'grill-with-docs'), { recursive: true })
  writeFileSync(join(claudeDir, 'skills', 'grill-with-docs', 'SKILL.md'), '# g\n')
  const linkTarget = join(base, 'elsewhere', 'linked-skill')
  mkdirSync(linkTarget, { recursive: true })
  writeFileSync(join(linkTarget, 'SKILL.md'), '# l\n')
  symlinkSync(linkTarget, join(claudeDir, 'skills', 'linked-skill'))

  // 源②:installed_plugins.json(v2 形状对齐本机真实文件)+ enabledPlugins=false 排除
  const spPath = join(base, 'cache', 'superpowers')
  mkdirSync(join(spPath, 'skills', 'handoff'), { recursive: true })
  writeFileSync(join(spPath, 'skills', 'handoff', 'SKILL.md'), '# h\n')
  const ghostPath = join(base, 'cache', 'ghostplug')
  mkdirSync(join(ghostPath, 'skills', 'ghost-skill'), { recursive: true })
  writeFileSync(join(ghostPath, 'skills', 'ghost-skill', 'SKILL.md'), '# x\n')
  mkdirSync(join(claudeDir, 'plugins'), { recursive: true })
  writeFileSync(
    join(claudeDir, 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'superpowers@claude-plugins-official': [{ scope: 'user', installPath: spPath, version: '6.1.1' }],
        'ghostplug@somewhere': [{ scope: 'user', installPath: ghostPath, version: '1.0.0' }],
      },
    }),
  )
  writeFileSync(
    join(claudeDir, 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'superpowers@claude-plugins-official': true, 'ghostplug@somewhere': false } }),
  )
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'skreg-t6-'))
  repoRoot = join(base, 'repo')
  claudeDir = join(base, 'home', '.claude')
  mkdirSync(repoRoot, { recursive: true })
  mkdirSync(claudeDir, { recursive: true })
  seedRepoSync()
  seedClaudeDir()
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('detectInstalled —— 三源探测', () => {
  it('源①:~/.claude/skills 目录含 SKILL.md 即已装,symlink 跟随', () => {
    const d = detectInstalled(claudeDir)
    expect(d.skills.has('grill-with-docs')).toBe(true)
    expect(d.skills.has('linked-skill')).toBe(true)
  })

  it('源②:已装且启用的插件 installPath 下技能计入;enabledPlugins=false 的插件整体排除', () => {
    const d = detectInstalled(claudeDir)
    expect(d.skills.has('handoff')).toBe(true)
    expect(d.skills.has('ghost-skill')).toBe(false)
    expect(d.pluginBases.has('superpowers')).toBe(true)
    expect(d.pluginBases.has('ghostplug')).toBe(false)
  })

  it('claudeDir 不存在时 fail-open 返回空集,不抛错', () => {
    const d = detectInstalled(join(base, 'no-such-dir'))
    expect(d.skills.size).toBe(0)
    expect(d.pluginBases.size).toBe(0)
  })
})

describe('listAllSkillsDetailed —— SkillEntry 明细', () => {
  it('本仓 skills/ 目录 → local-plugin;未装时 installCmd 给 --plugin-dir 装法', () => {
    const entries = listAllSkillsDetailed(repoRoot, claudeDir)
    const e = entries.find((x) => x.name === 'pipeline-open')!
    expect(e.source).toBe('local-plugin')
    expect(e.installed).toBe(false)
    expect(e.installCmd).toContain(`claude --plugin-dir ${repoRoot}`)
  })

  it('命名空间 token 按插件前缀匹配判已装:superpowers:* 已装,commit-commands:* 未装', () => {
    const entries = listAllSkillsDetailed(repoRoot, claudeDir)
    const sp = entries.find((x) => x.name === 'superpowers:brainstorming')!
    expect(sp.source).toBe('external-marketplace')
    expect(sp.installed).toBe(true)
    const cc = entries.find((x) => x.name === 'commit-commands:commit-push-pr')!
    expect(cc.source).toBe('external-marketplace')
    expect(cc.installed).toBe(false)
    expect(cc.installCmd).toBe('claude plugin install commit-commands')
  })

  it('用户自备类:在 ~/.claude/skills 命中即已装;未命中 installed:false 且无 installCmd(无真实可执行安装命令,UI 层按 source 给 find-skills 提示)', () => {
    const entries = listAllSkillsDetailed(repoRoot, claudeDir)
    const g = entries.find((x) => x.name === 'grill-with-docs')!
    expect(g.source).toBe('user')
    expect(g.installed).toBe(true)
    const b = entries.find((x) => x.name === 'browser-qa')!
    expect(b.source).toBe('user')
    expect(b.installed).toBe(false)
    expect(b.installCmd).toBeUndefined()
  })

  it('builtin 四件套恒 installed:true、source:builtin(不落盘,无法扫描,只能写死)', () => {
    const entries = listAllSkillsDetailed(repoRoot, claudeDir)
    for (const name of ['verify', 'run', 'code-review', 'security-review']) {
      const e = entries.find((x) => x.name === name)!
      expect(e.source).toBe('builtin')
      expect(e.installed).toBe(true)
      expect(e.installCmd).toBeUndefined()
    }
  })

  it('按 name 排序且去重;claudeDir 缺失时除 builtin 外全部 installed:false(fail-open)', () => {
    const entries = listAllSkillsDetailed(repoRoot, join(base, 'no-such-dir'))
    const names = entries.map((x) => x.name)
    expect(names).toEqual([...new Set(names)].sort())
    for (const e of entries) {
      expect(e.installed).toBe(e.source === 'builtin')
    }
  })

  it('listAllSkills 保持薄封装兼容:返回与明细同集合的纯名字排序数组', () => {
    const names = listAllSkills(repoRoot)
    const detailed = listAllSkillsDetailed(repoRoot, claudeDir).map((x) => x.name)
    expect(names).toEqual(detailed)
  })
})
