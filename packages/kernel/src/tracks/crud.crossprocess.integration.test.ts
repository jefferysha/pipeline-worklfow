/**
 * Track CRUD 跨进程真实锁竞争验收（真双子进程，非 mock withLock）——codex D4 要求的「至少一组
 * 跨进程真实锁竞争」。两子进程各自 spawn 真实 node，import **真实的** mutateTrackRegistry，在
 * barrier 同时放行下并发对同一 `.pipeline/tracks.yaml` 做 createTrack：
 *   (1) 不同 id → 均 exit 0，最终 registry 两条都在（无丢更新——旁路锁会让一次写覆盖另一次、丢一条）。
 *   (2) 同 id  → 恰一 exit 0（created）、另一 exit 3（TrackAlreadyExistsError：锁内读到已存在），
 *       最终 registry 恰一条（旁路锁则两进程都读到「不存在」→ 都写 → 最终两条或撕裂）。
 *
 * 手法零逻辑复制：esbuild（本仓 devDependency）把极小 child entry bundle 成 tmpdir 单文件 .mjs，
 * './registry.ts' 解析到被测源码本尊，再 spawn 真实 node（对齐 loops/ledger-store 跨进程测试）。
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { loadTrackRegistry, trackRegistryPath } from './registry.js'
import type { TrackValidationContext } from './types.js'

const CTX: TrackValidationContext = { workflowExists: (id) => id === 'default', skillProfiles: new Set() }

/** child entry：barrier 放行后 mutateTrackRegistry 建一条额外轨。created→exit 0；已存在→exit 3；其余→exit 1。 */
const CHILD_ENTRY_SOURCE = `
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { mutateTrackRegistry } from './registry.ts'
import { createTrack, TrackAlreadyExistsError } from './crud.ts'
import { builtinTrack } from './builtins.ts'

const [repoRoot, id, barrierPath] = process.argv.slice(2)
const ctx = { workflowExists: (w) => w === 'default', skillProfiles: new Set() }
const spec = {
  id, label: 'L-' + id,
  workflow: { default: 'default', allowed: '*' },
  policyProfile: structuredClone(builtinTrack('chat').policyProfile),
}
process.stdout.write('ready\\n')
while (!existsSync(barrierPath)) await sleep(5)
try {
  await mutateTrackRegistry(repoRoot, ctx, async ({ config }) => ({ next: createTrack(config, spec), result: 0 }))
  process.exit(0)
} catch (e) {
  if (e instanceof TrackAlreadyExistsError) process.exit(3)
  console.error(e && e.message ? e.message : String(e))
  process.exit(1)
}
`

async function bundleScript(source: string, outDir: string, name: string): Promise<string> {
  const outfile = join(outDir, name)
  await build({
    stdin: { contents: source, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile,
  })
  return outfile
}

/** spawn 一个 child：ready = 已启动停在 barrier 前；exit = 退出码（error/未启动前退出 fail-loud）。 */
function runChild(script: string, repoRoot: string, id: string, barrierPath: string): { ready: Promise<void>; exit: Promise<number> } {
  const child = spawn(process.execPath, [script, repoRoot, id, barrierPath], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf8') })
  const ready = new Promise<void>((resolve, reject) => {
    let out = ''
    child.stdout.on('data', (c: Buffer) => { out += c.toString('utf8'); if (out.includes('ready')) resolve() })
    child.on('error', reject)
    child.on('exit', () => reject(new Error(`child(${id}) 在 ready 前退出\n${stderr}`)))
  })
  const exit = new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? -1))
  })
  ready.catch(() => {})
  return { ready, exit }
}

describe('Track CRUD 跨进程真实锁竞争（真双子进程）', () => {
  let scriptDir: string
  let script: string
  beforeAll(async () => {
    scriptDir = await mkdtemp(join(tmpdir(), 'pl-crud-xproc-script-'))
    script = await bundleScript(CHILD_ENTRY_SOURCE, scriptDir, 'crud-child.mjs')
  })
  afterAll(async () => {
    await rm(scriptDir, { recursive: true, force: true })
  })

  test('两子进程并发 create 不同 id → 均 exit 0，最终两条都在（无丢更新）', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'pl-crud-xproc-diff-'))
    try {
      const barrier = join(scriptDir, `barrier-diff-${Date.now()}`)
      const a = runChild(script, repoRoot, 'alpha', barrier)
      const b = runChild(script, repoRoot, 'beta', barrier)
      await Promise.all([a.ready, b.ready])
      await writeFile(barrier, 'go\n', 'utf8')
      const [ca, cb] = await Promise.all([a.exit, b.exit])
      expect([ca, cb]).toEqual([0, 0])
      const ids = loadTrackRegistry(repoRoot, CTX).ordered.map((t) => t.id)
      expect(ids).toContain('alpha')
      expect(ids).toContain('beta')
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  }, 60_000)

  test('两子进程并发 create 同 id → 恰一 exit 0、一 exit 3，最终恰一条', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'pl-crud-xproc-same-'))
    try {
      const barrier = join(scriptDir, `barrier-same-${Date.now()}`)
      const a = runChild(script, repoRoot, 'dup', barrier)
      const b = runChild(script, repoRoot, 'dup', barrier)
      await Promise.all([a.ready, b.ready])
      await writeFile(barrier, 'go\n', 'utf8')
      const codes = (await Promise.all([a.exit, b.exit])).sort()
      expect(codes).toEqual([0, 3]) // 一个建成、一个锁内读到已存在
      const dup = loadTrackRegistry(repoRoot, CTX).ordered.filter((t) => t.id === 'dup')
      expect(dup).toHaveLength(1)
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  }, 60_000)
})
