import { mkdir } from 'node:fs/promises'
import { withLock } from '@tenon/kernel'
import {
  captureStableLaunchers,
  expectedStableLaunchers,
  restoreStableLaunchers,
  writeStableLaunchers,
} from './launchers.js'
import { resolveRuntimePaths } from './paths.js'
import type { RuntimePathInput } from './paths.js'
import { RuntimeReleaseStore } from './release-store.js'
import type {
  RuntimeActivation,
  RuntimeInspection,
  RuntimePaths,
  RuntimeReleaseSource,
} from './types.js'

/**
 * Boundary between the mutable marketplace checkout and the managed local runtime.
 *
 * Setup/update may inspect a host-owned checkout, but only this boundary can promote it into an
 * executable release.  The release store verifies a staged copy before atomically publishing the
 * selection; stable launchers are written only after that publication succeeds.
 */
export interface ManagedRuntimeTransaction {
  activate(candidateRoot: string, host: RuntimeReleaseSource['host']): Promise<RuntimeActivation>
  revertActivation(activation: RuntimeActivation): Promise<void>
}

export interface RuntimeInstallerScope {
  readonly homeDir: string
  readonly env: NonNullable<RuntimePathInput['env']>
  readonly platform?: NodeJS.Platform
}

export interface RuntimeInstaller {
  withManagedTransaction<T>(
    scope: RuntimeInstallerScope,
    operation: (transaction: ManagedRuntimeTransaction) => Promise<T>,
  ): Promise<T>
  inspect(scope: RuntimeInstallerScope): Promise<RuntimeInspection>
  rollback(scope: RuntimeInstallerScope): Promise<RuntimeActivation>
  recordUpdateFailure?(scope: RuntimeInstallerScope, detail: string): Promise<void>
}

export class ManagedRuntimeIndeterminateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ManagedRuntimeIndeterminateError'
  }
}

function pathsFor(scope: RuntimeInstallerScope): RuntimePaths {
  return resolveRuntimePaths({
    homeDir: scope.homeDir,
    env: scope.env,
    ...(scope.platform === undefined ? {} : { platform: scope.platform }),
  })
}

function storeFor(scope: RuntimeInstallerScope): RuntimeReleaseStore {
  return new RuntimeReleaseStore({ paths: pathsFor(scope) })
}

async function activateWithinTransaction(
  paths: RuntimePaths,
  homeDir: string,
  candidateRoot: string,
  host: RuntimeReleaseSource['host'],
): Promise<RuntimeActivation> {
  const store = new RuntimeReleaseStore({ paths })
  const launcherSnapshot = await captureStableLaunchers(paths, homeDir)
  const launcherCommitted = expectedStableLaunchers(paths, homeDir)
  const activation = await store.stageAndActivate(candidateRoot, host)
  try {
    await writeStableLaunchers(paths, homeDir)
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
  activation: RuntimeActivation,
): Promise<void> {
  await new RuntimeReleaseStore({ paths }).revertActivation(activation.selection)
  try {
    if (activation.launcherSnapshot !== undefined) {
      await restoreStableLaunchers(activation.launcherSnapshot, activation.launcherCommitted)
      return
    }
    const inspection = await new RuntimeReleaseStore({ paths }).inspect()
    if (inspection.selection.activeRelease !== null) await writeStableLaunchers(paths, homeDir)
  } catch (error) {
    throw new ManagedRuntimeIndeterminateError(
      `selection 已补偿，但稳定 launcher 状态无法证明：${String(error)}`,
    )
  }
}

async function rollbackWithinTransaction(
  paths: RuntimePaths,
  homeDir: string,
): Promise<RuntimeActivation> {
  const store = new RuntimeReleaseStore({ paths })
  const launcherSnapshot = await captureStableLaunchers(paths, homeDir)
  const launcherCommitted = expectedStableLaunchers(paths, homeDir)
  const activation = await store.rollbackToPrevious()
  try {
    await writeStableLaunchers(paths, homeDir)
    return { ...activation, launcherSnapshot, launcherCommitted }
  } catch (error) {
    try {
      await store.revertActivation(activation.selection)
    } catch (rollbackError) {
      throw new ManagedRuntimeIndeterminateError(
        `runtime repair 的 launcher 提交失败，且 selection CAS 补偿失败；未覆盖 launcher：`
        + `${String(error)}；selection=${String(rollbackError)}`,
      )
    }
    try {
      await restoreStableLaunchers(launcherSnapshot, launcherCommitted)
    } catch (rollbackError) {
      throw new ManagedRuntimeIndeterminateError(
        `runtime repair 的 selection 已恢复，但 launcher 精确恢复失败：`
        + `${String(error)}；launcher=${String(rollbackError)}`,
      )
    }
    throw new Error(`runtime repair 的 launcher 提交失败，已恢复 repair 前状态：${String(error)}`)
  }
}

async function withExclusiveRuntimeTransaction<T>(
  scope: RuntimeInstallerScope,
  operation: (transaction: ManagedRuntimeTransaction) => Promise<T>,
): Promise<T> {
  const paths = pathsFor(scope)
  await mkdir(paths.managedTransactionRoot, { recursive: true })
  return withLock(paths.managedTransactionRoot, () => operation({
    activate: (candidateRoot, host) =>
      activateWithinTransaction(paths, scope.homeDir, candidateRoot, host),
    revertActivation: (activation) =>
      revertWithinTransaction(paths, scope.homeDir, activation),
  }))
}

export const REAL_RUNTIME_INSTALLER: RuntimeInstaller = {
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
      () => rollbackWithinTransaction(paths, scope.homeDir),
    )
  },
  recordUpdateFailure(scope, detail) {
    return storeFor(scope).recordUpdateFailure(detail)
  },
}
