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
  /** Exact source bytes when the provider can expose them, preserving UTF-8 across ranged reads. */
  rawBytes?: Uint8Array
}

/** Directory read that distinguishes a successful empty directory from an unavailable source. */
export interface CheckedDirectoryRead {
  entries: MemDirent[]
  unavailable: boolean
}

/**
 * Request-local content budget for storage adapters that do not read text files (currently OpenCode
 * SQLite). It keeps their row reads inside the same aggregate budget as readTextBounded.
 */
export interface MemContentReadBudget {
  readonly perSourceBytes: number
  remainingBytes(): number
  consume(bytes: number): void
  noteSourceUnavailable(source: string): void
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
  /** 可选的诚实目录读取状态；Related Sessions 用它区分空目录与读取失败。 */
  readDirChecked?(path: string): CheckedDirectoryRead
  /** 整文件文本（缺失/不可读 → undefined）；JSONL 逐行解析在纯逻辑层 */
  readText(path: string): string | undefined
  /**
   * 最多读取 maxBytes 个原始字节（缺失/不可读 → undefined）。
   * 可选以保持既有注入 fake 兼容；生产 nodeMemFs 始终提供真正的读取层上限。
   */
  readTextBounded?(path: string, maxBytes: number): BoundedTextRead | undefined
  /** 从 byte offset 开始的有界读取；生产 Related Sessions 用它避免 metadata 被重复计费。 */
  readTextRangeBounded?(path: string, offset: number, maxBytes: number): BoundedTextRead | undefined
  /** Optional request budget consumed by non-text storage adapters. */
  contentReadBudget?: MemContentReadBudget
  /** 文件 mtime 毫秒（缺失 → undefined），作 updated 时间源 */
  mtimeMs(path: string): number | undefined
  /** 进程环境变量（Pi 自定义会话目录用；fake 可省 → undefined） */
  env?(name: string): string | undefined
}

/** Enough for the first JSONL event while keeping foreign-project discovery inside the aggregate budget. */
export const MEM_SESSION_METADATA_BYTES = 8 * 1024

export interface MemSessionMetadataRead {
  text: string | undefined
  truncated: boolean
}

/**
 * Related search discovers project identity from a bounded first-event prefix before admitting a
 * session for full dialogue reads. Ordinary CLI callers retain the existing full-read behavior.
 */
export function readMemSessionMetadataChecked(fs: MemFs, path: string): MemSessionMetadataRead {
  if (fs.contentReadBudget && fs.readTextBounded) {
    const read = fs.readTextBounded(path, MEM_SESSION_METADATA_BYTES)
    return { text: read?.text, truncated: read?.truncated === true }
  }
  return { text: fs.readText(path), truncated: false }
}

export function readMemSessionMetadata(fs: MemFs, path: string): string | undefined {
  return readMemSessionMetadataChecked(fs, path).text
}

/** 真 node fs 实现（缺省）。homeOverride 供集成测试指向 fixture home 根。 */
export function nodeMemFs(homeOverride?: string): MemFs {
  const home = homeOverride ?? homedir()
  const readDirectory = (p: string): CheckedDirectoryRead => {
    try {
      return {
        entries: readdirSync(p, { withFileTypes: true }).map((e) => ({
          name: e.name,
          isFile: e.isFile(),
          isDirectory: e.isDirectory(),
        })),
        unavailable: false,
      }
    } catch {
      return { entries: [], unavailable: true }
    }
  }
  const readTextRange = (p: string, offset: number, maxBytes: number): BoundedTextRead | undefined => {
    if (
      !Number.isSafeInteger(offset)
      || offset < 0
      || !Number.isSafeInteger(maxBytes)
      || maxBytes < 0
    ) return undefined
    let fd: number | undefined
    try {
      fd = openSync(p, 'r')
      const size = fstatSync(fd).size
      const available = Math.max(0, size - offset)
      const buffer = Buffer.allocUnsafe(Math.min(available, maxBytes))
      let bytesRead = 0
      while (bytesRead < buffer.byteLength) {
        const count = readSync(fd, buffer, bytesRead, buffer.byteLength - bytesRead, offset + bytesRead)
        if (count === 0) break
        bytesRead += count
      }
      const finalSize = fstatSync(fd).size
      const rawBytes = buffer.subarray(0, bytesRead)
      return {
        text: rawBytes.toString('utf8'),
        bytesRead,
        truncated: finalSize > offset + bytesRead,
        rawBytes,
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
  }
  return {
    home,
    exists: (p) => existsSync(p),
    readDir: (p) => readDirectory(p).entries,
    readDirChecked: readDirectory,
    readText: (p) => {
      try {
        return readFileSync(p, 'utf8')
      } catch {
        return undefined
      }
    },
    readTextBounded: (p, maxBytes) => readTextRange(p, 0, maxBytes),
    readTextRangeBounded: readTextRange,
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
