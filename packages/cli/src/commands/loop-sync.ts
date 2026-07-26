/**
 * H13 loop reconciliation command seam. Planning reads exact registry/LOOP.md/run-log bytes; apply delegates the
 * encoded typed plan to the kernel store, whose governance lock rechecks registry + LOOP.md epochs before publish.
 * `--expected-workflow-sha` names the human workflow mirror and therefore guards the exact `LOOP.md` bytes.
 */
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { join } from 'node:path'
import {
  applyReconciliationPlan,
  buildReconciliationPlan,
  detectDrift,
  encodeReconciliationPlan,
  loadRegistry,
  readReconciliationSnapshot,
  resourceEpoch,
  type ReconciliationBlocker,
  type ReconciliationApplyResult,
  type ReconciliationPlan,
  type ReconciliationSnapshot,
} from '@tenon/kernel'
import { errMsg, type CliDeps } from '../deps.js'

const decoder = new TextDecoder('utf-8', { fatal: true })
const SHA256_RE = /^[a-f0-9]{64}$/

class LoopSyncUsageError extends Error {
  constructor(readonly code: 'unsupported-auto-fix', message: string) {
    super(message)
    this.name = 'LoopSyncUsageError'
  }
}

interface ParsedLoopSyncArgs {
  readonly loopId: string
  readonly json: boolean
  readonly mode: 'dry-run' | 'apply'
  readonly expectedRegistrySha: string | null
  readonly expectedWorkflowSha: string | null
}

function parseArgs(args: readonly string[]): ParsedLoopSyncArgs {
  let loopId: string | null = null
  let json = false
  let dryRun = false
  let apply = false
  let expectedRegistrySha: string | null = null
  let expectedWorkflowSha: string | null = null
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === undefined) break
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--apply') apply = true
    else if (arg === '--json') json = true
    else if (arg === '--auto-fix') {
      throw new LoopSyncUsageError(
        'unsupported-auto-fix',
        '不支持 --auto-fix；请先用 --dry-run 检查真实计划，确认后再用 --apply。',
      )
    }
    else if (arg === '--expected-registry-sha' || arg === '--expected-workflow-sha') {
      const value = args[++i]
      if (value === undefined || !SHA256_RE.test(value)) {
        throw new Error(`${arg} 需要 64 位小写 SHA-256`)
      }
      if (arg === '--expected-registry-sha') {
        if (expectedRegistrySha !== null) throw new Error(`${arg} 不可重复`)
        expectedRegistrySha = value
      } else {
        if (expectedWorkflowSha !== null) throw new Error(`${arg} 不可重复`)
        expectedWorkflowSha = value
      }
    }
    else if (arg.startsWith('--')) throw new Error(`未知 loop sync 选项: ${arg}`)
    else if (loopId === null) loopId = arg
    else throw new Error(`loop sync 只接受一个 <loop-id>（多余参数: ${arg}）`)
  }
  if (loopId === null) throw new Error('用法：loop sync <loop-id> <--dry-run|--apply> [--json] [--expected-registry-sha SHA] [--expected-workflow-sha LOOP.md-SHA]')
  if (dryRun === apply) throw new Error('必须且只能选择 --dry-run 或 --apply')
  return {
    loopId,
    json,
    mode: dryRun ? 'dry-run' : 'apply',
    expectedRegistrySha,
    expectedWorkflowSha,
  }
}

async function readRunLog(repoRoot: string): Promise<Uint8Array | null> {
  const path = join(repoRoot, '.superpowers', 'loops', 'progress.md')
  let before: Awaited<ReturnType<typeof lstat>>
  try {
    before = await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    const code = (error as NodeJS.ErrnoException).code ?? 'IO'
    throw new Error(`loop-sync run-log read failed (io/${code}): ${path}`)
  }
  if (before.isSymbolicLink()) throw new Error(`loop-sync run-log read failed (symlink): ${path}`)
  if (!before.isFile()) throw new Error(`loop-sync run-log read failed (not-regular-file): ${path}`)

  let handle: Awaited<ReturnType<typeof open>>
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'IO'
    const reason = code === 'ELOOP' ? 'symlink' : `io/${code}`
    throw new Error(`loop-sync run-log read failed (${reason}): ${path}`)
  }
  try {
    const opened = await handle.stat()
    if (!opened.isFile()) throw new Error(`loop-sync run-log read failed (not-regular-file): ${path}`)
    if (opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error(`loop-sync run-log read failed (changed-during-read): ${path}`)
    }
    return new Uint8Array(await handle.readFile())
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('loop-sync run-log read failed')) throw error
    const code = (error as NodeJS.ErrnoException).code ?? 'IO'
    throw new Error(`loop-sync run-log read failed (io/${code}): ${path}`)
  } finally {
    await handle.close()
  }
}

export interface LoopSyncRuntime {
  readonly readSnapshot: (repoRoot: string) => Promise<ReconciliationSnapshot>
  readonly readRunLog: (repoRoot: string) => Promise<Uint8Array | null>
  readonly applyPlan: (
    repoRoot: string,
    encodedPlan: string | Uint8Array,
  ) => Promise<ReconciliationApplyResult>
}

export const REAL_LOOP_SYNC_RUNTIME: LoopSyncRuntime = {
  readSnapshot: readReconciliationSnapshot,
  readRunLog,
  applyPlan: applyReconciliationPlan,
}

function decode(bytes: Uint8Array | null, label: string): string | null {
  if (bytes === null) return null
  try {
    return decoder.decode(bytes)
  } catch {
    throw new Error(`${label} 不是合法 UTF-8`)
  }
}

function loadSnapshotRegistry(repoRoot: string, snapshot: ReconciliationSnapshot) {
  const text = decode(snapshot.registry_bytes, '.pipeline/loops.yaml')
  if (text === null) throw new Error(`loops.yaml 未找到于 ${repoRoot}/.pipeline/loops.yaml`)
  const loaded = loadRegistry(repoRoot, { readText: () => text })
  if (loaded.data === null || loaded.errors.length > 0) {
    throw new Error(loaded.errors.join('; ') || 'loops.yaml 无法解析')
  }
  return loaded.data
}

interface BlockerView {
  readonly disposition: 'unsupported' | 'not-applicable'
  readonly loop_id: string
  readonly dimension: ReconciliationBlocker['drift']['dimension']
  readonly severity: ReconciliationBlocker['drift']['severity']
  readonly detail: string
  readonly suggestion: string
  readonly reason: ReconciliationBlocker['reason']
  readonly next_step: string
}

function blockerView(
  blocker: ReconciliationBlocker,
  disposition: BlockerView['disposition'],
): BlockerView {
  return {
    disposition,
    loop_id: blocker.drift.loop,
    dimension: blocker.drift.dimension,
    severity: blocker.drift.severity,
    detail: blocker.drift.detail,
    suggestion: blocker.drift.suggestion,
    reason: blocker.reason,
    next_step: blocker.next_step,
  }
}

function blockerViews(plan: ReconciliationPlan): {
  unsupported: BlockerView[]
  notApplicable: BlockerView[]
} {
  const unsupported: BlockerView[] = []
  const notApplicable: BlockerView[] = []
  for (const blocker of plan.blockers) {
    if (blocker.reason === 'runtime-remediation-required') {
      notApplicable.push(blockerView(blocker, 'not-applicable'))
    } else {
      unsupported.push(blockerView(blocker, 'unsupported'))
    }
  }
  return { unsupported, notApplicable }
}

interface ExpectedShaConflict {
  readonly resource: 'registry' | 'workflow'
  readonly flag: '--expected-registry-sha' | '--expected-workflow-sha'
  readonly expected_sha: string
  readonly actual_sha: string | null
}

function expectedShaConflicts(
  parsed: ParsedLoopSyncArgs,
  snapshot: ReconciliationSnapshot,
): ExpectedShaConflict[] {
  const conflicts: ExpectedShaConflict[] = []
  const registryActual = snapshot.registry_epoch.kind === 'sha256' ? snapshot.registry_epoch.value : null
  if (parsed.expectedRegistrySha !== null && parsed.expectedRegistrySha !== registryActual) {
    conflicts.push({
      resource: 'registry',
      flag: '--expected-registry-sha',
      expected_sha: parsed.expectedRegistrySha,
      actual_sha: registryActual,
    })
  }
  const workflowActual = snapshot.loop_doc_epoch.kind === 'sha256' ? snapshot.loop_doc_epoch.value : null
  if (parsed.expectedWorkflowSha !== null && parsed.expectedWorkflowSha !== workflowActual) {
    conflicts.push({
      resource: 'workflow',
      flag: '--expected-workflow-sha',
      expected_sha: parsed.expectedWorkflowSha,
      actual_sha: workflowActual,
    })
  }
  return conflicts
}

export async function cmdLoopSync(
  deps: CliDeps,
  args: readonly string[],
  runtime: LoopSyncRuntime = REAL_LOOP_SYNC_RUNTIME,
): Promise<number> {
  let parsed: ParsedLoopSyncArgs | null = null
  try {
    const current = parseArgs(args)
    parsed = current
    const [snapshot, runLogBytes] = await Promise.all([
      runtime.readSnapshot(deps.cwd),
      runtime.readRunLog(deps.cwd),
    ])
    const requestedConflicts = expectedShaConflicts(current, snapshot)
    if (requestedConflicts.length > 0) {
      const output = {
        schema_version: 1,
        command: 'loop-sync',
        ok: false,
        mode: current.mode,
        status: 'conflict',
        reason: 'expected-sha-mismatch',
        scope: { kind: 'loop', loop_id: current.loopId },
        expected: {
          registry_sha: current.expectedRegistrySha,
          workflow_sha: current.expectedWorkflowSha,
        },
        conflicts: requestedConflicts,
      }
      if (current.json) deps.io.out(JSON.stringify(output))
      else {
        for (const conflict of requestedConflicts) {
          deps.io.err(`ERROR: ${conflict.flag} 冲突（expected=${conflict.expected_sha}, actual=${conflict.actual_sha ?? 'absent'}）`)
        }
      }
      return 3
    }
    const registry = loadSnapshotRegistry(deps.cwd, snapshot)
    if (!registry.loops.some((loop) => loop.id === current.loopId)) {
      throw new Error(`未知 loop id: ${current.loopId}`)
    }
    const now = new Date(deps.clock())
    const driftReport = detectDrift(
      registry,
      decode(snapshot.loop_doc_bytes, 'LOOP.md'),
      decode(runLogBytes, '.superpowers/loops/progress.md'),
      now,
    )
    const plan = buildReconciliationPlan({
      generated_at: now.toISOString(),
      scope: { kind: 'loop', loop_id: current.loopId },
      loops: registry.loops,
      registry_epoch: snapshot.registry_epoch,
      run_log_epoch: resourceEpoch(runLogBytes),
      loop_doc_bytes: snapshot.loop_doc_bytes,
      drift_report: driftReport,
    })
    const { unsupported, notApplicable } = blockerViews(plan)
    const result = current.mode === 'apply'
      ? await runtime.applyPlan(deps.cwd, encodeReconciliationPlan(plan))
      : null
    const output = {
      schema_version: 1,
      command: 'loop-sync',
      ok: result?.status !== 'conflict' && unsupported.length === 0,
      mode: current.mode,
      status: result?.status ?? 'planned',
      scope: plan.scope,
      expected: {
        registry_sha: current.expectedRegistrySha,
        workflow_sha: current.expectedWorkflowSha,
      },
      summary: {
        operations: plan.operations.length,
        unsupported: unsupported.length,
        not_applicable: notApplicable.length,
      },
      unsupported,
      not_applicable: notApplicable,
      plan,
      ...(result === null ? {} : { result }),
    }
    if (current.json) deps.io.out(JSON.stringify(output))
    else {
      deps.io.out(`[loop-sync] ${current.mode} loop=${current.loopId} plan=${plan.plan_id}`)
      deps.io.out(`  operations=${plan.operations.length} unsupported=${unsupported.length} not-applicable=${notApplicable.length}`)
      for (const item of unsupported) {
        deps.io.out(`  UNSUPPORTED ${item.dimension} loop=${item.loop_id}: ${item.detail}`)
      }
      for (const item of notApplicable) {
        deps.io.out(`  NOT-APPLICABLE ${item.dimension} loop=${item.loop_id}: ${item.detail}`)
      }
      if (current.mode === 'dry-run') deps.io.out('  DRY-RUN：零写入；使用 --apply 才会执行计划。')
      else if (result) deps.io.out(`  result=${result.status}`)
    }
    if (result?.status === 'conflict') return 3
    return unsupported.length === 0 ? 0 : 1
  } catch (error) {
    const message = errMsg(error)
    if (parsed?.json === true || args.includes('--json')) {
      deps.io.out(JSON.stringify({
        schema_version: 1,
        command: 'loop-sync',
        ok: false,
        mode: parsed?.mode ?? (args.includes('--apply') ? 'apply' : 'dry-run'),
        status: 'error',
        scope: parsed === null ? null : { kind: 'loop', loop_id: parsed.loopId },
        error: {
          code: error instanceof LoopSyncUsageError
            ? error.code
            : parsed === null ? 'usage-error' : 'source-error',
          message,
        },
      }))
    } else {
      deps.io.err(`ERROR: ${message}`)
    }
    return 2
  }
}
