import { homedir } from 'node:os'
import {
  captureStableLaunchers,
  expectedStableLaunchers,
  restoreStableLaunchers,
  writeStableLaunchers,
} from './launchers.js'
import { resolveRuntimePaths } from './paths.js'
import { RuntimeReleaseStore } from './release-store.js'
import type { RuntimeActivation, RuntimeInspection, RuntimeReleaseSource } from './types.js'

/**
 * Boundary between the mutable marketplace checkout and the managed local runtime.
 *
 * Setup/update may inspect a host-owned checkout, but only this boundary can promote it into an
 * executable release.  The release store verifies a staged copy before atomically publishing the
 * selection; stable launchers are written only after that publication succeeds.
 */
export interface RuntimeInstaller {
  activate(candidateRoot: string, host: RuntimeReleaseSource['host'], homeDir: string): Promise<RuntimeActivation>
  inspect(homeDir: string): Promise<RuntimeInspection>
  rollback(homeDir: string): Promise<RuntimeActivation>
  revertActivation?(homeDir: string, activation: RuntimeActivation): Promise<void>
  recordUpdateFailure?(homeDir: string, detail: string): Promise<void>
}

function storeFor(homeDir: string): RuntimeReleaseStore {
  return new RuntimeReleaseStore({ paths: resolveRuntimePaths({ homeDir }) })
}

export const REAL_RUNTIME_INSTALLER: RuntimeInstaller = {
  async activate(candidateRoot, host, homeDir = homedir()) {
    const paths = resolveRuntimePaths({ homeDir })
    const store = new RuntimeReleaseStore({ paths })
    const launcherSnapshot = await captureStableLaunchers(paths, homeDir)
    const launcherCommitted = expectedStableLaunchers(paths, homeDir)
    const activation = await store.stageAndActivate(candidateRoot, host)
    try {
      await writeStableLaunchers(paths, homeDir)
      return { ...activation, launcherSnapshot, launcherCommitted }
    } catch (error) {
      const rollbackErrors: string[] = []
      await store.revertActivation(activation.selection).catch((rollbackError: unknown) => {
        rollbackErrors.push(`selection=${String(rollbackError)}`)
      })
      await restoreStableLaunchers(launcherSnapshot, launcherCommitted).catch((rollbackError: unknown) => {
        rollbackErrors.push(`launcher=${String(rollbackError)}`)
      })
      if (rollbackErrors.length > 0) {
        throw new Error(
          `稳定 launcher 写入失败且 activation 补偿失败：${String(error)}；rollback=${rollbackErrors.join('；')}`,
        )
      }
      throw new Error(`稳定 launcher 写入失败，已恢复 activation 前 runtime：${String(error)}`)
    }
  },
  inspect(homeDir = homedir()) {
    return storeFor(homeDir).inspect()
  },
  async rollback(homeDir = homedir()) {
    const paths = resolveRuntimePaths({ homeDir })
    const activation = await new RuntimeReleaseStore({ paths }).rollbackToPrevious()
    await writeStableLaunchers(paths, homeDir)
    return activation
  },
  async revertActivation(homeDir = homedir(), activation) {
    const paths = resolveRuntimePaths({ homeDir })
    await new RuntimeReleaseStore({ paths }).revertActivation(activation.selection)
    if (activation.launcherSnapshot !== undefined) {
      await restoreStableLaunchers(activation.launcherSnapshot, activation.launcherCommitted)
      return
    }
    const inspection = await new RuntimeReleaseStore({ paths }).inspect()
    if (inspection.selection.activeRelease !== null) await writeStableLaunchers(paths, homeDir)
  },
  recordUpdateFailure(homeDir = homedir(), detail) {
    return storeFor(homeDir).recordUpdateFailure(detail)
  },
}
