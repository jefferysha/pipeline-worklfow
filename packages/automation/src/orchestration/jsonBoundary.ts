export type JsonBoundaryValue = null | boolean | number | string
  | readonly JsonBoundaryValue[]
  | { readonly [key: string]: JsonBoundaryValue }

export type JsonBoundaryErrorCode =
  | 'json-type-invalid'
  | 'json-accessor-rejected'
  | 'json-cycle'
  | 'json-depth-exceeded'
  | 'json-node-budget-exceeded'
  | 'json-byte-budget-exceeded'

export class JsonBoundaryError extends Error {
  override readonly name = 'JsonBoundaryError'

  constructor(
    readonly code: JsonBoundaryErrorCode,
    readonly path: string,
  ) {
    super(`${code} at ${path}`)
  }
}

export interface JsonBoundarySnapshot {
  readonly value: JsonBoundaryValue
  readonly json: string
  readonly bytes: number
}

export interface JsonBoundaryLimits {
  readonly maxBytes: number
  readonly maxDepth?: number
  readonly maxNodes?: number
}

const encoder = new TextEncoder()

function ownDataDescriptors(value: object, path: string): PropertyDescriptorMap {
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = Reflect.get(descriptors, key) as PropertyDescriptor | undefined
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new JsonBoundaryError('json-accessor-rejected', `${path}.${String(key)}`)
    }
  }
  return descriptors
}

/**
 * Takes a bounded, accessor-free JSON snapshot of untrusted provider output. The returned clone is
 * the only value downstream decoders may inspect; getters, proxies that throw, cycles, custom
 * prototypes, sparse arrays, and non-JSON primitives fail closed at this boundary.
 */
export function snapshotJsonBoundary(
  input: unknown,
  limits: JsonBoundaryLimits,
): JsonBoundarySnapshot {
  const maxDepth = limits.maxDepth ?? 32
  const maxNodes = limits.maxNodes ?? 4_096
  if (!Number.isSafeInteger(limits.maxBytes) || limits.maxBytes <= 0) {
    throw new TypeError('maxBytes must be a positive safe integer')
  }
  if (!Number.isSafeInteger(maxDepth) || maxDepth <= 0) {
    throw new TypeError('maxDepth must be a positive safe integer')
  }
  if (!Number.isSafeInteger(maxNodes) || maxNodes <= 0) {
    throw new TypeError('maxNodes must be a positive safe integer')
  }

  const active = new WeakSet<object>()
  let bytes = 0
  let nodes = 0
  const add = (fragment: string, path: string): string => {
    bytes += encoder.encode(fragment).byteLength
    if (bytes > limits.maxBytes) {
      throw new JsonBoundaryError('json-byte-budget-exceeded', path)
    }
    return fragment
  }

  const visit = (value: unknown, path: string, depth: number): {
    readonly value: JsonBoundaryValue
    readonly json: string
  } => {
    nodes += 1
    if (nodes > maxNodes) throw new JsonBoundaryError('json-node-budget-exceeded', path)
    if (depth > maxDepth) throw new JsonBoundaryError('json-depth-exceeded', path)

    if (value === null || typeof value === 'boolean' || typeof value === 'string') {
      const json = JSON.stringify(value)
      return { value, json: add(json, path) }
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new JsonBoundaryError('json-type-invalid', path)
      const json = JSON.stringify(value)
      return { value, json: add(json, path) }
    }
    if (typeof value !== 'object') throw new JsonBoundaryError('json-type-invalid', path)
    if (active.has(value)) throw new JsonBoundaryError('json-cycle', path)
    active.add(value)

    try {
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) {
          throw new JsonBoundaryError('json-type-invalid', path)
        }
        const descriptors = ownDataDescriptors(value, path)
        const allowed = new Set<PropertyKey>(['length'])
        for (let index = 0; index < value.length; index += 1) allowed.add(String(index))
        for (const key of Reflect.ownKeys(descriptors)) {
          if (!allowed.has(key)) throw new JsonBoundaryError('json-type-invalid', `${path}.${String(key)}`)
        }
        const result: JsonBoundaryValue[] = []
        const parts = [add('[', path)]
        for (let index = 0; index < value.length; index += 1) {
          const descriptor = descriptors[String(index)]
          if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
            throw new JsonBoundaryError('json-type-invalid', `${path}[${index}]`)
          }
          if (index > 0) parts.push(add(',', path))
          const child = visit(descriptor.value, `${path}[${index}]`, depth + 1)
          result.push(child.value)
          parts.push(child.json)
        }
        parts.push(add(']', path))
        return { value: Object.freeze(result), json: parts.join('') }
      }

      const prototype = Object.getPrototypeOf(value)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new JsonBoundaryError('json-type-invalid', path)
      }
      const descriptors = ownDataDescriptors(value, path)
      const keys = Reflect.ownKeys(descriptors)
      if (keys.some((key) => typeof key !== 'string')) {
        throw new JsonBoundaryError('json-type-invalid', path)
      }
      const sortedKeys = (keys as string[]).sort((left, right) => left.localeCompare(right))
      const result: Record<string, JsonBoundaryValue> = {}
      const parts = [add('{', path)]
      for (const [index, key] of sortedKeys.entries()) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          throw new JsonBoundaryError('json-type-invalid', `${path}.${key}`)
        }
        const descriptor = descriptors[key]
        if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
          throw new JsonBoundaryError('json-type-invalid', `${path}.${key}`)
        }
        if (index > 0) parts.push(add(',', path))
        parts.push(add(JSON.stringify(key), `${path}.${key}`), add(':', path))
        const child = visit(descriptor.value, `${path}.${key}`, depth + 1)
        // Define rather than assign so a model-controlled "__proto__" key cannot invoke the
        // Object.prototype setter while constructing the canonical plain-object clone.
        Object.defineProperty(result, key, {
          configurable: true,
          enumerable: true,
          value: child.value,
          writable: true,
        })
        parts.push(child.json)
      }
      parts.push(add('}', path))
      return { value: Object.freeze(result), json: parts.join('') }
    } finally {
      active.delete(value)
    }
  }

  const snapshot = visit(input, '$', 0)
  return Object.freeze({ ...snapshot, bytes })
}
