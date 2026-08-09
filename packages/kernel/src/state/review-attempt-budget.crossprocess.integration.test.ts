import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createReviewAttemptBudgetStore } from './review-attempt-budget.js'

const RUN_ID = 'cross-process-review-run'
const WORKFLOW = 'a'.repeat(64)
const LANES = ['standards', 'spec', 'e2e'] as const

const CHILD_SOURCE = `
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { createReviewAttemptBudgetStore, ReviewAttemptBudgetError } from './review-attempt-budget.ts'

const [projectRoot, changeDir, candidate, barrier] = process.argv.slice(2)
process.stdout.write('ready\\n')
while (!existsSync(barrier)) await sleep(5)
try {
  await createReviewAttemptBudgetStore().begin({
    projectRoot, changeDir,
    runId: '${RUN_ID}', workflowFingerprint: '${WORKFLOW}', scope: 'verify',
    candidateFingerprint: candidate, maxAttempts: 2,
    requiredLanes: ['standards', 'spec', 'e2e'],
  })
  process.exit(0)
} catch (error) {
  if (error instanceof ReviewAttemptBudgetError
    && (error.code === 'review-attempt-active' || error.code === 'review-budget-exhausted')) process.exit(3)
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
}
`

function runChild(
  script: string,
  root: string,
  changeDir: string,
  candidate: string,
  barrier: string,
): { readonly ready: Promise<void>; readonly exit: Promise<number> } {
  const child = spawn(process.execPath, [script, root, changeDir, candidate, barrier], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on('data', () => { if (stdout.includes('ready')) resolve() })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (!stdout.includes('ready')) reject(new Error(`review contender exited early: ${code}\n${stderr}`))
    })
  })
  const exit = new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? -1))
  })
  void ready.catch(() => {})
  return { ready, exit }
}

describe('Review attempt budget cross-process lock', () => {
  let scriptRoot: string
  let script: string

  beforeAll(async () => {
    scriptRoot = await mkdtemp(join(tmpdir(), 'review-attempt-script-'))
    script = join(scriptRoot, 'contender.mjs')
    await build({
      stdin: {
        contents: CHILD_SOURCE,
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      outfile: script,
    })
  })

  afterAll(async () => {
    await rm(scriptRoot, { recursive: true, force: true })
  })

  it('lets exactly one process consume the final attempt slot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'review-attempt-change-'))
    const changeDir = join(root, 'openspec', 'changes', 'demo')
    const reportPath = join(root, 'review.md')
    try {
      await mkdir(changeDir, { recursive: true })
      await writeFile(reportPath, '# review\n', 'utf8')
      const store = createReviewAttemptBudgetStore({
        attemptId: () => '00000000-0000-4000-8000-000000000001',
      })
      const identity = {
        projectRoot: root,
        changeDir,
        runId: RUN_ID,
        workflowFingerprint: WORKFLOW,
        scope: 'verify',
      }
      const first = await store.begin({
        ...identity,
        candidateFingerprint: `workspace:sha256:${'1'.repeat(64)}`,
        maxAttempts: 2,
        requiredLanes: LANES,
      })
      for (const lane of LANES) {
        await store.recordLane({
          ...identity, attemptId: first.attemptId, lane, result: 'fail', reportPath,
        })
      }
      await store.complete({
        ...identity, attemptId: first.attemptId, result: 'fail', reportPath,
      })

      const barrier = join(scriptRoot, `barrier-${Date.now()}`)
      const alpha = runChild(
        script, root, changeDir, `workspace:sha256:${'2'.repeat(64)}`, barrier,
      )
      const beta = runChild(
        script, root, changeDir, `workspace:sha256:${'3'.repeat(64)}`, barrier,
      )
      await Promise.all([alpha.ready, beta.ready])
      await writeFile(barrier, 'go\n', 'utf8')

      expect((await Promise.all([alpha.exit, beta.exit])).sort()).toEqual([0, 3])
      expect(await store.inspect(identity)).toMatchObject({ used: 2, maxAttempts: 2 })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)
})
