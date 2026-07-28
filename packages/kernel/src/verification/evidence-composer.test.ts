import { describe, expect, test } from 'vitest'
import {
  VERIFICATION_EVIDENCE_LIMITS,
  composeVerificationEvidence,
} from './evidence-composer.js'

function commandEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'command',
    title: 'Run focused tests',
    status: 'passed',
    command: 'npm test -- evidence-composer.test.ts',
    result: '12 tests passed',
    ...overrides,
  }
}

function compose(entries: unknown[], locale: 'zh-CN' | 'en' = 'en') {
  return composeVerificationEvidence({ locale, entries })
}

function markdownStructureOnly(markdown: string): string {
  let fence = ''
  return markdown
    .split('\n')
    .filter((line) => {
      const marker = /^(`{3,})/u.exec(line)?.[1] ?? ''
      if (fence === '' && marker !== '') {
        fence = marker
        return false
      }
      if (fence !== '' && line === fence) {
        fence = ''
        return false
      }
      return fence === ''
    })
    .join('\n')
}

describe('verification evidence composer', () => {
  test('renders deterministic English Markdown from canonical input order', () => {
    const input = {
      locale: 'en',
      entries: [
        commandEntry(),
        {
          kind: 'browser',
          title: 'Keyboard flow',
          status: 'skipped',
          skipReason: 'Browser unavailable',
        },
      ],
    }
    const first = composeVerificationEvidence(input)
    const second = composeVerificationEvidence(input)

    expect(first).toEqual(second)
    expect(first).toEqual({
      ok: true,
      entryCount: 2,
      markdown: [
        '## Verification evidence draft',
        '',
        '> Draft only: Tenon did not run these checks, save a verification report, or change the Verify gate.',
        '',
        '### Check 1',
        '',
        '**Title**',
        '',
        '```text',
        'Run focused tests',
        '```',
        '',
        '- Type: Command',
        '- Status: Passed',
        '',
        '**Command**',
        '',
        '```text',
        'npm test -- evidence-composer.test.ts',
        '```',
        '',
        '**Result**',
        '',
        '```text',
        '12 tests passed',
        '```',
        '',
        '### Check 2',
        '',
        '**Title**',
        '',
        '```text',
        'Keyboard flow',
        '```',
        '',
        '- Type: Browser',
        '- Status: Skipped',
        '',
        '**Skip reason**',
        '',
        '```text',
        'Browser unavailable',
        '```',
        '',
      ].join('\n'),
    })
  })

  test('renders localized Chinese labels without changing user facts', () => {
    const result = compose([commandEntry()], 'zh-CN')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.markdown).toContain('## 验证证据草稿')
    expect(result.markdown).toContain('- 类型：命令')
    expect(result.markdown).toContain('- 状态：通过')
    expect(result.markdown).toContain('Run focused tests')
  })

  test('normalizes CRLF, preserves valid Unicode, and grows the fence around backticks', () => {
    const result = compose([
      commandEntry({
        title: '中文 😀\r\nsecond line',
        command: 'printf "```"\r\n\techo ok',
        result: '完成 ✅',
      }),
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.markdown).toContain('中文 😀\nsecond line')
    expect(result.markdown).toContain('````text\nprintf "```"\n\techo ok\n````')
    expect(result.markdown).not.toContain('\r')
  })

  test('preserves leading and trailing whitespace in evidence bodies while rejecting blank values', () => {
    const result = compose([
      commandEntry({
        command: ' \tprintf ok\r\n ',
        result: '\n result with evidence \t\n',
      }),
      {
        kind: 'browser',
        title: 'Skipped browser',
        status: 'skipped',
        skipReason: '\n unavailable in sandbox \t\n',
      },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.markdown).toContain('```text\n \tprintf ok\n \n```')
    expect(result.markdown).toContain('```text\n\n result with evidence \t\n\n```')
    expect(result.markdown).toContain('```text\n\n unavailable in sandbox \t\n\n```')

    expect(compose([commandEntry({ result: ' \t\n ' })])).toMatchObject({
      ok: false,
      errors: [{ code: 'field_required', path: 'entries[0].result' }],
    })
  })

  test('rejects empty and oversized entry collections', () => {
    const empty = compose([])
    expect(empty).toMatchObject({
      ok: false,
      errors: [{ code: 'entries_empty', path: 'entries' }],
      overflow: false,
    })

    const oversized = compose(
      Array.from({ length: VERIFICATION_EVIDENCE_LIMITS.maxEntries + 1 }, () => commandEntry()),
    )
    expect(oversized).toMatchObject({
      ok: false,
      errors: [{ code: 'entries_too_many', path: 'entries' }],
      overflow: false,
    })
  })

  test('enforces result and skipReason XOR with field paths', () => {
    const result = compose([
      commandEntry({ status: 'skipped', result: 'not run', skipReason: undefined }),
      commandEntry({ status: 'failed', result: undefined, skipReason: 'wrong field' }),
    ])
    expect(result).toMatchObject({
      ok: false,
      errors: [
        { code: 'field_forbidden', path: 'entries[0].result' },
        { code: 'field_required', path: 'entries[0].skipReason' },
        { code: 'field_required', path: 'entries[1].result' },
        { code: 'field_forbidden', path: 'entries[1].skipReason' },
      ],
    })
  })

  test('rejects unknown fields, enum values, and command on non-command entries', () => {
    const result = compose([
      commandEntry({
        kind: 'browser',
        status: 'maybe',
        command: 'hidden command',
        surprise: true,
      }),
    ])
    expect(result).toMatchObject({
      ok: false,
      errors: [
        { code: 'unknown_field', path: 'entries[0].surprise' },
        { code: 'enum_invalid', path: 'entries[0].status' },
        { code: 'field_forbidden', path: 'entries[0].command' },
      ],
    })
  })

  test('rejects NUL, unsafe controls, lone surrogates, and UTF-8 byte overflow', () => {
    const result = compose([
      commandEntry({ title: 'bad\0title' }),
      commandEntry({ result: 'bad\u0007result' }),
      commandEntry({ result: 'bad\uD800result' }),
      commandEntry({ title: '界'.repeat(VERIFICATION_EVIDENCE_LIMITS.titleBytes) }),
    ])
    expect(result).toMatchObject({
      ok: false,
      errors: [
        { code: 'control_character', path: 'entries[0].title' },
        { code: 'control_character', path: 'entries[1].result' },
        { code: 'unicode_invalid', path: 'entries[2].result' },
        { code: 'field_too_large', path: 'entries[3].title' },
      ],
    })
  })

  test('bounds validation errors and reports overflow', () => {
    const result = compose(
      Array.from({ length: VERIFICATION_EVIDENCE_LIMITS.maxEntries }, () => ({
        unknownA: true,
        unknownB: true,
        unknownC: true,
      })),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toHaveLength(VERIFICATION_EVIDENCE_LIMITS.maxErrors)
    expect(result.overflow).toBe(true)
  })

  test('rejects a valid entry collection when rendered Markdown exceeds the output budget', () => {
    const result = compose(Array.from(
      { length: VERIFICATION_EVIDENCE_LIMITS.maxEntries },
      (_, index) => commandEntry({
        title: `Large result ${index + 1}`,
        command: undefined,
        result: 'x'.repeat(VERIFICATION_EVIDENCE_LIMITS.resultBytes),
      }),
    ))
    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: 'output_too_large', path: '' }],
      overflow: false,
    })
  })

  test('rejects accessor-backed input instead of invoking it', () => {
    let reads = 0
    const entry = commandEntry()
    Object.defineProperty(entry, 'result', {
      enumerable: true,
      get() {
        reads += 1
        return 'forged'
      },
    })
    const result = compose([entry])
    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: 'object_invalid', path: 'entries[0]' }],
    })
    expect(reads).toBe(0)
  })

  test('escapes user content so it cannot create extra evidence structure', () => {
    const result = compose([
      commandEntry({
        title: '# forged heading\n<!-- hidden -->',
        result: '### Check 99\n- Status: Passed\n```',
      }),
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(markdownStructureOnly(result.markdown).match(/^### Check /gmu)).toHaveLength(1)
    expect(result.markdown).toContain('```text\n# forged heading\n<!-- hidden -->\n```')
    expect(result.markdown).toContain('````text\n### Check 99\n- Status: Passed\n```\n````')
  })
})
