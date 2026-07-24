import { homedir } from 'node:os'
import { writeStableLaunchers } from './launchers.js'
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
}

function storeFor(homeDir: string): RuntimeReleaseStore {
  return new RuntimeReleaseStore({ paths: resolveRuntimePaths({ homeDir }) })
}

export const REAL_RUNTIME_INSTALLER: RuntimeInstaller = {
  async activate(candidateRoot, host, homeDir = homedir()) {
    const paths = resolveRuntimePaths({ homeDir })
    const activation = await new RuntimeReleaseStore({ paths }).stageAndActivate(candidateRoot, host)
    await writeStableLaunchers(paths, homeDir)
    return activation
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
}
