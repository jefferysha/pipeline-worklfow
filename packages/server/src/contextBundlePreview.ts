import type { IncomingMessage, ServerResponse } from 'node:http'
import { lstatSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import {
  compileLedgerContextBundleWithPorts,
  DEFAULT_LEDGER_CONTEXT_BUNDLE_RESOURCE_LIMITS,
  isDocumentContractPhase,
  LedgerContextBundleError,
  readsRequiredForPhase,
  validateChangeName,
  type LedgerContextBundlePreview,
} from '@tenon/kernel'
import {
  trustedContextBundleCurrentPhase,
  trustedContextBundleInputs,
} from './contextBundleTrustedReader.js'
import { assertWorkflowRootAnchor } from './workflows.js'
import type { WorkflowRootAnchor } from './workflows.js'
import type { GetRouteDeps } from './serverGetRoutes.js'

const SCHEMA_VERSION = 'context-bundle-preview/v1'
const SIDE_EFFECTS = 'none'

type ContextBundlePreviewDeps = Pick<
  GetRouteDeps,
  'sendJson' | 'workflowRootForRequest' | 'errMsg'
>

interface PathIdentity {
  readonly path: string
  readonly dev: number
  readonly ino: number
}

interface ChangePathAnchor {
  readonly changeDir: string
  readonly realPath: string
  readonly chain: readonly PathIdentity[]
}

class ContextBundlePathError extends Error {
  constructor(
    readonly status: 400 | 403,
    message: string,
  ) {
    super(message)
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

function captureChangePathAnchor(
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
  const changeDir = chainPaths[2]!
  let realPath: string
  try {
    realPath = realpathSync(changeDir)
  } catch {
    throw new ContextBundlePathError(403, `Context Bundle Change 路径在读取前被替换: ${changeDir}`)
  }
  if (!inside(root.realPath, realPath)) {
    throw new ContextBundlePathError(403, `Context Bundle Change 路径逃逸 registered root: ${realPath}`)
  }
  return { changeDir, realPath, chain }
}

function assertChangePathAnchor(anchor: ChangePathAnchor): void {
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

function invalidRequest(
  res: ServerResponse,
  sendJson: GetRouteDeps['sendJson'],
  error: string,
): void {
  sendJson(res, 400, {
    ok: false,
    code: 'CONTEXT_BUNDLE_INVALID_REQUEST',
    error,
    repairAction: '请提供已注册 root、安全 change、canonical target 和正安全整数 budgetBytes。',
  })
}

function safePreview(
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

function statusFor(error: LedgerContextBundleError): 400 | 409 | 413 | 422 {
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

function safeErrorText(error: LedgerContextBundleError): string {
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

function safeRepairAction(error: LedgerContextBundleError): string {
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

/**
 * Read-only adapter around the kernel's ledger-bound compiler. This layer owns only HTTP
 * validation/status/DTO mapping: policy, materialization, byte accounting and typed failures
 * stay in @tenon/kernel so Dashboard and CLI cannot drift.
 */
export async function handleContextBundlePreview(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ContextBundlePreviewDeps,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const root = url.searchParams.get('root')
  const change = url.searchParams.get('change')
  const target = url.searchParams.get('target')
  const budgetText = url.searchParams.get('budgetBytes')
  if (root === null || root === '' || change === null || target === null || budgetText === null) {
    return invalidRequest(res, deps.sendJson, '缺少 root、change、target 或 budgetBytes 查询参数')
  }
  if (!validateChangeName(change).ok) {
    return invalidRequest(res, deps.sendJson, 'change 名非法（仅允许 a-z A-Z 0-9 - _）')
  }
  if (!isDocumentContractPhase(target)) {
    return invalidRequest(res, deps.sendJson, 'target 必须是 canonical phase')
  }
  if (!/^[1-9][0-9]*$/.test(budgetText)) {
    return invalidRequest(res, deps.sendJson, 'budgetBytes 必须是正安全整数')
  }
  const budgetBytes = Number(budgetText)
  if (!Number.isSafeInteger(budgetBytes)) {
    return invalidRequest(res, deps.sendJson, 'budgetBytes 必须是正安全整数')
  }

  const rootCheck = deps.workflowRootForRequest(root)
  if (!rootCheck.ok) {
    return deps.sendJson(res, rootCheck.code, {
      ok: false,
      error: rootCheck.code === 403
        ? 'Context Bundle root trust check failed'
        : 'Context Bundle registered root is unavailable',
    })
  }
  const anchor = rootCheck.anchor
  if (anchor.fdPath === undefined) {
    return deps.sendJson(res, 501, {
      ok: false,
      code: 'CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE',
      error: 'Context Bundle trusted reader is unavailable on this platform',
      repairAction: 'Run the Dashboard on a platform with fd-relative directory traversal.',
    })
  }
  let changeAnchor: ChangePathAnchor | undefined
  try {
    assertWorkflowRootAnchor(anchor)
    changeAnchor = captureChangePathAnchor(anchor, change)
    const capturedChange = changeAnchor.chain[2]
    if (capturedChange === undefined) {
      throw new ContextBundlePathError(403, 'Context Bundle Change identity capture failed')
    }
    const changeIdentity = {
      dev: capturedChange.dev,
      ino: capturedChange.ino,
    }
    const from = trustedContextBundleCurrentPhase(anchor, change, changeIdentity)
    assertChangePathAnchor(changeAnchor)
    assertWorkflowRootAnchor(anchor)
    if (typeof from !== 'string' || !/^[A-Za-z0-9_-]+$/.test(from)) {
      return invalidRequest(
        res,
        deps.sendJson,
        '找不到该 Change 的 canonical workflow state，或当前 step id 不安全',
      )
    }

    const trustedInputs = readsRequiredForPhase(target).length === 0
      ? {
          ledger: undefined,
          sourceReader: {
            read: async () => {
              throw new Error('policy-empty preview must not read a source document')
            },
          },
        }
      : trustedContextBundleInputs(
          anchor,
          change,
          changeIdentity,
          DEFAULT_LEDGER_CONTEXT_BUNDLE_RESOURCE_LIMITS,
        )
    const result = await compileLedgerContextBundleWithPorts({
      root: anchor.path,
      change,
      from,
      target,
      budgetBytes,
      ledgerRepository: {
        read: async () => trustedInputs.ledger,
      },
      sourceReader: trustedInputs.sourceReader,
      resourceLimits: DEFAULT_LEDGER_CONTEXT_BUNDLE_RESOURCE_LIMITS,
    })
    assertChangePathAnchor(changeAnchor)
    assertWorkflowRootAnchor(anchor)
    return deps.sendJson(res, 200, {
      ok: true,
      preview: safePreview(result.preview, true, result.bundle.aggregateDigest),
    })
  } catch (error) {
    // Any root replacement discovered during/after the read dominates domain classification:
    // never return compiler metadata after the registered identity has drifted.
    try {
      assertWorkflowRootAnchor(anchor)
    } catch (anchorError) {
      void anchorError
      return deps.sendJson(res, 403, { ok: false, error: 'Context Bundle root trust check failed' })
    }
    if (changeAnchor !== undefined) {
      try {
        assertChangePathAnchor(changeAnchor)
      } catch (pathError) {
        void pathError
        return deps.sendJson(res, 403, { ok: false, error: 'Context Bundle path trust check failed' })
      }
    }
    if (error instanceof ContextBundlePathError) {
      return deps.sendJson(res, error.status, {
        ok: false,
        ...(error.status === 400 ? { code: 'CONTEXT_BUNDLE_INVALID_REQUEST' } : {}),
        error: error.status === 400
          ? 'Context Bundle Change state is unavailable'
          : 'Context Bundle path trust check failed',
        ...(error.status === 400
          ? { repairAction: '确认 Change 已创建 canonical workflow state 后重试。' }
          : {}),
      })
    }
    if (error instanceof LedgerContextBundleError) {
      return deps.sendJson(res, statusFor(error), {
        ok: false,
        code: error.code,
        error: safeErrorText(error),
        repairAction: safeRepairAction(error),
        detail: {
          ...(error.kind === undefined ? {} : { kind: error.kind }),
          ...(error.path === undefined ? {} : { path: error.path }),
          ...(error.requiredBytes === undefined ? {} : { requiredBytes: error.requiredBytes }),
          ...(error.availableBytes === undefined ? {} : { availableBytes: error.availableBytes }),
          ...(error.metric === undefined ? {} : { metric: error.metric }),
          ...(error.limit === undefined ? {} : { limit: error.limit }),
          ...(error.actual === undefined ? {} : { actual: error.actual }),
        },
        ...(error.code === 'CONTEXT_BUNDLE_BUDGET_EXCEEDED' && error.preview !== undefined
          ? { preview: safePreview(error.preview, false) }
          : {}),
      })
    }
    void error
    return deps.sendJson(res, 500, { ok: false, error: 'Context Bundle preview failed' })
  }
}
