/**
 * loops ledger 跨进程集成验收（真双子进程）。**两个测试都是 smoke / 高置信佐证，不是锁协议
 * 的确定性证明**——锁协议本身（mkdir 原子锁 + 陈锁回收 + 进程内 FIFO）的确定性正确性由
 * state/lock.test.ts + 本目录 ledger-store.test.ts 的进程内可重入/drain/并发测试保证；这里补
 * 的是「同一份真实 store 代码在两个真进程之间也不撕裂、也互斥」这层黑盒佐证。
 *
 * (1) **并发完整性 smoke**：真双子进程并发各写 N 条，验收「每行可解码、总行数=2N、record_id
 *     并集一致、rejected 为空」。barrier 让两进程同时待命把写窗口拉到最大重叠，但这组断言即便
 *     去掉 mkdir 锁、仅靠 O_APPEND 单次整行写也大概率通过——它证明的是**跨进程 append 不撕裂/
 *     不丢**，不判别互斥。
 * (2) **互斥佐证**：一个子进程在 withLedgerLock 内持锁等 release 门，另一个尝试 append。硬断言
 *     是落盘先后序（holder-0 先于 beta-0）：锁生效则 beta-0 只能在 holder 放锁后写、落在后面；
 *     锁旁路则 beta-0 在 holder 持锁时就写出、落在前面 → 先后序变红。**诚实边界**：这条只在
 *     「appender 越过 barrier 后在有界时间内真的执行到 mkdir 锁获取」这个 liveness 假设下才判别
 *     ——而黑盒跨进程无法从外部确定性观测「appender 此刻正阻塞在锁上」（attempt 标记只证明它写完
 *     了标记，之后到真正 mkdir 之间进程仍可被调度暂停）。故这是**高置信互斥佐证，非确定性判别**；
 *     持锁窗口内 beta-0 缺席的检查同理是佐证而非证明。确定性判别不在本测试的能力范围内。
 *
 * 手法（零逻辑复制）：用 esbuild（本仓 devDependency，`npm run bundle` 同款）把极小的 child
 * entry——import **真实的** createLoopLedgerStore——bundle 成 tmpdir 单文件 .mjs 再 spawn 真实
 * node 子进程。子进程跑的就是本仓源码的 bundle，不是协议复刻。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { decodeLedgerLine } from './ledger-codec.js'
import { createLoopLedgerStore, ledgerFilePath } from './ledger-store.js'

const N_PER_CHILD = 25

/** appender 子进程入口：真实 store 的最小驱动壳。argv = [repoRoot, prefix, n, barrierPath]。
 *  打印 ready 后轮询等 barrier 文件出现才开写——父进程在双 ready 后同时放行把写窗口拉到最大
 *  重叠（无 barrier 时进程启动时差会让两者几乎串行错开）。注意这只最大化重叠概率，完整性断言
 *  本身不判别互斥——互斥的高置信佐证在下方 holder 测试（非确定性判别，见文件头）。 */
const CHILD_ENTRY_SOURCE = `
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { createLoopLedgerStore } from './ledger-store.ts'

const [repoRoot, prefix, nStr, barrierPath, attemptMarkerPath] = process.argv.slice(2)
if (!repoRoot || !prefix || !nStr || !barrierPath) {
  console.error('usage: node child.mjs <repoRoot> <prefix> <n> <barrierPath> [attemptMarkerPath]')
  process.exit(2)
}
const n = Number(nStr)
const store = createLoopLedgerStore()
process.stdout.write('ready\\n')
while (!existsSync(barrierPath)) await sleep(5)
// 越过 barrier 后、进入 append 循环前写 attempt 标记：只证明 appender 已越过 barrier、即将调
// append(排除「还没启动」这个非锁原因),**不证明已执行到 mkdir 锁获取**(标记写完到真正 mkdir
// 之间进程仍可被调度暂停——见文件头诚实边界)。它是先后序佐证的 liveness 起点,非确定性观测点。
if (attemptMarkerPath) await writeFile(attemptMarkerPath, 'attempting\\n')
for (let i = 0; i < n; i++) {
  await store.append(repoRoot, {
    schema_version: 1,
    record_id: prefix + '-' + i,
    recorded_at: new Date().toISOString(),
    kind: 'usage',
    usage_id: 'usage-' + prefix + '-' + i,
    attempt_id: 'att-' + prefix + '-' + i,
    loop_id: 'loop-crossproc',
    provider: 'anthropic',
    tokens: { input: 1, output: 2, total: 3 },
    source: 'provider-structured',
    observed_at: new Date().toISOString(),
  })
}
`

/** holder 子进程入口：在 withLedgerLock 内持锁——写 held 标记（信号「我已持锁」）后轮询等
 *  release 门，门出现后锁内 append 一条 holder 记录再释放。argv = [repoRoot, heldPath,
 *  releasePath]。 */
const HOLDER_ENTRY_SOURCE = `
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { createLoopLedgerStore } from './ledger-store.ts'

const [repoRoot, heldPath, releasePath] = process.argv.slice(2)
const store = createLoopLedgerStore()
process.stdout.write('ready\\n')
await store.withLedgerLock(repoRoot, async () => {
  await writeFile(heldPath, 'held\\n')
  while (!existsSync(releasePath)) await sleep(5)
  await store.append(repoRoot, {
    schema_version: 1, record_id: 'holder-0', recorded_at: new Date().toISOString(),
    kind: 'usage', usage_id: 'usage-holder-0', attempt_id: 'att-holder-0', loop_id: 'loop-crossproc',
    provider: 'anthropic', tokens: { input: 1, output: 2, total: 3 },
    source: 'provider-structured', observed_at: new Date().toISOString(),
  })
})
`

/** 把一段 child entry bundle 成单文件 .mjs（stdin 输入，resolveDir 指向本源码目录，故
 *  './ledger-store.ts' 解析到的就是被测源码本尊）。 */
async function bundleScript(source: string, outDir: string, name: string): Promise<string> {
  const outfile = join(outDir, name)
  await build({
    stdin: {
      contents: source,
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile,
  })
  return outfile
}

/** 跑一个子进程写手。ready = 子进程已启动并停在 barrier 前；done = exit 0（否则带 stderr
 *  fail-loud）。 */
function runChildWriter(
  script: string, repoRoot: string, prefix: string, barrierPath: string,
): { ready: Promise<void>; done: Promise<void> } {
  const child = spawn(process.execPath, [script, repoRoot, prefix, String(N_PER_CHILD), barrierPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
  const ready = new Promise<void>((resolveReady, rejectReady) => {
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
      if (out.includes('ready')) resolveReady()
    })
    // ready 必须同时挂 error 与 exit：spawn 失败（execPath 不可执行等）只发 error、未必发 exit，
    // 若 ready 只等 exit 会在 spawn 失败时悬到 60s 超时而非 fail-loud（codex R2 P2b）。
    child.on('error', rejectReady)
    child.on('exit', () => rejectReady(new Error(`child(${prefix}) 在 ready 前退出\n${stderr}`)))
  })
  const done = new Promise<void>((resolveDone, rejectDone) => {
    child.on('error', rejectDone)
    child.on('exit', (code, signal) => {
      if (code === 0) resolveDone()
      else rejectDone(new Error(`child(${prefix}) exit code=${code} signal=${signal}\n${stderr}`))
    })
  })
  ready.catch(() => {}) // done 已承载失败面；防 ready 在 done 先 reject 时挂 unhandled
  return { ready, done }
}

/** 无 barrier 依赖的 spawn，返回 { done, child }：done = exit 0（否则带 stderr fail-loud），
 *  error/exit-before 都 fail-loud 不悬挂；child = 句柄供 finally 有界收割 + kill 兜底（断言失败
 *  时子进程若卡住不退，需能强杀 + 等退出，否则拖到 vitest 超时，codex R4/R5 Standards）。 */
function spawnChild(script: string, args: string[]): { done: Promise<void>; child: ReturnType<typeof spawn> } {
  const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf8') })
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`child exit code=${code} signal=${signal}\n${stderr}`))
    })
  })
  done.catch(() => {}) // 防被 kill 收割时 done reject 无 handler → unhandled
  return { done, child }
}

async function pollUntil(pred: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (pred()) return true
    await new Promise((r) => setTimeout(r, 5))
  }
  return pred()
}

/** race 一个 promise 与有界超时；超时 timer 用 unref()——p 早 settle 时不让残留 timer 阻止
 *  进程退出（codex R5：Promise.race 的 timer 未 unref 会挂住事件循环）。 */
async function boundedWait(p: Promise<unknown>, ms: number): Promise<void> {
  await Promise.race([
    p.then(() => undefined),
    new Promise<void>((r) => { const t = setTimeout(r, ms); t.unref() }),
  ])
}

describe('loops/ledger-store —— 跨进程集成（mkdir 锁 + O_APPEND 的真双进程验收）', () => {
  let repoRoot: string
  let scriptDir: string
  let script: string
  let holderScript: string

  beforeAll(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'lite-ledger-xproc-'))
    scriptDir = await mkdtemp(join(tmpdir(), 'lite-ledger-xproc-script-'))
    script = await bundleScript(CHILD_ENTRY_SOURCE, scriptDir, 'ledger-append-child.mjs')
    holderScript = await bundleScript(HOLDER_ENTRY_SOURCE, scriptDir, 'ledger-holder-child.mjs')
  })
  afterAll(async () => {
    await rm(repoRoot, { recursive: true, force: true })
    await rm(scriptDir, { recursive: true, force: true })
  })

  test(
    `两个真实子进程并发各 append ${N_PER_CHILD} 条 → 零交错、零丢失、record_id 并集一致、rejected 为空`,
    async () => {
      const barrierPath = join(scriptDir, 'barrier-go')
      const alpha = runChildWriter(script, repoRoot, 'alpha', barrierPath)
      const beta = runChildWriter(script, repoRoot, 'beta', barrierPath)
      await Promise.all([alpha.ready, beta.ready]) // 双方都停在 barrier 前
      await writeFile(barrierPath, 'go\n', 'utf8') // 同时放行：写窗口完全重叠
      await Promise.all([alpha.done, beta.done])

      // 物理层零交错：文件以 \n 收尾，且去掉收尾换行后恰好 2N 行、每行独立可解码
      const raw = await readFile(ledgerFilePath(repoRoot), 'utf8')
      expect(raw.endsWith('\n')).toBe(true)
      const lines = raw.slice(0, -1).split('\n')
      expect(lines).toHaveLength(2 * N_PER_CHILD)
      for (const line of lines) expect(decodeLedgerLine(line).ok).toBe(true)

      // 读侧零丢失 + 并集一致 + 零 rejected
      const store = createLoopLedgerStore()
      const { records, rejected } = await store.read(repoRoot)
      expect(rejected).toEqual([])
      expect(records).toHaveLength(2 * N_PER_CHILD)
      const expected = new Set([
        ...Array.from({ length: N_PER_CHILD }, (_, i) => `alpha-${i}`),
        ...Array.from({ length: N_PER_CHILD }, (_, i) => `beta-${i}`),
      ])
      expect(new Set(records.map((r) => r.record_id))).toEqual(expected)
    },
    60_000, // 两子进程串行争锁 50 次 append + esbuild 冷启动，给足裕量与「真卡死」拉开区分度
  )

  // 跨进程互斥的两层佐证（都非确定性判别，见文件头诚实边界；确定性锁正确性在 lock.test.ts +
  // 进程内测试）：
  //  · **硬断言 = 落盘先后序**：holder 在锁内、release 之前写 holder-0；appender 只有在 holder
  //    放锁之后才能拿到锁写 beta-0。锁生效 → [holder-0, beta-0]；锁被旁路 → appender 在 holder
  //    还持锁时就写出 beta-0 落在前 → [beta-0, holder-0] → 先后序断言变红。它从「beta-0 何时能
  //    落盘」这个真实锁获取结果反推，**在 liveness 假设成立时**是强佐证——前提是 appender 越过
  //    barrier 后在有界时间内真的执行到 mkdir 锁获取；attempt 标记只确认它已越过 barrier、排除
  //    「慢启动尚未尝试」，不确定性观测「已在锁上阻塞」（标记到真正 mkdir 之间仍可被暂停）。
  //  · **辅助佐证 = 持锁窗口内 beta-0 缺席**：holder 持锁 + appender 已越过 barrier 的窗口里读
  //    ledger，beta-0 不应出现。诚实边界：黑盒跨进程无法从外部确定性观测「appender 此刻正阻塞
  //    在 mkdir 锁上」——attempt 标记之后到真正 mkdir 之间仍有一段进程可被调度暂停的间隙，故这
  //    一层是高置信佐证、非绝对判别。锁协议本身的确定性正确性由 state/lock.test.ts（mkdir 原子
  //    锁）+ 本文件同目录的进程内可重入/drain 测试保证；此跨进程测试是对「同一份真实 store 代码
  //    在两个真进程间也互斥」的强佐证。
  test(
    '互斥佐证：落盘先后序（锁旁路→beta-0 早于 holder-0 变红）+ 持锁窗口 beta-0 缺席（liveness 假设下的高置信佐证，非确定性判别，见文件头）',
    async () => {
      // 独立 repoRoot，与上面的完整性 smoke 隔离
      const xrepo = await mkdtemp(join(tmpdir(), 'lite-ledger-xproc-mutex-'))
      const heldPath = join(scriptDir, `held-${Date.now()}`)
      const releasePath = join(scriptDir, `release-${Date.now()}`)
      const barrierPath = join(scriptDir, `mutex-barrier-${Date.now()}`)
      const attemptPath = join(scriptDir, `attempt-${Date.now()}`)
      let holder: { done: Promise<void>; child: ReturnType<typeof spawn> } | undefined
      let appender: { done: Promise<void>; child: ReturnType<typeof spawn> } | undefined
      try {
        holder = spawnChild(holderScript, [xrepo, heldPath, releasePath])
        // 等 holder 真正持锁（held 标记只在 withLedgerLock 内写出）
        expect(await pollUntil(() => existsSync(heldPath), 30_000)).toBe(true)

        // holder 持锁中，放 appender 进场尝试 append 一条 beta-0（第 5 参 = attempt 标记）
        appender = spawnChild(script, [xrepo, 'beta', '1', barrierPath, attemptPath])
        await writeFile(barrierPath, 'go\n', 'utf8') // appender 越过自身 barrier
        // 等 attempt 标记：appender 已越过 barrier、即将进入 append（排除「慢启动尚未尝试」这个
        // 非锁原因）。这是先后序判别的 liveness 前提，也是窗口佐证的起点。
        expect(await pollUntil(() => existsSync(attemptPath), 30_000)).toBe(true)

        // 辅助佐证：持锁窗口内 beta-0 不应落盘（给 300ms 让「锁旁路」实现有时间写出）。
        const store = createLoopLedgerStore()
        await new Promise((r) => setTimeout(r, 300))
        const during = await store.read(xrepo)
        expect(during.rejected).toEqual([])
        expect(during.records.map((r) => r.record_id)).not.toContain('beta-0')

        // 放行 holder：它锁内写 holder-0 再释放；appender 随后才拿到锁写 beta-0
        await writeFile(releasePath, 'go\n', 'utf8')
        await Promise.all([holder.done, appender.done])

        const after = await store.read(xrepo)
        expect(after.rejected).toEqual([])
        const ids = after.records.map((r) => r.record_id)
        expect(ids).toContain('holder-0')
        expect(ids).toContain('beta-0')
        // 先后序佐证：holder-0 先于 beta-0（锁旁路 + liveness 成立则相反 → 变红；见文件头诚实边界）
        expect(ids.indexOf('holder-0')).toBeLessThan(ids.indexOf('beta-0'))
      } finally {
        // 断言中途抛出时子进程仍在轮询 → release + 有界等待 + kill + kill 后再有界等退出，完整
        // reap，绝不泄漏子进程拖到 vitest 超时（codex R5：kill 后需再等 exit 才算收割完）。
        await writeFile(releasePath, 'go\n', 'utf8').catch(() => {})
        const both = [holder?.done, appender?.done].filter(Boolean) as Promise<void>[]
        await boundedWait(Promise.allSettled(both), 5_000) // 正常退出等它，卡住到点就往下 kill
        holder?.child.kill('SIGKILL') // 已退出则 no-op；卡住则强杀
        appender?.child.kill('SIGKILL')
        // kill 后再有界等 exit 落定（done 因非 0 退出会 reject，已在 spawnChild 挂 catch，这里
        // 只等它 settle）——kill→exit 有异步延迟，不等则 reap 未完成、句柄可能残留。
        await boundedWait(Promise.allSettled(both), 5_000)
        await rm(xrepo, { recursive: true, force: true })
      }
    },
    60_000,
  )
})
