import type { TaskPlanRevisionV1 } from './types.js'

const encoder = new TextEncoder()

export interface TaskPlanEntityIdEntry {
  readonly id: string
  readonly path: string
}

export function taskPlanEntityIdEntries(value: TaskPlanRevisionV1): readonly TaskPlanEntityIdEntry[] {
  return [
    { id: value.plan_id, path: '$.plan_id' },
    { id: value.revision_id, path: '$.revision_id' },
    ...value.requirements.map((entry, index) => ({ id: entry.id, path: `$.requirements[${index}].id` })),
    ...value.acceptance_criteria.map((entry, index) => ({ id: entry.id, path: `$.acceptance_criteria[${index}].id` })),
    ...value.groups.map((entry, index) => ({ id: entry.id, path: `$.groups[${index}].id` })),
    ...value.work_items.flatMap((item, index) => [
      { id: item.id, path: `$.work_items[${index}].id` },
      ...item.expected_outputs.map((entry, outputIndex) => ({
        id: entry.id,
        path: `$.work_items[${index}].expected_outputs[${outputIndex}].id`,
      })),
      ...item.validators.map((entry, validatorIndex) => ({
        id: entry.id,
        path: `$.work_items[${index}].validators[${validatorIndex}].id`,
      })),
    ]),
  ]
}

export function byteLength(value: string): number {
  return encoder.encode(value).byteLength
}

export function hasInvalidSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index)
    if (current >= 0xd800 && current <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (current >= 0xdc00 && current <= 0xdfff) return true
  }
  return false
}

export function hasUnsafeControl(value: string): boolean {
  return /[\u0000-\u001f\u007f-\u009f]/u.test(value)
}

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) deepFreeze(descriptor.value)
  }
  return Object.freeze(value)
}

export function exactResourceKey(kind: 'path' | 'logical' | 'external', key: string): string | undefined {
  if (key === '' || key !== key.trim() || key !== key.normalize('NFC') || hasInvalidSurrogate(key) || hasUnsafeControl(key)) {
    return undefined
  }
  if (key.includes('\\') || key.startsWith('/') || key.endsWith('/') || key.includes('//')) return undefined
  const segments = key.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return undefined
  if (kind === 'path' && key.includes(':')) return undefined
  if (kind !== 'path' && !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(key)) return undefined
  return `${kind}:${key}`
}
