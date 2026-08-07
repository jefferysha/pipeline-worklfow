import { describe, expect, it } from 'vitest'
import * as automation from './index.js'
import * as kernel from '@tenon/kernel'

describe('SkillInvocation public minting boundary', () => {
  it('does not export raw append or caller-configurable application factories', async () => {
    expect('appendSkillInvocationEvent' in kernel).toBe(false)
    expect('skillInvocationPersistenceAdapter' in kernel).toBe(false)
    expect('createSkillInvocationApplicationCommand' in automation).toBe(false)
    expect('afkSkillInvocationAdapterProof' in automation).toBe(false)
    expect('skillInvocationApplicationAdapter' in automation).toBe(false)
    expect('captureDocumentSkillInvocationStepVisit' in kernel).toBe(false)
    expect('recordReconciledDocumentSkillInvocation' in kernel).toBe(false)
    expect('failDurableAfkSkillInvocations' in kernel).toBe(false)
    expect('interruptDurableAfkSkillInvocations' in kernel).toBe(false)
    expect('issueVerifiedAfkInteractionReceipt' in kernel).toBe(false)
    expect('recordNativeDocumentSkillConfirmation' in kernel).toBe(false)
    expect('recordCodexDocumentSkillConfirmation' in kernel).toBe(false)
    expect('recordCanonicalDocumentSkillInvocation' in kernel).toBe(false)
    expect('startDurableAfkSkillInvocations' in kernel).toBe(false)
    expect('finishDurableAfkSkillInvocations' in kernel).toBe(false)
    const forbiddenSpecifier = '@tenon/kernel/internal/skill-invocation-producer'
    await expect(import(forbiddenSpecifier)).rejects.toThrow(/Missing .*internal\/skill-invocation-producer.*specifier/u)
  })
})
