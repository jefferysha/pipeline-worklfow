import { describe, expect, it, vi } from 'vitest'
import { createRuntimeScopeResolver } from './scope.js'

describe('runtime scope snapshot', () => {
  it('captures home and environment providers once and reuses the same paths object', () => {
    const homeDir = vi.fn(() => '/tmp/tenon-home')
    const env = vi.fn(() => ({ TENON_RUNTIME_HOME: '/tmp/tenon-runtime' }))
    const resolve = createRuntimeScopeResolver({ homeDir, env })

    const first = resolve()
    const second = resolve()

    expect(second).toBe(first)
    expect(second.paths).toBe(first.paths)
    expect(homeDir).toHaveBeenCalledTimes(1)
    expect(env).toHaveBeenCalledTimes(1)
  })

  it('does not follow environment changes after the command snapshot is created', () => {
    let runtimeHome = '/tmp/tenon-runtime-a'
    const resolve = createRuntimeScopeResolver({
      homeDir: () => '/tmp/tenon-home',
      env: () => ({ TENON_RUNTIME_HOME: runtimeHome }),
    })

    const first = resolve()
    runtimeHome = '/tmp/tenon-runtime-b'
    const second = resolve()

    expect(second).toBe(first)
    expect(second.env.TENON_RUNTIME_HOME).toBe('/tmp/tenon-runtime-a')
    expect(second.paths.dataRoot).toBe('/tmp/tenon-runtime-a/data')
    expect(second.paths.dataRoot).not.toContain('tenon-runtime-b')
  })
})
