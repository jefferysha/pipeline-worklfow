import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize } from 'node:path'
import { atomicWriteFile } from '@tenon/kernel'
import type {
  ManagedReleaseJournal,
  ManagedReleaseJournalRecord,
  ManagedReleaseOperation,
} from './installer.js'
import type {
  RuntimeActivation,
  RuntimeLauncherSnapshot,
  RuntimePaths,
  RuntimeReleaseSource,
} from './types.js'
import { expectedStableLaunchers } from './launchers.js'
import { parseManifest, validReleaseId } from './release-store-codecs.js'
import { decodeManagedHostSteps } from './managed-host-step-codec.js'

const JOURNAL_FILE = 'release-transaction.json'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key))
}

function isSource(value: unknown): value is RuntimeReleaseSource['host'] {
  return value === 'codex' || value === 'claude' || value === 'adapter' || value === 'manual'
}

function decodeSelection(value: unknown): RuntimeActivation['selection'] | null {
  if (!isRecord(value) || !exactKeys(value, [
    'version', 'revision', 'activeRelease', 'previousRelease', 'updatedAt',
  ])) return null
  if (
    value.version !== 1
    || !Number.isSafeInteger(value.revision)
    || (value.revision as number) < 0
    || (value.activeRelease !== null && !validReleaseId(value.activeRelease))
    || (value.previousRelease !== null && !validReleaseId(value.previousRelease))
    || typeof value.updatedAt !== 'string'
    || value.updatedAt === ''
  ) return null
  return {
    version: 1,
    revision: value.revision as number,
    activeRelease: value.activeRelease as string | null,
    previousRelease: value.previousRelease as string | null,
    updatedAt: value.updatedAt,
  }
}

function decodeRelease(value: unknown): RuntimeActivation['release'] | null {
  if (!isRecord(value)) return null
  return parseManifest(JSON.stringify(value))
}

function decodeLauncherFile(value: unknown): NonNullable<RuntimeActivation['launcherSnapshot']>['tenon'] | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ['path', 'state'])
    || typeof value.path !== 'string'
    || !isAbsolute(value.path)
    || normalize(value.path) !== value.path
  ) return null
  const state = value.state
  if (!isRecord(state) || typeof state.kind !== 'string') return null
  if (state.kind === 'missing' && exactKeys(state, ['kind'])) {
    return { path: value.path, state: { kind: 'missing' } }
  }
  if (
    state.kind === 'file'
    && exactKeys(state, ['kind', 'content', 'mode'])
    && typeof state.content === 'string'
    && Number.isSafeInteger(state.mode)
    && (state.mode as number) >= 0
  ) {
    return {
      path: value.path,
      state: {
        kind: 'file',
        content: state.content,
        mode: state.mode as number,
      },
    }
  }
  return null
}

function decodeLauncherSnapshot(value: unknown): RuntimeLauncherSnapshot | null {
  if (!isRecord(value) || !exactKeys(value, ['tenon', 'hook'])) return null
  const tenon = decodeLauncherFile(value.tenon)
  const hook = decodeLauncherFile(value.hook)
  return tenon === null || hook === null ? null : { tenon, hook }
}

function decodeActivation(value: unknown): RuntimeActivation | null {
  if (!isRecord(value) || !exactKeys(
    value,
    ['selection', 'release', 'releaseRoot'],
    ['launcherSnapshot', 'launcherCommitted'],
  )) return null
  const selection = decodeSelection(value.selection)
  const release = decodeRelease(value.release)
  if (selection === null || release === null || typeof value.releaseRoot !== 'string') return null
  const launcherSnapshot = value.launcherSnapshot === undefined
    ? undefined
    : decodeLauncherSnapshot(value.launcherSnapshot)
  const launcherCommitted = value.launcherCommitted === undefined
    ? undefined
    : decodeLauncherSnapshot(value.launcherCommitted)
  if (launcherSnapshot === null || launcherCommitted === null) return null
  return {
    selection,
    release,
    releaseRoot: value.releaseRoot,
    ...(launcherSnapshot === undefined ? {} : { launcherSnapshot }),
    ...(launcherCommitted === undefined ? {} : { launcherCommitted }),
  }
}

function decodeActivationCheckpoint(
  value: unknown,
): ManagedReleaseJournalRecord['activationCheckpoint'] | null {
  if (!isRecord(value) || !exactKeys(value, ['selection', 'launchers'])) return null
  const selection = decodeSelection(value.selection)
  const launchers = decodeLauncherSnapshot(value.launchers)
  return selection === null || launchers === null ? null : { selection, launchers }
}

function isOperation(value: unknown): value is ManagedReleaseOperation {
  return value === 'setup' || value === 'update' || value === 'adapter'
}

function decodeStableTarget(
  value: unknown,
): ManagedReleaseJournalRecord['stableTarget'] | null {
  if (value === undefined) return undefined
  if (!isRecord(value)
    || !exactKeys(value, ['version', 'tag', 'commit'])
    || typeof value.version !== 'string'
    || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value.version)
    || value.tag !== `v${value.version}`
    || typeof value.commit !== 'string'
    || !/^[a-f0-9]{40}$/.test(value.commit)) return null
  return { version: value.version, tag: value.tag as string, commit: value.commit }
}

function decodeDashboardIdentity(value: unknown): ManagedReleaseJournalRecord['dashboardBefore'] | null {
  if (value === undefined) return undefined
  const serverVersion = isRecord(value) && value.serverVersion === undefined
    ? ''
    : isRecord(value) ? value.serverVersion : undefined
  if (!isRecord(value)
    || !exactKeys(value, ['version', 'port', 'pid', 'releaseId', 'stateScopeId'], ['serverVersion', 'transactionId'])
    || value.version !== 1
    || typeof serverVersion !== 'string'
    || (serverVersion === '' && Object.hasOwn(value, 'serverVersion'))
    || (serverVersion !== ''
      && !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(serverVersion))
    || !Number.isSafeInteger(value.port)
    || (value.port as number) < 1
    || (value.port as number) > 65_535
    || !Number.isSafeInteger(value.pid)
    || (value.pid as number) < 1
    || !validReleaseId(value.releaseId)
    || typeof value.stateScopeId !== 'string'
    || !/^sha256-v1-[a-f0-9]{64}$/.test(value.stateScopeId)
    || (value.transactionId !== undefined
      && (typeof value.transactionId !== 'string'
        || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value.transactionId)))) return null
  return {
    version: 1,
    serverVersion,
    port: value.port as number,
    pid: value.pid as number,
    releaseId: value.releaseId,
    stateScopeId: value.stateScopeId,
    ...(value.transactionId === undefined ? {} : { transactionId: value.transactionId as string }),
  }
}

function decodeDashboard(value: unknown): ManagedReleaseJournalRecord['dashboard'] | null {
  if (value === undefined) return undefined
  if (!isRecord(value) || (value.owner !== 'transaction' && value.owner !== 'preexisting')) return null
  const identity = decodeDashboardIdentity({
    version: value.version,
    port: value.port,
    pid: value.pid,
    releaseId: value.releaseId,
    stateScopeId: value.stateScopeId,
    transactionId: value.transactionId,
    ...(value.serverVersion === undefined ? {} : { serverVersion: value.serverVersion }),
  })
  if (identity === null || identity === undefined
    || !exactKeys(
      value,
      ['version', 'port', 'pid', 'releaseId', 'stateScopeId', 'owner'],
      ['serverVersion', 'transactionId'],
    )) return null
  return { ...identity, owner: value.owner }
}

function decodeJournal(raw: string, paths: RuntimePaths): ManagedReleaseJournalRecord | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || !exactKeys(
    value,
    ['version', 'transactionId', 'operation', 'source', 'phase', 'startedAt', 'updatedAt'],
    [
      'dashboardPort', 'stableTarget', 'candidateRoot', 'candidateOpenBrowser', 'evidence', 'hostSteps', 'activationCheckpoint', 'activation',
      'dashboardBefore', 'dashboardBeforeAbsent', 'dashboardBeforeRetiring', 'dashboard', 'compensationReason',
      'dashboardRestored',
    ],
  )) return null
  if (
    value.version !== 1
    || typeof value.transactionId !== 'string'
    || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value.transactionId)
    || !isOperation(value.operation)
    || !isSource(value.source)
    || (value.phase !== 'preparing-host'
      && value.phase !== 'candidate-resolved'
      && value.phase !== 'activating-runtime'
      && value.phase !== 'runtime-activated'
      && value.phase !== 'starting-dashboard'
      && value.phase !== 'dashboard-ready'
      && value.phase !== 'stopping-candidate'
      && value.phase !== 'reverting-activation'
      && value.phase !== 'restoring-previous'
      && value.phase !== 'previous-restored'
      && value.phase !== 'evidence-committed')
    || typeof value.startedAt !== 'string'
    || value.startedAt === ''
    || typeof value.updatedAt !== 'string'
    || value.updatedAt === ''
    || (value.dashboardPort !== undefined
      && (!Number.isSafeInteger(value.dashboardPort)
        || (value.dashboardPort as number) < 1
        || (value.dashboardPort as number) > 65_535))
    || (value.candidateRoot !== undefined
      && (typeof value.candidateRoot !== 'string'
        || !isAbsolute(value.candidateRoot)
        || normalize(value.candidateRoot) !== value.candidateRoot))
    || (value.candidateOpenBrowser !== undefined && typeof value.candidateOpenBrowser !== 'boolean')
    || (value.evidence !== undefined
      && (typeof value.evidence !== 'string' || value.evidence.length > 1_000_000))
    || (value.compensationReason !== undefined
      && (typeof value.compensationReason !== 'string'
        || value.compensationReason === ''
        || value.compensationReason.length > 4_096))
    || (value.dashboardBeforeAbsent !== undefined && value.dashboardBeforeAbsent !== true)
    || (value.dashboardBeforeRetiring !== undefined && value.dashboardBeforeRetiring !== true)
  ) return null
  const activationCheckpoint = value.activationCheckpoint === undefined
    ? undefined
    : decodeActivationCheckpoint(value.activationCheckpoint)
  const activation = value.activation === undefined ? undefined : decodeActivation(value.activation)
  const hostSteps = decodeManagedHostSteps(value.hostSteps)
  const dashboardBefore = decodeDashboardIdentity(value.dashboardBefore)
  const dashboard = decodeDashboard(value.dashboard)
  const dashboardRestored = decodeDashboardIdentity(value.dashboardRestored)
  const stableTarget = decodeStableTarget(value.stableTarget)
  if (activationCheckpoint === null
    || activation === null
    || hostSteps === null
    || dashboardBefore === null
    || dashboard === null
    || dashboardRestored === null
    || stableTarget === null) return null
  if (activation !== undefined
    && (activation.selection.activeRelease !== activation.release.releaseId
      || activation.release.source.host !== value.source
      || (stableTarget !== undefined
        && (activation.release.version !== 2
          || activation.release.stableTarget === undefined
          || JSON.stringify(activation.release.stableTarget) !== JSON.stringify(stableTarget))))) return null
  const expectedLaunchers = expectedStableLaunchers(paths, paths.homeDir)
  const launchersHaveExpectedPaths = (snapshot: RuntimeLauncherSnapshot | undefined) =>
    snapshot === undefined
    || (snapshot.tenon.path === expectedLaunchers.tenon.path
      && snapshot.hook.path === expectedLaunchers.hook.path)
  if (
    !launchersHaveExpectedPaths(activationCheckpoint?.launchers)
    || !launchersHaveExpectedPaths(activation?.launcherSnapshot)
    || !launchersHaveExpectedPaths(activation?.launcherCommitted)
    || (activation !== undefined
      && activation.releaseRoot !== join(paths.releasesRoot, activation.release.releaseId))
  ) return null
  if (
    (value.phase === 'candidate-resolved' && typeof value.candidateRoot !== 'string')
    || (value.phase === 'activating-runtime'
      && (typeof value.candidateRoot !== 'string' || activationCheckpoint === undefined))
    || ((value.phase === 'runtime-activated'
      || value.phase === 'starting-dashboard'
      || value.phase === 'dashboard-ready'
      || value.phase === 'stopping-candidate'
      || value.phase === 'reverting-activation'
      || value.phase === 'restoring-previous'
      || value.phase === 'previous-restored'
      || value.phase === 'evidence-committed')
      && (typeof value.candidateRoot !== 'string' || activation === undefined))
    || ((value.phase === 'dashboard-ready' || value.phase === 'evidence-committed')
      && value.dashboard !== undefined
      && dashboard === undefined)
    || (dashboard?.owner === 'transaction'
      && dashboard.transactionId !== value.transactionId)
    || ((value.phase === 'stopping-candidate'
      || value.phase === 'reverting-activation'
      || value.phase === 'restoring-previous'
      || value.phase === 'previous-restored')
      && (activationCheckpoint === undefined || typeof value.compensationReason !== 'string'))
    || (dashboardRestored !== undefined
      && dashboardRestored.transactionId !== `${value.transactionId}:restore`)
    || (dashboardBefore !== undefined && value.dashboardBeforeAbsent === true)
    || (value.dashboardBeforeRetiring === true
      && (value.phase !== 'starting-dashboard'
        || dashboardBefore === undefined
        || value.dashboardBeforeAbsent === true))
    || (value.dashboardPort !== undefined
      && ((dashboardBefore !== undefined
        && dashboardBefore.port !== value.dashboardPort)
        || (dashboard !== undefined
          && dashboard.port !== value.dashboardPort)
        || (dashboardRestored !== undefined
          && dashboardRestored.port !== value.dashboardPort)))
    || ((value.source === 'codex' || value.source === 'claude')
      && (value.phase === 'runtime-activated'
        || value.phase === 'starting-dashboard'
        || value.phase === 'dashboard-ready'
        || value.phase === 'stopping-candidate'
        || value.phase === 'reverting-activation'
        || value.phase === 'restoring-previous'
        || value.phase === 'previous-restored'
        || value.phase === 'evidence-committed')
      && value.dashboardPort === undefined
      && !((value.operation === 'setup' || value.operation === 'update')
        && value.stableTarget === undefined))
  ) return null
  return {
    version: 1,
    transactionId: value.transactionId,
    operation: value.operation,
    source: value.source,
    phase: value.phase,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    ...(value.dashboardPort === undefined ? {} : { dashboardPort: value.dashboardPort as number }),
    ...(stableTarget === undefined ? {} : { stableTarget }),
    ...(value.candidateRoot === undefined ? {} : { candidateRoot: value.candidateRoot }),
    ...(value.candidateOpenBrowser === undefined
      ? {}
      : { candidateOpenBrowser: value.candidateOpenBrowser }),
    ...(value.evidence === undefined ? {} : { evidence: value.evidence }),
    ...(hostSteps === undefined ? {} : { hostSteps }),
    ...(activationCheckpoint === undefined ? {} : { activationCheckpoint }),
    ...(activation === undefined ? {} : { activation }),
    ...(dashboardBefore === undefined ? {} : { dashboardBefore }),
    ...(value.dashboardBeforeAbsent === true ? { dashboardBeforeAbsent: true as const } : {}),
    ...(value.dashboardBeforeRetiring === true ? { dashboardBeforeRetiring: true as const } : {}),
    ...(dashboard === undefined ? {} : { dashboard }),
    ...(value.compensationReason === undefined
      ? {}
      : { compensationReason: value.compensationReason }),
    ...(dashboardRestored === undefined ? {} : { dashboardRestored }),
  }
}

async function readJournal(path: string, paths: RuntimePaths): Promise<ManagedReleaseJournalRecord | null> {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`managed release journal 不是普通文件：${path}`)
    }
    const decoded = decodeJournal(await readFile(path, 'utf8'), paths)
    if (decoded === null) throw new Error(`managed release journal 格式非法：${path}`)
    return decoded
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export function createManagedReleaseJournal(paths: RuntimePaths): ManagedReleaseJournal {
  const path = join(paths.managedTransactionRoot, JOURNAL_FILE)
  return {
    create(operation, source, now) {
      return {
        version: 1,
        transactionId: randomUUID(),
        operation,
        source,
        phase: 'preparing-host',
        startedAt: now,
        updatedAt: now,
      }
    },
    read: () => readJournal(path, paths),
    async write(record) {
      if (decodeJournal(JSON.stringify(record), paths) === null) {
        throw new Error(`managed release journal 格式非法：${path}`)
      }
      await mkdir(dirname(path), { recursive: true })
      await atomicWriteFile(path, `${JSON.stringify(record, null, 2)}\n`)
    },
    async clear(expectedTransactionId) {
      const current = await readJournal(path, paths)
      if (current === null) return
      if (current.transactionId !== expectedTransactionId) {
        throw new Error(
          `managed release journal ownership changed: expected=${expectedTransactionId}; actual=${current.transactionId}`,
        )
      }
      await unlink(path)
    },
  }
}
