/**
 * skillSources.test —— registry 载入器（批 2 Wave A · S1）。
 * 真 fs：解析 inline fixture + 真读 templates/skill-sources.yaml / manifest.yaml（只读，不碰全局）。
 */
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseSkillSources, readSkillSources, SkillSourcesError } from './skillSources.js'

// src 与 dist 同深度：三级上溯 → 仓根（对齐 loader / cli main.ts pluginRoot）
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const REGISTRY = join(REPO_ROOT, 'templates', 'skill-sources.yaml')
const MANIFEST = join(REPO_ROOT, 'templates', 'manifest.yaml')

const GOOD_FIXTURE = `
version: 1
skills:
  # 注释行应被跳过
  browser-qa: { tool: skills-cli, source: affaan-m/ECC, skill: browser-qa, tier: mandatory, official: false, engine: "playwright@claude-plugins-official" }
  huashu-design: { tool: skills-cli, source: alchaincyf/huashu-design, tier: mandatory, official: false, alt: prototype }
  web-artifacts-builder: { tool: skills-cli, source: anthropics/skills, skill: web-artifacts-builder, tier: optional, official: true }
  commit-commands:commit-push-pr: { tool: claude-plugin, source: claude-plugins-official, skill: commit-commands, tier: mandatory, official: true, note: "命令非技能，冒号 token 与含逗号 note 都要解析对" }
`

describe('① parseSkillSources —— 结构化字段', () => {
  const by = new Map(parseSkillSources(GOOD_FIXTURE).map((r) => [r.token, r]))

  it('tool/source/skill/tier/official/engine 逐字段', () => {
    const bq = by.get('browser-qa')!
    expect(bq).toMatchObject({
      token: 'browser-qa', tool: 'skills-cli', source: 'affaan-m/ECC',
      skill: 'browser-qa', tier: 'mandatory', official: false,
      engine: 'playwright@claude-plugins-official',
    })
  })

  it('单技能仓省略 skill → undefined；alt 保留', () => {
    const hs = by.get('huashu-design')!
    expect(hs.skill).toBeUndefined()
    expect(hs.alt).toBe('prototype')
  })

  it('official: true 布尔化（非字符串）', () => {
    expect(by.get('web-artifacts-builder')!.official).toBe(true)
  })

  it('含冒号 token 正确切分 + 含逗号引号 note 完整保留', () => {
    const cc = by.get('commit-commands:commit-push-pr')!
    expect(cc.token).toBe('commit-commands:commit-push-pr')
    expect(cc.skill).toBe('commit-commands')
    expect(cc.note).toBe('命令非技能，冒号 token 与含逗号 note 都要解析对')
  })
})

describe('② / ③ readSkillSources —— 容错兜底（fail-open）', () => {
  it('② 缺文件 → []', () => {
    expect(readSkillSources(join(tmpdir(), 'no-such-skill-sources-xyz.yaml'))).toEqual([])
  })

  it('③ 坏 yaml → []（不抛）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skillsrc-'))
    try {
      const bad = join(dir, 'bad.yaml')
      await writeFile(bad, 'skills:\n  broken: { tool: not-a-real-tool, source: x, tier: mandatory, official: false }\n', 'utf8')
      expect(readSkillSources(bad)).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('③b parseSkillSources 对坏内容 fail-loud（SkillSourcesError，消息带 token）', () => {
    expect(() => parseSkillSources('skills:\n  broken: { tool: not-a-real-tool, source: x, tier: mandatory, official: false }\n'))
      .toThrow(SkillSourcesError)
    expect(() => parseSkillSources('skills:\n  nobrace: tool skills-cli\n')).toThrow(/token/)
    expect(() => parseSkillSources('skills:\n  dup: { tool: npm, source: a, tier: optional, official: false }\n  dup: { tool: npm, source: b, tier: optional, official: false }\n'))
      .toThrow(/重复/)
  })
})

describe('④ 真读 templates/skill-sources.yaml', () => {
  const rows = readSkillSources(REGISTRY)
  const by = new Map(rows.map((r) => [r.token, r]))

  const ECC = [
    'browser-qa', 'e2e-testing', 'search-first', 'deep-research', 'market-research',
    'code-tour', 'github-ops', 'react-patterns', 'python-patterns', 'python-testing',
    'nestjs-patterns', 'postgres-patterns', 'docker-patterns', 'deployment-patterns', 'frontend-patterns',
  ]

  it('④a ECC 恰 15 个 token，tool=skills-cli source=affaan-m/ECC', () => {
    expect(ECC).toHaveLength(15)
    for (const t of ECC) {
      const e = by.get(t)
      expect(e, `${t} 应在 registry`).toBeDefined()
      expect(e!.tool).toBe('skills-cli')
      expect(e!.source).toBe('affaan-m/ECC')
    }
    expect(rows.filter((r) => r.source === 'affaan-m/ECC').map((r) => r.token).sort())
      .toEqual([...ECC].sort())
  })

  it('④b browser-qa 带 playwright MCP engine', () => {
    expect(by.get('browser-qa')!.engine).toBe('playwright@claude-plugins-official')
  })

  it('④c 改名落地：to-spec/to-tickets 在、to-prd/to-issues 不在', () => {
    expect(by.get('to-spec')).toBeDefined()
    expect(by.get('to-tickets')).toBeDefined()
    expect(by.get('to-prd')).toBeUndefined()
    expect(by.get('to-issues')).toBeUndefined()
    expect(by.get('to-spec')).toMatchObject({ tool: 'skills-cli', source: 'mattpocock/skills', tier: 'mandatory' })
  })

  it('④d uiforge 不进 registry（无 uiforge 条目；头注可保留“已删”说明）', () => {
    expect(by.get('uiforge')).toBeUndefined()
    // 无 `uiforge: {…}` 条目行（`#` 说明注释不受影响）
    expect(readFileSync(REGISTRY, 'utf8')).not.toMatch(/^\s*uiforge\s*:/m)
  })

  it('④e 全表字段完整、tier/official 合法', () => {
    expect(rows.length).toBeGreaterThan(30)
    for (const r of rows) {
      expect(['mandatory', 'recommended', 'conditional', 'optional'], `${r.token} tier`).toContain(r.tier)
      expect(typeof r.official, `${r.token} official`).toBe('boolean')
      expect(['claude-plugin', 'skills-cli', 'npm', 'builtin', 'bundled'], `${r.token} tool`).toContain(r.tool)
      expect(r.source, `${r.token} source`).not.toBe('')
    }
  })
})

describe('⑤ manifest 改名落地（templates/manifest.yaml）', () => {
  const manifest = readFileSync(MANIFEST, 'utf8')

  it('技能表无 to-prd / to-issues / uiforge', () => {
    expect(manifest).not.toContain('to-prd')
    expect(manifest).not.toContain('to-issues')
    expect(manifest).not.toContain('uiforge')
  })

  it('ship.pm 用改名后的 to-spec / to-tickets', () => {
    expect(manifest).toMatch(/ship\.pm:\s*\[to-spec,\s*to-tickets\]/)
  })
})
