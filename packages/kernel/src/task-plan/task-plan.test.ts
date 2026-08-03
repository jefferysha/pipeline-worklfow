import { describe, expect, it, vi } from 'vitest'
import {
  decodeTaskPlanRevisionV1,
  encodeTaskPlanRevisionV1,
  TASK_PLAN_LIMITS,
  toTaskPlanReadModelV1,
  validateTaskPlanRevisionV1,
  type TaskPlanRevisionV1,
} from './index.js'
import { byteLength, byteLengthWithin } from './internal.js'

function revision(overrides: Partial<TaskPlanRevisionV1> = {}): TaskPlanRevisionV1 {
  return {
    schema_version: 'task-plan/v1',
    plan_id: 'plan-opaque-1',
    revision_id: 'revision-opaque-1',
    revision_number: 1,
    status: 'frozen',
    created_at: '2026-08-03T09:00:00.000Z',
    requirements: [{ id: 'req-1', title: 'Stable task identities' }],
    acceptance_criteria: [{ id: 'acc-1', title: 'Identity survives reorder' }],
    groups: [{ id: 'group-1', title: 'Kernel', parent_id: null, work_item_ids: ['wi-a', 'wi-b'] }],
    work_items: [
      {
        id: 'wi-a',
        title: 'Define contract',
        group_id: 'group-1',
        requirement_refs: ['req-1'],
        acceptance_refs: ['acc-1'],
        depends_on: [],
        resource_claims: [{ kind: 'path', access: 'write', key: 'packages/kernel/src/task-plan/types.ts' }],
        expected_outputs: [{ id: 'out-a', kind: 'file', ref: 'packages/kernel/src/task-plan/types.ts' }],
        validators: [{ id: 'validator-a', kind: 'file-exists', version: 1, output_ids: ['out-a'] }],
      },
      {
        id: 'wi-b',
        title: 'Verify contract',
        group_id: 'group-1',
        requirement_refs: [],
        acceptance_refs: [],
        depends_on: ['wi-a'],
        resource_claims: [{ kind: 'path', access: 'write', key: 'packages/kernel/src/task-plan/types.ts' }],
        expected_outputs: [{ id: 'out-b', kind: 'artifact', ref: 'kernel-test-report' }],
        validators: [{ id: 'validator-b', kind: 'test-report', version: 1, output_ids: ['out-b'] }],
      },
    ],
    ...overrides,
  }
}

describe('TaskPlan v1 codec', () => {
  it.each([
    '',
    'ASCII',
    '计划-ä',
    'emoji-😀',
    '\ud800',
    'a\udc00b',
  ])('counts UTF-8 bytes without allocating an encoded copy for %j', (value) => {
    expect(byteLength(value)).toBe(new TextEncoder().encode(value).byteLength)
  })

  it.each([
    ['ASCII exact', 'abcd', 4, 4],
    ['ASCII overflow', 'abcd', 3, undefined],
    ['BMP exact', '计划', 6, 6],
    ['BMP overflow', '计划', 5, undefined],
    ['astral exact', '😀', 4, 4],
    ['astral overflow', '😀', 3, undefined],
    ['unpaired surrogate replacement', '\ud800', 3, 3],
  ])('counts UTF-8 only within a caller budget: %s', (_label, value, limit, expected) => {
    expect(byteLengthWithin(value, limit)).toBe(expected)
  })

  it('rejects a many-times-over-budget string through the bounded byte counter', () => {
    const hostile = 'x'.repeat(TASK_PLAN_LIMITS.maxDocumentBytes * 4)
    const charCodeAt = vi.spyOn(String.prototype, 'charCodeAt')
    try {
      expect(byteLengthWithin(hostile, TASK_PLAN_LIMITS.maxDocumentBytes)).toBeUndefined()
      expect(charCodeAt).not.toHaveBeenCalled()
    } finally {
      charCodeAt.mockRestore()
    }
  })

  it('rejects line-breaking control characters before they can escape a Markdown projection', () => {
    const decoded = decodeTaskPlanRevisionV1(revision({
      work_items: revision().work_items.map((item, index) => index === 0
        ? { ...item, title: 'First line\n- [x] injected' }
        : item),
    }))
    expect(decoded.ok).toBe(false)
    if (decoded.ok) throw new Error('expected decode failure')
    expect(decoded.errors).toContainEqual({ code: 'control_character', path: '$.work_items[0].title' })
  })

  it('rejects path-like persistent identifiers', () => {
    for (const revisionId of ['../escaped', 'revision--comment-collision']) {
      const decoded = decodeTaskPlanRevisionV1(revision({ revision_id: revisionId }))
      expect(decoded.ok).toBe(false)
      if (decoded.ok) throw new Error('expected decode failure')
      expect(decoded.errors).toContainEqual({ code: 'identifier_invalid', path: '$.revision_id' })
    }
  })

  it('round-trips opaque IDs without deriving them from title, order, or group', () => {
    const original = revision()
    const decoded = decodeTaskPlanRevisionV1(encodeTaskPlanRevisionV1(original))
    expect(decoded).toEqual({ ok: true, value: original })
    if (!decoded.ok) throw new Error('expected decode success')

    const changed = revision({
      groups: [{ id: 'group-2', title: 'Moved', parent_id: null, work_item_ids: ['wi-b', 'wi-a'] }],
      work_items: [...decoded.value.work_items].reverse().map((item) => ({
        ...item,
        title: `Renamed ${item.title}`,
        group_id: 'group-2',
      })),
    })
    expect(changed.work_items.map((item) => item.id)).toEqual(['wi-b', 'wi-a'])
  })

  it('round-trips NFC Unicode opaque IDs through the real codec', () => {
    const unicode = revision({
      plan_id: 'plan-计划',
      revision_id: 'revision-修订',
      requirements: [{ id: 'req-ä', title: 'Unicode requirement' }],
      acceptance_criteria: [{ id: 'acc-東京', title: 'Unicode acceptance' }],
      groups: [{ id: 'group-组', title: 'Unicode group', parent_id: null, work_item_ids: ['wi-ä', 'wi-東京'] }],
      work_items: revision().work_items.map((item, index) => ({
        ...item,
        id: index === 0 ? 'wi-ä' : 'wi-東京',
        group_id: 'group-组',
        requirement_refs: index === 0 ? ['req-ä'] : [],
        acceptance_refs: index === 0 ? ['acc-東京'] : [],
        depends_on: index === 0 ? [] : ['wi-ä'],
        expected_outputs: item.expected_outputs.map((output) => ({
          ...output,
          id: `${output.id}-产物`,
        })),
        validators: item.validators.map((validator) => ({
          ...validator,
          id: `${validator.id}-验证`,
          output_ids: validator.output_ids.map((id) => `${id}-产物`),
        })),
      })),
    })

    expect(decodeTaskPlanRevisionV1(encodeTaskPlanRevisionV1(unicode))).toEqual({ ok: true, value: unicode })
    expect(validateTaskPlanRevisionV1(unicode).freezable).toBe(true)
  })

  it.each([
    ['wi-a\u0308', 'identifier_invalid'],
    ['wi/escape', 'identifier_invalid'],
    ['wi\\escape', 'identifier_invalid'],
    [' wi-space', 'field_required'],
    ['wi space', 'identifier_invalid'],
  ]) (
    'rejects non-NFC, separator, or whitespace opaque identifier %s',
    (id, code) => {
      const decoded = decodeTaskPlanRevisionV1(revision({ revision_id: id }))
      expect(decoded.ok).toBe(false)
      if (decoded.ok) throw new Error('expected decode failure')
      expect(decoded.errors).toContainEqual({ code, path: '$.revision_id' })
    },
  )

  it('deep-freezes decoded input and does not retain caller references', () => {
    const raw = JSON.parse(JSON.stringify(revision())) as unknown
    const decoded = decodeTaskPlanRevisionV1(raw)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) throw new Error('expected decode success')
    expect(Object.isFrozen(decoded.value)).toBe(true)
    expect(Object.isFrozen(decoded.value.work_items[0]?.resource_claims)).toBe(true)
  })

  it.each([
    ['future schema', { ...revision(), schema_version: 'task-plan/v2' }, 'schema_version'],
    ['unknown field', { ...revision(), surprise: true }, '$.surprise'],
    ['control character', { ...revision(), plan_id: 'bad\u0000id' }, '$.plan_id'],
    ['duplicate ID', { ...revision(), work_items: [revision().work_items[0], revision().work_items[0]] }, '$.work_items[1].id'],
  ])('rejects %s with bounded structured errors', (_label, input, expectedPath) => {
    const result = decodeTaskPlanRevisionV1(input)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected decode failure')
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.length).toBeLessThanOrEqual(64)
    expect(result.errors.some((error) => error.path.includes(expectedPath))).toBe(true)
  })

  it('rejects oversized collections before iterating their contents', () => {
    const result = decodeTaskPlanRevisionV1({ ...revision(), groups: Array.from({ length: 257 }, () => null) })
    expect(result).toMatchObject({ ok: false, errors: [{ code: 'array_too_large', path: '$.groups' }] })
  })

  it('accepts bounded persisted whitespace through maxRevisionBytes and rejects the next byte', () => {
    const encoded = encodeTaskPlanRevisionV1(revision())
    const maximumPersisted = encoded.padEnd(TASK_PLAN_LIMITS.maxRevisionBytes, ' ')
    expect(Buffer.byteLength(maximumPersisted)).toBe(TASK_PLAN_LIMITS.maxRevisionBytes)
    expect(decodeTaskPlanRevisionV1(maximumPersisted)).toMatchObject({ ok: true })
    expect(decodeTaskPlanRevisionV1(`${maximumPersisted} `)).toEqual({
      ok: false,
      errors: [{ code: 'document_too_large', path: '$' }],
      overflow: false,
    })
  })

  it('rejects a many-times-over-budget encoded document through the bounded counter', () => {
    expect(decodeTaskPlanRevisionV1(' '.repeat(TASK_PLAN_LIMITS.maxRevisionBytes * 4))).toEqual({
      ok: false,
      errors: [{ code: 'document_too_large', path: '$' }],
      overflow: false,
    })
  })

  it('rejects an accessor-backed array without invoking its index getter', () => {
    const entry = revision().requirements[0]!
    const hostile = [entry]
    let hits = 0
    Object.defineProperty(hostile, '0', {
      get() {
        hits += 1
        return entry
      },
      enumerable: true,
      configurable: true,
    })

    const decoded = decodeTaskPlanRevisionV1({ ...revision(), requirements: hostile })

    expect(hits).toBe(0)
    expect(decoded).toMatchObject({
      ok: false,
      errors: [{ code: 'array_invalid', path: '$.requirements' }],
    })
  })

  it('stops object decoding when nested relations exceed the global traversal budget', () => {
    const template = revision().work_items[0]!
    const workItems = Array.from({ length: 500 }, (_, index) => ({
      ...template,
      id: `wi-${index}`,
      depends_on: Array.from({ length: 128 }, () => 'wi-0'),
      expected_outputs: [],
      validators: [],
    }))
    const decoded = decodeTaskPlanRevisionV1(revision({ work_items: workItems }))
    expect(decoded.ok).toBe(false)
    if (decoded.ok) throw new Error('expected decode failure')
    expect(decoded.errors.map((entry) => entry.code)).toContain('document_too_large')
  })

  it('counts hostile object field-name bytes before copying values or building diagnostics', () => {
    const input = revision() as TaskPlanRevisionV1 & Record<string, unknown>
    const oversizedKey = 'x'.repeat(TASK_PLAN_LIMITS.maxDocumentBytes + 1)
    Object.defineProperty(input, oversizedKey, {
      enumerable: true,
      configurable: true,
      value: true,
    })

    expect(decodeTaskPlanRevisionV1(input)).toEqual({
      ok: false,
      errors: [{ code: 'document_too_large', path: '$' }],
      overflow: false,
    })
  })

  it('rejects a many-times-over-budget text value before Unicode and whitespace validation', () => {
    const oversizedTitle = 'x'.repeat(TASK_PLAN_LIMITS.maxDocumentBytes * 4)
    const originalCharCodeAt = String.prototype.charCodeAt
    let oversizedScans = 0
    const charCodeAt = vi.spyOn(String.prototype, 'charCodeAt').mockImplementation(function (index) {
      if (String(this) === oversizedTitle) oversizedScans += 1
      return originalCharCodeAt.call(this, index)
    })
    let decoded: ReturnType<typeof decodeTaskPlanRevisionV1>
    try {
      decoded = decodeTaskPlanRevisionV1(revision({
        work_items: revision().work_items.map((item, index) => index === 0
          ? { ...item, title: oversizedTitle }
          : item),
      }))
    } finally {
      charCodeAt.mockRestore()
    }

    expect(decoded.ok).toBe(false)
    if (decoded.ok) return
    expect(decoded.errors).toContainEqual({
      code: 'field_too_large',
      path: '$.work_items[0].title',
    })
    expect(oversizedScans).toBe(0)
  })

  it.each([
    ['cumulative ASCII keys', ['x'.repeat(600_000), 'y'.repeat(600_000)]],
    ['one multibyte key', ['界'.repeat(Math.floor(TASK_PLAN_LIMITS.maxDocumentBytes / 3) + 1)]],
  ])('counts %s by UTF-8 bytes against the aggregate document budget', (_label, keys) => {
    const input = revision() as TaskPlanRevisionV1 & Record<string, unknown>
    for (const key of keys) {
      Object.defineProperty(input, key, {
        enumerable: true,
        configurable: true,
        value: true,
      })
    }

    expect(decodeTaskPlanRevisionV1(input)).toEqual({
      ok: false,
      errors: [{ code: 'document_too_large', path: '$' }],
      overflow: false,
    })
  })

  it('does not invoke an accessor after an oversized property name exhausts the budget', () => {
    const input = revision() as TaskPlanRevisionV1 & Record<string, unknown>
    let getterCalls = 0
    Object.defineProperty(input, 'x'.repeat(TASK_PLAN_LIMITS.maxDocumentBytes + 1), {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1
        return true
      },
    })

    expect(decodeTaskPlanRevisionV1(input)).toMatchObject({
      ok: false,
      errors: [{ code: 'document_too_large', path: '$' }],
    })
    expect(getterCalls).toBe(0)
  })

  it('bounds unknown-field paths whose keys fit inside the aggregate document budget', () => {
    const input = revision() as TaskPlanRevisionV1 & Record<string, unknown>
    const longUnknownKey = '界'.repeat(TASK_PLAN_LIMITS.maxTextBytes)
    Object.defineProperty(input, longUnknownKey, {
      enumerable: true,
      configurable: true,
      value: true,
    })

    const decoded = decodeTaskPlanRevisionV1(input)
    expect(decoded.ok).toBe(false)
    if (decoded.ok) return
    expect(decoded.errors).toContainEqual({
      code: 'unknown_field',
      path: '$.[unknown-field-too-large]',
    })
    expect(decoded.errors.every((entry) => Buffer.byteLength(entry.path) <= TASK_PLAN_LIMITS.maxTextBytes)).toBe(true)
  })
})

describe('TaskPlan v1 validation and read projection', () => {
  it('reports complete coverage and dependency-serialized writers', () => {
    const result = validateTaskPlanRevisionV1(revision())
    expect(result.valid).toBe(true)
    expect(result.freezable).toBe(true)
    expect(result.coverage).toEqual({
      complete: true,
      requirements: [{ id: 'req-1', work_item_ids: ['wi-a'] }],
      acceptance_criteria: [{ id: 'acc-1', work_item_ids: ['wi-a'] }],
      uncovered_requirement_ids: [],
      uncovered_acceptance_ids: [],
    })
    expect(result.resources.conflicts).toEqual([])
    expect(result.resources.serialized).toEqual([{
      resource: 'path:packages/kernel/src/task-plan/types.ts',
      before_work_item_id: 'wi-a',
      after_work_item_id: 'wi-b',
    }])
  })

  it('does not invent dependency edges from group order', () => {
    const input = revision({
      work_items: revision().work_items.map((item) => ({
        ...item,
        depends_on: [],
        resource_claims: [],
      })),
    })
    const read = toTaskPlanReadModelV1(input, { state: 'current' })
    expect(read.requirements).toEqual([{ id: 'req-1', title: 'Stable task identities' }])
    expect(read.acceptance_criteria).toEqual([{ id: 'acc-1', title: 'Identity survives reorder' }])
    expect(read.dependencies.edges).toEqual([])
  })

  it('deep-freezes the read DTO without changing caller descriptors or frozen state', () => {
    const input = revision()
    const requirement = input.requirements[0]!
    Object.defineProperty(requirement, 'title', {
      value: requirement.title,
      enumerable: true,
      configurable: true,
      writable: false,
    })
    Object.freeze(input.work_items[0]!.resource_claims[0])
    const tracked = [
      input,
      input.requirements,
      requirement,
      input.groups,
      input.groups[0]!,
      input.groups[0]!.work_item_ids,
      input.work_items,
      input.work_items[0]!,
      input.work_items[0]!.resource_claims,
      input.work_items[0]!.resource_claims[0]!,
      input.work_items[0]!.validators[0]!,
      input.work_items[0]!.validators[0]!.output_ids,
    ] as const
    const before = tracked.map((value) => ({
      frozen: Object.isFrozen(value),
      descriptors: Object.getOwnPropertyDescriptors(value),
    }))

    const read = toTaskPlanReadModelV1(input, { state: 'pending', reason: 'projection queued' })

    for (const [index, value] of tracked.entries()) {
      expect(Object.isFrozen(value)).toBe(before[index]!.frozen)
      expect(Object.getOwnPropertyDescriptors(value)).toEqual(before[index]!.descriptors)
    }
    const pending: unknown[] = [read]
    const visited = new Set<object>()
    while (pending.length > 0) {
      const value = pending.pop()
      if (value === null || typeof value !== 'object' || visited.has(value)) continue
      visited.add(value)
      expect(Object.isFrozen(value)).toBe(true)
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
        if ('value' in descriptor) pending.push(descriptor.value)
      }
    }
  })

  it('rejects duplicate entity IDs in the public validator without requiring a codec round-trip', () => {
    const base = revision()
    const cases: Array<{
      label: string
      input: TaskPlanRevisionV1
      duplicatePath: string
      duplicateId: string
    }> = [
      {
        label: 'plan/revision',
        input: revision({ revision_id: base.plan_id }),
        duplicatePath: '$.revision_id',
        duplicateId: base.plan_id,
      },
      {
        label: 'catalog',
        input: revision({
          requirements: [base.requirements[0]!, { ...base.requirements[0]!, title: 'Duplicate requirement' }],
        }),
        duplicatePath: '$.requirements[1].id',
        duplicateId: 'req-1',
      },
      {
        label: 'cross-kind catalog/group',
        input: revision({
          groups: [{ ...base.groups[0]!, id: 'req-1' }],
          work_items: base.work_items.map((item) => ({ ...item, group_id: 'req-1' })),
        }),
        duplicatePath: '$.groups[0].id',
        duplicateId: 'req-1',
      },
      {
        label: 'group',
        input: revision({
          groups: [base.groups[0]!, { ...base.groups[0]!, work_item_ids: [] }],
        }),
        duplicatePath: '$.groups[1].id',
        duplicateId: 'group-1',
      },
      {
        label: 'work item',
        input: revision({
          groups: [{ ...base.groups[0]!, work_item_ids: ['wi-a'] }],
          work_items: [base.work_items[0]!, { ...base.work_items[0]!, title: 'Duplicate work item' }],
        }),
        duplicatePath: '$.work_items[1].id',
        duplicateId: 'wi-a',
      },
      {
        label: 'output across work items',
        input: revision({
          work_items: base.work_items.map((item, index) => index === 1
            ? { ...item, expected_outputs: [{ ...item.expected_outputs[0]!, id: 'out-a' }] }
            : item),
        }),
        duplicatePath: '$.work_items[1].expected_outputs[0].id',
        duplicateId: 'out-a',
      },
      {
        label: 'validator across work items',
        input: revision({
          work_items: base.work_items.map((item, index) => index === 1
            ? { ...item, validators: [{ ...item.validators[0]!, id: 'validator-a' }] }
            : item),
        }),
        duplicatePath: '$.work_items[1].validators[0].id',
        duplicateId: 'validator-a',
      },
    ]

    const nestedCollisionCases: ReadonlyArray<{
      label: string
      duplicatePath: string
      input: (duplicateId: string) => TaskPlanRevisionV1
    }> = [
      {
        label: 'requirement',
        duplicatePath: '$.requirements[1].id',
        input: (duplicateId) => revision({
          requirements: [
            base.requirements[0]!,
            { ...base.requirements[0]!, id: duplicateId, title: 'Top-level ID collision' },
          ],
        }),
      },
      {
        label: 'acceptance criterion',
        duplicatePath: '$.acceptance_criteria[1].id',
        input: (duplicateId) => revision({
          acceptance_criteria: [
            base.acceptance_criteria[0]!,
            { ...base.acceptance_criteria[0]!, id: duplicateId, title: 'Top-level ID collision' },
          ],
        }),
      },
      {
        label: 'group',
        duplicatePath: '$.groups[0].id',
        input: (duplicateId) => revision({
          groups: [{ ...base.groups[0]!, id: duplicateId }],
          work_items: base.work_items.map((item) => ({ ...item, group_id: duplicateId })),
        }),
      },
      {
        label: 'work item',
        duplicatePath: '$.work_items[0].id',
        input: (duplicateId) => revision({
          groups: [{ ...base.groups[0]!, work_item_ids: [duplicateId, 'wi-b'] }],
          work_items: base.work_items.map((item, index) => index === 0
            ? { ...item, id: duplicateId }
            : { ...item, depends_on: [duplicateId] }),
        }),
      },
      {
        label: 'output',
        duplicatePath: '$.work_items[0].expected_outputs[0].id',
        input: (duplicateId) => revision({
          work_items: base.work_items.map((item, index) => index === 0
            ? {
                ...item,
                expected_outputs: [{ ...item.expected_outputs[0]!, id: duplicateId }],
                validators: [{ ...item.validators[0]!, output_ids: [duplicateId] }],
              }
            : item),
        }),
      },
      {
        label: 'validator',
        duplicatePath: '$.work_items[0].validators[0].id',
        input: (duplicateId) => revision({
          work_items: base.work_items.map((item, index) => index === 0
            ? { ...item, validators: [{ ...item.validators[0]!, id: duplicateId }] }
            : item),
        }),
      },
    ]

    for (const topLevel of [
      { label: 'plan', id: base.plan_id },
      { label: 'revision', id: base.revision_id },
    ] as const) {
      for (const nested of nestedCollisionCases) {
        cases.push({
          label: `${topLevel.label}/${nested.label}`,
          input: nested.input(topLevel.id),
          duplicatePath: nested.duplicatePath,
          duplicateId: topLevel.id,
        })
      }
    }

    for (const { label, input, duplicatePath, duplicateId } of cases) {
      const decoded = decodeTaskPlanRevisionV1(input)
      expect(decoded.ok, label).toBe(false)
      if (decoded.ok) throw new Error(`expected duplicate ${label} decode failure`)
      expect(decoded.errors, label).toContainEqual({ code: 'duplicate_id', path: duplicatePath })

      const validation = validateTaskPlanRevisionV1(input)
      expect(validation.issues, label).toContainEqual({
        severity: 'error',
        code: 'entity-id-duplicate',
        path: duplicatePath,
        related_ids: [duplicateId],
      })
      expect(validation.valid, label).toBe(false)
      expect(validation.freezable, label).toBe(false)
      expect(() => toTaskPlanReadModelV1(input, { state: 'current' }), label)
        .toThrow('TaskPlan revision cannot be projected')
    }
  })

  it('reports duplicate IDs from a safe decoded candidate without executing caller Proxy traps', () => {
    const input = revision()
    const duplicateRequirements = [
      input.requirements[0]!,
      { ...input.requirements[0]!, title: 'Duplicate requirement' },
    ]
    let getterCalls = 0
    const requirements = new Proxy(duplicateRequirements, {
      get() {
        getterCalls += 1
        throw new Error('hostile-get')
      },
    })
    const hostile = revision({ requirements })

    const decoded = decodeTaskPlanRevisionV1(hostile)
    expect(decoded).toMatchObject({
      ok: false,
      errors: [{ code: 'duplicate_id', path: '$.requirements[1].id' }],
    })
    const validation = validateTaskPlanRevisionV1(hostile)
    expect(validation.issues).toContainEqual({
      severity: 'error',
      code: 'entity-id-duplicate',
      path: '$.requirements[1].id',
      related_ids: ['req-1'],
    })
    expect(validation.valid).toBe(false)
    expect(() => toTaskPlanReadModelV1(hostile, { state: 'current' }))
      .toThrow('TaskPlan revision cannot be projected at $.requirements[1].id')
    expect(getterCalls).toBe(0)
  })

  it.each([
    ['future schema', { ...revision(), schema_version: 'task-plan/v2' } as TaskPlanRevisionV1, '$.schema_version', 'enum_invalid'],
    ['unknown field', { ...revision(), unexpected: true } as TaskPlanRevisionV1, '$.unexpected', 'unknown_field'],
    ['invalid identifier', revision({ revision_id: '../escape' }), '$.revision_id', 'identifier_invalid'],
    ['non-NFC identifier', revision({ revision_id: 'revision-a\u0308' }), '$.revision_id', 'identifier_invalid'],
    ['invalid status', revision({ status: 'future' as TaskPlanRevisionV1['status'] }), '$.status', 'enum_invalid'],
    ['invalid timestamp', revision({ created_at: 'not-a-timestamp' }), '$.created_at', 'timestamp_invalid'],
    ['invalid revision number', revision({ revision_number: 0 }), '$.revision_number', 'integer_invalid'],
    ['control character', revision({
      work_items: revision().work_items.map((item, index) => index === 0
        ? { ...item, title: 'unsafe\nheading' }
        : item),
    }), '$.work_items[0].title', 'control_character'],
    ['oversized text', revision({
      work_items: revision().work_items.map((item, index) => index === 0
        ? { ...item, title: 'x'.repeat(TASK_PLAN_LIMITS.maxTextBytes + 1) }
        : item),
    }), '$.work_items[0].title', 'field_too_large'],
    ['unnormalized path claim', revision({
      work_items: revision().work_items.map((item, index) => index === 0
        ? { ...item, resource_claims: [{ kind: 'path', access: 'write', key: '../outside' }] }
        : item),
    }), '$.work_items[0].resource_claims[0].key', 'resource_not_normalized'],
    ['unnormalized file output', revision({
      work_items: revision().work_items.map((item, index) => index === 0
        ? { ...item, expected_outputs: [{ ...item.expected_outputs[0]!, ref: '../outside' }] }
        : item),
    }), '$.work_items[0].expected_outputs[0].ref', 'resource_not_normalized'],
  ])('rejects codec-invalid typed %s through the public validator and read model', (
    _label,
    input,
    path,
    codecError,
  ) => {
    const decoded = decodeTaskPlanRevisionV1(input)
    expect(decoded.ok).toBe(false)
    if (decoded.ok) throw new Error('expected codec-invalid fixture')
    expect(decoded.errors).toContainEqual({ code: codecError, path })

    const validation = validateTaskPlanRevisionV1(input)
    expect(validation.issues).toContainEqual({
      severity: 'error',
      code: 'task-plan-contract-invalid',
      path,
      related_ids: [codecError],
    })
    expect(validation.valid).toBe(false)
    expect(validation.freezable).toBe(false)
    expect(() => toTaskPlanReadModelV1(input, { state: 'current' }))
      .toThrow(`TaskPlan revision cannot be projected at ${path}`)
  })

  it('rejects nested unknown fields without copying them into the stable read DTO', () => {
    const input = revision({
      work_items: revision().work_items.map((item, index) => index === 0
        ? { ...item, private_payload: 'leaked' }
        : item) as unknown as TaskPlanRevisionV1['work_items'],
    })

    const validation = validateTaskPlanRevisionV1(input)
    expect(validation).toMatchObject({ valid: false, freezable: false })
    expect(validation.issues).toContainEqual({
      severity: 'error',
      code: 'task-plan-contract-invalid',
      path: '$.work_items[0].private_payload',
      related_ids: ['unknown_field'],
    })
    expect(() => toTaskPlanReadModelV1(input, { state: 'current' }))
      .toThrow('TaskPlan revision cannot be projected at $.work_items[0].private_payload')
  })

  it.each([
    ['missing requirements', { ...revision(), requirements: undefined } as unknown as TaskPlanRevisionV1, '$.requirements'],
    ['null acceptance catalog', { ...revision(), acceptance_criteria: null } as unknown as TaskPlanRevisionV1, '$.acceptance_criteria'],
    ['null group', { ...revision(), groups: [null] } as unknown as TaskPlanRevisionV1, '$.groups[0]'],
    ['null dependency list', revision({
      work_items: revision().work_items.map((item, index) => index === 0
        ? { ...item, depends_on: null as unknown as readonly string[] }
        : item),
    }), '$.work_items[0].depends_on'],
  ])('rejects structurally invalid typed %s before read-model traversal', (_label, input, path) => {
    const validation = validateTaskPlanRevisionV1(input)
    expect(validation.valid).toBe(false)
    expect(validation.issues).toContainEqual({
      severity: 'error',
      code: 'task-plan-contract-invalid',
      path,
      related_ids: [expect.stringMatching(/^(array|field|object)_/)],
    })
    expect(() => toTaskPlanReadModelV1(input, { state: 'current' }))
      .toThrow(`TaskPlan revision cannot be projected at ${path}`)
  })

  it('rejects an accessor-backed typed array without executing its getter in the read model', () => {
    const input = revision()
    let getterCalls = 0
    const workItems = [...input.work_items]
    Object.defineProperty(workItems, '0', {
      enumerable: true,
      configurable: true,
      get: () => {
        getterCalls += 1
        return input.work_items[0]
      },
    })
    const hostile = { ...input, work_items: workItems }

    expect(() => toTaskPlanReadModelV1(hostile, { state: 'current' }))
      .toThrow('TaskPlan revision cannot be projected at $.work_items')
    expect(getterCalls).toBe(0)
  })

  it('returns stable sorted issues for ownership, refs, cycles, and uncovered catalogs', () => {
    const input = revision({
      groups: [
        { id: 'group-1', title: 'One', parent_id: 'group-2', work_item_ids: ['wi-a', 'wi-b'] },
        { id: 'group-2', title: 'Two', parent_id: 'group-1', work_item_ids: ['wi-a'] },
      ],
      work_items: [
        { ...revision().work_items[0]!, requirement_refs: ['missing'], acceptance_refs: [], depends_on: ['wi-b'] },
        { ...revision().work_items[1]!, requirement_refs: [], acceptance_refs: [], depends_on: ['wi-a'] },
      ],
    })
    const first = validateTaskPlanRevisionV1(input)
    const second = validateTaskPlanRevisionV1(input)
    expect(first).toEqual(second)
    expect(first.valid).toBe(false)
    expect(first.freezable).toBe(false)
    expect(first.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'acceptance-uncovered',
      'dependency-cycle',
      'group-cycle',
      'requirement-ref-unknown',
      'requirement-uncovered',
      'work-item-multiple-groups',
    ]))
    expect(first.issues).toEqual([...first.issues].sort((left, right) => {
      const leftKey = `${left.code}\u0000${left.path}\u0000${left.related_ids.join('\u0000')}`
      const rightKey = `${right.code}\u0000${right.path}\u0000${right.related_ids.join('\u0000')}`
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
    }))
  })

  it('sorts every diagnostic projection with locale-independent ordinal semantics', () => {
    const baseItems = revision().work_items
    const ids = ['wi-z', 'wi-ä', 'wi-A'] as const
    const input = revision({
      requirements: [
        { id: 'req-ä', title: 'Unicode' },
        { id: 'req-z', title: 'Lower ASCII' },
        { id: 'req-A', title: 'Upper ASCII' },
      ],
      acceptance_criteria: [
        { id: 'acc-ä', title: 'Unicode' },
        { id: 'acc-z', title: 'Lower ASCII' },
        { id: 'acc-A', title: 'Upper ASCII' },
      ],
      groups: [{ id: 'group-1', title: 'Kernel', parent_id: null, work_item_ids: [...ids] }],
      work_items: ids.map((id, index) => ({
        ...baseItems[index % baseItems.length]!,
        id,
        requirement_refs: index === 0 ? ['req-ä'] : index === 1 ? ['req-z'] : ['req-A', 'missing-ä'],
        acceptance_refs: index === 0 ? ['acc-ä'] : index === 1 ? ['acc-z'] : ['acc-A', 'missing-z'],
        depends_on: index === 0 ? ['wi-A'] : index === 1 ? ['wi-A'] : [],
        resource_claims: [
          { kind: 'path' as const, access: 'write' as const, key: 'z/resource' },
          { kind: 'path' as const, access: 'write' as const, key: 'ä/resource' },
          { kind: 'path' as const, access: 'write' as const, key: 'A/resource' },
        ],
      })),
    })
    const originalLocaleCompare = String.prototype.localeCompare
    const ordinal = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0
    const assertSorted = <T>(values: readonly T[], key: (value: T) => string): void => {
      expect(values).toEqual([...values].sort((left, right) => ordinal(key(left), key(right))))
    }

    const baseline = validateTaskPlanRevisionV1(input)
    let adversarial: ReturnType<typeof validateTaskPlanRevisionV1>
    try {
      Object.defineProperty(String.prototype, 'localeCompare', {
        configurable: true,
        writable: true,
        value(this: string, other: string) {
          return -ordinal(String(this), String(other))
        },
      })
      adversarial = validateTaskPlanRevisionV1(input)
    } finally {
      Object.defineProperty(String.prototype, 'localeCompare', {
        configurable: true,
        writable: true,
        value: originalLocaleCompare,
      })
    }

    expect(JSON.stringify(adversarial)).toBe(JSON.stringify(baseline))
    assertSorted(adversarial.coverage.requirements, (entry) => entry.id)
    assertSorted(adversarial.coverage.acceptance_criteria, (entry) => entry.id)
    for (const entry of [...adversarial.coverage.requirements, ...adversarial.coverage.acceptance_criteria]) {
      assertSorted(entry.work_item_ids, (id) => id)
    }
    assertSorted(adversarial.dependencies.edges, (edge) => `${edge.from_work_item_id}\u0000${edge.to_work_item_id}`)
    assertSorted(adversarial.resources.conflicts, (entry) => `${entry.resource}\u0000${entry.work_item_ids.join('\u0000')}`)
    assertSorted(adversarial.resources.serialized, (entry) =>
      `${entry.resource}\u0000${entry.before_work_item_id}\u0000${entry.after_work_item_id}`,
    )
    assertSorted(adversarial.issues, (entry) =>
      `${entry.code}\u0000${entry.path}\u0000${entry.related_ids.join('\u0000')}`,
    )
    for (const entry of adversarial.issues) assertSorted(entry.related_ids, (id) => id)
  })

  it('rejects unordered exact writer overlap but allows distinct exact resources', () => {
    const conflicting = revision({
      work_items: revision().work_items.map((item) => ({ ...item, depends_on: [] })),
    })
    expect(validateTaskPlanRevisionV1(conflicting).resources.conflicts).toEqual([{
      resource: 'path:packages/kernel/src/task-plan/types.ts',
      work_item_ids: ['wi-a', 'wi-b'],
    }])

    const distinct = revision({
      work_items: revision().work_items.map((item, index) => ({
        ...item,
        depends_on: [],
        resource_claims: [{ kind: 'logical', access: 'write', key: `task-plan/${index}` }],
      })),
    })
    expect(validateTaskPlanRevisionV1(distinct).resources.conflicts).toEqual([])
  })

  it('fails closed with bounded diagnostics when resource pairs exceed the analysis budget', () => {
    const template = revision().work_items[0]!
    const workItems = Array.from({ length: 92 }, (_, index) => ({
      ...template,
      id: `wi-${index}`,
      depends_on: [],
      expected_outputs: [{ id: `out-${index}`, kind: 'file' as const, ref: `out/${index}.json` }],
      validators: [{ id: `validator-${index}`, kind: 'file-exists' as const, version: 1 as const, output_ids: [`out-${index}`] }],
    }))
    const result = validateTaskPlanRevisionV1(revision({
      groups: [{ id: 'group-1', title: 'Kernel', parent_id: null, work_item_ids: workItems.map((item) => item.id) }],
      work_items: workItems,
    }))
    expect(result).toMatchObject({ valid: false, freezable: false, truncated: true })
    expect(result.issues.length).toBeLessThanOrEqual(256)
    expect(result.resources.conflicts.length).toBeLessThanOrEqual(4096)
    expect(result.issues.map((entry) => entry.code)).toContain('diagnostic-budget-exceeded')
  })

  it.each(['../secret', '/absolute', 'src//file.ts', 'src/./file.ts', 'src\\file.ts']) (
    'strictly rejects non-normal project-relative resource %s',
    (key) => {
      const input = JSON.parse(JSON.stringify(revision())) as Record<string, unknown>
      const workItems = input.work_items as Array<Record<string, unknown>>
      workItems[0]!.resource_claims = [{ kind: 'path', access: 'read', key }]
      const decoded = decodeTaskPlanRevisionV1(input)
      expect(decoded.ok).toBe(false)
      if (decoded.ok) throw new Error('expected decode failure')
      expect(decoded.errors.some((error) => error.code === 'resource_not_normalized')).toBe(true)
    },
  )

  it('rejects arbitrary command validators and unknown output references', () => {
    const raw = JSON.parse(JSON.stringify(revision())) as Record<string, unknown>
    const workItems = raw.work_items as Array<Record<string, unknown>>
    workItems[0]!.validators = [{
      id: 'validator-command',
      kind: 'command',
      version: 1,
      output_ids: ['unknown-output'],
      command: 'rm -rf .',
    }]
    const decoded = decodeTaskPlanRevisionV1(raw)
    expect(decoded.ok).toBe(false)
    if (decoded.ok) throw new Error('expected decode failure')
    expect(decoded.errors.map((error) => error.code)).toEqual(expect.arrayContaining(['enum_invalid', 'unknown_field']))

    const invalidRef = revision({
      work_items: revision().work_items.map((item, index) => index === 0
        ? { ...item, validators: [{ ...item.validators[0]!, output_ids: ['unknown-output'] }] }
        : item),
    })
    expect(validateTaskPlanRevisionV1(invalidRef).issues.map((issue) => issue.code)).toContain('validator-output-unknown')
  })

  it('only marks a valid frozen canonical revision schedulable', () => {
    expect(toTaskPlanReadModelV1(revision(), { state: 'current' }).schedulable).toBe(true)
    expect(toTaskPlanReadModelV1(revision({ status: 'draft' }), { state: 'current' }).schedulable).toBe(false)
  })
})
