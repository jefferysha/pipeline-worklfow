import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

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
  assert.deepEqual([...new Set(versions)], ['1.0.0'])
})
