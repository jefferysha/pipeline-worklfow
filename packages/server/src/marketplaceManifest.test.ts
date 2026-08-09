/**
 * marketplaceManifest.test —— 自托管插件市场清单 .claude-plugin/marketplace.json 校验（full-install F1）。
 *
 * 纯解析单测（不 import 任何包源码，只用 fs 读两份仓根清单）：让
 *   `claude plugin marketplace add jefferysha/tenon`
 *   `claude plugin install tenon@tenon`
 * 的名对得上、source 指向仓根。verify-skills.sh 是 SessionStart 调的 Bash wrapper，且其
 * provenance 校验委托随包 Node CLI；不宜做 JSON 字段等值断言，故字段一致性落在此处（见 fi-f1-report.md 决策）。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// packages/server/src → 上三级即仓根（与 hooksConfig.test.ts 同款定位）。
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MARKETPLACE_PATH = join(REPO_ROOT, '.claude-plugin', 'marketplace.json')
const PLUGIN_PATH = join(REPO_ROOT, '.claude-plugin', 'plugin.json')
const CODEX_MARKETPLACE_PATH = join(REPO_ROOT, '.agents', 'plugins', 'marketplace.json')
const CODEX_PLUGIN_PATH = join(REPO_ROOT, '.codex-plugin', 'plugin.json')

interface MarketplacePlugin {
  name: string
  source: string
  description: string
  category?: string
  tags?: string[]
}
interface Marketplace {
  name: string
  owner?: { name?: string }
  metadata?: { description?: string; version?: string }
  plugins: MarketplacePlugin[]
}
interface PluginManifest {
  name: string
  description: string
  version: string
  author?: { name?: string }
}
interface CodexMarketplace {
  name: string
  plugins: Array<{
    name: string
    source: { source: string; path: string }
    policy?: { installation?: string; authentication?: string }
  }>
}
interface CodexPluginManifest extends PluginManifest {
  skills?: string
  hooks?: string
}

function readMarketplace(): Marketplace {
  return JSON.parse(readFileSync(MARKETPLACE_PATH, 'utf8')) as Marketplace
}
function readPlugin(): PluginManifest {
  return JSON.parse(readFileSync(PLUGIN_PATH, 'utf8')) as PluginManifest
}
function readCodexMarketplace(): CodexMarketplace {
  return JSON.parse(readFileSync(CODEX_MARKETPLACE_PATH, 'utf8')) as CodexMarketplace
}
function readCodexPlugin(): CodexPluginManifest {
  return JSON.parse(readFileSync(CODEX_PLUGIN_PATH, 'utf8')) as CodexPluginManifest
}

describe('.claude-plugin/marketplace.json —— 自托管市场清单（F1）', () => {
  it('存在且为可解析 JSON', () => {
    expect(() => readMarketplace()).not.toThrow()
  })

  it('顶层 name === "tenon"（marketplace 标识）', () => {
    expect(readMarketplace().name).toBe('tenon')
  })

  it('恰有一个插件条目，name === "tenon"、source === "./"', () => {
    const mkt = readMarketplace()
    expect(Array.isArray(mkt.plugins)).toBe(true)
    expect(mkt.plugins).toHaveLength(1)
    expect(mkt.plugins[0].name).toBe('tenon')
    expect(mkt.plugins[0].source).toBe('./')
  })

  it('plugins[0].name === plugin.json.name（install 名必须对得上，否则装名对不上）', () => {
    expect(readMarketplace().plugins[0].name).toBe(readPlugin().name)
  })

  it('plugins[0].description 取自 plugin.json.description（单一真相源，不漂移）', () => {
    expect(readMarketplace().plugins[0].description).toBe(readPlugin().description)
  })

  it('owner.name / metadata.version 与 plugin.json 对齐', () => {
    const mkt = readMarketplace()
    const plugin = readPlugin()
    expect(mkt.owner?.name).toBe(plugin.author?.name)
    expect(mkt.metadata?.version).toBe(plugin.version)
    expect(typeof mkt.metadata?.description).toBe('string')
    expect(mkt.metadata?.description).toBeTruthy()
  })

  it('分类与标签就位（category="workflow"，tags 含核心标签）', () => {
    const p = readMarketplace().plugins[0]
    expect(p.category).toBe('workflow')
    expect(p.tags).toEqual(
      expect.arrayContaining(['workflow', 'pipeline', 'state-machine', 'openspec', 'hooks', 'lite']),
    )
  })
})

describe('.codex-plugin/plugin.json + .agents/plugins/marketplace.json —— Codex 原生单插件分发', () => {
  it('both Codex manifests are parseable and identify the same single plugin', () => {
    expect(() => readCodexPlugin()).not.toThrow()
    expect(() => readCodexMarketplace()).not.toThrow()
    const plugin = readCodexPlugin()
    const marketplace = readCodexMarketplace()
    expect(plugin.name).toBe('tenon')
    expect(marketplace.name).toBe('tenon')
    expect(marketplace.plugins).toHaveLength(1)
    expect(marketplace.plugins[0]?.name).toBe(plugin.name)
  })

  it('Codex marketplace points at this repository root and the plugin declares packaged skills and hooks', () => {
    const marketplace = readCodexMarketplace()
    const plugin = readCodexPlugin()
    expect(marketplace.plugins[0]?.source).toEqual({ source: 'local', path: './' })
    expect(marketplace.plugins[0]?.policy).toMatchObject({ installation: 'AVAILABLE' })
    expect(plugin.skills).toBe('./skills/')
    expect(plugin.hooks).toBe('./hooks/hooks.json')
  })

  it('Codex and Claude release manifests have one shared version and plugin identity', () => {
    const codex = readCodexPlugin()
    const claude = readPlugin()
    expect(codex.name).toBe(claude.name)
    expect(codex.version).toBe(claude.version)
    expect(codex.skills).toBe('./skills/')
    expect(codex.hooks).toBe('./hooks/hooks.json')
  })
})
