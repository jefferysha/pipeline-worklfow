/**
 * mkdir 原子锁 —— POSIX mkdir 原子性，macOS/Linux/BSD 通吃（flock 在 macOS 默认缺席），
 * 语义对齐老内核 state-lib.sh portable_lock。锁目录固定 `<changeDir>/.pipeline.lock/`。
 *
 * 双层互斥：
 * - 进程内：按锁目录路径 FIFO 排队（Promise 链），并发 withLock 严格串行、零忙等；
 * - 跨进程：mkdir 抢占 + 轮询等待 + 陈锁回收（owner 文件 mtime 超 60s 视为持有者已死，接管）。
 *
 * 跨进程正确性（B1 修复）：
 * - **owner token**：抢锁成功后在锁目录写 `<lockDir>/owner`（pid+随机 token）。
 * - **心跳刷新 mtime**：持锁期间周期性 utimes owner 文件，令「活着的长任务（fn>60s）」的锁不被误判陈锁
 *   （老实现 mtime 从不刷新 → 长任务被夺锁双持）。
 * - **原子回收**：陈锁不再 `rm -rf` 后 mkdir（两进程都判陈锁会各 rm+mkdir 双持）；改为把陈锁目录
 *   `rename` 到唯一坟墓名——rename 原子，多个回收者只有一个成功「移走」，其余得 ENOENT 退回重试 mkdir，
 *   最终持有者恒由原子 mkdir 唯一裁定。
 * - **token 守卫的 release**：只有 owner 仍等于自己的 token 才删锁；被夺锁（token 变更）→ 不删他人的锁
 *   （老实现无条件 rmdir → 夺锁后原持有者 release 会删掉夺锁者的锁）。
 *
 * 注意：锁不可重入——fn 内组合多步请用 read/write 原语，勿嵌套 set/setMany/cas/withLock。
 */
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

export const LOCK_DIR_NAME = '.pipeline.lock'
/** 锁归属令牌文件（锁目录内）：记 pid+随机 token；回收/释放据此校验「锁是否仍属自己」 */
export const LOCK_OWNER_FILE = 'owner'
/** 陈锁阈值：锁 owner 文件 mtime 超过 60s 视为陈锁，可回收接管 */
export const STALE_LOCK_MS = 60_000
/** 心跳周期：持锁期间每 STALE_LOCK_MS/3 刷新一次 owner 文件 mtime，令活锁永不被误判陈锁 */
const HEARTBEAT_MS = Math.floor(STALE_LOCK_MS / 3)
const ACQUIRE_TIMEOUT_MS = 10_000
const POLL_MS = 10

/** 进程内 FIFO 队尾（按解析后的锁目录路径），存入的 promise 永不 reject */
const queues = new Map<string, Promise<void>>()

/** 持锁凭据：token（release/回收据此校验归属）+ 心跳计时器（release 时清除）。 */
interface Held {
  token: string
  heartbeat: ReturnType<typeof setInterval>
}

function lockDirFor(changeDir: string): string {
  return path.join(path.resolve(changeDir), LOCK_DIR_NAME)
}

function ownerPathFor(lockDir: string): string {
  return path.join(lockDir, LOCK_OWNER_FILE)
}

/** 锁年龄（ms）：优先按 owner 文件 mtime（心跳刷新的真相源）；无 owner 文件回退锁目录 mtime；
 *  两者皆 stat 失败（锁刚消失）→ null，调用方立刻重试 mkdir。 */
async function lockAgeMs(lockDir: string): Promise<number | null> {
  try {
    const st = await stat(ownerPathFor(lockDir))
    return Date.now() - st.mtimeMs
  } catch {
    try {
      const st = await stat(lockDir)
      return Date.now() - st.mtimeMs
    } catch {
      return null
    }
  }
}

/** 原子回收陈锁：把陈锁目录 rename 到唯一坟墓名（原子，多回收者只有一个成功），再删坟墓。
 *  rename 失败（他人已移走/替换）→ 静默返回，调用方退回循环重试 mkdir。 */
async function reclaimStale(lockDir: string): Promise<void> {
  const grave = `${lockDir}.stale.${process.pid}.${randomBytes(6).toString('hex')}`
  try {
    await rename(lockDir, grave)
  } catch {
    return
  }
  await rm(grave, { recursive: true, force: true }).catch(() => {})
}

/** 持锁期间周期刷新 owner 文件 mtime（unref，不拖住事件循环/进程退出）。 */
function startHeartbeat(lockDir: string): ReturnType<typeof setInterval> {
  const owner = ownerPathFor(lockDir)
  const t = setInterval(() => {
    const now = new Date()
    void utimes(owner, now, now).catch(() => {})
  }, HEARTBEAT_MS)
  if (typeof t.unref === 'function') t.unref() // 对应 daemon timer，不吊住进程/事件循环
  return t
}

async function acquire(lockDir: string): Promise<Held> {
  const token = `${process.pid}.${randomBytes(8).toString('hex')}.${Date.now()}`
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS
  for (;;) {
    let created = false
    try {
      await mkdir(lockDir)
      created = true // 锁目录是本进程建的
      await writeFile(ownerPathFor(lockDir), `${token}\n`, 'utf8')
      return { token, heartbeat: startHeartbeat(lockDir) }
    } catch (err) {
      // mkdir 成功但写 owner 失败（ENOSPC/瞬态 IO，codex review P2）：不能把自己刚建的锁目录留成孤儿
      // ——它没有 owner 文件、mtime 也不会被心跳刷新，后续调用者会当它是活锁空等满 10s 直到 60s 变陈锁。
      // 清掉再抛，让下一个调用者立刻能 mkdir。
      if (created) {
        await rm(lockDir, { recursive: true, force: true }).catch(() => {})
        throw err
      }
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
    // 已被占用：陈锁（owner mtime 超 60s）→ 原子回收后立刻重试；否则轮询等待
    const age = await lockAgeMs(lockDir)
    if (age === null) continue // 锁刚消失，立刻重试 mkdir
    if (age > STALE_LOCK_MS) {
      await reclaimStale(lockDir)
      continue
    }
    if (Date.now() >= deadline) {
      throw new Error(`withLock: acquire timeout after ${ACQUIRE_TIMEOUT_MS}ms: ${lockDir}`)
    }
    await sleep(POLL_MS)
  }
}

async function release(lockDir: string, held: Held): Promise<void> {
  clearInterval(held.heartbeat)
  // 原子归属保留删除（codex review P2）：旧实现"读 owner 确认是我 → rm"有 TOCTOU——读与 rm 之间锁可能
  // 被夺锁 reclaim 且由新持有者重建同名 lockDir → rm 误删新持有者的锁,放第三者进临界区。改为:先原子
  // rename 把 lockDir 移到 token 专属坟墓名（rename 只能移走"此刻那个 inode"）,再核对移走那份的 owner:
  //   · 是自己 → 删（正常释放）;
  //   · 不是（我已被夺锁,移走的是新持有者的锁）→ rename 回去撤销,绝不删新持有者的锁。
  // 常见路径（未冻结/未被夺锁）只多一次同父目录内原子 rename,零风险;仅近零频率的">STALE 冻结被夺锁"
  // 走撤销分支（其间新持有者的心跳 utimes 是 best-effort,微秒级窗口可容）。
  const grave = `${lockDir}.released.${held.token.replace(/[^a-zA-Z0-9]/g, '')}`
  try {
    await rename(lockDir, grave)
  } catch {
    return // lockDir 已不在（被 reclaim/已删）→ 无我可删,幂等空操作
  }
  let owner: string | null = null
  try {
    owner = (await readFile(ownerPathFor(grave), 'utf8')).trim()
  } catch {
    owner = null
  }
  if (owner === held.token) {
    await rm(grave, { recursive: true, force: true }).catch(() => {})
  } else {
    // 移走的是新持有者的锁 → 还回去撤销;若期间第三者又建了 lockDir 则 rename 回失败,grave 成无害孤儿。
    await rename(grave, lockDir).catch(() => {})
  }
}

/** mkdir 原子锁 + 陈锁回收，锁内串行执行 fn；透传 fn 结果，异常时保证释放。 */
export async function withLock<T>(changeDir: string, fn: () => Promise<T>): Promise<T> {
  const lockDir = lockDirFor(changeDir)
  const prev = queues.get(lockDir) ?? Promise.resolve()
  const run = prev.then(async () => {
    const held = await acquire(lockDir)
    try {
      return await fn()
    } finally {
      await release(lockDir, held)
    }
  })
  const settled = run.then(
    () => undefined,
    () => undefined,
  )
  queues.set(lockDir, settled)
  void settled.then(() => {
    if (queues.get(lockDir) === settled) queues.delete(lockDir)
  })
  return run
}
