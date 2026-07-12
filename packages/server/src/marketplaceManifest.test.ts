/**
 * marketplaceManifest.test —— 自托管插件市场清单 .claude-plugin/marketplace.json 校验（full-install F1）。
 *
 * 纯解析单测（不 import 任何包源码，只用 fs 读两份仓根清单）：让
 *   `claude plugin marketplace add jefferysha/pipeline-worklfow`
 *   `claude plugin install pipeline-lite@pipeline-lite`
 * 的名对得上、source 指向仓根。verify-skills.sh 是 SessionStart 调的零解释器纯 bash，
 * 不宜做 JSON 字段等值断言，故字段一致性落在此处（见 fi-f1-report.md 决策）。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// packages/server/src → 上三级即仓根（与 hooksConfig.test.ts 同款定位）。
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MARKETPLACE_PATH = join(REPO_ROOT, '.claude-plugin', 'marketplace.json')
const PLUGIN_PATH = join(REPO_ROOT, '.claude-plugin', 'plugin.json')

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

function readMarketplace(): Marketplace {
  return JSON.parse(readFileSync(MARKETPLACE_PATH, 'utf8')) as Marketplace
}
function readPlugin(): PluginManifest {
  return JSON.parse(readFileSync(PLUGIN_PATH, 'utf8')) as PluginManifest
}

describe('.claude-plugin/marketplace.json —— 自托管市场清单（F1）', () => {
  it('存在且为可解析 JSON', () => {
    expect(() => readMarketplace()).not.toThrow()
  })

  it('顶层 name === "pipeline-lite"（marketplace 标识）', () => {
    expect(readMarketplace().name).toBe('pipeline-lite')
  })

  it('恰有一个插件条目，name === "pipeline-lite"、source === "./"', () => {
    const mkt = readMarketplace()
    expect(Array.isArray(mkt.plugins)).toBe(true)
    expect(mkt.plugins).toHaveLength(1)
    expect(mkt.plugins[0].name).toBe('pipeline-lite')
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
