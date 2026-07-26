import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { renderCodexAgentsBlock } from './generate-product-identity.mjs'

const root = new URL('../', import.meta.url)

test('产品身份真相源完整定义 Tenon 的公开契约', async () => {
  const identity = JSON.parse(await readFile(new URL('product/identity.json', root), 'utf8'))

  assert.deepEqual(identity, {
    schemaVersion: 1,
    displayName: 'Tenon',
    cli: 'tenon',
    hookLauncher: 'tenon-hook',
    dashboardLauncher: 'tenon-dashboard',
    plugin: 'tenon',
    marketplace: 'tenon',
    entrySkill: 'tenon',
    skillPrefix: 'tenon-',
    runtimeApp: 'tenon',
    environmentPrefix: 'TENON_',
    browserPrefix: '__TENON_',
    repository: 'jefferysha/tenon',
    repositoryUrl: 'https://github.com/jefferysha/tenon',
    pagesBase: '/tenon/',
    dashboardHost: '127.0.0.1',
    dashboardPort: 18765,
  })
})

test('TypeScript 身份投影与 JSON 真相源逐字段一致', async () => {
  const identity = JSON.parse(await readFile(new URL('product/identity.json', root), 'utf8'))
  const generated = await readFile(
    new URL('packages/kernel/src/product-identity.generated.ts', root),
    'utf8',
  )

  for (const [key, value] of Object.entries(identity)) {
    assert.match(generated, new RegExp(`${key}: ${JSON.stringify(value).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`))
  }
})

test('Codex managed block 与根规则由同一身份模板生成，且入口 Skill 可调用', async () => {
  const identity = JSON.parse(await readFile(new URL('product/identity.json', root), 'utf8'))
  const template = await readFile(
    new URL('templates/generated/codex-agents-block.md', root),
    'utf8',
  )
  const agents = await readFile(new URL('AGENTS.md', root), 'utf8')
  const adapter = await readFile(new URL('adapters/codex/install.sh', root), 'utf8')
  const skill = await readFile(new URL(`skills/${identity.entrySkill}/SKILL.md`, root), 'utf8')

  assert.match(template, new RegExp(`${identity.plugin}:${identity.entrySkill}`))
  assert.match(template, new RegExp(`\\b${identity.cli} (?:status|get|set|transition|check)\\b`))
  assert.equal(agents.split('<!-- PIPELINE:CODEX:START -->').length - 1, 1)
  assert.equal(agents.split('<!-- PIPELINE:CODEX:END -->').length - 1, 1)
  const start = agents.indexOf('<!-- PIPELINE:CODEX:START -->')
  const end = agents.indexOf('<!-- PIPELINE:CODEX:END -->') + '<!-- PIPELINE:CODEX:END -->'.length
  assert.equal(`${agents.slice(start, end)}\n`, template)
  assert.match(adapter, /templates\/generated\/codex-agents-block\.md/)
  assert.doesNotMatch(adapter, /block=.*cat <<'EOF'/)
  assert.match(skill, new RegExp(`^name: ${identity.entrySkill}$`, 'm'))
})

test('Tenon 公开插件与 workspace 使用同一发行版本', async () => {
  const paths = [
    'package.json',
    'docs-site/package.json',
    '.codex-plugin/plugin.json',
    '.claude-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
    'packages/automation/package.json',
    'packages/channel/package.json',
    'packages/cli/package.json',
    'packages/dashboard-app/package.json',
    'packages/kernel/package.json',
    'packages/server/package.json',
    'packages/tap/package.json',
  ]
  const versions = await Promise.all(paths.map(async (path) => {
    const value = JSON.parse(await readFile(new URL(path, root), 'utf8'))
    return path === '.claude-plugin/marketplace.json' ? value.metadata.version : value.version
  }))
  assert.deepEqual([...new Set(versions)], ['1.0.1'])
})

test('入口 Skill 必须是安全 slug，不能越过 first-party skills 根', () => {
  const base = {
    displayName: 'Tenon',
    cli: 'tenon',
    plugin: 'tenon',
    entrySkill: 'tenon',
  }
  assert.throws(
    () => renderCodexAgentsBlock({ ...base, entrySkill: '../foreign' }),
    /entrySkill/,
  )
  assert.throws(
    () => renderCodexAgentsBlock({ ...base, entrySkill: 'tenon/other' }),
    /entrySkill/,
  )
})
