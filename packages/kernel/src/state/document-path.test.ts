import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBoundedRegularFile, readOptionalBoundedRegularTextFile } from './document-path.js'

describe('bounded regular file identity fence', () => {
  it('rejects a same-inode same-size mutation during the read window', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tenon-bounded-file-race-'))
    const path = join(dir, 'current.json')
    const before = Buffer.from('{"value":"before"}\n')
    const after = Buffer.from('{"value":"after!"}\n')
    expect(after.byteLength).toBe(before.byteLength)
    await writeFile(path, before)
    try {
      await expect(readBoundedRegularFile(path, 1024, 'TaskPlan state file', async () => {
        await writeFile(path, after)
        return before
      })).rejects.toThrow(/读取期间变化/u)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects invalid UTF-8 instead of materializing replacement characters', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tenon-bounded-text-'))
    const path = join(dir, 'tasks.md')
    await writeFile(path, Buffer.from([0xc3, 0x28]))
    try {
      await expect(readOptionalBoundedRegularTextFile(path, 1024, 'TaskPlan tasks projection'))
        .rejects.toThrow(/UTF-8/u)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
