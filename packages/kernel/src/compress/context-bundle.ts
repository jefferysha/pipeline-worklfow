import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'

export type ContextBundleTier = 'light' | 'strong'
export type ContextBundleMode = 'full' | 'summary' | 'reference'

export interface ContextBundleInputV1 {
  readonly kind: string
  readonly path: string
  readonly digest: `sha256:${string}`
  readonly reason: string
  readonly mode: ContextBundleMode
  readonly content?: string
}

export interface ContextBundleV1 {
  readonly schemaVersion: 'context-bundle/v1'
  readonly change: string
  readonly from: string
  readonly to: string
  readonly tier: ContextBundleTier
  readonly inputs: readonly ContextBundleInputV1[]
  readonly budget: { readonly maxBytes: number; readonly usedBytes: number }
  readonly aggregateDigest: `sha256:${string}`
}

export interface CompileContextBundleInput {
  readonly change: string
  readonly from: string
  readonly to: string
  readonly tier: ContextBundleTier
  readonly maxBytes: number
  readonly inputs: readonly ContextBundleInputV1[]
}

export class ContextBundleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContextBundleError'
  }
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/
const SHA256 = /^sha256:[a-f0-9]{64}$/

function contentBytes(input: ContextBundleInputV1): number {
  return input.content === undefined ? 0 : Buffer.byteLength(input.content, 'utf8')
}

function validRelativePath(path: string): boolean {
  if (path === '' || isAbsolute(path) || path.includes('\\')) return false
  const parts = path.split('/')
  return !parts.some((part) => part === '' || part === '.' || part === '..')
}

function unsignedPayload(
  input: Omit<ContextBundleV1, 'aggregateDigest'>,
): Omit<ContextBundleV1, 'aggregateDigest'> {
  return input
}

export function contextBundleAggregateDigest(
  bundle: Omit<ContextBundleV1, 'aggregateDigest'>,
): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(JSON.stringify(unsignedPayload(bundle)), 'utf8').digest('hex')}`
}

export function verifyContextBundleAggregate(bundle: ContextBundleV1): boolean {
  const { aggregateDigest, ...unsigned } = bundle
  return aggregateDigest === contextBundleAggregateDigest(unsigned)
}

export function compileContextBundle(input: CompileContextBundleInput): ContextBundleV1 {
  if (!SAFE_ID.test(input.change)) throw new ContextBundleError(`Context Bundle change 非法: ${input.change}`)
  if (!SAFE_ID.test(input.from) || !SAFE_ID.test(input.to)) {
    throw new ContextBundleError(`Context Bundle phase/role 非法: ${input.from} -> ${input.to}`)
  }
  if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0) {
    throw new ContextBundleError(`Context Bundle maxBytes 必须是正整数: ${input.maxBytes}`)
  }

  const seen = new Set<string>()
  for (const item of input.inputs) {
    if (item.kind.trim() === '') throw new ContextBundleError('Context Bundle input kind 不能为空')
    if (!validRelativePath(item.path)) throw new ContextBundleError(`Context Bundle input path 非法: ${item.path}`)
    if (!SHA256.test(item.digest)) throw new ContextBundleError(`Context Bundle input digest 非法: ${item.path}`)
    if (item.reason.trim() === '') throw new ContextBundleError(`Context Bundle input reason 不能为空: ${item.path}`)
    if (item.mode === 'reference' && item.content !== undefined) {
      throw new ContextBundleError(`reference input 不得内嵌 content: ${item.path}`)
    }
    if (item.mode !== 'reference' && item.content === undefined) {
      throw new ContextBundleError(`${item.mode} input 必须内嵌 content: ${item.path}`)
    }
    const key = `${item.kind}\0${item.path}`
    if (seen.has(key)) throw new ContextBundleError(`Context Bundle input 重复: ${item.kind} ${item.path}`)
    seen.add(key)
  }

  const usedBytes = input.inputs.reduce((total, item) => total + contentBytes(item), 0)
  if (usedBytes > input.maxBytes) {
    throw new ContextBundleError(`Context Bundle 超预算: required=${usedBytes} bytes, available=${input.maxBytes} bytes`)
  }
  const unsigned: Omit<ContextBundleV1, 'aggregateDigest'> = {
    schemaVersion: 'context-bundle/v1',
    change: input.change,
    from: input.from,
    to: input.to,
    tier: input.tier,
    inputs: input.inputs.map((item) => ({ ...item })),
    budget: { maxBytes: input.maxBytes, usedBytes },
  }
  return { ...unsigned, aggregateDigest: contextBundleAggregateDigest(unsigned) }
}
