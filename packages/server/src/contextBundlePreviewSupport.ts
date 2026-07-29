import { lstatSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import {
  type LedgerContextBundlePreview,
  LedgerContextBundleError,
} from '@tenon/kernel'
import type { WorkflowRootAnchor } from './workflows.js'

const SCHEMA_VERSION = 'context-bundle-preview/v1'
const SIDE_EFFECTS = 'none'

interface PathIdentity {
  readonly path: string
  readonly dev: number
  readonly ino: number
}

export interface ChangePathAnchor {
  readonly changeDir: string
  readonly realPath: string
  readonly chain: readonly PathIdentity[]
}

export class ContextBundlePathError extends Error {
  constructor(
    readonly status: 400 | 403,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'ContextBundlePathError'
  }
}

function missingCode(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && Reflect.get(error, 'code') === 'ENOENT'
}

function inside(base: string, candidate: string): boolean {
  const fromBase = relative(base, candidate)
  return fromBase !== ''
    && fromBase !== '..'
    && !fromBase.startsWith(`..${sep}`)
    && !isAbsolute(fromBase)
}

export function captureChangePathAnchor(
  root: WorkflowRootAnchor,
  change: string,
): ChangePathAnchor {
  const chainPaths = [
    join(root.path, 'openspec'),
    join(root.path, 'openspec', 'changes'),
    join(root.path, 'openspec', 'changes', change),
  ]
  const chain: PathIdentity[] = []
  for (const path of chainPaths) {
    let info
    try {
      info = lstatSync(path)
    } catch (error) {
      if (missingCode(error)) {
        throw new ContextBundlePathError(400, '找不到该 Change 的 canonical workflow state')
      }
      throw error
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new ContextBundlePathError(403, `Context Bundle 路径不安全（须为真实目录）: ${path}`)
    }
    chain.push({ path, dev: info.dev, ino: info.ino })
  }
  const changeDir = chainPaths.at(2)
  if (changeDir === undefined) {
    throw new ContextBundlePathError(403, 'Context Bundle Change path capture failed')
  }
  let realPath: string
  try {
    realPath = realpathSync(changeDir)
  } catch (cause) {
    throw new ContextBundlePathError(
      403,
      `Context Bundle Change 路径在读取前被替换: ${changeDir}`,
      cause,
    )
  }
  if (!inside(root.realPath, realPath)) {
    throw new ContextBundlePathError(403, `Context Bundle Change 路径逃逸 registered root: ${realPath}`)
  }
  return { changeDir, realPath, chain }
}

export function assertChangePathAnchor(anchor: ChangePathAnchor): void {
  for (const expected of anchor.chain) {
    let actual
    try {
      actual = lstatSync(expected.path)
    } catch {
      throw new ContextBundlePathError(403, `Context Bundle Change 路径在读取期间消失: ${expected.path}`)
    }
    if (
      actual.isSymbolicLink()
      || !actual.isDirectory()
      || actual.dev !== expected.dev
      || actual.ino !== expected.ino
    ) {
      throw new ContextBundlePathError(403, `Context Bundle Change 路径在读取期间被替换: ${expected.path}`)
    }
  }
  if (realpathSync(anchor.changeDir) !== anchor.realPath) {
    throw new ContextBundlePathError(403, `Context Bundle Change realpath 在读取期间变化: ${anchor.changeDir}`)
  }
}

export function safeContextBundlePreview(
  preview: LedgerContextBundlePreview,
  fits: boolean,
  aggregateDigest?: string,
): Record<string, unknown> {
  return {
    schemaVersion: SCHEMA_VERSION,
    sideEffects: SIDE_EFFECTS,
    change: preview.change,
    from: preview.from,
    to: preview.to,
    tier: preview.tier,
    documentCount: preview.documentCount,
    budget: {
      maxBytes: preview.budget.maxBytes,
      usedBytes: preview.budget.usedBytes,
      fits,
    },
    inputs: preview.inputs.map((input) => ({
      kind: input.kind,
      path: input.path,
      digest: input.digest,
      reason: input.reason,
      reasonCode: input.reasonCode,
      mode: input.mode,
      sourceBytes: input.sourceBytes,
      materializedBytes: input.materializedBytes,
    })),
    ...(aggregateDigest === undefined ? {} : { aggregateDigest }),
  }
}

export function contextBundleErrorStatus(
  error: LedgerContextBundleError,
): 400 | 409 | 413 | 422 {
  switch (error.code) {
    case 'CONTEXT_BUNDLE_INVALID_REQUEST':
      return 400
    case 'CONTEXT_BUNDLE_STATE_CORRUPT':
    case 'CONTEXT_BUNDLE_LEDGER_MISSING':
    case 'CONTEXT_BUNDLE_DOCUMENT_MISSING':
    case 'CONTEXT_BUNDLE_DOCUMENT_STALE':
      return 409
    case 'CONTEXT_BUNDLE_RESOURCE_LIMIT_EXCEEDED':
      return 413
    case 'CONTEXT_BUNDLE_BUDGET_EXCEEDED':
      return 422
  }
  const unreachable: never = error.code
  return unreachable
}

export function safeContextBundleErrorText(error: LedgerContextBundleError): string {
  switch (error.code) {
    case 'CONTEXT_BUNDLE_INVALID_REQUEST':
      return 'Context Bundle request is invalid'
    case 'CONTEXT_BUNDLE_STATE_CORRUPT':
      return 'Context Bundle canonical state is corrupt'
    case 'CONTEXT_BUNDLE_LEDGER_MISSING':
      return 'Context Bundle document ledger is unavailable'
    case 'CONTEXT_BUNDLE_DOCUMENT_MISSING':
      return 'A required Context Bundle document is unavailable'
    case 'CONTEXT_BUNDLE_DOCUMENT_STALE':
      return 'A required Context Bundle document has changed'
    case 'CONTEXT_BUNDLE_RESOURCE_LIMIT_EXCEEDED':
      return 'Context Bundle source resource limit exceeded'
    case 'CONTEXT_BUNDLE_BUDGET_EXCEEDED':
      return 'Context Bundle materialized budget exceeded'
  }
}

export function safeContextBundleRepairAction(error: LedgerContextBundleError): string {
  switch (error.code) {
    case 'CONTEXT_BUNDLE_INVALID_REQUEST':
      return 'Use a registered root, safe identifiers, canonical target, and positive budget.'
    case 'CONTEXT_BUNDLE_STATE_CORRUPT':
      return 'Restore a valid canonical Change state, then retry.'
    case 'CONTEXT_BUNDLE_LEDGER_MISSING':
      return 'Initialize and record the document ledger, then retry.'
    case 'CONTEXT_BUNDLE_DOCUMENT_MISSING':
      return 'Restore or record the required project document, then retry.'
    case 'CONTEXT_BUNDLE_DOCUMENT_STALE':
      return 'Record and read the changed project document again, then retry.'
    case 'CONTEXT_BUNDLE_RESOURCE_LIMIT_EXCEEDED':
      return 'Reduce the number or source size of recorded documents, then retry.'
    case 'CONTEXT_BUNDLE_BUDGET_EXCEEDED':
      return 'Increase budgetBytes to the required materialized size, then retry.'
  }
}
