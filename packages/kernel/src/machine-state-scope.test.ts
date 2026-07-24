import { describe, expect, it } from 'vitest'
import { machineStateScopeId } from './machine-state-scope.js'

describe('machineStateScopeId', () => {
  it('canonicalizes lexically equivalent machine-state homes', () => {
    expect(machineStateScopeId('/tmp/pipeline-scope/../pipeline-scope/'))
      .toBe(machineStateScopeId('/tmp/pipeline-scope'))
  })

  it('separates distinct machine-state homes with a stable versioned digest', () => {
    const first = machineStateScopeId('/tmp/pipeline-scope-a')
    expect(first).toMatch(/^sha256-v1-[a-f0-9]{64}$/)
    expect(first).toBe(machineStateScopeId('/tmp/pipeline-scope-a'))
    expect(first).not.toBe(machineStateScopeId('/tmp/pipeline-scope-b'))
  })

  it('does not expose the machine-state home path', () => {
    const home = '/Users/private-user/pipeline-state'
    expect(machineStateScopeId(home)).not.toContain(home)
    expect(machineStateScopeId(home)).not.toContain('private-user')
  })
})
