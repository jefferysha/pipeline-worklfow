import { execFile } from 'node:child_process'
import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build as esbuild } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import { publishManagedRelease } from '../commands/release-coordinator.js'
import type { ReleasedDashboardStarter } from '../commands/dashboard.js'
import { makeDeps } from '../test-support.js'
import { resolveRuntimePaths } from './paths.js'
import { REAL_RUNTIME_INSTALLER } from './installer.js'
import { RuntimeReleaseStore } from './release-store.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const roots: string[] = []
const execFileAsync = promisify(execFile)

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

async function freshRoot(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `pipeline-runtime-${label}-`))
  roots.push(root)
  return root
}

async function candidateCopy(root: string, suffix = ''): Promise<string> {
  const candidate = join(root, `candidate${suffix}`)
  const entries = [
    '.agents/plugins/marketplace.json',
    '.claude-plugin/marketplace.json',
    '.claude-plugin/plugin.json',
    '.codex-plugin/plugin.json',
    'adapters',
    'hooks',
    'packages/cli/dist/tenon.mjs',
    'packages/dashboard-app/dist',
    'packages/server/dist/dashboard.mjs',
    'runtime/tenon-bootstrap.mjs',
    'skills',
    'templates',
    'tools/verify-skills.sh',
  ]
  for (const entry of entries) {
    await cp(join(repoRoot, entry), join(candidate, entry), { recursive: true, preserveTimestamps: false })
  }
  return candidate
}

function storeFor(root: string): RuntimeReleaseStore {
  return new RuntimeReleaseStore({
    paths: resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' }),
    now: () => '2026-07-24T00:00:00Z',
    retainedReleases: 3,
  })
}

function pathsFor(root: string) {
  return resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
}

describe('RuntimeReleaseStore', () => {
  const isolatedScope = (homeDir: string) => ({ homeDir, env: {} })

  it('holds one product-scoped transaction lock across the caller-defined managed release lifecycle', async () => {
    const root = await freshRoot('managed-transaction-lock')
    const home = join(root, 'home')
    const events: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })

    const first = REAL_RUNTIME_INSTALLER.withManagedTransaction(isolatedScope(home), async () => {
      events.push('first:start')
      await firstGate
      events.push('first:end')
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    const second = REAL_RUNTIME_INSTALLER.withManagedTransaction(isolatedScope(home), async () => {
      events.push('second:start')
      events.push('second:end')
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(events).toEqual(['first:start'])
    releaseFirst()
    await Promise.all([first, second])
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('stages, verifies, and atomically selects a complete candidate release', async () => {
    const root = await freshRoot('activate')
    const candidate = await candidateCopy(root)
    const store = storeFor(root)

    const activated = await store.stageAndActivate(candidate, 'codex')

    expect(activated.release.releaseId).toMatch(/^sha256-[a-f0-9]{64}$/)
    expect(activated.selection.activeRelease).toBe(activated.release.releaseId)
    expect(activated.selection.previousRelease).toBeNull()
    expect((await store.inspect()).activeValid).toBe(true)
  }, 30_000)

  it('recovers an activation crash window from the pre-activation selection and launcher checkpoint', async () => {
    const root = await freshRoot('activation-checkpoint')
    const home = join(root, 'home')
    const candidate = await candidateCopy(root)
    const scope = isolatedScope(home)

    await REAL_RUNTIME_INSTALLER.withManagedTransaction(scope, async (transaction) => {
      const checkpoint = await transaction.checkpointActivation()
      await expect(transaction.recoverActivation(checkpoint, 'codex')).resolves.toEqual({
        state: 'not-started',
      })

      const activation = await transaction.activate(candidate, 'codex')
      const recovered = await transaction.recoverActivation(checkpoint, 'codex')

      expect(recovered).toMatchObject({
        state: 'activated',
        activation: {
          selection: activation.selection,
          release: activation.release,
          releaseRoot: activation.releaseRoot,
          launcherSnapshot: checkpoint.launchers,
        },
      })
    })
  }, 30_000)

  it('reuses a fully verified content-addressed release when an idempotent publish collides', async () => {
    const root = await freshRoot('idempotent-release')
    const candidate = await candidateCopy(root)
    const store = storeFor(root)
    const first = await store.stageAndActivate(candidate, 'codex')

    // macOS reports ENOTEMPTY for this directory rename; Linux may report EEXIST. The public
    // installer contract is the same: validate the existing digest-addressed release and reuse it.
    const second = await store.stageAndActivate(candidate, 'codex')

    expect(second.release.releaseId).toBe(first.release.releaseId)
    expect(second.selection.activeRelease).toBe(first.release.releaseId)
    expect((await store.inspect()).activeValid).toBe(true)
  }, 30_000)

  it('rejects a malformed candidate without replacing the active release', async () => {
    const root = await freshRoot('reject')
    const healthy = await candidateCopy(root, '-healthy')
    const broken = await candidateCopy(root, '-broken')
    const store = storeFor(root)
    const first = await store.stageAndActivate(healthy, 'codex')
    await writeFile(join(broken, 'hooks', 'gate.sh'), 'if then\n', 'utf8')

    await expect(store.stageAndActivate(broken, 'codex')).rejects.toThrow(/语法|candidate|插件资产/i)

    expect((await store.inspect()).selection.activeRelease).toBe(first.release.releaseId)
  }, 30_000)

  it('rejects a candidate missing the Claude marketplace manifest without replacing selection', async () => {
    const root = await freshRoot('missing-claude-marketplace')
    const healthy = await candidateCopy(root, '-healthy')
    const broken = await candidateCopy(root, '-broken')
    const store = storeFor(root)
    const first = await store.stageAndActivate(healthy, 'codex')
    await rm(join(broken, '.claude-plugin', 'marketplace.json'))

    await expect(store.stageAndActivate(broken, 'codex')).rejects.toThrow(/marketplace\.json|插件资产/i)

    expect((await store.inspect()).selection.activeRelease).toBe(first.release.releaseId)
  }, 30_000)

  it('rolls back only to a fully verified previous release', async () => {
    const root = await freshRoot('rollback')
    const firstCandidate = await candidateCopy(root, '-one')
    const secondCandidate = await candidateCopy(root, '-two')
    await writeFile(
      join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'),
      `${await readFile(join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'), 'utf8')}\n// release-two\n`,
      'utf8',
    )
    const store = storeFor(root)
    const first = await store.stageAndActivate(firstCandidate, 'claude')
    const second = await store.stageAndActivate(secondCandidate, 'claude')

    const rolledBack = await store.rollbackToPrevious()

    expect(second.release.releaseId).not.toBe(first.release.releaseId)
    expect(rolledBack.selection.activeRelease).toBe(first.release.releaseId)
    expect(rolledBack.selection.previousRelease).toBe(second.release.releaseId)
  }, 30_000)

  it('compensates only the exact activation, including a failed first-install readiness gate', async () => {
    const root = await freshRoot('revert-activation')
    const candidate = await candidateCopy(root)
    const store = storeFor(root)
    const activated = await store.stageAndActivate(candidate, 'codex')

    await store.revertActivation(activated.selection)

    const inspection = await store.inspect()
    expect(inspection.selection.activeRelease).toBeNull()
    expect(inspection.selection.previousRelease).toBe(activated.release.releaseId)
    expect(inspection.activeValid).toBe(false)
    await expect(store.revertActivation(activated.selection)).rejects.toThrow(/拒绝回滚非当前 activation/)
  }, 30_000)

  it('rejects symbolic links in a candidate payload', async () => {
    const root = await freshRoot('symlink')
    const candidate = await candidateCopy(root)
    await rm(join(candidate, 'packages', 'cli', 'dist', 'tenon.mjs'))
    await symlink('/tmp/not-a-pipeline', join(candidate, 'packages', 'cli', 'dist', 'tenon.mjs'))

    await expect(storeFor(root).stageAndActivate(candidate, 'codex')).rejects.toThrow(/符号链接/i)
  }, 30_000)

  it('never changes activation or rollback selection after an audit append failure', async () => {
    const root = await freshRoot('audit-failure')
    const firstCandidate = await candidateCopy(root, '-one')
    const secondCandidate = await candidateCopy(root, '-two')
    await writeFile(
      join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'),
      `${await readFile(join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'), 'utf8')}\n// second\n`,
      'utf8',
    )
    const healthy = storeFor(root)
    const first = await healthy.stageAndActivate(firstCandidate, 'codex')
    const second = await healthy.stageAndActivate(secondCandidate, 'codex')
    const failingAudit = new RuntimeReleaseStore({
      paths: pathsFor(root),
      auditWriter: async () => { throw new Error('injected audit append failure') },
    })

    await expect(failingAudit.rollbackToPrevious()).rejects.toThrow(/audit append failure/)
    expect((await healthy.inspect()).selection).toEqual(second.selection)

    const thirdCandidate = await candidateCopy(root, '-three')
    await writeFile(
      join(thirdCandidate, 'runtime', 'tenon-bootstrap.mjs'),
      `${await readFile(join(thirdCandidate, 'runtime', 'tenon-bootstrap.mjs'), 'utf8')}\n// third\n`,
      'utf8',
    )
    await expect(failingAudit.stageAndActivate(thirdCandidate, 'codex')).rejects.toThrow(/audit append failure/)
    expect((await healthy.inspect()).selection).toEqual(second.selection)
    expect(first.release.releaseId).not.toBe(second.release.releaseId)
  }, 60_000)

  it('persists a host refresh failure for runtime status diagnostics', async () => {
    const root = await freshRoot('update-diagnostic')
    const store = storeFor(root)

    await store.recordUpdateFailure('host marketplace refresh failed')

    expect((await store.inspect()).lastAudit).toMatchObject({
      kind: 'update-rejected',
      detail: 'host marketplace refresh failed',
    })
  })

  it('compensates a real installer activation across selection and exact stable launchers', async () => {
    const root = await freshRoot('installer-transaction')
    const home = join(root, 'home')
    const candidate = await candidateCopy(root)
    const bin = join(home, '.local', 'bin')
    const tenon = join(bin, 'tenon')
    const hook = join(bin, 'tenon-hook')
    await mkdir(bin, { recursive: true })
    await writeFile(tenon, '#!/bin/sh\necho previous-tenon\n', 'utf8')
    await writeFile(hook, '#!/bin/sh\necho previous-hook\n', 'utf8')
    await chmod(tenon, 0o750)
    await chmod(hook, 0o700)

    const activation = await REAL_RUNTIME_INSTALLER.withManagedTransaction(
      isolatedScope(home),
      (transaction) => transaction.activate(candidate, 'codex'),
    )
    expect(await readFile(tenon, 'utf8')).toContain('TENON_RUNTIME_DATA_ROOT')

    await REAL_RUNTIME_INSTALLER.withManagedTransaction(
      isolatedScope(home),
      (transaction) => transaction.revertActivation(activation),
    )
    await REAL_RUNTIME_INSTALLER.withManagedTransaction(
      isolatedScope(home),
      (transaction) => transaction.revertActivation(activation),
    )

    expect(await readFile(tenon, 'utf8')).toBe('#!/bin/sh\necho previous-tenon\n')
    expect(await readFile(hook, 'utf8')).toBe('#!/bin/sh\necho previous-hook\n')
    expect((await stat(tenon)).mode & 0o777).toBe(0o750)
    expect((await stat(hook)).mode & 0o777).toBe(0o700)
    expect((await REAL_RUNTIME_INSTALLER.inspect(isolatedScope(home))).selection.activeRelease).toBeNull()
  }, 30_000)

  it('never restores an old launcher snapshot after selection CAS proves another activation owns the runtime', async () => {
    const root = await freshRoot('installer-cas-ownership')
    const home = join(root, 'home')
    const firstCandidate = await candidateCopy(root, '-one')
    const secondCandidate = await candidateCopy(root, '-two')
    await writeFile(
      join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'),
      `${await readFile(join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'), 'utf8')}\n// concurrent-owner\n`,
      'utf8',
    )
    const paths = resolveRuntimePaths({ homeDir: home, env: {} })
    const first = await REAL_RUNTIME_INSTALLER.withManagedTransaction(
      isolatedScope(home),
      (transaction) => transaction.activate(firstCandidate, 'codex'),
    )
    const second = await new RuntimeReleaseStore({ paths }).stageAndActivate(secondCandidate, 'codex')
    const tenon = join(home, '.local', 'bin', 'tenon')
    await writeFile(tenon, '#!/bin/sh\necho concurrent-owner\n', 'utf8')

    await expect(REAL_RUNTIME_INSTALLER.withManagedTransaction(
      isolatedScope(home),
      (transaction) => transaction.revertActivation(first),
    )).rejects.toThrow(/拒绝覆盖/)

    expect((await REAL_RUNTIME_INSTALLER.inspect(isolatedScope(home))).selection.activeRelease).toBe(second.release.releaseId)
    expect(await readFile(tenon, 'utf8')).toBe('#!/bin/sh\necho concurrent-owner\n')
  }, 60_000)

  it('resolves one immutable path snapshot before locking a rollback transaction', async () => {
    const root = await freshRoot('installer-rollback-path-snapshot')
    const home = join(root, 'home')
    const runtimeA = join(root, 'runtime-a')
    const runtimeB = join(root, 'runtime-b')
    const firstCandidate = await candidateCopy(root, '-one')
    const secondCandidate = await candidateCopy(root, '-two')
    await writeFile(
      join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'),
      `${await readFile(join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'), 'utf8')}\n// second\n`,
      'utf8',
    )
    const stableScope = { homeDir: home, env: { TENON_RUNTIME_HOME: runtimeA } }
    await REAL_RUNTIME_INSTALLER.withManagedTransaction(
      stableScope,
      (transaction) => transaction.activate(firstCandidate, 'codex'),
    )
    await REAL_RUNTIME_INSTALLER.withManagedTransaction(
      stableScope,
      (transaction) => transaction.activate(secondCandidate, 'codex'),
    )

    let runtimeRootReads = 0
    const changingEnv = new Proxy<Record<string, string | undefined>>({}, {
      get: (_target, property) => {
        if (property !== 'TENON_RUNTIME_HOME') return undefined
        runtimeRootReads += 1
        return runtimeRootReads === 1 ? runtimeA : runtimeB
      },
    })
    const rolledBack = await REAL_RUNTIME_INSTALLER.rollback({ homeDir: home, env: changingEnv })

    expect(rolledBack.release.releaseId).toBe(
      (await REAL_RUNTIME_INSTALLER.inspect(stableScope)).selection.activeRelease,
    )
    expect(runtimeRootReads).toBe(1)
  }, 60_000)

  it('keeps the real same-release selection and preexisting Dashboard aligned when evidence fails', async () => {
    const root = await freshRoot('same-release-evidence-compensation')
    const home = join(root, 'home')
    const candidate = await candidateCopy(root)
    const scope = {
      homeDir: home,
      env: { TENON_RUNTIME_HOME: join(root, 'runtime') },
    }
    let running: {
      version: 1
      port: number
      pid: number
      releaseId: string
      stateScopeId: string
      transactionId: string
    } | null = null
    const starter: ReleasedDashboardStarter = {
      inspect: async () => running,
      adopt: async () => null,
      start: async (_deps, payloadRoot, opts) => {
        const releaseId = payloadRoot.split('/').at(-2)
        if (releaseId === undefined || opts.transactionId === undefined) {
          throw new Error('missing managed Dashboard identity')
        }
        running = {
          version: 1,
          port: opts.port ?? 18_765,
          pid: 42_424,
          releaseId,
          stateScopeId: `sha256-v1-${'1'.repeat(64)}`,
          transactionId: opts.transactionId,
        }
        return {
          state: 'ready',
          session: {
            ownership: running,
            stop: async () => ({ state: 'stopped' as const }),
          },
        }
      },
    }
    const request = {
      operation: 'setup' as const,
      source: 'codex' as const,
      runtime: scope,
      openBrowser: false,
      prepareCandidate: () => ({ candidateRoot: candidate }),
    }

    expect(await publishManagedRelease(
      makeDeps(),
      request,
      REAL_RUNTIME_INSTALLER,
      starter,
    )).toMatchObject({ ok: true })
    const firstDashboard = running
    const firstSelection = (await REAL_RUNTIME_INSTALLER.inspect(scope)).selection

    expect(await publishManagedRelease(
      makeDeps(),
      {
        ...request,
        commitReadyEvidence: () => {
          throw new Error('injected evidence failure')
        },
      },
      REAL_RUNTIME_INSTALLER,
      starter,
    )).toMatchObject({ ok: false, state: 'restored' })

    const after = await REAL_RUNTIME_INSTALLER.inspect(scope)
    expect(after.activeValid).toBe(true)
    expect(after.selection.activeRelease).toBe(firstSelection.activeRelease)
    expect(after.selection.previousRelease).toBe(firstSelection.previousRelease)
    expect(running).toEqual(firstDashboard)
  }, 60_000)

  it('restores the previous Dashboard after evidence failure and a fresh real-store retry replaces it safely', async () => {
    const root = await freshRoot('changed-release-preexisting-compensation')
    const home = join(root, 'home')
    const firstCandidate = await candidateCopy(root, '-one')
    const secondCandidate = await candidateCopy(root, '-two')
    await writeFile(
      join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'),
      `${await readFile(join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'), 'utf8')}\n// changed release\n`,
      'utf8',
    )
    const scope = {
      homeDir: home,
      env: { TENON_RUNTIME_HOME: join(root, 'runtime') },
    }
    const first = await publishManagedRelease(
      makeDeps(),
      {
        operation: 'setup',
        source: 'codex',
        runtime: scope,
        openBrowser: false,
        prepareCandidate: () => ({ candidateRoot: firstCandidate }),
      },
      REAL_RUNTIME_INSTALLER,
      undefined,
    )
    expect(first).toMatchObject({ ok: true })
    if (!first.ok) throw new Error(first.detail)

    let running: {
      version: 1
      port: number
      pid: number
      releaseId: string
      stateScopeId: string
      transactionId?: string
    } | null = {
      version: 1,
      port: 43_210,
      pid: 42_425,
      releaseId: first.activation.release.releaseId,
      stateScopeId: `sha256-v1-${'2'.repeat(64)}`,
      transactionId: 'previous-service',
    }
    const events: string[] = []
    const starter: ReleasedDashboardStarter = {
      inspect: async () => running,
      adopt: async (_deps, identity) => {
        if (running === null || JSON.stringify(running) !== JSON.stringify(identity)) return null
        return {
          ownership: running,
          stop: async () => {
            events.push(`dashboard:stop:${identity.releaseId}`)
            running = null
            return { state: 'stopped' as const }
          },
        }
      },
      start: async (_deps, payloadRoot, opts) => {
        const releaseId = basename(dirname(payloadRoot))
        events.push(`dashboard:start:${releaseId}`)
        running = {
          version: 1,
          port: opts.port ?? 18_765,
          pid: releaseId === first.activation.release.releaseId ? 42_425 : 42_426,
          releaseId,
          stateScopeId: `sha256-v1-${'2'.repeat(64)}`,
          ...(opts.transactionId === undefined ? {} : { transactionId: opts.transactionId }),
        }
        return {
          state: 'ready',
          session: {
            ownership: running,
            stop: async () => {
              events.push(`dashboard:stop:${releaseId}`)
              running = null
              return { state: 'stopped' as const }
            },
          },
        }
      },
    }

    const updateRequest = {
      operation: 'update' as const,
      source: 'codex' as const,
      runtime: scope,
      openBrowser: false,
      dashboardPort: 43_210,
      prepareCandidate: () => ({ candidateRoot: secondCandidate }),
    }
    const failedUpdate = await publishManagedRelease(
      makeDeps(),
      {
        ...updateRequest,
        commitReadyEvidence: () => {
          throw new Error('injected evidence failure')
        },
      },
      REAL_RUNTIME_INSTALLER,
      starter,
    )
    if (failedUpdate.ok || failedUpdate.state !== 'restored') {
      throw new Error(`expected restored compensation: ${failedUpdate.detail}`)
    }

    const restored = await REAL_RUNTIME_INSTALLER.inspect(scope)
    expect(restored.activeValid).toBe(true)
    expect(restored.selection.activeRelease).toBe(first.activation.release.releaseId)
    expect(running?.releaseId).toBe(first.activation.release.releaseId)
    expect(running?.transactionId).toMatch(/:restore$/)
    const journalPath = join(
      pathsFor(root).managedTransactionRoot,
      'release-transaction.json',
    )
    await expect(readFile(journalPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })

    expect(await publishManagedRelease(
      makeDeps(),
      updateRequest,
      REAL_RUNTIME_INSTALLER,
      starter,
    )).toMatchObject({ ok: true, state: 'ready' })
    const recovered = await REAL_RUNTIME_INSTALLER.inspect(scope)
    expect(recovered.activeValid).toBe(true)
    expect(recovered.selection.activeRelease).toBe(running?.releaseId)
    expect(recovered.selection.activeRelease).not.toBe(first.activation.release.releaseId)
    await expect(readFile(journalPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(events.filter((event) =>
      event === `dashboard:stop:${first.activation.release.releaseId}`)).toHaveLength(2)
  }, 60_000)

  it('recovers a real persisted release journal after an abrupt process restart', async () => {
    const root = await freshRoot('process-restart-recovery')
    const candidate = await candidateCopy(root)
    const helper = join(root, 'release-restart-helper.mjs')
    const coordinatorPath = join(
      repoRoot,
      'packages',
      'cli',
      'src',
      'commands',
      'release-coordinator.ts',
    )
    const installerPath = join(repoRoot, 'packages', 'cli', 'src', 'runtime', 'installer.ts')
    await esbuild({
      stdin: {
        contents: `
          import { publishManagedRelease } from ${JSON.stringify(coordinatorPath)}
          import { REAL_RUNTIME_INSTALLER } from ${JSON.stringify(installerPath)}
          const [phase, root, candidate] = process.argv.slice(2)
          const scope = {
            homeDir: root + '/home',
            env: { TENON_RUNTIME_HOME: root + '/runtime' },
          }
          const starter = {
            inspect: async () => null,
            adopt: async () => null,
            start: async (_deps, payloadRoot, opts) => {
              if (phase === 'crash') process.exit(91)
              const releaseId = payloadRoot.split('/').at(-2)
              return {
                state: 'ready',
                session: {
                  ownership: {
                    version: 1,
                    port: opts.port ?? 18765,
                    pid: process.pid,
                    releaseId,
                    stateScopeId: 'sha256-v1-${'3'.repeat(64)}',
                    transactionId: opts.transactionId,
                  },
                  stop: async () => ({ state: 'stopped' }),
                },
              }
            },
          }
          const outcome = await publishManagedRelease(
            { clock: () => new Date().toISOString() },
            {
              operation: 'setup',
              source: 'codex',
              runtime: scope,
              openBrowser: false,
              dashboardPort: 43210,
              prepareCandidate: () => ({ candidateRoot: candidate }),
            },
            REAL_RUNTIME_INSTALLER,
            starter,
          )
          const inspection = await REAL_RUNTIME_INSTALLER.inspect(scope)
          process.stdout.write(JSON.stringify({ outcome, inspection }) + '\\n')
        `,
        sourcefile: 'release-restart-helper.ts',
        loader: 'ts',
        resolveDir: repoRoot,
      },
      outfile: helper,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      alias: {
        '@tenon/kernel': join(repoRoot, 'packages', 'kernel', 'src', 'index.ts'),
      },
    })

    await expect(execFileAsync(process.execPath, [helper, 'crash', root, candidate]))
      .rejects.toMatchObject({ code: 91 })
    const journalPath = join(
      pathsFor(root).managedTransactionRoot,
      'release-transaction.json',
    )
    expect(JSON.parse(await readFile(journalPath, 'utf8'))).toMatchObject({
      phase: 'starting-dashboard',
      dashboardPort: 43_210,
    })

    const recovered = await execFileAsync(
      process.execPath,
      [helper, 'recover', root, candidate],
    )
    const result = JSON.parse(recovered.stdout)
    expect(result.outcome, JSON.stringify(result)).toMatchObject({ ok: true, state: 'ready' })
    expect(result.inspection).toMatchObject({
      activeValid: true,
      selection: {
        activeRelease: result.outcome.activation.release.releaseId,
      },
    })
    await expect(readFile(journalPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  }, 60_000)

  it('resumes every durable compensation phase after a real process crash without duplicate effects', async () => {
    const crashModes = [
      'crash-stopping-candidate',
      'crash-reverting-activation',
      'crash-restoring-previous',
      'crash-previous-restored',
    ] as const
    for (const crashMode of crashModes) {
      const root = await freshRoot(`compensation-${crashMode}`)
      const firstCandidate = await candidateCopy(root, '-one')
      const secondCandidate = await candidateCopy(root, '-two')
      await writeFile(
        join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'),
        `${await readFile(join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'), 'utf8')}\n`
          + `// ${crashMode}\n`,
        'utf8',
      )
      const helper = join(root, 'compensation-restart-helper.mjs')
      const coordinatorPath = join(repoRoot, 'packages', 'cli', 'src', 'commands', 'release-coordinator.ts')
      const installerPath = join(repoRoot, 'packages', 'cli', 'src', 'runtime', 'installer.ts')
      await esbuild({
        stdin: {
          contents: `
            import { readFile, writeFile, unlink } from 'node:fs/promises'
            import { publishManagedRelease } from ${JSON.stringify(coordinatorPath)}
            import { REAL_RUNTIME_INSTALLER } from ${JSON.stringify(installerPath)}
            const [mode, root, firstCandidate, secondCandidate] = process.argv.slice(2)
            const scope = {
              homeDir: root + '/home',
              env: { TENON_RUNTIME_HOME: root + '/runtime' },
            }
            const dashboardPath = root + '/dashboard.json'
            const startsPath = root + '/dashboard-starts.txt'
            const stopsPath = root + '/dashboard-stops.txt'
            const readDashboard = async () => {
              try { return JSON.parse(await readFile(dashboardPath, 'utf8')) }
              catch (error) {
                if (error?.code === 'ENOENT') return null
                throw error
              }
            }
            const writeDashboard = (identity) =>
              writeFile(dashboardPath, JSON.stringify(identity), 'utf8')
            const incrementCounter = async (path) => {
              let count = 0
              try { count = Number(await readFile(path, 'utf8')) }
              catch (error) { if (error?.code !== 'ENOENT') throw error }
              count += 1
              await writeFile(path, String(count), 'utf8')
              return count
            }
            const starter = {
              inspect: async () => readDashboard(),
              adopt: async (_deps, identity) => {
                const current = await readDashboard()
                const { owner: _owner, ...expected } = identity
                if (JSON.stringify(current) !== JSON.stringify(expected)) return null
                return {
                  ownership: current,
                  stop: async () => {
                    await incrementCounter(stopsPath)
                    await unlink(dashboardPath).catch((error) => {
                      if (error?.code !== 'ENOENT') throw error
                    })
                    return { state: 'stopped' }
                  },
                }
              },
              start: async (_deps, payloadRoot, opts) => {
                const releaseId = payloadRoot.split('/').at(-2)
                const starts = await incrementCounter(startsPath)
                const ownership = {
                  version: 1,
                  port: opts.port ?? 18765,
                  pid: 45000 + starts,
                  releaseId,
                  stateScopeId: 'sha256-v1-${'4'.repeat(64)}',
                  transactionId: opts.transactionId,
                }
                await writeDashboard(ownership)
                const restoringPrevious = opts.transactionId?.endsWith(':restore') === true
                if (mode === 'crash-restoring-previous' && restoringPrevious) process.exit(91)
                return {
                  state: 'ready',
                  session: {
                    ownership,
                    stop: async () => {
                      await incrementCounter(stopsPath)
                      await unlink(dashboardPath).catch((error) => {
                        if (error?.code !== 'ENOENT') throw error
                      })
                      if (mode === 'crash-stopping-candidate') process.exit(91)
                      return { state: 'stopped' }
                    },
                  },
                }
              },
            }
            const crashingInstaller = {
              ...REAL_RUNTIME_INSTALLER,
              withManagedTransaction: (runtimeScope, operation) =>
                REAL_RUNTIME_INSTALLER.withManagedTransaction(runtimeScope, (transaction) =>
                  operation({
                    ...transaction,
                    revertActivation: async (activation) => {
                      await transaction.revertActivation(activation)
                      if (mode === 'crash-reverting-activation') process.exit(91)
                    },
                    journal: {
                      ...transaction.journal,
                      write: async (record) => {
                        await transaction.journal.write(record)
                        if (mode === 'crash-previous-restored'
                          && record.phase === 'previous-restored') process.exit(91)
                      },
                    },
                  })),
            }
            if (mode === 'seed') {
              const outcome = await publishManagedRelease(
                { clock: () => new Date().toISOString() },
                {
                  operation: 'setup',
                  source: 'codex',
                  runtime: scope,
                  openBrowser: false,
                  dashboardPort: 43210,
                  prepareCandidate: () => ({ candidateRoot: firstCandidate }),
                },
                REAL_RUNTIME_INSTALLER,
                undefined,
              )
              if (!outcome.ok) throw new Error(outcome.detail)
              await writeDashboard({
                version: 1,
                port: 43210,
                pid: 44000,
                releaseId: outcome.activation.release.releaseId,
                stateScopeId: 'sha256-v1-${'4'.repeat(64)}',
                transactionId: 'previous-service',
              })
              process.stdout.write(JSON.stringify({
                firstRelease: outcome.activation.release.releaseId,
              }) + '\\n')
            } else {
              const outcome = await publishManagedRelease(
                { clock: () => new Date().toISOString() },
                {
                  operation: 'update',
                  source: 'codex',
                  runtime: scope,
                  openBrowser: false,
                  dashboardPort: 43210,
                  prepareCandidate: () => ({ candidateRoot: secondCandidate }),
                  commitReadyEvidence: () => { throw new Error('injected evidence failure') },
                },
                mode === 'recover' ? REAL_RUNTIME_INSTALLER : crashingInstaller,
                starter,
              )
              const inspection = await REAL_RUNTIME_INSTALLER.inspect(scope)
              const dashboard = await readDashboard()
              const starts = Number(await readFile(startsPath, 'utf8'))
              const stops = Number(await readFile(stopsPath, 'utf8'))
              process.stdout.write(JSON.stringify({
                outcome, inspection, dashboard, starts, stops,
              }) + '\\n')
            }
          `,
          sourcefile: 'compensation-restart-helper.ts',
          loader: 'ts',
          resolveDir: repoRoot,
        },
        outfile: helper,
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node22',
        alias: {
          '@tenon/kernel': join(repoRoot, 'packages', 'kernel', 'src', 'index.ts'),
        },
      })

      const seeded = await execFileAsync(
        process.execPath,
        [helper, 'seed', root, firstCandidate, secondCandidate],
      )
      const firstRelease = JSON.parse(seeded.stdout).firstRelease as string
      await expect(execFileAsync(
        process.execPath,
        [helper, crashMode, root, firstCandidate, secondCandidate],
      )).rejects.toMatchObject({ code: 91 })

      const journalPath = join(pathsFor(root).managedTransactionRoot, 'release-transaction.json')
      const crashedJournal = JSON.parse(await readFile(journalPath, 'utf8'))
      const expectedCrashPhase = {
        'crash-stopping-candidate': 'stopping-candidate',
        'crash-reverting-activation': 'reverting-activation',
        'crash-restoring-previous': 'restoring-previous',
        'crash-previous-restored': 'previous-restored',
      } as const
      expect(crashedJournal.phase).toBe(expectedCrashPhase[crashMode])

      const preRecoveryInspection = await REAL_RUNTIME_INSTALLER.inspect({
        homeDir: join(root, 'home'),
        env: { TENON_RUNTIME_HOME: join(root, 'runtime') },
      })
      const preRecoveryDashboard = await readFile(join(root, 'dashboard.json'), 'utf8')
        .then((contents) => JSON.parse(contents))
        .catch((error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
          throw error
        })
      if (crashMode === 'crash-stopping-candidate') {
        expect(preRecoveryInspection.selection.activeRelease).not.toBe(firstRelease)
        expect(preRecoveryInspection.selection.activeRelease).not.toBeNull()
        expect(preRecoveryDashboard).toBeNull()
      } else {
        expect(preRecoveryInspection.selection.activeRelease).toBe(firstRelease)
        if (
          crashMode === 'crash-restoring-previous'
          || crashMode === 'crash-previous-restored'
        ) {
          expect(preRecoveryDashboard).toMatchObject({
            releaseId: firstRelease,
            transactionId: expect.stringMatching(/:restore$/),
          })
        } else {
          expect(preRecoveryDashboard).toBeNull()
        }
      }

      const recovered = await execFileAsync(
        process.execPath,
        [helper, 'recover', root, firstCandidate, secondCandidate],
      )
      const result = JSON.parse(recovered.stdout)
      expect(result.outcome, `${crashMode}: ${recovered.stdout}`)
        .toMatchObject({ ok: false, state: 'restored' })
      expect(result.inspection.selection.activeRelease).toBe(firstRelease)
      expect(result.dashboard).toMatchObject({
        releaseId: firstRelease,
        transactionId: expect.stringMatching(/:restore$/),
      })
      expect(result.starts).toBe(2)
      expect(result.stops).toBe(2)
      await expect(readFile(journalPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    }
  }, 180_000)
})
