/**
 * channel fs 注入面 —— 事件日志的磁盘字节层（append-only JSONL + .seq 侧车 + 桶目录 + 文件锁）。
 * 老仓真相源：skills/pipeline/scripts/channel/{events.py 的 _Lock/append fs 面, paths.py ensure_channel_dir}。
 *
 * 纯逻辑（events/seq/worker-state/thread-state）通过此面读写磁盘；真 fs 缺省（nodeChannelFs），
 * mock/测试可注入内存 fake。kernel 零第三方依赖（仅 node:fs / node:os / node:path）。
 */
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs'

export interface ChannelDirent {
  name: string
  isFile: boolean
  isDirectory: boolean
}

export interface ChannelFs {
  /** 当前进程 pid（写进锁文件，死 pid 偷锁用）。 */
  readonly pid: number
  exists(path: string): boolean
  /** 整文件文本（缺失/不可读 → undefined）。 */
  readText(path: string): string | undefined
  writeText(path: string, data: string): void
  appendText(path: string, data: string): void
  mkdirp(path: string): void
  /** 列目录项（缺失/不可读 → []）。 */
  listDir(path: string): ChannelDirent[]
  rename(src: string, dst: string): void
  remove(path: string): void
  /** 文件 mtime 毫秒（缺失 → undefined）。 */
  mtimeMs(path: string): number | undefined
  /** O_CREAT|O_EXCL 原子创建锁文件并写内容；已存在 → false（events.py:_Lock）。 */
  createExclusive(path: string, content: string): boolean
  /** pid 是否存活（os.kill(pid,0) 语义；死 pid → false）。 */
  pidAlive(pid: number): boolean
}

/** 真 node fs 实现（缺省）。 */
export function nodeChannelFs(): ChannelFs {
  return {
    pid: process.pid,
    exists: (p) => existsSync(p),
    readText: (p) => {
      try {
        return readFileSync(p, 'utf8')
      } catch {
        return undefined
      }
    },
    writeText: (p, data) => {
      writeFileSync(p, data, 'utf8')
    },
    appendText: (p, data) => {
      appendFileSync(p, data, 'utf8')
    },
    mkdirp: (p) => {
      mkdirSync(p, { recursive: true, mode: 0o700 })
    },
    listDir: (p) => {
      try {
        return readdirSync(p, { withFileTypes: true }).map((e) => ({
          name: e.name,
          isFile: e.isFile(),
          isDirectory: e.isDirectory(),
        }))
      } catch {
        return []
      }
    },
    rename: (src, dst) => {
      renameSync(src, dst)
    },
    remove: (p) => {
      try {
        rmSync(p, { force: true })
      } catch {
        /* best-effort */
      }
    },
    mtimeMs: (p) => {
      try {
        return statSync(p).mtimeMs
      } catch {
        return undefined
      }
    },
    createExclusive: (p, content) => {
      try {
        const fd = openSync(p, 'wx', 0o600) // wx = O_CREAT|O_EXCL|O_WRONLY
        try {
          writeSync(fd, content)
        } finally {
          closeSync(fd)
        }
        return true
      } catch {
        return false
      }
    },
    pidAlive: (pid) => {
      if (!pid) return false
      try {
        process.kill(pid, 0)
        return true
      } catch (e) {
        // ESRCH → 死；EPERM → 存在但无权（视为活）
        return (e as NodeJS.ErrnoException).code === 'EPERM'
      }
    },
  }
}

/** 同步睡眠 ms（锁重试用；不占 CPU）。 */
function sleepMs(ms: number): void {
  const sab = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(sab, 0, 0, ms)
}

const LOCK_RETRY_MS = 25
const LOCK_TIMEOUT_MS = 5000

/**
 * 文件锁（O_EXCL + 死 pid 偷锁 + 重试，events.py:_Lock 的 TS 等价）。
 * 在锁内跑 fn；覆盖"读幂等→reconcile→写 jsonl→写侧车"整个临界区。
 */
export function withChannelLock<T>(fs: ChannelFs, lockFile: string, fn: () => T): T {
  const holder = String(fs.pid)
  let waited = 0
  for (;;) {
    if (fs.createExclusive(lockFile, holder)) break
    // 偷死锁
    const cur = fs.readText(lockFile)
    if (cur !== undefined) {
      const pid = Number.parseInt(cur.trim(), 10)
      if (Number.isInteger(pid) && !fs.pidAlive(pid)) fs.remove(lockFile)
    }
    if (waited >= LOCK_TIMEOUT_MS) throw new Error(`获取 channel 锁超时: ${lockFile}`)
    sleepMs(LOCK_RETRY_MS)
    waited += LOCK_RETRY_MS
  }
  try {
    return fn()
  } finally {
    const cur = fs.readText(lockFile)
    if (cur !== undefined && cur.trim() === holder) fs.remove(lockFile)
  }
}
