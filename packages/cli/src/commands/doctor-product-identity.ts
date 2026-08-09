import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { win32 } from 'node:path'
import { machineStateScopeId } from '@tenon/kernel'
import type { DoctorCheck } from './doctor-check.js'
import { green, red } from './doctor-check.js'
import type { DoctorProbes, DoctorProductIdentity } from '../deps.js'
import type { RuntimeInstaller } from '../runtime/installer.js'
import type { RuntimeScopeSnapshot } from '../runtime/scope.js'
import { resolveCommandOnPath } from './commandExists.js'
import { probeHealthyDashboard } from './dashboard-health.js'
import { parseDashboardPort } from './dashboard-launch-options.js'
import { DEFAULT_DASHBOARD_PORT } from './dashboard.js'
import { TENON_RELEASE_VERSION } from './plugin-host.js'
import { nativeHostMatchesStableTarget } from './managed-host-observation.js'
import { decodeNativeHostObservation, observeNativeHost } from './managed-host-state.js'
import type { SetupEnv } from './setupEnvironment.js'
import { inspectCandidatePayload } from '../runtime/release-store.js'
import { resolveStableTagTarget } from './stable-release.js'
import {
  nativeHostCommandBinding,
  type NativeHostCommandBinding,
} from './native-host-command-binding.js'
import { freezeTrustedExecutable, type TrustedExecutable } from './trusted-executable.js'

interface DoctorProductIdentityProbeRuntime {
  resolveHostCommand(
    command: 'codex' | 'claude',
    scope: RuntimeScopeSnapshot,
  ): NativeHostCommandBinding | undefined
  resolveTrustedCommand(
    command: 'bash' | 'git' | 'node',
    scope: RuntimeScopeSnapshot,
  ): TrustedExecutable | undefined
  readText(path: string): string | undefined
  run(
    file: string,
    args: readonly string[],
    cwd?: string,
  ): { readonly code: number; readonly stdout: string; readonly stderr: string }
  inspectCandidate: typeof inspectCandidatePayload
  probeDashboard: typeof probeHealthyDashboard
}

const REAL_PRODUCT_IDENTITY_RUNTIME: DoctorProductIdentityProbeRuntime = {
  resolveTrustedCommand(command, scope) {
    const candidate = resolveCommandOnPath(command, {
      pathValue: scope.env.PATH,
      platform: process.platform,
      requireAbsolutePathEntries: true,
    })
    return candidate === undefined ? undefined : freezeTrustedExecutable(candidate)
  },
  resolveHostCommand(command, scope) {
    const candidate = resolveCommandOnPath(command, {
      pathValue: scope.env.PATH,
      platform: process.platform,
      requireAbsolutePathEntries: true,
    })
    if (candidate === undefined) return undefined
    const trusted = freezeTrustedExecutable(candidate)
    if (trusted === undefined) return undefined
    const interpreter = process.platform === 'win32' && /\.(?:cmd|bat)$/iu.test(trusted.executable)
      ? freezeTrustedExecutable(
          scope.env.ComSpec && win32.isAbsolute(scope.env.ComSpec)
            ? scope.env.ComSpec
            : win32.join(scope.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe'),
        )
      : undefined
    return nativeHostCommandBinding(
      trusted.executable,
      process.platform,
      scope.env,
      trusted,
      interpreter,
    )
  },
  readText(path) {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return undefined
    }
  },
  run(file, args, cwd) {
    const asText = (value: unknown): string => Buffer.isBuffer(value)
      ? value.toString('utf8')
      : typeof value === 'string' ? value : ''
    try {
      return {
        code: 0,
        stdout: execFileSync(file, [...args], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 5_000,
          ...(cwd === undefined ? {} : { cwd }),
        }),
        stderr: '',
      }
    } catch (error) {
      const failed = error as { status?: unknown; stdout?: unknown; stderr?: unknown }
      return {
        code: typeof failed.status === 'number' ? failed.status : 1,
        stdout: asText(failed.stdout),
        stderr: asText(failed.stderr),
      }
    }
  },
  inspectCandidate: inspectCandidatePayload,
  probeDashboard: probeHealthyDashboard,
}

export async function checkProductIdentity(p: DoctorProbes): Promise<DoctorCheck> {
  const identity = await p.productIdentity()
  if (identity.state === 'unavailable') {
    return red(
      'identity:release',
      `无法证明发布身份: ${identity.detail}`,
      '重新运行 tenon setup --<host> 或 tenon update，使宿主、runtime 与 Dashboard 收敛到同一发布版本',
    )
  }
  const exact = identity.hostPluginVersion === identity.expectedVersion
    && identity.runtimePluginVersion === identity.expectedVersion
    && identity.dashboardServerVersion === identity.expectedVersion
    && identity.dashboardReleaseId === identity.runtimeReleaseId
    && identity.hostTargetExact
    && identity.payloadDigestExact
  const detail = [
    `expected=${identity.expectedVersion}`,
    `host=${identity.hostPluginVersion ?? 'missing'}`,
    `root=${identity.hostPluginRoot ?? 'missing'}`,
    `target=${identity.stableTargetTag}@${identity.stableTargetCommit.slice(0, 12)}:${identity.hostTargetExact ? 'exact' : 'drift'}`,
    `payload=${identity.hostPayloadDigest?.slice(0, 12) ?? 'missing'}/${identity.runtimePayloadDigest.slice(0, 12)}:${identity.payloadDigestExact ? 'exact' : 'drift'}`,
    `runtime=${identity.runtimePluginVersion}`,
    `dashboard=${identity.dashboardServerVersion ?? 'missing'}`,
    `release=${identity.dashboardReleaseId ?? 'missing'}/${identity.runtimeReleaseId}`,
  ].join('; ')
  return exact
    ? green('identity:release', `${identity.host} 发布身份一致（${detail}）`)
    : red(
        'identity:release',
        `发布身份漂移（${detail}）`,
        `运行 tenon update --${identity.host}，不要从 main 或源码目录直接启动`,
      )
}

export function createDoctorProductIdentityProbe(
  runtimeScope: () => RuntimeScopeSnapshot,
  installer: RuntimeInstaller,
  runtime: DoctorProductIdentityProbeRuntime = REAL_PRODUCT_IDENTITY_RUNTIME,
): () => Promise<DoctorProductIdentity> {
  return async () => {
    const scope = runtimeScope()
    try {
      const trustedBash = runtime.resolveTrustedCommand('bash', scope)
      const trustedGit = runtime.resolveTrustedCommand('git', scope)
      const trustedNode = runtime.resolveTrustedCommand('node', scope)
      if (trustedBash === undefined) {
        return { state: 'unavailable', detail: '可信 Bash 不可执行' }
      }
      if (trustedGit === undefined) {
        return { state: 'unavailable', detail: '可信 Git 不可执行' }
      }
      if (trustedNode === undefined) {
        return { state: 'unavailable', detail: '可信 Node 不可执行' }
      }
      const inspection = await installer.inspect({
        homeDir: scope.homeDir,
        env: scope.env,
        trustedBashPath: trustedBash.executable,
        verifyTrustedBash: trustedBash.assert,
        trustedNodePath: trustedNode.executable,
        trustedNodeProof: trustedNode.proof,
        verifyTrustedNode: trustedNode.assert,
      })
      const active = inspection.activeValid ? inspection.active : null
      const host = active?.source.host
      if (active === null || (host !== 'codex' && host !== 'claude')) {
        return { state: 'unavailable', detail: '没有可验证的 native managed runtime' }
      }
      if (active.version !== 2 || active.stableTarget === undefined) {
        return { state: 'unavailable', detail: 'active runtime manifest 缺少持久化 stable tag/commit 证明' }
      }
      const hostBinding = runtime.resolveHostCommand(host, scope)
      if (hostBinding === undefined) {
        return { state: 'unavailable', detail: `${host} 宿主不可执行` }
      }
      const diagnosticEnv = {
        homeDir: () => scope.homeDir,
        runtimeEnv: () => scope.env,
        readText: (path: string) => runtime.readText(path),
        runCommand: (command: string, args: string[]) => {
          if (command === host) {
            const invocation = hostBinding.invocation(args)
            return invocation === undefined
              ? { code: 127, stdout: '', stderr: 'trusted host identity drifted' }
              : runtime.run(invocation.file, invocation.args, invocation.cwd)
          }
          if (command !== 'git') return { code: 127, stdout: '', stderr: 'untrusted command' }
          try {
            trustedGit.assert()
          } catch {
            return { code: 127, stdout: '', stderr: 'trusted git identity drifted' }
          }
          return runtime.run(trustedGit.executable, args)
        },
      } as SetupEnv
      const observation = decodeNativeHostObservation(observeNativeHost(diagnosticEnv, host))
      const hostTargetExactBeforePayload = nativeHostMatchesStableTarget(
        diagnosticEnv,
        host,
        active.stableTarget,
      )
      const candidateRoot = observation.plugin?.root
      const candidate = candidateRoot === undefined
        ? null
        : await (async () => {
            trustedBash.assert()
            trustedNode.assert()
            return runtime.inspectCandidate(candidateRoot, {
              bashPath: trustedBash.executable,
              verifyBash: trustedBash.assert,
              nodePath: trustedNode.executable,
              verifyNode: trustedNode.assert,
            })
          })()
      const hostTargetExactAfterPayload = nativeHostMatchesStableTarget(
        diagnosticEnv,
        host,
        active.stableTarget,
      )
      const provenTarget = resolveStableTagTarget(diagnosticEnv, active.stableTarget.version)
      const remoteTargetExact = provenTarget.tag === active.stableTarget.tag
        && provenTarget.commit === active.stableTarget.commit
      const hostTargetExact = hostTargetExactBeforePayload
        && hostTargetExactAfterPayload
        && remoteTargetExact
      const payloadDigestExact = candidate !== null
        && candidate.pluginVersion === active.stableTarget.version
        && candidate.payloadDigest === active.payloadDigest
      const port = parseDashboardPort(scope.env.TENON_DASHBOARD_PORT) ?? DEFAULT_DASHBOARD_PORT
      const dashboard = await runtime.probeDashboard(
        port,
        active.releaseId,
        machineStateScopeId(scope.paths.stateRoot),
        { observeAnyTransaction: true },
      )
      return {
        state: 'native',
        expectedVersion: TENON_RELEASE_VERSION,
        host,
        hostPluginVersion: observation.plugin?.version ?? null,
        hostPluginRoot: observation.plugin?.root ?? null,
        stableTargetTag: active.stableTarget.tag,
        stableTargetCommit: active.stableTarget.commit,
        hostTargetExact,
        hostPayloadDigest: candidate?.payloadDigest ?? null,
        runtimePluginVersion: active.source.pluginVersion,
        runtimeReleaseId: active.releaseId,
        runtimePayloadDigest: active.payloadDigest,
        payloadDigestExact,
        dashboardServerVersion: dashboard?.serverVersion ?? null,
        dashboardReleaseId: dashboard?.releaseId ?? null,
      }
    } catch {
      return { state: 'unavailable', detail: '发布身份探针失败' }
    }
  }
}
