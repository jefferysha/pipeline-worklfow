import type { RuntimeInstallerScope } from './installer-contract.js'
import { resolveRuntimePaths } from './paths.js'
import { RuntimeReleaseStore } from './release-store.js'
import type { RuntimePaths } from './types.js'

export function runtimePathsFor(scope: RuntimeInstallerScope): RuntimePaths {
  return resolveRuntimePaths({
    homeDir: scope.homeDir,
    env: scope.env,
    ...(scope.platform === undefined ? {} : { platform: scope.platform }),
  })
}

export function runtimeStoreFor(scope: RuntimeInstallerScope): RuntimeReleaseStore {
  return new RuntimeReleaseStore({
    paths: runtimePathsFor(scope),
    ...(scope.trustedBashPath === undefined ? {} : { bashPath: scope.trustedBashPath }),
    ...(scope.verifyTrustedBash === undefined ? {} : { verifyBash: scope.verifyTrustedBash }),
    ...(scope.trustedNodePath === undefined ? {} : { nodePath: scope.trustedNodePath }),
    ...(scope.verifyTrustedNode === undefined ? {} : { verifyNode: scope.verifyTrustedNode }),
  })
}

export function transactionRuntimeStore(
  paths: RuntimePaths,
  trustedBashPath?: string,
  verifyTrustedBash?: () => void,
  trustedNodePath?: string,
  verifyTrustedNode?: () => void,
): RuntimeReleaseStore {
  return new RuntimeReleaseStore({
    paths,
    ...(trustedBashPath === undefined ? {} : { bashPath: trustedBashPath }),
    ...(verifyTrustedBash === undefined ? {} : { verifyBash: verifyTrustedBash }),
    ...(trustedNodePath === undefined ? {} : { nodePath: trustedNodePath }),
    ...(verifyTrustedNode === undefined ? {} : { verifyNode: verifyTrustedNode }),
  })
}
