/**
 * Governed OpenSpec document evidence commands.
 *
 * The workflow state remains in the canonical StateStore; this command owns only the sidecar
 * evidence ledger.  Every mutation is performed under the same change lock as a transition so a
 * phase cannot move between "checked" and "recorded/read".
 */
import {
  ensureDocumentLedger,
  evaluateDocumentEvidence,
  isDocumentContractPhase,
  isDocumentKind,
  isOpenSpecDocumentContractRequired,
  loadWorkflow,
  migrateLegacyDeltaDocument,
  recordDocument,
  recordDocumentReads,
  resolveWorkflowName,
} from '@pipeline-lite/kernel'
import type {
  DocumentContractPhase,
  DocumentEvidenceReport,
  DocumentKind,
  PipelineState,
  WorkflowDef,
} from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'
import { reconcileCodexSkillEvidence } from '../codexSkillReceipt.js'

interface GovernedDocumentContext {
  readonly workflowName: string
  readonly phase: DocumentContractPhase
  readonly governed: boolean
}

function reject(deps: CliDeps, message: string): number {
  deps.io.err(`ERROR: ${message}`)
  return 1
}

function scalar(state: PipelineState, field: 'phase' | 'track'): string {
  const value = state.fields[field]
  return Array.isArray(value) ? value.join(',') : (value ?? '')
}

function workflowForState(deps: CliDeps, state: PipelineState, workflowName: string): WorkflowDef | undefined {
  if (workflowName === 'default') return undefined
  const workflow = loadWorkflow(deps.cwd, workflowName)
  if (!workflow) {
    throw new Error(`workflow '${workflowName}' 未找到（期望 .pipeline/workflows/${workflowName}.yaml）`)
  }
  return workflow
}

/** Resolve governance from the actual persisted workflow definition, never a caller-supplied flag. */
export function governedDocumentContext(deps: CliDeps, state: PipelineState): GovernedDocumentContext {
  const workflowName = resolveWorkflowName(state)
  const workflow = workflowForState(deps, state, workflowName)
  const governed = isOpenSpecDocumentContractRequired(workflowName, scalar(state, 'track'), workflow)
  const phase = scalar(state, 'phase')
  if (!governed) {
    // A non-governed workflow may use arbitrary step ids.  The phase is intentionally not narrowed
    // or validated here because `document status` should correctly explain that no contract applies.
    return { workflowName, phase: 'open', governed: false }
  }
  if (!isDocumentContractPhase(phase)) {
    throw new Error(`受 OpenSpec 文档契约治理的 workflow 当前 phase 必须是标准阶段（当前 '${phase || '空'}'）`)
  }
  return { workflowName, phase, governed: true }
}

function assertChangeName(deps: CliDeps, name: string): string | undefined {
  if (isValidChangeName(name)) return changeDir(deps.cwd, name)
  reject(deps, `change-name 非法: '${name}' (仅允许 a-z A-Z 0-9 - _)`)
  return undefined
}

function assertGoverned(context: GovernedDocumentContext): DocumentContractPhase {
  if (!context.governed) {
    throw new Error(`workflow '${context.workflowName}' 未声明 openspec_contract: required；此 Change 不适用 document ledger`)
  }
  return context.phase
}

/** `pipeline document init <change>`: create the ledger for a governed existing change (migration-safe). */
export async function cmdDocumentInit(deps: CliDeps, name: string): Promise<number> {
  const dir = assertChangeName(deps, name)
  if (!dir) return 1
  try {
    await deps.store.withLock(dir, async () => {
      const context = governedDocumentContext(deps, await deps.store.read(dir))
      assertGoverned(context)
      await ensureDocumentLedger(dir, deps.clock())
    })
    return 0
  } catch (error) {
    return reject(deps, errMsg(error))
  }
}

/**
 * `pipeline document record`: bind a real document plus actual Skill invocation evidence.
 *
 * `backfill` is deliberately explicit for an installed-plugin upgrade: an older Change may already
 * have passed the phase that originally owns an unrecorded document. It cannot overwrite an existing
 * record, register a future phase, bypass current producer evidence, or bypass digest/path checks.
 */
export async function cmdDocumentRecord(
  deps: CliDeps,
  name: string,
  kind: string,
  path: string,
  producer: string,
  backfill = false,
): Promise<number> {
  const dir = assertChangeName(deps, name)
  if (!dir) return 1
  if (!isDocumentKind(kind)) return reject(deps, `未知 document kind: '${kind}'`)
  if (path === '') return reject(deps, 'document path 不得为空')
  if (producer === '') return reject(deps, '--producer 不得为空')
  if (producer.includes('|')) return reject(deps, `--producer '${producer}' 必须是单个具体 skill id`)
  try {
    await deps.store.withLock(dir, async () => {
      const context = governedDocumentContext(deps, await deps.store.read(dir))
      const phase = assertGoverned(context)
      // Native PostToolUse remains the fast path.  On Codex hosts that omit that callback for a
      // completed `exec` tool call, reconcile the earlier PreToolUse receipt against the
      // host-owned transcript *inside this same change lock* before the kernel inspects history.
      // A receipt alone cannot pass this point.
      await reconcileCodexSkillEvidence({
        repoRoot: deps.cwd,
        changeDir: dir,
        producer,
        recordedAt: deps.clock(),
        history: deps.history,
        evidenceScope: phase,
      })
      await recordDocument({
        repoRoot: deps.cwd,
        changeDir: dir,
        phase,
        kind: kind as DocumentKind,
        path,
        producer,
        recordedAt: deps.clock(),
        allowBackfill: backfill,
      })
    })
    return 0
  } catch (error) {
    return reject(deps, errMsg(error))
  }
}

/** Explicitly map one legacy delta record to its canonical capability path without changing bytes. */
export async function cmdDocumentMigrateDelta(
  deps: CliDeps,
  name: string,
  legacyPath: string,
  canonicalPath: string,
): Promise<number> {
  const dir = assertChangeName(deps, name)
  if (!dir) return 1
  if (!legacyPath || !canonicalPath) return reject(deps, 'legacy-path 与 canonical-path 均不得为空')
  try {
    await deps.store.withLock(dir, async () => {
      const context = governedDocumentContext(deps, await deps.store.read(dir))
      assertGoverned(context)
      await migrateLegacyDeltaDocument({
        repoRoot: deps.cwd,
        changeDir: dir,
        legacyPath,
        canonicalPath,
      })
    })
    return 0
  } catch (error) {
    return reject(deps, errMsg(error))
  }
}

/** `pipeline document read`: store a digest-bound receipt that the current phase consumed its inputs. */
export async function cmdDocumentRead(
  deps: CliDeps,
  name: string,
  kind: string,
): Promise<number> {
  const dir = assertChangeName(deps, name)
  if (!dir) return 1
  if (kind !== 'all' && !isDocumentKind(kind)) return reject(deps, `未知 document kind: '${kind}'`)
  try {
    await deps.store.withLock(dir, async () => {
      const context = governedDocumentContext(deps, await deps.store.read(dir))
      const phase = assertGoverned(context)
      await recordDocumentReads({
        repoRoot: deps.cwd,
        changeDir: dir,
        phase,
        kind: kind === 'all' ? 'all' : kind,
        readAt: deps.clock(),
      })
    })
    return 0
  } catch (error) {
    return reject(deps, errMsg(error))
  }
}

function renderEvidence(deps: CliDeps, report: DocumentEvidenceReport): void {
  for (const item of report.items) {
    const read = item.requiredRead ? ' · read required' : ''
    const paths = item.paths.length === 0 ? '' : ` · ${item.paths.join(', ')}`
    deps.io.out(`  [${item.status.toUpperCase()}] ${item.kind}${read}${paths}`)
  }
  for (const blocker of report.blockers) deps.io.out(`  [FAIL] ${blocker}`)
}

/** Read-only evidence report.  Exit 2 means state is valid but the governed proof is incomplete. */
export async function cmdDocumentStatus(deps: CliDeps, name: string, json: boolean): Promise<number> {
  const dir = assertChangeName(deps, name)
  if (!dir) return 1
  try {
    const state = await deps.store.read(dir)
    const context = governedDocumentContext(deps, state)
    if (!context.governed) {
      const value = { change: name, workflow: context.workflowName, governed: false }
      if (json) deps.io.out(JSON.stringify(value))
      else {
        deps.io.out(`[DOCUMENT] ${name} (workflow=${context.workflowName})`)
        deps.io.out('  [SKIP] 当前 workflow 未声明 openspec_contract: required')
      }
      return 0
    }
    const report = await evaluateDocumentEvidence(deps.cwd, dir, context.phase)
    if (json) {
      deps.io.out(JSON.stringify({ change: name, workflow: context.workflowName, governed: true, ...report }))
    } else {
      deps.io.out(`[DOCUMENT] ${name} (workflow=${context.workflowName}, phase=${context.phase})`)
      renderEvidence(deps, report)
      if (report.pass) deps.io.out('  [PASS] 文档产物和读取证据完整')
    }
    return report.pass ? 0 : 2
  } catch (error) {
    return reject(deps, errMsg(error))
  }
}
