/**
 * mem fs 注入面 —— 只读外部会话目录（绝不写用户 session 历史）。
 * 纯逻辑通过此面读磁盘字节；真 fs 缺省（nodeMemFs），mock/测试注入 fake 树。
 * 对位老仓 skills/pipeline/scripts/mem/adapters/internal/{jsonl,paths}.py 的 os 调用面。
 */
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'

export interface MemDirent {
  name: string
  isFile: boolean
  isDirectory: boolean
}

/** A text read whose byte ceiling was enforced before bytes entered memory. */
export interface BoundedTextRead {
  text: string
  bytesRead: number
  truncated: boolean
}

/**
 * Request-local content budget for storage adapters that do not read text files (currently OpenCode
 * SQLite). It keeps their row reads inside the same aggregate budget as readTextBounded.
 */
export interface MemContentReadBudget {
  readonly perSourceBytes: number
  remainingBytes(): number
  consume(bytes: number): void
  noteSourceTruncated(): void
  noteTotalExhausted(): void
}

export interface MemFs {
  /** 用户 home（CLAUDE_PROJECTS/CODEX_SESSIONS/PI 根的锚）；测试注入 fake home */
  readonly home: string
  /** 路径存在（文件或目录） */
  exists(path: string): boolean
  /** 列目录项（缺失/不可读 → []，对齐老仓 os.scandir 静默跳过） */
  readDir(path: string): MemDirent[]
  /** 整文件文本（缺失/不可读 → undefined）；JSONL 逐行解析在纯逻辑层 */
  readText(path: string): string | undefined
  /**
   * 最多读取 maxBytes 个原始字节（缺失/不可读 → undefined）。
   * 可选以保持既有注入 fake 兼容；生产 nodeMemFs 始终提供真正的读取层上限。
   */
  readTextBounded?(path: string, maxBytes: number): BoundedTextRead | undefined
  /** Optional request budget consumed by non-text storage adapters. */
  contentReadBudget?: MemContentReadBudget
  /** 文件 mtime 毫秒（缺失 → undefined），作 updated 时间源 */
  mtimeMs(path: string): number | undefined
  /** 进程环境变量（Pi 自定义会话目录用；fake 可省 → undefined） */
  env?(name: string): string | undefined
}

/** 真 node fs 实现（缺省）。homeOverride 供集成测试指向 fixture home 根。 */
export function nodeMemFs(homeOverride?: string): MemFs {
  const home = homeOverride ?? homedir()
  return {
    home,
    exists: (p) => existsSync(p),
    readDir: (p) => {
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
    readText: (p) => {
      try {
        return readFileSync(p, 'utf8')
      } catch {
        return undefined
      }
    },
    readTextBounded: (p, maxBytes) => {
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) return undefined
      let fd: number | undefined
      try {
        fd = openSync(p, 'r')
        const size = fstatSync(fd).size
        const buffer = Buffer.allocUnsafe(Math.min(size, maxBytes))
        let bytesRead = 0
        while (bytesRead < buffer.byteLength) {
          const count = readSync(fd, buffer, bytesRead, buffer.byteLength - bytesRead, bytesRead)
          if (count === 0) break
          bytesRead += count
        }
        return {
          text: buffer.subarray(0, bytesRead).toString('utf8'),
          bytesRead,
          truncated: size > bytesRead,
        }
      } catch {
        return undefined
      } finally {
        if (fd !== undefined) {
          try {
            closeSync(fd)
          } catch {
            /* best-effort close after a failed read */
          }
        }
      }
    },
    mtimeMs: (p) => {
      try {
        return statSync(p).mtimeMs
      } catch {
        return undefined
      }
    },
    env: (name) => process.env[name],
  }
}

/** mtime 毫秒 → ISO Z 字符串（老仓 _mtime_iso 的 TS 等价，作 updated 值）。 */
export function mtimeIso(fs: MemFs, path: string): string | undefined {
  const ms = fs.mtimeMs(path)
  return ms === undefined ? undefined : new Date(ms).toISOString()
}
