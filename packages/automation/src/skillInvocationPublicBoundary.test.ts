import { describe, expect, it } from 'vitest'
import * as automation from './index.js'
import * as kernel from '@tenon/kernel'

describe('SkillInvocation public minting boundary', () => {
  it('does not export raw append or caller-configurable application factories', () => {
    expect('appendSkillInvocationEvent' in kernel).toBe(false)
    expect('skillInvocationPersistenceAdapter' in kernel).toBe(false)
    expect('createSkillInvocationApplicationCommand' in automation).toBe(false)
    expect('afkSkillInvocationAdapterProof' in automation).toBe(false)
    expect('skillInvocationApplicationAdapter' in automation).toBe(false)
    expect('captureDocumentSkillInvocationStepVisit' in kernel).toBe(false)
    expect('recordReconciledDocumentSkillInvocation' in kernel).toBe(false)
    expect('failDurableAfkSkillInvocations' in kernel).toBe(false)
    expect('interruptDurableAfkSkillInvocations' in kernel).toBe(false)
  })
})
