import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBoundedRegularFile } from './document-path.js'

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
})
