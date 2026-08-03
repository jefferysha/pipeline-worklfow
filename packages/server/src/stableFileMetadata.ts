import type { BigIntStats } from 'node:fs'

export interface StableFileVersion {
  readonly dev: bigint
  readonly ino: bigint
  readonly size: bigint
  readonly mtimeNs: bigint
  readonly ctimeNs: bigint
}

/** Capture the inode identity and mutation clocks needed to fence a bounded fd read. */
export function captureStableFileVersion(stat: BigIntStats): StableFileVersion {
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  }
}

/** Reject replacement, growth, truncation, and same-size in-place overwrite races. */
export function matchesStableFileVersion(
  stat: BigIntStats,
  expected: StableFileVersion,
): boolean {
  return stat.isFile()
    && stat.dev === expected.dev
    && stat.ino === expected.ino
    && stat.size === expected.size
    && stat.mtimeNs === expected.mtimeNs
    && stat.ctimeNs === expected.ctimeNs
}
