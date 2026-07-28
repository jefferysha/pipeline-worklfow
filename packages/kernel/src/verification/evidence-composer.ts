export const VERIFICATION_EVIDENCE_LIMITS = Object.freeze({
  maxEntries: 12,
  maxErrors: 20,
  titleBytes: 240,
  commandBytes: 2_000,
  resultBytes: 4_000,
  skipReasonBytes: 2_000,
  outputBytes: 32 * 1024,
})

export type VerificationEvidenceLocale = 'zh-CN' | 'en'
export type VerificationEvidenceKind = 'command' | 'browser' | 'review' | 'other'
export type VerificationEvidenceStatus = 'passed' | 'failed' | 'skipped'

export interface VerificationEvidenceEntry {
  readonly kind: VerificationEvidenceKind
  readonly title: string
  readonly status: VerificationEvidenceStatus
  readonly command?: string
  readonly result?: string
  readonly skipReason?: string
}

export interface VerificationEvidenceDraft {
  readonly locale: VerificationEvidenceLocale
  readonly entries: readonly VerificationEvidenceEntry[]
}

export type VerificationEvidenceErrorCode =
  | 'object_invalid'
  | 'unknown_field'
  | 'field_required'
  | 'field_type'
  | 'field_forbidden'
  | 'field_too_large'
  | 'enum_invalid'
  | 'entries_empty'
  | 'entries_too_many'
  | 'control_character'
  | 'unicode_invalid'
  | 'output_too_large'

export interface VerificationEvidenceError {
  readonly code: VerificationEvidenceErrorCode
  readonly path: string
}

export type VerificationEvidenceComposition =
  | {
      readonly ok: true
      readonly markdown: string
      readonly entryCount: number
    }
  | {
      readonly ok: false
      readonly errors: readonly VerificationEvidenceError[]
      readonly overflow: boolean
    }

const INPUT_FIELDS = new Set(['locale', 'entries'])
const ENTRY_FIELDS = new Set(['kind', 'title', 'status', 'command', 'result', 'skipReason'])
const KINDS = new Set<VerificationEvidenceKind>(['command', 'browser', 'review', 'other'])
const STATUSES = new Set<VerificationEvidenceStatus>(['passed', 'failed', 'skipped'])
const encoder = new TextEncoder()

interface ErrorCollector {
  readonly errors: VerificationEvidenceError[]
  overflow: boolean
}

function addError(
  collector: ErrorCollector,
  code: VerificationEvidenceErrorCode,
  path: string,
): void {
  if (collector.errors.length < VERIFICATION_EVIDENCE_LIMITS.maxErrors) {
    collector.errors.push(Object.freeze({ code, path }))
  } else {
    collector.overflow = true
  }
}

function snapshotRecord(value: unknown): Record<string, unknown> | null {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    const keys = Reflect.ownKeys(value)
    if (keys.some((key) => typeof key !== 'string')) return null
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    for (const key of keys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) return null
      copy[key] = descriptor.value
    }
    return copy
  } catch {
    return null
  }
}

type ArraySnapshot =
  | { readonly kind: 'ok'; readonly value: readonly unknown[] }
  | { readonly kind: 'not_array' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'too_many' }

function snapshotArray(value: unknown, maxLength: number): ArraySnapshot {
  try {
    if (!Array.isArray(value)) return { kind: 'not_array' }
    if (Object.getPrototypeOf(value) !== Array.prototype) return { kind: 'invalid' }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
    if (
      lengthDescriptor === undefined
      || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
      || typeof lengthDescriptor.value !== 'number'
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
    ) return { kind: 'invalid' }
    const length = lengthDescriptor.value
    if (length > maxLength) return { kind: 'too_many' }
    const keys = Reflect.ownKeys(value)
    if (keys.length !== length + 1 || keys.some((key) => typeof key !== 'string')) {
      return { kind: 'invalid' }
    }
    const copy: unknown[] = []
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) return { kind: 'invalid' }
      copy.push(descriptor.value)
    }
    return { kind: 'ok', value: Object.freeze(copy) }
  } catch {
    return { kind: 'invalid' }
  }
}

function hasInvalidSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index)
    if (current >= 0xd800 && current <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (current >= 0xdc00 && current <= 0xdfff) {
      return true
    }
  }
  return false
}

function hasUnsafeControl(value: string): boolean {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)
}

function normalizeText(
  value: unknown,
  path: string,
  maxBytes: number,
  collector: ErrorCollector,
  required: boolean,
  preserveWhitespace = false,
): string | undefined {
  if (value === undefined) {
    if (required) addError(collector, 'field_required', path)
    return undefined
  }
  if (typeof value !== 'string') {
    addError(collector, 'field_type', path)
    return undefined
  }
  if (hasInvalidSurrogate(value)) {
    addError(collector, 'unicode_invalid', path)
    return undefined
  }
  if (hasUnsafeControl(value)) {
    addError(collector, 'control_character', path)
    return undefined
  }
  const normalized = value.replace(/\r\n?/gu, '\n')
  const canonical = preserveWhitespace ? normalized : normalized.trim()
  if (canonical.trim() === '') {
    if (required) addError(collector, 'field_required', path)
    return undefined
  }
  if (encoder.encode(canonical).byteLength > maxBytes) {
    addError(collector, 'field_too_large', path)
    return undefined
  }
  return canonical
}

function enumValue<T extends string>(
  value: unknown,
  values: ReadonlySet<T>,
  path: string,
  collector: ErrorCollector,
): T | undefined {
  if (value === undefined) {
    addError(collector, 'field_required', path)
    return undefined
  }
  if (typeof value !== 'string') {
    addError(collector, 'field_type', path)
    return undefined
  }
  if (!values.has(value as T)) {
    addError(collector, 'enum_invalid', path)
    return undefined
  }
  return value as T
}

function entryFromUnknown(
  value: unknown,
  index: number,
  collector: ErrorCollector,
): VerificationEvidenceEntry | undefined {
  const path = `entries[${index}]`
  const record = snapshotRecord(value)
  if (record === null) {
    addError(collector, 'object_invalid', path)
    return undefined
  }
  for (const key of Object.keys(record)) {
    if (!ENTRY_FIELDS.has(key)) addError(collector, 'unknown_field', `${path}.${key}`)
  }

  const kind = enumValue(record.kind, KINDS, `${path}.kind`, collector)
  const title = normalizeText(
    record.title,
    `${path}.title`,
    VERIFICATION_EVIDENCE_LIMITS.titleBytes,
    collector,
    true,
    true,
  )
  const status = enumValue(record.status, STATUSES, `${path}.status`, collector)

  let command: string | undefined
  if (record.command !== undefined) {
    if (kind !== undefined && kind !== 'command') {
      addError(collector, 'field_forbidden', `${path}.command`)
    } else {
      command = normalizeText(
        record.command,
        `${path}.command`,
        VERIFICATION_EVIDENCE_LIMITS.commandBytes,
        collector,
        false,
        true,
      )
    }
  }

  let result: string | undefined
  let skipReason: string | undefined
  if (status === 'skipped') {
    if (record.result !== undefined) addError(collector, 'field_forbidden', `${path}.result`)
    skipReason = normalizeText(
      record.skipReason,
      `${path}.skipReason`,
      VERIFICATION_EVIDENCE_LIMITS.skipReasonBytes,
      collector,
      true,
      true,
    )
  } else if (status === 'passed' || status === 'failed') {
    result = normalizeText(
      record.result,
      `${path}.result`,
      VERIFICATION_EVIDENCE_LIMITS.resultBytes,
      collector,
      true,
      true,
    )
    if (record.skipReason !== undefined) {
      addError(collector, 'field_forbidden', `${path}.skipReason`)
    }
  }

  if (kind === undefined || title === undefined || status === undefined) return undefined
  if (status === 'skipped' && skipReason === undefined) return undefined
  if (status !== 'skipped' && result === undefined) return undefined
  return Object.freeze({
    kind,
    title,
    status,
    ...(command === undefined ? {} : { command }),
    ...(result === undefined ? {} : { result }),
    ...(skipReason === undefined ? {} : { skipReason }),
  })
}

const COPY = {
  en: {
    heading: 'Verification evidence draft',
    notice: 'Draft only: Tenon did not run these checks, save a verification report, or change the Verify gate.',
    check: 'Check',
    title: 'Title',
    type: 'Type',
    status: 'Status',
    command: 'Command',
    result: 'Result',
    skipReason: 'Skip reason',
    kinds: { command: 'Command', browser: 'Browser', review: 'Review', other: 'Other' },
    statuses: { passed: 'Passed', failed: 'Failed', skipped: 'Skipped' },
  },
  'zh-CN': {
    heading: '验证证据草稿',
    notice: '仅为草稿：Tenon 未执行这些检查、未保存验证报告，也未改变 Verify gate。',
    check: '检查',
    title: '标题',
    type: '类型',
    status: '状态',
    command: '命令',
    result: '结果',
    skipReason: '跳过原因',
    kinds: { command: '命令', browser: '浏览器', review: '评审', other: '其他' },
    statuses: { passed: '通过', failed: '失败', skipped: '跳过' },
  },
} as const

function textBlock(value: string): string {
  let longest = 0
  for (const match of value.matchAll(/`+/gu)) longest = Math.max(longest, match[0].length)
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}text\n${value}\n${fence}`
}

function renderDraft(draft: VerificationEvidenceDraft): string {
  const copy = COPY[draft.locale]
  const separator = draft.locale === 'zh-CN' ? '：' : ': '
  const lines = [
    `## ${copy.heading}`,
    '',
    `> ${copy.notice}`,
    '',
  ]
  draft.entries.forEach((entry, index) => {
    lines.push(
      `### ${copy.check} ${index + 1}`,
      '',
      `**${copy.title}**`,
      '',
      textBlock(entry.title),
      '',
      `- ${copy.type}${separator}${copy.kinds[entry.kind]}`,
      `- ${copy.status}${separator}${copy.statuses[entry.status]}`,
      '',
    )
    if (entry.command !== undefined) {
      lines.push(`**${copy.command}**`, '', textBlock(entry.command), '')
    }
    if (entry.result !== undefined) {
      lines.push(`**${copy.result}**`, '', textBlock(entry.result), '')
    } else if (entry.skipReason !== undefined) {
      lines.push(`**${copy.skipReason}**`, '', textBlock(entry.skipReason), '')
    }
  })
  return lines.join('\n')
}

export function composeVerificationEvidence(input: unknown): VerificationEvidenceComposition {
  const collector: ErrorCollector = { errors: [], overflow: false }
  const record = snapshotRecord(input)
  if (record === null) {
    addError(collector, 'object_invalid', '')
    return Object.freeze({ ok: false, errors: Object.freeze(collector.errors), overflow: false })
  }
  for (const key of Object.keys(record)) {
    if (!INPUT_FIELDS.has(key)) addError(collector, 'unknown_field', key)
  }
  const locale = enumValue(
    record.locale,
    new Set<VerificationEvidenceLocale>(['zh-CN', 'en']),
    'locale',
    collector,
  )
  const entriesSnapshot = snapshotArray(record.entries, VERIFICATION_EVIDENCE_LIMITS.maxEntries)
  if (entriesSnapshot.kind !== 'ok') {
    addError(
      collector,
      entriesSnapshot.kind === 'not_array'
        ? 'field_type'
        : entriesSnapshot.kind === 'too_many'
          ? 'entries_too_many'
          : 'object_invalid',
      'entries',
    )
    return Object.freeze({
      ok: false,
      errors: Object.freeze(collector.errors),
      overflow: collector.overflow,
    })
  }
  const sourceEntries = entriesSnapshot.value
  if (sourceEntries.length === 0) {
    addError(collector, 'entries_empty', 'entries')
    return Object.freeze({
      ok: false,
      errors: Object.freeze(collector.errors),
      overflow: collector.overflow,
    })
  }

  const entries: VerificationEvidenceEntry[] = []
  for (let index = 0; index < sourceEntries.length; index += 1) {
    const normalized = entryFromUnknown(sourceEntries[index], index, collector)
    if (normalized !== undefined) entries.push(normalized)
  }
  if (collector.errors.length > 0 || collector.overflow || locale === undefined) {
    return Object.freeze({
      ok: false,
      errors: Object.freeze(collector.errors),
      overflow: collector.overflow,
    })
  }
  const draft = Object.freeze({
    locale,
    entries: Object.freeze(entries),
  })
  const markdown = renderDraft(draft)
  if (encoder.encode(markdown).byteLength > VERIFICATION_EVIDENCE_LIMITS.outputBytes) {
    addError(collector, 'output_too_large', '')
    return Object.freeze({
      ok: false,
      errors: Object.freeze(collector.errors),
      overflow: collector.overflow,
    })
  }
  return Object.freeze({ ok: true, markdown, entryCount: entries.length })
}
