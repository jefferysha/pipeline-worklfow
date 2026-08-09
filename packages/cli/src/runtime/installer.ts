import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { atomicWriteFile, withLock } from '@tenon/kernel'
import {
  captureStableLaunchers,
  convergeStableLaunchers,
  expectedLegacyStableLaunchersV101,
  expectedStableLaunchers,
  restoreStableLaunchers,
  writeStableLaunchers,
} from './launchers.js'
import { RuntimeReleaseStore } from './release-store.js'
import type {
  RuntimeActivation,
  RuntimePaths,
  RuntimeReleaseSource,
  RuntimeStableReleaseTarget,
  RuntimeSelection,
  TrustedExecutableProof,
} from './types.js'
import { createManagedReleaseJournal } from './managed-release-journal.js'
import {
  readRollbackJournal,
  rollbackJournalPath,
  selectionMatchesRollbackTarget,
} from './runtime-rollback-journal.js'
import {
  runtimePathsFor as pathsFor,
  runtimeStoreFor as storeFor,
  transactionRuntimeStore as transactionStore,
} from './runtime-installer-store.js'
import {
  ManagedRuntimeIndeterminateError,
  type ManagedRuntimeTransaction,
  type RuntimeActivationCheckpoint,
  type RuntimeInstaller,
  type RuntimeInstallerScope,
} from './installer-contract.js'
export * from './installer-contract.js'
async function activateWithinTransaction(
  paths: RuntimePaths,
  homeDir: string,
  trustedBashPath: string | undefined,
  verifyTrustedBash: (() => void) | undefined,
  trustedNodePath: string | undefined,
  trustedNodeProof: TrustedExecutableProof | undefined,
  verifyTrustedNode: (() => void) | undefined,
  candidateRoot: string,
  host: RuntimeReleaseSource['host'],
  expectedPluginVersion?: string,
  stableTarget?: RuntimeStableReleaseTarget,
): Promise<RuntimeActivation> {
  const store = new RuntimeReleaseStore({
    paths,
    ...(trustedBashPath === undefined ? {} : { bashPath: trustedBashPath }),
    ...(verifyTrustedBash === undefined ? {} : { verifyBash: verifyTrustedBash }),
    ...(trustedNodePath === undefined ? {} : { nodePath: trustedNodePath }),
    ...(verifyTrustedNode === undefined ? {} : { verifyNode: verifyTrustedNode }),
  })
  const launcherSnapshot = await captureStableLaunchers(paths, homeDir)
  verifyTrustedNode?.()
  const launcherCommitted = expectedStableLaunchers(paths, homeDir, trustedNodePath, trustedNodeProof)
  const activation = await store.stageAndActivate(candidateRoot, host, expectedPluginVersion, stableTarget)
  try {
    await writeStableLaunchers(paths, homeDir, {
      checkpoint: launcherSnapshot,
      ...(trustedNodePath === undefined ? {} : { nodeExecutable: trustedNodePath }),
      ...(trustedNodeProof === undefined ? {} : { nodeProof: trustedNodeProof }),
      ...(verifyTrustedNode === undefined ? {} : { verifyNode: verifyTrustedNode }),
    })
    return { ...activation, launcherSnapshot, launcherCommitted }
  } catch (error) {
    try {
      await store.revertActivation(activation.selection)
    } catch (rollbackError) {
      throw new ManagedRuntimeIndeterminateError(
        `稳定 launcher 写入失败，且 selection CAS 补偿失败；为避免覆盖并发事务，未恢复 launcher：`
        + `${String(error)}；selection=${String(rollbackError)}`,
      )
    }
    try {
      await restoreStableLaunchers(launcherSnapshot, launcherCommitted)
    } catch (rollbackError) {
      throw new ManagedRuntimeIndeterminateError(
        `稳定 launcher 写入失败；selection 已恢复，但 launcher 精确恢复失败：`
        + `${String(error)}；launcher=${String(rollbackError)}`,
      )
    }
    throw new Error(`稳定 launcher 写入失败，已恢复 activation 前 runtime：${String(error)}`)
  }
}
async function revertWithinTransaction(
  paths: RuntimePaths,
  homeDir: string,
  trustedBashPath: string | undefined,
  verifyTrustedBash: (() => void) | undefined,
  trustedNodePath: string | undefined,
  trustedNodeProof: TrustedExecutableProof | undefined,
  verifyTrustedNode: (() => void) | undefined,
  activation: RuntimeActivation,
): Promise<void> {
  const store = transactionStore(paths, trustedBashPath, verifyTrustedBash, trustedNodePath, verifyTrustedNode)
  const compensatedSelection = {
    version: 1 as const,
    revision: activation.selection.revision + 1,
    activeRelease: activation.selection.previousRelease,
    previousRelease: activation.selection.activeRelease,
  }
  const sameSelectionCoordinates = (
    current: RuntimeSelection,
    expected: Pick<RuntimeSelection, 'version' | 'revision' | 'activeRelease' | 'previousRelease'>,
  ) => current.version === expected.version
    && current.revision === expected.revision
    && current.activeRelease === expected.activeRelease
    && current.previousRelease === expected.previousRelease
  const before = await store.inspect()
  if (sameSelectionCoordinates(before.selection, activation.selection)) {
    await store.revertActivation(activation.selection)
  } else if (!sameSelectionCoordinates(before.selection, compensatedSelection)) {
    throw new ManagedRuntimeIndeterminateError(
      'runtime selection 既不匹配 journal activation，也不是其精确 compensated revision；拒绝覆盖',
    )
  }
  try {
    if (activation.launcherSnapshot !== undefined) {
      await restoreStableLaunchers(activation.launcherSnapshot, activation.launcherCommitted)
    } else {
      const inspection = await store.inspect()
      if (inspection.selection.activeRelease !== null) {
        const current = await captureStableLaunchers(paths, homeDir)
        const legacy = expectedLegacyStableLaunchersV101(paths, homeDir)
        verifyTrustedNode?.()
        const committed = expectedStableLaunchers(paths, homeDir, trustedNodePath, trustedNodeProof)
        const checkpoint = sameJson(current, legacy) || sameJson(current, committed)
          ? current
          : (() => { throw new ManagedRuntimeIndeterminateError('legacy launcher 状态不可证明，拒绝覆盖') })()
        await writeStableLaunchers(paths, homeDir, {
          checkpoint,
          ...(trustedNodePath === undefined ? {} : { nodeExecutable: trustedNodePath }),
          ...(trustedNodeProof === undefined ? {} : { nodeProof: trustedNodeProof }),
          ...(verifyTrustedNode === undefined ? {} : { verifyNode: verifyTrustedNode }),
        })
      }
    }
  } catch (error) {
    throw new ManagedRuntimeIndeterminateError(
      `selection 已补偿，但稳定 launcher 状态无法证明：${String(error)}`,
    )
  }
  const after = await store.inspect()
  if (!sameSelectionCoordinates(after.selection, compensatedSelection)) {
    throw new ManagedRuntimeIndeterminateError('activation 补偿后 selection 未处于精确 compensated revision')
  }
  if (compensatedSelection.activeRelease === null) {
    if (after.active !== null || after.activeValid) {
      throw new ManagedRuntimeIndeterminateError('activation 补偿后空 selection 的 runtime 证明不一致')
    }
  } else if (
    !after.activeValid
    || after.active?.releaseId !== compensatedSelection.activeRelease
  ) {
    throw new ManagedRuntimeIndeterminateError('activation 补偿后的 previous runtime 无法通过完整性证明')
  }
  if (activation.launcherSnapshot !== undefined) {
    const currentLaunchers = await captureStableLaunchers(paths, homeDir)
    if (!sameJson(currentLaunchers, activation.launcherSnapshot)) {
      throw new ManagedRuntimeIndeterminateError('activation 补偿后的 launcher 与 pre-activation checkpoint 不一致')
    }
  }
}
async function proveActivationWithinTransaction(
  paths: RuntimePaths,
  homeDir: string,
  trustedBashPath: string | undefined,
  verifyTrustedBash: (() => void) | undefined,
  trustedNodePath: string | undefined,
  _trustedNodeProof: TrustedExecutableProof | undefined,
  verifyTrustedNode: (() => void) | undefined,
  activation: RuntimeActivation,
): Promise<boolean> {
  const inspection = await transactionStore(
    paths,
    trustedBashPath,
    verifyTrustedBash,
    trustedNodePath,
    verifyTrustedNode,
  ).inspect()
  if (inspection.auditPending === true) return false
  if (
    !inspection.activeValid
    || !sameJson(inspection.selection, activation.selection)
    || !sameJson(inspection.active, activation.release)
    || activation.releaseRoot !== join(paths.releasesRoot, activation.release.releaseId)
  ) return false
  if (activation.launcherCommitted === undefined) return true
  const currentLaunchers = await captureStableLaunchers(paths, homeDir)
  return JSON.stringify(currentLaunchers) === JSON.stringify(activation.launcherCommitted)
}
async function checkpointActivationWithinTransaction(
  paths: RuntimePaths,
  homeDir: string,
  trustedBashPath: string | undefined,
  verifyTrustedBash: (() => void) | undefined,
  trustedNodePath: string | undefined,
  _trustedNodeProof: TrustedExecutableProof | undefined,
  verifyTrustedNode: (() => void) | undefined,
): Promise<RuntimeActivationCheckpoint> {
  const selection = (await transactionStore(
    paths,
    trustedBashPath,
    verifyTrustedBash,
    trustedNodePath,
    verifyTrustedNode,
  ).inspect()).selection
  return {
    selection,
    launchers: await captureStableLaunchers(paths, homeDir),
  }
}
function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function recoverActivationWithinTransaction(
  paths: RuntimePaths,
  homeDir: string,
  trustedBashPath: string | undefined,
  verifyTrustedBash: (() => void) | undefined,
  trustedNodePath: string | undefined,
  trustedNodeProof: TrustedExecutableProof | undefined,
  verifyTrustedNode: (() => void) | undefined,
  checkpoint: RuntimeActivationCheckpoint,
  host: RuntimeReleaseSource['host'],
): Promise<{ readonly state: 'not-started' } | { readonly state: 'activated'; readonly activation: RuntimeActivation }> {
  const store = transactionStore(paths, trustedBashPath, verifyTrustedBash, trustedNodePath, verifyTrustedNode)
  const inspection = await store.inspect()
  if (inspection.auditPending === true) {
    throw new ManagedRuntimeIndeterminateError(
      'activation selection 已提交，但 terminal audit 尚未持久化；保留 WAL 并等待同一命令恢复',
    )
  }
  const launchers = await captureStableLaunchers(paths, homeDir)
  if (sameJson(inspection.selection, checkpoint.selection) && sameJson(launchers, checkpoint.launchers)) {
    return { state: 'not-started' }
  }
  const active = inspection.active
  const expectedPrevious = checkpoint.selection.activeRelease === active?.releaseId
    ? checkpoint.selection.previousRelease
    : checkpoint.selection.activeRelease
  const activationCoordinatesMatch = (
    active !== null
    && inspection.activeValid
    && active.source.host === host
    && inspection.selection.revision === checkpoint.selection.revision + 1
    && inspection.selection.activeRelease === active.releaseId
    && inspection.selection.previousRelease === expectedPrevious
  )
  let committedLaunchers = launchers
  if (activationCoordinatesMatch
    && active.version === 1
    && active.source.pluginVersion === '1.0.1'
    && sameJson(launchers, expectedLegacyStableLaunchersV101(paths, homeDir))) {
    try {
      await writeStableLaunchers(paths, homeDir, {
        checkpoint: expectedLegacyStableLaunchersV101(paths, homeDir),
        ...(trustedNodePath === undefined ? {} : { nodeExecutable: trustedNodePath }),
        ...(trustedNodeProof === undefined ? {} : { nodeProof: trustedNodeProof }),
        ...(verifyTrustedNode === undefined ? {} : { verifyNode: verifyTrustedNode }),
      })
      committedLaunchers = await captureStableLaunchers(paths, homeDir)
    } catch (error) {
      throw new ManagedRuntimeIndeterminateError(
        `已证明 v1.0.1 activation，但安全 launcher 升级失败：${String(error)}`,
      )
    }
  }
  if (activationCoordinatesMatch
    && !sameJson(committedLaunchers, expectedStableLaunchers(paths, homeDir, trustedNodePath, trustedNodeProof))) {
    try {
      committedLaunchers = await convergeStableLaunchers(paths, checkpoint.launchers, homeDir, {
        ...(trustedNodePath === undefined ? {} : { nodeExecutable: trustedNodePath }),
        ...(trustedNodeProof === undefined ? {} : { nodeProof: trustedNodeProof }),
        ...(verifyTrustedNode === undefined ? {} : { verifyNode: verifyTrustedNode }),
      })
    } catch (error) {
      throw new ManagedRuntimeIndeterminateError(
        `selection 已提交，但 stable launcher partial pair 无法证明或收敛：${String(error)}`,
      )
    }
  }
  if (activationCoordinatesMatch
    && sameJson(committedLaunchers, expectedStableLaunchers(paths, homeDir, trustedNodePath, trustedNodeProof))) {
    return {
      state: 'activated',
      activation: {
        selection: inspection.selection,
        release: active,
        releaseRoot: join(paths.releasesRoot, active.releaseId),
        launcherSnapshot: checkpoint.launchers,
        launcherCommitted: committedLaunchers,
      },
    }
  }
  throw new ManagedRuntimeIndeterminateError(
    'activation checkpoint 与当前 selection/launcher 不一致，无法证明激活未开始或已完整提交',
  )
}

async function rollbackWithinTransaction(
  paths: RuntimePaths,
  homeDir: string,
  trustedBashPath: string | undefined,
  verifyTrustedBash: (() => void) | undefined,
  trustedNodePath: string | undefined,
  trustedNodeProof: TrustedExecutableProof | undefined,
  verifyTrustedNode: (() => void) | undefined,
): Promise<RuntimeActivation> {
  const store = transactionStore(paths, trustedBashPath, verifyTrustedBash, trustedNodePath, verifyTrustedNode)
  let journal = await readRollbackJournal(paths)
  if (journal === null) {
    const before = await store.inspect()
    if (!before.previousValid || before.previous === null || before.selection.previousRelease === null) {
      throw new ManagedRuntimeIndeterminateError(
        '没有可回滚的已验证 runtime release；请重新运行 tenon setup --<host>',
      )
    }
    journal = {
      version: 1,
      transactionId: randomUUID(),
      beforeSelection: before.selection,
      target: {
        revision: before.selection.revision + 1,
        activeRelease: before.selection.previousRelease,
        previousRelease: before.selection.activeRelease,
      },
      launchers: await captureStableLaunchers(paths, homeDir),
    }
    await atomicWriteFile(rollbackJournalPath(paths), `${JSON.stringify(journal, null, 2)}\n`)
  }
  const launcherSnapshot = journal.launchers
  verifyTrustedNode?.()
  const launcherCommitted = expectedStableLaunchers(paths, homeDir, trustedNodePath, trustedNodeProof)
  let inspection = await store.inspect()
  if (sameJson(inspection.selection, journal.beforeSelection)) {
    const committed = await store.rollbackToPrevious()
    if (!selectionMatchesRollbackTarget(committed.selection, journal.target)
      || committed.release.releaseId !== journal.target.activeRelease) {
      throw new ManagedRuntimeIndeterminateError('runtime rollback selection 未提交冻结目标')
    }
    inspection = await store.inspect()
  }
  if (inspection.auditPending === true) {
    throw new ManagedRuntimeIndeterminateError(
      'runtime rollback selection 已提交，但 terminal audit 尚未持久化；保留 rollback journal',
    )
  }
  if (!selectionMatchesRollbackTarget(inspection.selection, journal.target)
    || !inspection.activeValid || inspection.active?.releaseId !== journal.target.activeRelease) {
    throw new ManagedRuntimeIndeterminateError(
      'runtime rollback journal 与当前 selection 不一致；拒绝再次翻转或覆盖并发状态',
    )
  }
  try {
    await writeStableLaunchers(paths, homeDir, {
      checkpoint: launcherSnapshot,
      ...(trustedNodePath === undefined ? {} : { nodeExecutable: trustedNodePath }),
      ...(trustedNodeProof === undefined ? {} : { nodeProof: trustedNodeProof }),
      ...(verifyTrustedNode === undefined ? {} : { verifyNode: verifyTrustedNode }),
    })
    const exactLaunchers = await captureStableLaunchers(paths, homeDir)
    if (!sameJson(exactLaunchers, launcherCommitted)) {
      throw new ManagedRuntimeIndeterminateError('runtime rollback launcher pair 未收敛到冻结 Node 身份')
    }
    const persisted = await readRollbackJournal(paths)
    if (persisted === null || persisted.transactionId !== journal.transactionId) {
      throw new ManagedRuntimeIndeterminateError('runtime rollback journal owner 在提交前发生漂移')
    }
    await rm(rollbackJournalPath(paths))
    return {
      selection: inspection.selection,
      release: inspection.active,
      releaseRoot: join(paths.releasesRoot, inspection.active.releaseId),
      launcherSnapshot,
      launcherCommitted,
    }
  } catch (error) {
    throw new ManagedRuntimeIndeterminateError(
      `runtime rollback selection 已冻结；launcher 尚未收敛，请重跑同一 repair 命令：${String(error)}`,
    )
  }
}

async function withExclusiveRuntimeTransaction<T>(
  scope: RuntimeInstallerScope,
  operation: (transaction: ManagedRuntimeTransaction) => Promise<T>,
): Promise<T> {
  const paths = pathsFor(scope)
  await mkdir(paths.managedTransactionRoot, { recursive: true })
  return withLock(paths.managedTransactionRoot, async () => {
    if (await readRollbackJournal(paths) !== null) {
      throw new ManagedRuntimeIndeterminateError(
        '存在未完成的 runtime rollback；请先重跑 tenon runtime repair --rollback',
      )
    }
    return operation({
    checkpointActivation: () =>
      checkpointActivationWithinTransaction(
        paths,
        scope.homeDir,
        scope.trustedBashPath,
        scope.verifyTrustedBash,
        scope.trustedNodePath,
        scope.trustedNodeProof,
        scope.verifyTrustedNode,
      ),
    activate: (candidateRoot, host, expectedPluginVersion, stableTarget) =>
      activateWithinTransaction(
        paths,
        scope.homeDir,
        scope.trustedBashPath,
        scope.verifyTrustedBash,
        scope.trustedNodePath,
        scope.trustedNodeProof,
        scope.verifyTrustedNode,
        candidateRoot,
        host,
        expectedPluginVersion,
        stableTarget,
      ),
    recoverActivation: (checkpoint, host) =>
      recoverActivationWithinTransaction(
        paths,
        scope.homeDir,
        scope.trustedBashPath,
        scope.verifyTrustedBash,
        scope.trustedNodePath,
        scope.trustedNodeProof,
        scope.verifyTrustedNode,
        checkpoint,
        host,
      ),
    revertActivation: (activation) =>
      revertWithinTransaction(
        paths,
        scope.homeDir,
        scope.trustedBashPath,
        scope.verifyTrustedBash,
        scope.trustedNodePath,
        scope.trustedNodeProof,
        scope.verifyTrustedNode,
        activation,
      ),
    proveActivation: (activation) =>
      proveActivationWithinTransaction(
        paths,
        scope.homeDir,
        scope.trustedBashPath,
        scope.verifyTrustedBash,
        scope.trustedNodePath,
        scope.trustedNodeProof,
        scope.verifyTrustedNode,
        activation,
      ),
      journal: createManagedReleaseJournal(paths),
    })
  })
}

export const REAL_RUNTIME_INSTALLER: RuntimeInstaller = {
  peekManagedJournal(scope) {
    return createManagedReleaseJournal(pathsFor(scope)).read()
  },
  async withManagedTransaction(scope, operation) {
    return withExclusiveRuntimeTransaction(scope, operation)
  },
  inspect(scope) {
    return storeFor(scope).inspect()
  },
  async rollback(scope) {
    const paths = pathsFor(scope)
    await mkdir(paths.managedTransactionRoot, { recursive: true })
    return withLock(
      paths.managedTransactionRoot,
      () => rollbackWithinTransaction(
        paths,
        scope.homeDir,
        scope.trustedBashPath,
        scope.verifyTrustedBash,
        scope.trustedNodePath,
        scope.trustedNodeProof,
        scope.verifyTrustedNode,
      ),
    )
  },
  recordUpdateFailure(scope, detail) {
    return storeFor(scope).recordUpdateFailure(detail)
  },
}
