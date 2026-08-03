import { describe, expect, it } from 'vitest'
import { transcriptExecInvocations } from './codexToolProgram.js'

describe('Codex transcript exec program', () => {
  it('accepts the real exec_command wrapper with a safe max_output_tokens value', () => {
    const expected = [{
      command: 'cat /trusted/SKILL.md',
      workdir: '/repo',
    }]
    expect(transcriptExecInvocations(
      'const r = await tools.exec_command({cmd:"cat /trusted/SKILL.md",workdir:"/repo",yield_time_ms:10000,max_output_tokens:20000}); text(r)',
    )).toEqual(expected)
    expect(transcriptExecInvocations(
      `const r = await tools.exec_command(${JSON.stringify({
        cmd: 'cat /trusted/SKILL.md',
        workdir: '/repo',
        yield_time_ms: 10_000,
        max_output_tokens: 20_000,
      })}); text(r)`,
    )).toEqual(expected)
  })

  it.each([
    '0',
    '-1',
    '1.5',
    '9007199254740992',
    '"20000"',
    'true',
    'null',
    'dynamicLimit',
  ])('rejects an unsafe max_output_tokens value: %s', (value) => {
    expect(transcriptExecInvocations(
      `const r = await tools.exec_command({cmd:"cat /trusted/SKILL.md",max_output_tokens:${value}}); text(r)`,
    )).toEqual([])
  })
})
