/**
 * loop ledger store（GOAL H1）—— `<repoRoot>/.pipeline/loops/ledger.jsonl` 的
 * 带锁原子 append + 宽容读 + run 窗口投影。
 *
 * 锁：复用 state/lock.ts 的 mkdir 原子锁 `withLock(dir, fn)`（进程内 FIFO + 跨进程
 * mkdir 抢占 + 陈锁回收），锁定目录 = ledger 目录本身（锁目录落在
 * `<repoRoot>/.pipeline/loops/.pipeline.lock/`）。两处对 lock.ts 真实语义的适配：
 *   · **抢锁前必须 mkdir -p ledger 目录**——lock.ts 的 `mkdir(lockDir)` 不带 recursive，
 *     父目录缺失时直接抛 ENOENT，不会自建。
 *   · **锁不可重入**（lock.ts 顶注明言；进程内 FIFO 下嵌套 withLock 同目录 = 自等死锁），
 *     而本 store 的契约要求 withLedgerLock 的 fn 内可继续调 append。故用 AsyncLocalStorage
 *     携带「ledger 目录 → 持锁令牌」映射：令牌在物理锁存续期间 active，append/withLedgerLock
 *     只对**仍存活**的令牌直通（不嵌套抢锁），并把直通操作登记进令牌的 pending。物理锁属主
 *     （最外层 withLock 的 finally）在放锁前逐批 drain pending 至稳定为空——**drain 全程保持
 *     令牌 active**，让已获准后代的嵌套锁操作继续走 fast-path、不重新抢锁（否则与「属主持锁
 *     等后代」成环死锁，见 withLedgerLock finally 注释），排空后才撤销令牌 + 归还物理锁。
 *     由此：所有已获准直通（含 fire-and-forget 后代及其派生）都在物理锁存续期内落地，不逃逸给
 *     下一个抢锁者；令牌撤销后到来的新操作走正常抢锁排队。持锁事实按解析后的目录路径判定
 *     （与 lock.ts 的 FIFO 队列同 key 口径），跨 store 实例同样成立——锁的真相在文件系统。
 *
 * 写：O_APPEND 打开 + **单次 write 完整一行**（含行尾 `\n`）+ `FileHandle.sync()` 落盘
 * 后才返回；短写（磁盘满等）fail-loud。record_id 由调用方生成，store 不自产 ID，但
 * append 前强制 encode→decode 往返校验，拒写任何读侧解不回来的记录。
 *
 * 读：宽容仅限「内容局部污染」——文件不存在（ENOENT）→ 空结果；坏行（半行/非法 JSON/
 * 窄校验不过/内部空白行）逐行隔离进 rejected（只带行号 + 内容短哈希 + 错误，不回传原文），
 * 其余合法行照常交付。空段唯二豁免：完全空文件、以及「每行以 \n 结尾」惯例下末尾换行的
 * 收尾空段——其余位置的空白行不是合法 JSONL，按损坏计入 rejected（fail-closed：判读方靠
 * rejected 看见损坏，静默跳过会把坏文件伪装成干净账本）。ENOENT 之外的 IO 错误（EISDIR/
 * EACCES/磁盘错误…）原样抛出——对齐 server readJsonlHistory 的 ENOENT-only 纪律，不许把
 * 真故障伪装成「还没有账本」。
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { mkdir, open, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { withLock } from '../state/lock.js'
import { required } from '../required.js'
import { decodeLedgerLine, encodeLedgerRecord } from './ledger-codec.js'
import { indexSkillBundleSnapshots } from './ledger-projection.js'
import type {
  BudgetReservationRecord, LedgerRecord, ReservationActivatedRecord, RunRecord, SkillBundleSnapshotRecord,
} from './ledger-types.js'

/** ledger 目录相对 repoRoot 的路径段。 */
export const LEDGER_DIR = ['.pipeline', 'loops'] as const
export const LEDGER_FILE = 'ledger.jsonl'

export function ledgerDirPath(repoRoot: string): string {
  return join(repoRoot, ...LEDGER_DIR)
}

export function ledgerFilePath(repoRoot: string): string {
  return join(ledgerDirPath(repoRoot), LEDGER_FILE)
}

export interface LedgerReadResult {
  records: LedgerRecord[]
  /** 被隔离的坏行。raw_hash = 坏行内容的 sha256 前 12 位 hex（诊断定位用，不回传原文）。 */
  rejected: { line: number; raw_hash: string; error: string }[]
}

/**
 * closeReservationIfOpen 的结果（GOAL H · Stage B 返工 #1）：
 *   · committed —— 本次真写入了一条 terminal RunRecord（关闭该 reservation）。
 *   · already-closed —— 已有一条 terminal 引用该 reservation，幂等成功、未追加第二条（防双结算双扣账）。
 */
export type CloseReservationResult =
  | { status: 'committed'; record: RunRecord }
  | { status: 'already-closed'; existing: RunRecord }

// ── typed ledger 错误（Stage B 返工 #2：结算/准入路径据 _tag 区分「治理拒绝」与「ledger I/O 故障」）──
// 均带 _tag（scheduler classifyRoundFailure / admission 据此归 kind=ledger-io，绝不被 allSettled 吞成 ok=true）。

/** 账本存在坏行——不得在损坏账本上猜 reservation 是否已关闭（fail-closed）。 */
export class LedgerDegradedError extends Error {
  readonly _tag = 'LedgerDegradedError'
  constructor(message: string) { super(message); this.name = 'LedgerDegradedError' }
}
/** 要关闭的 reservation 在账本中不存在。 */
export class UnknownReservationError extends Error {
  readonly _tag = 'UnknownReservationError'
  constructor(message: string) { super(message); this.name = 'UnknownReservationError' }
}
/** reservation 损坏（同 ID 多条预占 / 同 reservation 多条 terminal——旧版本双写痕迹）。 */
export class ReservationCorruptionError extends Error {
  readonly _tag = 'ReservationCorruptionError'
  constructor(message: string) { super(message); this.name = 'ReservationCorruptionError' }
}
/** create() 产出的 RunRecord 与 reservation 关键字段（reservation_id/attempt_id/loop_id/change）不一致。 */
export class ReservationMismatchError extends Error {
  readonly _tag = 'ReservationMismatchError'
  constructor(message: string) { super(message); this.name = 'ReservationMismatchError' }
}
/** 普通 append 收到带 reservation_id 的 RunRecord（须走 closeReservationIfOpen 幂等原语）。 */
export class ReservationAppendError extends Error {
  readonly _tag = 'ReservationAppendError'
  constructor(message: string) { super(message); this.name = 'ReservationAppendError' }
}

export interface LoopLedgerStore {
  /** 仓级锁内 append 一条记录：withLock(ledgerDir) → open(O_APPEND) → 单次 write 完整一行 →
   *  FileHandle.sync() 后才返回。目录不存在自动 mkdir -p。append 前做 encode→decode 往返
   *  校验，record 解不回来 → reject 且零字节落盘。
   *  **拒绝带 reservation_id 的 RunRecord**（Stage B 返工 #1）：terminal/close marker 必须走
   *  closeReservationIfOpen 幂等原语，否则调用方能绕过幂等制造双 terminal 双扣账。不带
   *  reservation 的历史/导入型 RunRecord 仍可普通 append。 */
  append(repoRoot: string, record: LedgerRecord): Promise<void>
  /**
   * 幂等关闭一个 reservation（Stage B 返工 #1，唯一 terminal 写入口）——锁内 read → 查 reservation →
   * 查已有 terminal：已有 1 条 → already-closed 不追加；0 条 → create(reservation) 产 RunRecord，
   * 校验关键字段一致后持锁 append+fsync → committed。坏行 → LedgerDegradedError；reservation 不存在
   * → UnknownReservationError；同 ID 多预占 / 多 terminal → ReservationCorruptionError（绝不猜、绝不
   * 追加第二条）。recovery 与 scheduler settle 并发关同一 reservation：一个 committed、一个 already-closed，
   * token 只扣一次。可重入直通（reserve 的 recovery 在既有 withLedgerLock 内调用不再抢锁）。
   */
  closeReservationIfOpen(
    repoRoot: string,
    reservationId: string,
    create: (reservation: BudgetReservationRecord) => RunRecord,
  ): Promise<CloseReservationResult>
  /** 锁内串行执行 fn（fn 内可先 read 再 append 多条——append 感知本上下文的持锁令牌仍
   *  存活，不会嵌套抢锁死锁；令牌随锁释放失效，逃逸出临界区的后代不能复用）。供「重读 +
   *  判定 + append」需要原子性的调用方（admission 式临界区）。
   *  调用方契约：可重入直通没有内层互斥——同一外层锁内用 Promise.all 并发跑多个「临界区」，
   *  它们彼此**并不**互相串行。admission 式的「重读 + 判定 + append」必须在锁内顺序执行，
   *  不得在锁内并发。 */
  withLedgerLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T>
  /** 宽容读：文件不存在 → 空结果；坏行（含内部空白行）隔离进 rejected，其余合法行照常
   *  交付；ENOENT 之外的 IO 错误原样抛（空段豁免与错误纪律见文件顶注）。 */
  read(repoRoot: string): Promise<LedgerReadResult>
  /** 纯内存投影，不改文件：每 loop 最近 limit 条 RunRecord（RunRecord 即 terminal 记录）
   *  + 全部未关闭 reservation（**无论多老**，不受 limit 窗口影响）+ 与之关联的激活记录
   *  + 与之关联的 skill-bundle-snapshot 记录（H10 §3/§8任务3：「reservation 关联查询」，口径
   *  镜像 activated——只列仍未关闭 reservation 名下的快照事实，不参与 openReservations/runs
   *  本身的判定）。「未关闭」= 该 reservation_id 没有任何 RunRecord 引用（关闭是全量事实，不随
   *  loopId 过滤改变口径）。 */
  readRunWindow(repoRoot: string, opts: { loopId?: string; limit: number }): Promise<{
    runs: RunRecord[]
    openReservations: BudgetReservationRecord[]
    activated: ReservationActivatedRecord[]
    skillBundleSnapshots: SkillBundleSnapshotRecord[]
    rejected: LedgerReadResult['rejected']
  }>
}

/** 持锁令牌：withLedgerLock 在物理锁存续期间置 active=true，withLock 归还锁之前撤销
 *  （active=false）。令牌存活 ⇒ 对应物理锁此刻必仍被本上下文的祖先持有（撤销先于释放）；
 *  反向不必成立——撤销到释放之间的极窄窗口里后代会保守地重新排队，正确性不受影响。
 *  pending：经本令牌可重入直通（未必被调用方 await）的操作——令牌属主（外层 withLock 的
 *  finally）在放锁前 allSettled 等它们全部落地，fire-and-forget 后代不再逃逸出物理锁存续期
 *  （codex R2 P1：仅「令牌存活⇒锁仍在」不足以推出「所有获准的临界区都在锁内完成」）。 */
interface HeldLockToken { active: boolean; readonly pending: Set<Promise<unknown>> }

/** 本异步上下文可见的「ledger 目录（resolve 后路径）→ 持锁令牌」映射；withLedgerLock 据此
 *  实现可重入直通，且只认仍存活的令牌（失效令牌 = 锁已还，须重新抢锁排队）。 */
const heldLedgerDirs = new AsyncLocalStorage<ReadonlyMap<string, HeldLockToken>>()

function shortHash(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 12)
}

export function createLoopLedgerStore(): LoopLedgerStore {
  // **非 async 外壳**（不是 async function）：fast-path 直接 `return p`，让调用方拿到的、
  // 登记进 pending 的、被属主 drain 的是**同一个** promise——若外壳是 async，调用方拿到的是
  // 采用 p 状态的 wrapper（≠ p），被丢弃时 wrapper 仍可能 unhandled（codex R4 P1）。慢路径
  // 交内部 async helper acquireAndRun。锁与令牌都以 resolve 后的 ledger 目录绝对路径为 key。
  function withLedgerLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> {
    const key = resolve(ledgerDirPath(repoRoot))
    const currentToken = heldLedgerDirs.getStore()?.get(key)
    // 令牌仍存活 = 物理锁此刻确在本上下文祖先手上 → 真可重入直通（lock.ts 不可重入，见顶注）。
    // 直通操作登记进命中令牌的 pending：即便调用方 fire-and-forget（不 await），令牌属主也会
    // 在放锁前等它落地。失效令牌（外层锁已还的后代）走下面的正常抢锁，排进 lock.ts 的 FIFO。
    if (currentToken?.active === true) {
      const p = fn()
      currentToken.pending.add(p)
      // 登记那一刻立即挂 rejection 观测（noop），消除「登记 → 属主 finally 的 allSettled」之间
      // p 已 reject 却无 handler 的 unhandledRejection 窗口（codex R4 P1）。不影响调用方语义：
      // 调用方拿到的仍是 p 本身，`await p` 照样抛出 reject（p.catch 返回的新 promise 被丢弃，但
      // p 本身已 handled）。属主 drain 用 allSettled 追踪落地；属主不吞、也不代传子操作的错误。
      void p.catch(() => {})
      return p
    }
    return acquireAndRun(key, fn)
  }

  async function acquireAndRun<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const held = heldLedgerDirs.getStore()
    await mkdir(key, { recursive: true }) // lock.ts 的 mkdir(lockDir) 不建父目录，见顶注
    return withLock(key, async () => {
      const token: HeldLockToken = { active: true, pending: new Set() }
      const next = new Map<string, HeldLockToken>()
      for (const [k, t] of held ?? []) if (t.active) next.set(k, t) // 只继承仍存活的令牌
      next.set(key, token)
      try {
        return await heldLedgerDirs.run(next, fn)
      } finally {
        // 排空已获准直通（含它们运行时再派生的直通）——**全程保持 token.active=true**：若在 drain
        // 前就撤销令牌，一个被 gate 挡住的已获准后代在 gate 打开后做嵌套锁操作时会看到 active=false
        // 而重新抢锁，与「属主持物理锁 + 在此 finally 等这个后代」形成环 → 确定性死锁（codex R3
        // 抓到）。保持 active，后代的嵌套锁走 fast-path 登记进 pending，不抢锁、不成环。逐批 drain
        // 到 pending 稳定为空：批内成员运行时可能再派生孙代登记进 pending，下一轮捞起（快照与
        // clear 之间无 await，登记要么进本批要么进下一轮，不丢）。allSettled 不因成员 reject 而
        // reject（属主不吞、也不代传子操作的错误——那是子操作调用方自己 await 的事）。
        while (token.pending.size > 0) {
          const batch = [...token.pending]
          token.pending.clear()
          await Promise.allSettled(batch)
        }
        // pending 已空，且从 size===0 判定到此处撤销之间无 await（无新登记可插入）：撤销先于
        // withLock 归还锁，保证「令牌存活 ⇒ 锁仍在」；此后到来的新操作见 active=false 走重排队。
        token.active = false
      }
    })
  }

  /** 持锁写一行（调用方须已在 withLedgerLock 内）：encode→decode 往返校验 → open(a) → 单次 write
   *  完整一行 → fsync。短写 fail-loud。append 与 closeReservationIfOpen 共用这一份落盘原语。 */
  async function writeRecordLine(repoRoot: string, record: LedgerRecord): Promise<void> {
    const line = encodeLedgerRecord(record)
    const back = decodeLedgerLine(line)
    if (!back.ok) {
      throw new Error(`loops ledger append: record 未通过编解码往返校验，拒写不可解码记录 —— ${back.error}`)
    }
    const fh = await open(ledgerFilePath(repoRoot), 'a')
    try {
      const buf = Buffer.from(`${line}\n`, 'utf8')
      const { bytesWritten } = await fh.write(buf, 0, buf.length)
      if (bytesWritten !== buf.length) {
        throw new Error(`loops ledger append: 短写 ${bytesWritten}/${buf.length} 字节（磁盘满/IO 故障）`)
      }
      await fh.sync()
    } finally {
      await fh.close()
    }
  }

  async function append(repoRoot: string, record: LedgerRecord): Promise<void> {
    // Stage B 返工 #1：带 reservation_id 的 RunRecord 是 terminal/close marker，必须走
    // closeReservationIfOpen（否则绕过幂等制造双 terminal 双扣账）。此判定先于抢锁。
    if (record.kind === 'run' && record.reservation_id !== undefined) {
      throw new ReservationAppendError(
        'RunRecord with reservation_id must use closeReservationIfOpen()（带 reservation_id 的 terminal 记录禁走普通 append）',
      )
    }
    const back = decodeLedgerLine(encodeLedgerRecord(record)) // 往返校验在抢锁之前：坏记录零锁占用、零字节落盘
    if (!back.ok) {
      throw new Error(`loops ledger append: record 未通过编解码往返校验，拒写不可解码记录 —— ${back.error}`)
    }
    await withLedgerLock(repoRoot, () => writeRecordLine(repoRoot, record))
  }

  async function closeReservationIfOpen(
    repoRoot: string,
    reservationId: string,
    create: (reservation: BudgetReservationRecord) => RunRecord,
  ): Promise<CloseReservationResult> {
    return withLedgerLock(repoRoot, async (): Promise<CloseReservationResult> => {
      const { records, rejected } = await read(repoRoot)
      // 坏行 → 拒关（不猜 reservation 是否已关闭；fail-closed 见顶注纪律）。
      if (rejected.length > 0) {
        throw new LedgerDegradedError(
          `loops ledger closeReservationIfOpen: 账本有 ${rejected.length} 条坏行，拒绝在损坏账本上关闭 reservation「${reservationId}」（不猜是否已关闭）`,
        )
      }
      const reservations = records.filter(
        (r): r is BudgetReservationRecord => r.kind === 'budget-reservation' && r.reservation_id === reservationId,
      )
      if (reservations.length === 0) {
        throw new UnknownReservationError(`loops ledger closeReservationIfOpen: reservation「${reservationId}」在账本中不存在`)
      }
      if (reservations.length > 1) {
        throw new ReservationCorruptionError(`loops ledger closeReservationIfOpen: reservation「${reservationId}」有 ${reservations.length} 条同 ID 预占记录（账本损坏）`)
      }
      const reservation = required(reservations[0])
      const terminals = records.filter((r): r is RunRecord => r.kind === 'run' && r.reservation_id === reservationId)
      if (terminals.length === 1) {
        return { status: 'already-closed', existing: terminals[0]! } // 幂等成功：已关闭，不追加第二条
      }
      if (terminals.length > 1) {
        throw new ReservationCorruptionError(`loops ledger closeReservationIfOpen: reservation「${reservationId}」有 ${terminals.length} 条 terminal（账本损坏，重复结算痕迹）`)
      }
      const record = create(reservation)
      // 校验 create 产出与 reservation 一致（防写入方构造出错关到别的 reservation）。
      if (record.kind !== 'run' || record.reservation_id !== reservationId
        || record.attempt_id !== reservation.attempt_id || record.loop_id !== reservation.loop_id
        || record.change !== reservation.change
        || (reservation.iteration_id !== undefined && record.iteration_id !== reservation.iteration_id)) {
        throw new ReservationMismatchError(
          `loops ledger closeReservationIfOpen: create 产出的 RunRecord 与 reservation「${reservationId}」关键字段不一致（reservation_id/attempt_id/iteration_id/loop_id/change）`,
        )
      }
      await writeRecordLine(repoRoot, record)
      return { status: 'committed', record }
    })
  }

  async function read(repoRoot: string): Promise<LedgerReadResult> {
    let text: string
    try {
      text = await readFile(ledgerFilePath(repoRoot), 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { records: [], rejected: [] } // 还没记过账
      throw e // EISDIR/EACCES/IO 等真故障 fail-loud，不伪装成空账本
    }
    const records: LedgerRecord[] = []
    const rejected: LedgerReadResult['rejected'] = []
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const raw = required(lines[i])
      if (raw.trim() === '') {
        // 空段唯二豁免（见顶注）：完全空文件、末尾换行的收尾空段——都只能是最后一个空串段。
        // 其余位置的空白行（含尾部无换行的纯空白半行）不是合法 JSONL，按损坏进 rejected。
        if (raw === '' && i === lines.length - 1) continue
        rejected.push({
          line: i + 1,
          raw_hash: shortHash(raw),
          error: '空白行（blank/whitespace line）：JSONL 记录之间不允许空行，视为文件损坏痕迹',
        })
        continue
      }
      const r = decodeLedgerLine(raw)
      if (r.ok) records.push(r.record)
      else rejected.push({ line: i + 1, raw_hash: shortHash(raw), error: r.error })
    }
    return { records, rejected }
  }

  async function readRunWindow(repoRoot: string, opts: { loopId?: string; limit: number }): Promise<{
    runs: RunRecord[]
    openReservations: BudgetReservationRecord[]
    activated: ReservationActivatedRecord[]
    skillBundleSnapshots: SkillBundleSnapshotRecord[]
    rejected: LedgerReadResult['rejected']
  }> {
    const { records, rejected } = await read(repoRoot)
    const inScope = (loopId: string): boolean => opts.loopId === undefined || loopId === opts.loopId

    // 关闭集合按全量记录算（不随 loopId 过滤）：关闭是 reservation 的全局事实
    const closedReservationIds = new Set<string>()
    for (const rec of records) {
      if (rec.kind === 'run' && rec.reservation_id !== undefined) closedReservationIds.add(rec.reservation_id)
    }

    // 每 loop 最近 limit 条 run：append 顺序即时间顺序，各组取尾部，合并后按文件序回稳
    const fileIndex = new Map<RunRecord, number>()
    const runsByLoop = new Map<string, RunRecord[]>()
    records.forEach((rec, idx) => {
      if (rec.kind !== 'run' || !inScope(rec.loop_id)) return
      fileIndex.set(rec, idx)
      const bucket = runsByLoop.get(rec.loop_id)
      if (bucket === undefined) runsByLoop.set(rec.loop_id, [rec])
      else bucket.push(rec)
    })
    const runs = [...runsByLoop.values()]
      .flatMap((bucket) => (opts.limit > 0 ? bucket.slice(-opts.limit) : [])) // slice(-0) 是全量，limit<=0 必须显式空窗
      .sort((a, b) => required(fileIndex.get(a)) - required(fileIndex.get(b)))

    const openReservations = records.filter(
      (rec): rec is BudgetReservationRecord =>
        rec.kind === 'budget-reservation' && inScope(rec.loop_id) && !closedReservationIds.has(rec.reservation_id),
    )
    const openIds = new Set(openReservations.map((r) => r.reservation_id))
    const activated = records.filter(
      (rec): rec is ReservationActivatedRecord =>
        rec.kind === 'reservation-activated' && openIds.has(rec.reservation_id),
    )
    // H10 §3/§8任务3：「reservation 关联查询」——只列仍未关闭 reservation（已按 loopId 限定）名下
    // 已产出的 skill-bundle-snapshot 事实，口径镜像 activated；不影响上面 openReservations/runs
    // 的判定（indexSkillBundleSnapshots 是纯附加的读投影，见该函数头注）。
    const snapshotByReservation = indexSkillBundleSnapshots(records)
    const skillBundleSnapshots = openReservations
      .map((r) => snapshotByReservation.get(r.reservation_id))
      .filter((s): s is SkillBundleSnapshotRecord => s !== undefined)
    return { runs, openReservations, activated, skillBundleSnapshots, rejected }
  }

  return { append, closeReservationIfOpen, withLedgerLock, read, readRunWindow }
}
