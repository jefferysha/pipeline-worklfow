import { describe, expect, it } from 'vitest'
import { resolveRuntimePaths } from './paths.js'

describe('resolveRuntimePaths', () => {
  it('uses XDG defaults on Linux', () => {
    expect(resolveRuntimePaths({ platform: 'linux', homeDir: '/home/pipeline', env: {} })).toMatchObject({
      dataRoot: '/home/pipeline/.local/share/tenon',
      stateRoot: '/home/pipeline/.local/state/tenon',
      configRoot: '/home/pipeline/.config/tenon',
    })
  })

  it('uses native Application Support paths on macOS', () => {
    expect(resolveRuntimePaths({ platform: 'darwin', homeDir: '/Users/pipeline', env: {} })).toMatchObject({
      dataRoot: '/Users/pipeline/Library/Application Support/tenon',
      stateRoot: '/Users/pipeline/Library/Application Support/tenon/state',
      configRoot: '/Users/pipeline/Library/Application Support/tenon/config',
    })
  })

  it('uses the explicit root as an isolated three-root hierarchy', () => {
    expect(resolveRuntimePaths({
      platform: 'linux', homeDir: '/home/pipeline', env: { TENON_RUNTIME_HOME: '/tmp/runtime' },
    })).toMatchObject({
      dataRoot: '/tmp/runtime/data',
      stateRoot: '/tmp/runtime/state',
      configRoot: '/tmp/runtime/config',
    })
  })

  it('does not trust a relative XDG override', () => {
    expect(resolveRuntimePaths({
      platform: 'linux', homeDir: '/home/pipeline', env: { XDG_DATA_HOME: 'relative' },
    }).dataRoot).toBe('/home/pipeline/.local/share/tenon')
  })
})
