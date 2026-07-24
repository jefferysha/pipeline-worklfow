import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const bootstrapSource = join(repoRoot, 'runtime', 'pipeline-bootstrap.mjs')
const roots: string[] = []

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

async function freshRoot(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `pipeline-bootstrap-${label}-`))
  roots.push(root)
  return root
}

async function payloadDigest(root: string): Promise<string> {
  const hash = createHash('sha256')
  async function visit(dir: string, relativePath: string): Promise<void> {
    const { readdir, lstat, readFile: read } = await import('node:fs/promises')
    const entries = await readdir(dir, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const path = join(dir, entry.name)
      const child = relativePath === '' ? entry.name : `${relativePath}/${entry.name}`
      const stat = await lstat(path)
      if (stat.isDirectory()) {
        hash.update(`D\u0000${child}\u0000`)
        await visit(path, child)
      } else if (stat.isFile()) {
        hash.update(`F\u0000${child}\u0000${(stat.mode & 0o777).toString(8)}\u0000`)
        hash.update(await read(path))
      } else {
        throw new Error(`unsupported fixture entry: ${child}`)
      }
    }
  }
  await visit(root, '')
  return hash.digest('hex')
}

async function createRelease(runtimeHome: string, marker: string): Promise<string> {
  const stagingPayload = join(runtimeHome, 'fixture', marker, 'payload')
  await mkdir(join(stagingPayload, 'packages', 'cli', 'dist'), { recursive: true })
  await mkdir(join(stagingPayload, 'runtime'), { recursive: true })
  await writeFile(join(stagingPayload, 'packages', 'cli', 'dist', 'pipeline.mjs'), `process.stdout.write(${JSON.stringify(marker)})\n`, 'utf8')
  await copyFile(bootstrapSource, join(stagingPayload, 'runtime', 'pipeline-bootstrap.mjs'))
  await chmod(join(stagingPayload, 'runtime', 'pipeline-bootstrap.mjs'), 0o755)
  const digest = await payloadDigest(stagingPayload)
  const releaseId = `sha256-${digest}`
  const releaseRoot = join(runtimeHome, 'data', 'releases', releaseId)
  await mkdir(join(releaseRoot, 'payload', 'packages', 'cli', 'dist'), { recursive: true })
  await mkdir(join(releaseRoot, 'payload', 'runtime'), { recursive: true })
  await copyFile(join(stagingPayload, 'packages', 'cli', 'dist', 'pipeline.mjs'), join(releaseRoot, 'payload', 'packages', 'cli', 'dist', 'pipeline.mjs'))
  await copyFile(join(stagingPayload, 'runtime', 'pipeline-bootstrap.mjs'), join(releaseRoot, 'payload', 'runtime', 'pipeline-bootstrap.mjs'))
  await chmod(join(releaseRoot, 'payload', 'runtime', 'pipeline-bootstrap.mjs'), 0o755)
  await writeFile(join(releaseRoot, 'release.json'), `${JSON.stringify({
    version: 1,
    releaseId,
    payloadDigest: digest,
    createdAt: '2026-07-24T00:00:00Z',
    source: { host: 'codex', pluginVersion: '1.0.0' },
  })}\n`, 'utf8')
  return releaseId
}

async function installBootstrap(runtimeHome: string): Promise<string> {
  const active = join(runtimeHome, 'data', 'bootstrap', 'active.mjs')
  await mkdir(dirname(active), { recursive: true })
  await copyFile(bootstrapSource, active)
  await chmod(active, 0o755)
  return active
}

async function runBootstrap(runtimeHome: string, bootstrap: string, args: string[], input = ''): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, [bootstrap, ...args], {
      env: { ...process.env, PIPELINE_RUNTIME_HOME: runtimeHome },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.on('error', (error) => resolveResult({ stdout, stderr: `${stderr}${error.message}`, code: 1 }))
    child.on('close', (code) => resolveResult({ stdout, stderr, code: code ?? 1 }))
    child.stdin.end(input)
  })
}

describe('stable runtime bootstrap', () => {
  it('can roll back while the active payload is unavailable, after verifying the previous release digest', async () => {
    const root = await freshRoot('rollback')
    const activeRelease = await createRelease(root, 'active')
    const previousRelease = await createRelease(root, 'previous')
    const bootstrap = await installBootstrap(root)
    const state = join(root, 'state')
    await mkdir(state, { recursive: true })
    await writeFile(join(state, 'selection.json'), `${JSON.stringify({
      version: 1,
      revision: 2,
      activeRelease,
      previousRelease,
      updatedAt: '2026-07-24T00:00:00Z',
    })}\n`, 'utf8')
    const result = await runBootstrap(root, bootstrap, ['cli', 'runtime', 'repair', '--rollback'])

    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      selection: { activeRelease: previousRelease, previousRelease: activeRelease, revision: 3 },
    })
    expect(JSON.parse(await readFile(join(state, 'selection.json'), 'utf8'))).toMatchObject({
      activeRelease: previousRelease,
      previousRelease: activeRelease,
    })
  })

  it('refuses a rollback whose previous payload no longer matches its stored digest', async () => {
    const root = await freshRoot('tamper')
    const activeRelease = await createRelease(root, 'active')
    const previousRelease = await createRelease(root, 'previous')
    const bootstrap = await installBootstrap(root)
    const state = join(root, 'state')
    await mkdir(state, { recursive: true })
    await writeFile(join(state, 'selection.json'), `${JSON.stringify({
      version: 1,
      revision: 2,
      activeRelease,
      previousRelease,
      updatedAt: '2026-07-24T00:00:00Z',
    })}\n`, 'utf8')
    await writeFile(join(root, 'data', 'releases', previousRelease, 'payload', 'packages', 'cli', 'dist', 'pipeline.mjs'), 'tampered\n', 'utf8')

    const result = await runBootstrap(root, bootstrap, ['cli', 'runtime', 'repair', '--rollback'])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('integrity check failed')
    expect(JSON.parse(await readFile(join(state, 'selection.json'), 'utf8'))).toMatchObject({ activeRelease, previousRelease })
  })

  it('refuses to execute an active payload whose content no longer matches its manifest digest', async () => {
    const root = await freshRoot('active-tamper')
    const activeRelease = await createRelease(root, 'VERIFIED_ACTIVE')
    const bootstrap = await installBootstrap(root)
    const state = join(root, 'state')
    await mkdir(state, { recursive: true })
    await writeFile(join(state, 'selection.json'), `${JSON.stringify({
      version: 1,
      revision: 1,
      activeRelease,
      previousRelease: null,
      updatedAt: '2026-07-24T00:00:00Z',
    })}\n`, 'utf8')
    await writeFile(join(state, 'audit.jsonl'), `${JSON.stringify({
      version: 1,
      at: '2026-07-24T00:00:00Z',
      kind: 'update-rejected',
      detail: 'host refresh failed',
    })}\n`, 'utf8')
    await writeFile(
      join(root, 'data', 'releases', activeRelease, 'payload', 'packages', 'cli', 'dist', 'pipeline.mjs'),
      'process.stdout.write("UNVERIFIED_ACTIVE_EXECUTED")\n',
      'utf8',
    )

    const result = await runBootstrap(root, bootstrap, ['cli', '--help'])
    const status = await runBootstrap(root, bootstrap, ['cli', 'runtime', 'status', '--json'])

    expect(result.code).toBe(1)
    expect(result.stdout).not.toContain('UNVERIFIED_ACTIVE_EXECUTED')
    expect(result.stderr).toContain('runtime is unavailable')
    expect(JSON.parse(status.stdout)).toMatchObject({
      activeValid: false,
      lastAudit: { kind: 'update-rejected', detail: 'host refresh failed' },
    })
  })

  it('blocks only project mutation through gate while the runtime is unavailable, leaving the exact repair command reachable', async () => {
    const root = await freshRoot('gate')
    const bootstrap = await installBootstrap(root)
    const mutation = JSON.stringify({ tool_name: 'Bash', command: 'touch src/app.ts' })
    const recovery = JSON.stringify({ tool_name: 'Bash', command: 'pipeline runtime repair --rollback' })
    const attacker = JSON.stringify({ tool_name: 'Bash', command: '/tmp/evil/pipeline runtime repair --rollback' })

    expect((await runBootstrap(root, bootstrap, ['hook', 'gate'], mutation)).code).toBe(2)
    expect((await runBootstrap(root, bootstrap, ['hook', 'gate'], recovery)).code).toBe(0)
    expect((await runBootstrap(root, bootstrap, ['hook', 'gate'], attacker)).code).toBe(2)
  })
})
