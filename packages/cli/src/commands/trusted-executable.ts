import { createHash } from 'node:crypto'
import { accessSync, constants as fsConstants, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, parse } from 'node:path'
import type { TrustedExecutableProof, TrustedPathProof } from '../runtime/types.js'

interface FrozenFileIdentity {
  readonly path: string
  readonly dev: number
  readonly ino: number
  readonly mode: number
  readonly uid: number
  readonly size: number
  readonly ctimeMs: number
  readonly mtimeMs: number
}

export interface TrustedExecutable {
  /** Canonical ordinary file path used for every spawn. */
  readonly executable: string
  /** Original PATH candidate; a later symlink retarget is also treated as identity drift. */
  readonly requestedPath: string
  /** Serializable identity consumed by stable launchers after the installer process exits. */
  readonly proof: TrustedExecutableProof
  verify(): boolean
  assert(): void
}

function pathProof(value: FrozenFileIdentity): TrustedPathProof {
  return {
    path: value.path,
    dev: value.dev,
    ino: value.ino,
    mode: value.mode,
    uid: value.uid,
    size: value.size,
  }
}

function identity(path: string): FrozenFileIdentity | undefined {
  try {
    const info = lstatSync(path)
    if (!info.isFile() || info.isSymbolicLink()) return undefined
    return {
      path,
      dev: info.dev,
      ino: info.ino,
      mode: info.mode,
      uid: info.uid,
      size: info.size,
      ctimeMs: info.ctimeMs,
      mtimeMs: info.mtimeMs,
    }
  } catch {
    return undefined
  }
}

function sameIdentity(
  left: FrozenFileIdentity,
  right: FrozenFileIdentity | undefined,
  includeChangeIdentity = false,
): boolean {
  return right !== undefined
    && left.path === right.path
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.uid === right.uid
    && (!includeChangeIdentity || (
      left.size === right.size
      && left.ctimeMs === right.ctimeMs
      && left.mtimeMs === right.mtimeMs
    ))
}

function parentChain(
  path: string,
  executableOwner: number,
  platform: NodeJS.Platform,
): readonly FrozenFileIdentity[] | undefined {
  const root = parse(path).root
  const result: FrozenFileIdentity[] = []
  let cursor = dirname(path)
  while (true) {
    let info
    try {
      info = lstatSync(cursor)
    } catch {
      return undefined
    }
    const otherWritable = platform !== 'win32' && (info.mode & 0o002) !== 0
    const groupWritableByAnotherOwner = platform !== 'win32'
      && (info.mode & 0o020) !== 0
      && info.uid !== executableOwner
    const sticky = platform !== 'win32' && (info.mode & 0o1000) !== 0
    if (!info.isDirectory() || info.isSymbolicLink()
      || ((otherWritable || groupWritableByAnotherOwner) && !sticky)) return undefined
    result.push({
      path: cursor,
      dev: info.dev,
      ino: info.ino,
      mode: info.mode,
      uid: info.uid,
      size: info.size,
      ctimeMs: info.ctimeMs,
      mtimeMs: info.mtimeMs,
    })
    if (cursor === root) return result
    const parent = dirname(cursor)
    if (parent === cursor) return result
    cursor = parent
  }
}

/**
 * Resolve one absolute PATH candidate to an executable ordinary file and bind its physical
 * identity. The returned verifier is intentionally synchronous so it can run immediately before
 * execFileSync/spawn planning without opening an async TOCTOU window in the caller.
 */
export function freezeTrustedExecutable(
  requestedPath: string,
  platform: NodeJS.Platform = process.platform,
): TrustedExecutable | undefined {
  if (!isAbsolute(requestedPath)) return undefined
  let executable: string
  try {
    executable = realpathSync(requestedPath)
    accessSync(executable, fsConstants.X_OK)
  } catch {
    return undefined
  }
  const executableIdentity = identity(executable)
  const currentUid = typeof process.getuid === 'function' ? process.getuid() : executableIdentity?.uid
  if (platform !== 'win32'
    && executableIdentity !== undefined
    && ((executableIdentity.mode & 0o022) !== 0
      || (executableIdentity.uid !== 0 && executableIdentity.uid !== currentUid))) return undefined
  const parents = executableIdentity === undefined
    ? undefined
    : parentChain(executable, executableIdentity.uid, platform)
  if (executableIdentity === undefined || parents === undefined) return undefined

  const verify = (): boolean => {
    try {
      if (realpathSync(requestedPath) !== executable) return false
      accessSync(executable, fsConstants.X_OK)
    } catch {
      return false
    }
    if (!sameIdentity(executableIdentity, identity(executable), true)) return false
    const currentParents = parentChain(executable, executableIdentity.uid, platform)
    return currentParents !== undefined
      && currentParents.length === parents.length
      && parents.every((parent, index) => sameIdentity(parent, currentParents[index]))
  }

  return {
    executable,
    requestedPath,
    proof: {
      version: 1,
      platform,
      requestedPath: executable,
      executable: pathProof(executableIdentity),
      parents: parents.map(pathProof),
      sha256: createHash('sha256').update(readFileSync(executable)).digest('hex'),
    },
    verify,
    assert: () => {
      if (!verify()) throw new Error(`可信可执行文件身份已漂移: ${executable}`)
    },
  }
}
