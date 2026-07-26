import { describe, expect, it } from 'vitest'
import { resolveServerPaths } from './paths.js'

describe('resolveServerPaths —— 宿主发现与 Tenon 产品状态分域', () => {
  it('Claude 目录只用于宿主资产发现，产品文件不写入其中', () => {
    const paths = resolveServerPaths({
      home: '/Users/demo',
      platform: 'darwin',
      env: {},
    })
    expect(paths.claudeDir).toBe('/Users/demo/.claude')
    expect(paths.registryPath).toBe('/Users/demo/Library/Application Support/tenon/config/projects.json')
    expect(paths.secretsPath).toBe('/Users/demo/Library/Application Support/tenon/config/secrets.json')
    expect(paths.tokenPath).toBe('/Users/demo/Library/Application Support/tenon/state/dashboard-token.json')
    expect(paths.pidfilePath).toBe('/Users/demo/Library/Application Support/tenon/state/dashboard-server.json')
    expect([
      paths.registryPath,
      paths.secretsPath,
      paths.tokenPath,
      paths.pidfilePath,
    ].some((path) => path.startsWith(paths.claudeDir))).toBe(false)
  })

  it('TENON_RUNTIME_HOME 只重定向产品域，不劫持宿主 home', () => {
    const paths = resolveServerPaths({
      home: '/home/demo',
      platform: 'linux',
      env: { TENON_RUNTIME_HOME: '/tmp/tenon-runtime' },
    })
    expect(paths.homeDir).toBe('/home/demo')
    expect(paths.claudeDir).toBe('/home/demo/.claude')
    expect(paths.registryPath).toBe('/tmp/tenon-runtime/config/projects.json')
    expect(paths.stateRoot).toBe('/tmp/tenon-runtime/state')
  })
})
