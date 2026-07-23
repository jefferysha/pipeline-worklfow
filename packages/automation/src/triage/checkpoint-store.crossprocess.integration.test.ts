import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTriageCheckpointStore } from './checkpoint-store.js'

const key = { sourceId: 'repo-main', actionKind: 'git-commits' } as const
let repoRoot: string

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'triage-checkpoint-xproc-'))
})

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true })
})

function runWorker(cursor: string): Promise<{ ok: boolean; stderr: string }> {
  const viteNode = join(process.cwd(), 'node_modules', '.bin', 'vite-node')
  const worker = join(
    process.cwd(),
    'packages',
    'automation',
    'src',
    'triage',
    'checkpoint-store.crossprocess.worker.ts',
  )
  return new Promise((resolve, reject) => {
    const child = spawn(viteNode, [worker, repoRoot, cursor], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code !== 0) {
        reject(new Error(`worker exited code=${String(code)} signal=${String(signal)} stderr=${stderr}`))
        return
      }
      try {
        resolve({ ok: (JSON.parse(stdout.trim()) as { ok: boolean }).ok, stderr })
      } catch (error) {
        reject(new Error(`worker returned invalid JSON: ${stdout}; stderr=${stderr}`, { cause: error }))
      }
    })
  })
}

describe('triage checkpoint store cross-process CAS', () => {
  it('allows exactly one of two real processes to commit revision 0', async () => {
    const outcomes = await Promise.all([runWorker('left'), runWorker('right')])

    expect(outcomes.map((outcome) => outcome.ok).filter(Boolean)).toHaveLength(1)
    const persisted = await createTriageCheckpointStore({ repoRoot }).read(key)
    expect(persisted.revision).toBe(1)
    expect(['left', 'right']).toContain(persisted.checkpoint?.cursor)
  }, 20_000)
})
