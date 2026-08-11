import { describe, expect, test } from 'vitest'
import { join } from 'node:path'
import type { RuntimeInstaller } from '../runtime/installer.js'
import { resolveRuntimePaths } from '../runtime/paths.js'
import { runtimeReleaseIdV2 } from '../runtime/release-store-codecs.js'
import { createDoctorProductIdentityProbe } from './doctor-product-identity.js'

const target = { version: '1.0.2', tag: 'v1.0.2', commit: 'a'.repeat(40) }
const source = { host: 'codex' as const, pluginVersion: target.version }
const runtimePayloadDigest = 'b'.repeat(64)
const releaseId = runtimeReleaseIdV2(runtimePayloadDigest, source, target)
const marketplaceRoot = process.platform === 'win32' ? 'C:\\marketplace' : '/marketplace'
const trustedRoot = process.platform === 'win32' ? 'C:\\trusted' : '/trusted'

function probeFixture(options: {
  readonly head?: string
  readonly ref?: string
  readonly candidateDigest?: string
  readonly driftHeadAfterCandidate?: string
  readonly remoteCommit?: string
  readonly driftGitAfterCandidate?: boolean
  readonly verificationCounts?: Record<'host' | 'bash' | 'git' | 'node', number>
  readonly runtimeCalls?: Array<{
    readonly args: readonly string[]
    readonly cwd?: string
    readonly timeoutMs: number
  }>
} = {}) {
  let head = options.head ?? target.commit
  const ref = options.ref ?? target.tag
  const candidateDigest = options.candidateDigest ?? runtimePayloadDigest
  const homeDir = process.platform === 'win32'
    ? 'C:\\Users\\doctor-identity-test'
    : '/home/doctor-identity-test'
  const env = { PATH: join(trustedRoot, 'bin') }
  const paths = resolveRuntimePaths({ homeDir, env })
  let gitExact = true
  const trusted = (name: 'bash' | 'git' | 'node') => ({
    executable: join(trustedRoot, name),
    requestedPath: join(trustedRoot, name),
    verify: () => {
      if (options.verificationCounts !== undefined) options.verificationCounts[name] += 1
      return name !== 'git' || gitExact
    },
    assert: () => {
      if (options.verificationCounts !== undefined) options.verificationCounts[name] += 1
      if (name === 'git' && !gitExact) throw new Error('git drift')
    },
  })
  const installer = {
    inspect: async () => ({
      selection: {
        version: 1 as const,
        revision: 2,
        activeRelease: releaseId,
        previousRelease: null,
        updatedAt: '2026-08-08T00:00:00Z',
      },
      active: {
        version: 2 as const,
        releaseId,
        payloadDigest: runtimePayloadDigest,
        createdAt: '2026-08-08T00:00:00Z',
        source,
        stableTarget: target,
      },
      previous: null,
      activeValid: true,
      previousValid: false,
      lastAudit: null,
    }),
  } as RuntimeInstaller
  return createDoctorProductIdentityProbe(
    () => ({ homeDir, env, paths }),
    installer,
    {
      resolveHostCommand: (command) => ({
        executable: join(trustedRoot, command),
        verify: () => {
          if (options.verificationCounts !== undefined) options.verificationCounts.host += 1
          return true
        },
        invocation: (args) => {
          if (options.verificationCounts !== undefined) options.verificationCounts.host += 1
          return { file: join(trustedRoot, command), args }
        },
      }),
      resolveTrustedCommand: (command) => trusted(command),
      readText: (path) => path === join(marketplaceRoot, '.codex-plugin', 'plugin.json')
        || path === join(marketplaceRoot, '.claude-plugin', 'plugin.json')
        ? JSON.stringify({ version: target.version })
        : undefined,
      run: (_file, args, commandOptions) => {
        options.runtimeCalls?.push({
          args: [...args],
          cwd: commandOptions?.cwd,
          timeoutMs: commandOptions?.timeoutMs ?? 5_000,
        })
        const text = args.join(' ')
        if (text === 'plugin marketplace list --json') {
          return {
            code: 0,
            stdout: JSON.stringify({ marketplaces: [{
              name: 'tenon',
              root: marketplaceRoot,
              ref,
              marketplaceSource: { sourceType: 'git', source: 'jefferysha/tenon' },
            }] }),
            stderr: '',
          }
        }
        if (text === 'plugin list --json') {
          return {
            code: 0,
            stdout: JSON.stringify({ installed: [{
              pluginId: 'tenon@tenon',
              enabled: true,
              version: target.version,
              source: { path: marketplaceRoot },
            }] }),
            stderr: '',
          }
        }
        if (text === `-C ${marketplaceRoot} rev-parse HEAD`) {
          return { code: 0, stdout: `${head}\n`, stderr: '' }
        }
        if (text === `-C ${marketplaceRoot} remote get-url origin`) {
          return { code: 0, stdout: 'https://github.com/jefferysha/tenon.git\n', stderr: '' }
        }
        if (text === `ls-remote https://github.com/jefferysha/tenon.git refs/tags/${target.tag} refs/tags/${target.tag}^{}`) {
          return {
            code: 0,
            stdout: `${options.remoteCommit ?? target.commit}\trefs/tags/${target.tag}\n`,
            stderr: '',
          }
        }
        if (text.startsWith('init --bare ')) {
          return { code: 0, stdout: '', stderr: '' }
        }
        if (/^-C .+ fetch --no-tags --depth=1 https:\/\/github\.com\/jefferysha\/tenon\.git refs\/tags\/v1\.0\.2$/u.test(text)) {
          return { code: 0, stdout: '', stderr: '' }
        }
        if (/^-C .+ rev-parse FETCH_HEAD\^\{commit\}$/u.test(text)) {
          return { code: 0, stdout: `${options.remoteCommit ?? target.commit}\n`, stderr: '' }
        }
        if (/^-C .+ cat-file -t [a-f0-9]{40}$/u.test(text)) {
          return { code: 0, stdout: 'commit\n', stderr: '' }
        }
        if (text === `-C ${marketplaceRoot} diff --quiet HEAD --`
          || text === `-C ${marketplaceRoot} ls-files --others --exclude-standard`) {
          return { code: 0, stdout: '', stderr: '' }
        }
        return { code: 1, stdout: '', stderr: `unexpected: ${text}` }
      },
      inspectCandidate: async () => {
        if (options.driftHeadAfterCandidate !== undefined) head = options.driftHeadAfterCandidate
        if (options.driftGitAfterCandidate === true) gitExact = false
        return {
          pluginVersion: target.version,
          payloadDigest: candidateDigest,
        }
      },
      probeDashboard: async (port, expectedRelease, stateScopeId) => ({
        version: 1,
        serverVersion: target.version,
        port,
        pid: 4242,
        releaseId: expectedRelease ?? releaseId,
        stateScopeId,
      }),
    },
  )
}

describe('doctor native immutable product identity probe', () => {
  test('proves stable tag, commit, canonical host root, payload digest, runtime and Dashboard together', async () => {
    const identity = await probeFixture()()
    expect(identity, JSON.stringify(identity)).toMatchObject({
      state: 'native',
      stableTargetTag: target.tag,
      stableTargetCommit: target.commit,
      hostPluginRoot: marketplaceRoot,
      hostTargetExact: true,
      hostPayloadDigest: runtimePayloadDigest,
      runtimePayloadDigest,
      payloadDigestExact: true,
      dashboardReleaseId: releaseId,
    })
  })

  test('reports equal version strings as drift when HEAD and payload differ from the frozen release', async () => {
    await expect(probeFixture({
      head: 'c'.repeat(40),
      candidateDigest: 'd'.repeat(64),
    })()).resolves.toMatchObject({
      state: 'native',
      hostPluginVersion: target.version,
      runtimePluginVersion: target.version,
      dashboardServerVersion: target.version,
      hostTargetExact: false,
      payloadDigestExact: false,
    })
  })

  test('re-observes the immutable host target after hashing the mutable plugin candidate', async () => {
    await expect(probeFixture({
      driftHeadAfterCandidate: 'c'.repeat(40),
    })()).resolves.toMatchObject({
      state: 'native',
      hostTargetExact: false,
      payloadDigestExact: true,
    })
  })

  test('reports drift when the public stable tag no longer proves the persisted commit', async () => {
    await expect(probeFixture({
      remoteCommit: 'd'.repeat(40),
    })()).resolves.toMatchObject({
      state: 'native',
      hostTargetExact: false,
      payloadDigestExact: true,
    })
  })

  test('physically re-verifies host, Bash, Git and Node and fails closed on later Git drift', async () => {
    const verificationCounts = { host: 0, bash: 0, git: 0, node: 0 }
    await expect(probeFixture({
      driftGitAfterCandidate: true,
      verificationCounts,
    })()).resolves.toMatchObject({ state: 'unavailable' })
    expect(verificationCounts.host).toBeGreaterThan(0)
    expect(verificationCounts.git).toBeGreaterThan(1)
    expect(verificationCounts.bash).toBeGreaterThan(0)
    expect(verificationCounts.node).toBeGreaterThan(0)
  })

  test('propagates bounded release proof budgets while host observation keeps its default timeout', async () => {
    const runtimeCalls: Array<{
      readonly args: readonly string[]
      readonly cwd?: string
      readonly timeoutMs: number
    }> = []
    await expect(probeFixture({ runtimeCalls })()).resolves.toMatchObject({ state: 'native' })

    const call = (predicate: (args: readonly string[]) => boolean) => {
      const matching = runtimeCalls.find((entry) => predicate(entry.args))
      expect(matching, `missing runtime call: ${runtimeCalls.map((entry) => entry.args.join(' ')).join(' | ')}`).toBeDefined()
      return matching as (typeof runtimeCalls)[number]
    }

    expect(call((args) => args.join(' ') === 'plugin marketplace list --json')).toMatchObject({
      timeoutMs: 5_000,
      cwd: undefined,
    })
    expect(call((args) => args[0] === 'ls-remote')).toMatchObject({ timeoutMs: 30_000 })
    expect(call((args) => args[0] === 'init' && args[1] === '--bare')).toMatchObject({ timeoutMs: 10_000 })
    expect(call((args) => args.includes('fetch') && args.includes('--no-tags'))).toMatchObject({ timeoutMs: 30_000 })
    expect(call((args) => args.includes('rev-parse') && args.includes('FETCH_HEAD^{commit}'))).toMatchObject({ timeoutMs: 10_000 })
    expect(call((args) => args.includes('cat-file') && args.includes('-t'))).toMatchObject({ timeoutMs: 10_000 })
  })
})
