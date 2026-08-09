import type { RuntimeInstallerScope } from '../runtime/installer.js'
import { ManagedRuntimeIndeterminateError } from '../runtime/installer.js'
import type { CandidatePayloadValidationOptions } from '../runtime/release-payload.js'
import type { SetupEnv } from './setupEnvironment.js'

/**
 * Freeze the lifecycle executables once for recovery/cleanup paths that do not pass through the
 * ordinary setup/update preflight. Production exposes the physical resolver and therefore must
 * prove both Bash and Node; legacy injected unit environments remain capability-neutral.
 */
export function nativeRuntimeInstallerScope(env: SetupEnv): RuntimeInstallerScope {
  const bash = env.resolveTrustedCommandBinding?.('bash')
  const node = env.resolveTrustedCommandBinding?.('node')
  if (env.resolveTrustedCommandBinding !== undefined && (bash === undefined || node === undefined)) {
    throw new ManagedRuntimeIndeterminateError(
      'cleanup/recovery 无法冻结可信 Bash + Node；保留 pending 状态且拒绝宿主 mutation',
    )
  }
  return {
    homeDir: env.homeDir(),
    env: env.runtimeEnv(),
    ...(bash === undefined ? {} : {
      trustedBashPath: bash.executable,
      verifyTrustedBash: bash.assert,
    }),
    ...(node === undefined ? {} : {
      trustedNodePath: node.executable,
      trustedNodeProof: node.proof,
      verifyTrustedNode: node.assert,
    }),
  }
}

export function nativeCandidateValidationOptions(
  env: SetupEnv,
): CandidatePayloadValidationOptions | undefined {
  const scope = nativeRuntimeInstallerScope(env)
  if (scope.trustedBashPath === undefined || scope.trustedNodePath === undefined) return undefined
  return {
    bashPath: scope.trustedBashPath,
    verifyBash: scope.verifyTrustedBash,
    nodePath: scope.trustedNodePath,
    verifyNode: scope.verifyTrustedNode,
  }
}
