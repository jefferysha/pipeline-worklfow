/**
 * H11 production wiring smoke: bundle the current CLI entrypoint, spawn it as a real Node binary, and
 * observe init/status through argv + stdout + the durable loops.yaml artifact. The bundle lives under a
 * temporary plugin-shaped tree so main.ts resolves the real templates without touching checked-in dist.
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..', '..')

interface ProcessResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

function runBinary(binary: string, cwd: string, args: readonly string[]): Promise<ProcessResult> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [binary, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.once('error', reject)
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`H11 CLI binary timed out: ${args.join(' ')}`))
    }, 20_000)
    timeout.unref()
    child.once('close', (code, signal) => {
      clearTimeout(timeout)
      if (code === null) {
        reject(new Error(`H11 CLI binary exited by signal ${signal ?? 'unknown'}\n${stderr}`))
        return
      }
      resolveRun({ code, stdout, stderr })
    })
  })
}

describe('H11 real pipeline binary wiring', () => {
  let bundleRoot: string
  let binary: string
  let projectRoot: string

  beforeAll(async () => {
    bundleRoot = await mkdtemp(join(tmpdir(), 'pipeline-h11-bundle-'))
    binary = join(bundleRoot, 'packages', 'cli', 'dist', 'tenon.mjs')
    await mkdir(dirname(binary), { recursive: true })
    await symlink(join(repoRoot, 'templates'), join(bundleRoot, 'templates'), 'dir')
    await build({
      entryPoints: [join(repoRoot, 'packages', 'cli', 'src', 'main.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      banner: {
        js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
      },
      outfile: binary,
      logLevel: 'silent',
    })
  })

  afterAll(async () => { await rm(bundleRoot, { recursive: true, force: true }) })
  beforeEach(async () => { projectRoot = await mkdtemp(join(tmpdir(), 'pipeline-h11-project-')) })
  afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }) })

  test('loops init remains the entrypoint and status reports the persisted paused/unwired starter', async () => {
    const initialized = await runBinary(binary, projectRoot, [
      'loops', 'init', '--yes', '--id', 'binary-ci', '--template', 'ci-sweeper', '--json',
    ])

    expect(initialized.code, initialized.stderr).toBe(0)
    const initJson = JSON.parse(initialized.stdout)
    expect(initJson).toMatchObject({
      ok: true,
      id: 'binary-ci',
      draft: true,
      status: 'paused',
      binding: { status: 'valid' },
      wiring: { status: 'unwired' },
      runnable: false,
    })
    const yaml = await readFile(join(projectRoot, '.pipeline', 'loops.yaml'), 'utf8')
    expect(yaml).toContain('    template_id: ci-sweeper\n')
    expect(yaml).toContain('    template_version: 1\n')
    expect(yaml).toContain('    workflow_id: default\n')
    expect(yaml).toContain('    skill_bundle_id: null\n')
    expect(yaml).toContain('    status: paused\n')

    const status = await runBinary(binary, projectRoot, ['loops', 'status', '--json'])
    expect(status.code, status.stderr).toBe(0)
    const row = JSON.parse(status.stdout).loops[0]
    expect(row).toMatchObject({
      id: 'binary-ci',
      status: 'paused',
      template: { id: 'ci-sweeper', version: 1 },
      binding: { status: 'valid' },
      wiring: { status: 'unwired' },
      runnable: false,
    })
  })
})
