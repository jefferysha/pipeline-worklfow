import { mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { publishSpecScaffoldTransaction } from './specScaffoldTransaction.js'

describe('spec scaffold overwrite 事务', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pipeline-spec-transaction-'))
    await mkdir(join(root, 'docs', 'specs'), { recursive: true })
    await writeFile(join(root, 'docs', 'specs', 'api.md'), 'old\n', 'utf8')
    await writeFile(join(root, 'docs', 'specs', 'unrelated.md'), 'keep\n', 'utf8')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test('提交前故障保留完整旧文件集，成功重试一次性发布完整新集合', async () => {
    await expect(publishSpecScaffoldTransaction({
      repoRoot: root,
      specDirectory: join(root, 'docs', 'specs'),
      files: [
        { relativePath: 'api.md', content: 'new\n' },
        { relativePath: 'guide.md', content: 'guide\n' },
      ],
      beforeCommit: () => {
        throw new Error('injected before commit')
      },
    })).rejects.toThrow(/injected/)

    expect(await readFile(join(root, 'docs', 'specs', 'api.md'), 'utf8')).toBe('old\n')
    expect(await readFile(join(root, 'docs', 'specs', 'unrelated.md'), 'utf8')).toBe('keep\n')
    await expect(readFile(join(root, 'docs', 'specs', 'guide.md'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })

    await publishSpecScaffoldTransaction({
      repoRoot: root,
      specDirectory: join(root, 'docs', 'specs'),
      files: [
        { relativePath: 'api.md', content: 'new\n' },
        { relativePath: 'guide.md', content: 'guide\n' },
      ],
    })

    expect(await readFile(join(root, 'docs', 'specs', 'api.md'), 'utf8')).toBe('new\n')
    expect(await readFile(join(root, 'docs', 'specs', 'guide.md'), 'utf8')).toBe('guide\n')
    expect(await readFile(join(root, 'docs', 'specs', 'unrelated.md'), 'utf8')).toBe('keep\n')
  })

  test('进程在旧目录移走后崩溃，下一次调用先恢复完整候选再执行新事务', async () => {
    const specDirectory = join(root, 'docs', 'specs')
    const stageName = 'specs.pipeline-stage-crashed'
    const backupName = 'specs.pipeline-backup-crashed'
    const stage = join(root, stageName)
    const backup = join(root, backupName)
    await mkdir(stage)
    await writeFile(join(stage, 'api.md'), 'recovered\n', 'utf8')
    await writeFile(join(stage, 'unrelated.md'), 'keep\n', 'utf8')
    await rename(specDirectory, backup)
    const lockKey = createHash('sha256').update(specDirectory).digest('hex').slice(0, 16)
    await writeFile(
      join(root, `.pipeline-spec-transaction-${lockKey}.json`),
      `${JSON.stringify({
        version: 1,
        pid: 99_999_999,
        state: 'prepared',
        stageName,
        backupName,
      })}\n`,
      'utf8',
    )

    await publishSpecScaffoldTransaction({
      repoRoot: root,
      specDirectory,
      files: [{ relativePath: 'api.md', content: 'newest\n' }],
    })

    expect(await readFile(join(specDirectory, 'api.md'), 'utf8')).toBe('newest\n')
    expect(await readFile(join(specDirectory, 'unrelated.md'), 'utf8')).toBe('keep\n')
    await expect(readFile(join(root, `.pipeline-spec-transaction-${lockKey}.json`), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(stage, 'api.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(backup, 'api.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('活跃事务 owner 存在时 fail-closed，不把并发 writer 当作崩溃恢复', async () => {
    const specDirectory = join(root, 'docs', 'specs')
    const lockKey = createHash('sha256').update(specDirectory).digest('hex').slice(0, 16)
    await writeFile(
      join(root, `.pipeline-spec-transaction-${lockKey}.json`),
      `${JSON.stringify({
        version: 1,
        pid: process.pid,
        state: 'preparing',
        stageName: 'specs.pipeline-stage-live',
        backupName: 'specs.pipeline-backup-live',
      })}\n`,
      'utf8',
    )

    await expect(publishSpecScaffoldTransaction({
      repoRoot: root,
      specDirectory,
      files: [{ relativePath: 'api.md', content: 'new\n' }],
    })).rejects.toThrow(/仍在运行|并发/)
    expect(await readFile(join(specDirectory, 'api.md'), 'utf8')).toBe('old\n')
  })

  test('复制后 sibling 出现并发更新时不移动其命名空间，更新保持可见', async () => {
    await mkdir(join(root, 'docs', 'changes', 'live'), { recursive: true })
    await writeFile(join(root, 'docs', 'changes', 'live', 'state.txt'), 'before-copy\n', 'utf8')

    await publishSpecScaffoldTransaction({
      repoRoot: root,
      specDirectory: join(root, 'docs', 'specs'),
      files: [{ relativePath: 'api.md', content: 'new\n' }],
      beforeCommit: async () => {
        await writeFile(
          join(root, 'docs', 'changes', 'live', 'state.txt'),
          'concurrent-after-copy\n',
          'utf8',
        )
      },
    })

    await expect(readFile(join(root, 'docs', 'specs', 'api.md'), 'utf8')).resolves.toBe('new\n')
    await expect(readFile(join(root, 'docs', 'changes', 'live', 'state.txt'), 'utf8'))
      .resolves.toBe('concurrent-after-copy\n')
    expect((await readdir(root)).filter((name) => name.includes('.pipeline-'))).toEqual([])
  })

  test('提交前已打开的 sibling 文件描述符继续写入时更新保持可见', async () => {
    const sibling = join(root, 'docs', 'changes', 'live', 'state.txt')
    await mkdir(join(root, 'docs', 'changes', 'live'), { recursive: true })
    await writeFile(sibling, 'before\n', 'utf8')
    const writer = await open(sibling, 'r+')
    try {
      await publishSpecScaffoldTransaction({
        repoRoot: root,
        specDirectory: join(root, 'docs', 'specs'),
        files: [{ relativePath: 'api.md', content: 'new\n' }],
        afterOriginalMove: async () => {
          await writer.truncate(0)
          await writer.writeFile('concurrent-after-cas\n', 'utf8')
        },
      })
    } finally {
      await writer.close()
    }

    await expect(readFile(join(root, 'docs', 'specs', 'api.md'), 'utf8')).resolves.toBe('new\n')
    await expect(readFile(sibling, 'utf8')).resolves.toBe('concurrent-after-cas\n')
  })

  test('目标规格目录内未受管文件的 open-FD 更新保持可见，原 inode 也保留为恢复证据', async () => {
    const specDirectory = join(root, 'docs', 'specs')
    const sibling = join(specDirectory, 'unrelated.md')
    const writer = await open(sibling, 'r+')
    try {
      await publishSpecScaffoldTransaction({
        repoRoot: root,
        specDirectory,
        files: [{ relativePath: 'api.md', content: 'new\n' }],
        afterOriginalMove: async () => {
          await writer.truncate(0)
          await writer.writeFile('target-internal-concurrent\n', 'utf8')
        },
      })
    } finally {
      await writer.close()
    }

    await expect(readFile(join(specDirectory, 'api.md'), 'utf8')).resolves.toBe('new\n')
    await expect(readFile(sibling, 'utf8')).resolves.toBe('target-internal-concurrent\n')
    const backup = (await readdir(root)).find((name) => name.startsWith('specs.pipeline-backup-'))
    expect(backup).toBeDefined()
    await expect(readFile(join(root, backup!, 'unrelated.md'), 'utf8'))
      .resolves.toBe('target-internal-concurrent\n')
  })

  test('检查后顶层父目录被替换时 fail-loud，保留竞争方目录且不发布旧快照', async () => {
    await expect(publishSpecScaffoldTransaction({
      repoRoot: root,
      specDirectory: join(root, 'docs', 'specs'),
      files: [
        { relativePath: 'api.md', content: 'new\n' },
        { relativePath: 'guide.md', content: 'guide\n' },
      ],
      beforeCommit: async () => {
        await rename(join(root, 'docs'), join(root, 'docs-raced-original'))
        await mkdir(join(root, 'docs'))
        await writeFile(join(root, 'docs', 'raced.txt'), 'replacement-wins\n', 'utf8')
      },
    })).rejects.toThrow(/身份漂移/)

    await expect(readFile(join(root, 'docs', 'raced.txt'), 'utf8')).resolves.toBe('replacement-wins\n')
    await expect(readFile(join(root, 'docs-raced-original', 'specs', 'api.md'), 'utf8')).resolves.toBe('old\n')
    await expect(readFile(join(root, 'docs', 'specs', 'api.md'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readdir(root)).filter((name) => name.includes('.pipeline-'))).toEqual([])
  })

  test('旧 envelope 移走后 promotion 故障会恢复完整旧目录', async () => {
    await expect(publishSpecScaffoldTransaction({
      repoRoot: root,
      specDirectory: join(root, 'docs', 'specs'),
      files: [{ relativePath: 'api.md', content: 'new\n' }],
      afterOriginalMove: () => {
        throw new Error('injected after original move')
      },
    })).rejects.toThrow(/injected/)

    await expect(readFile(join(root, 'docs', 'specs', 'api.md'), 'utf8')).resolves.toBe('old\n')
    await expect(readFile(join(root, 'docs', 'specs', 'unrelated.md'), 'utf8')).resolves.toBe('keep\n')
    expect((await readdir(root)).filter((name) => name.includes('.pipeline-'))).toEqual([])
  })

  test('旧 envelope 移走后正式路径被占用时 fail-closed 并保留可恢复事务', async () => {
    await expect(publishSpecScaffoldTransaction({
      repoRoot: root,
      specDirectory: join(root, 'docs', 'specs'),
      files: [{ relativePath: 'api.md', content: 'new\n' }],
      afterOriginalMove: async () => {
        await mkdir(join(root, 'docs', 'specs'))
        await writeFile(join(root, 'docs', 'specs', 'raced.txt'), 'do-not-overwrite\n', 'utf8')
        throw new Error('injected occupied rollback')
      },
    })).rejects.toThrow(/事务证据已保留/)

    await expect(readFile(join(root, 'docs', 'specs', 'raced.txt'), 'utf8')).resolves.toBe('do-not-overwrite\n')
    const rootEntries = await readdir(root)
    expect(rootEntries.some((name) => name.startsWith('.pipeline-spec-transaction-'))).toBe(true)
    expect(rootEntries.some((name) => name.startsWith('specs.pipeline-stage-'))).toBe(true)
    expect(rootEntries.some((name) => name.startsWith('specs.pipeline-backup-'))).toBe(true)
  })
})
