import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { applyFileCas } from './spec-migration-cas.mjs'

function digest(content) {
  return createHash('sha256').update(content).digest('hex')
}

test('migration CAS 拒绝锁内检查后的并发漂移且保留竞争方内容', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-cas-'))
  const target = join(root, 'spec.md')
  const recoveryDirectory = join(root, 'recovery')
  await writeFile(target, 'observed\n', 'utf8')
  try {
    await assert.rejects(
      applyFileCas({
        repoRoot: root,
        targetPath: target,
        recoveryDirectory,
        observedDigest: digest('observed\n'),
        expectedBytes: Buffer.from('expected\n'),
        expectedDigest: digest('expected\n'),
        beforeCommit: async () => {
          await writeFile(target, 'concurrent\n', 'utf8')
        },
      }),
      /并发漂移/,
    )
    assert.equal(await readFile(target, 'utf8'), 'concurrent\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('migration CAS 第一次 changed、重复执行 no-op，并返回结构化摘要', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-cas-'))
  const target = join(root, 'spec.md')
  const recoveryDirectory = join(root, 'recovery')
  await writeFile(target, 'observed\n', 'utf8')
  const options = {
    repoRoot: root,
    targetPath: target,
    recoveryDirectory,
    observedDigest: digest('observed\n'),
    expectedBytes: Buffer.from('expected\n'),
    expectedDigest: digest('expected\n'),
  }
  try {
    const changed = await applyFileCas(options)
    assert.equal(changed.effect, 'changed')
    assert.equal(changed.beforeDigest, digest('observed\n'))
    assert.equal(changed.afterDigest, digest('expected\n'))
    assert.match(changed.recoveryPath, /^recovery\/original-/)
    assert.equal(await readFile(join(root, changed.recoveryPath), 'utf8'), 'observed\n')
    assert.deepEqual(await applyFileCas(options), {
      effect: 'no-op',
      beforeDigest: digest('expected\n'),
      afterDigest: digest('expected\n'),
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('migration CAS 的无覆盖发布拒绝 original move 后抢占并保留竞争内容和原始 inode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-cas-'))
  const target = join(root, 'spec.md')
  const recoveryDirectory = join(root, 'recovery')
  await writeFile(target, 'observed\n', 'utf8')
  try {
    await assert.rejects(applyFileCas({
      repoRoot: root,
      targetPath: target,
      recoveryDirectory,
      observedDigest: digest('observed\n'),
      expectedBytes: Buffer.from('expected\n'),
      expectedDigest: digest('expected\n'),
      afterOriginalMove: () => writeFile(target, 'concurrent\n', 'utf8'),
    }), /竞争方占用正式路径/)
    assert.equal(await readFile(target, 'utf8'), 'concurrent\n')
    const recoveryFiles = (await readdir(recoveryDirectory))
      .filter((name) => name.startsWith('original-'))
    assert.equal(recoveryFiles.length, 1)
    assert.equal(await readFile(join(recoveryDirectory, recoveryFiles[0]), 'utf8'), 'observed\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('migration CAS 在最后内容检查与 rename 之间拒绝同 inode 写入并保留稳定 observed 快照', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-cas-'))
  const target = join(root, 'spec.md')
  const recoveryDirectory = join(root, 'recovery')
  await writeFile(target, 'observed\n', 'utf8')
  try {
    await assert.rejects(applyFileCas({
      repoRoot: root,
      targetPath: target,
      recoveryDirectory,
      observedDigest: digest('observed\n'),
      expectedBytes: Buffer.from('expected\n'),
      expectedDigest: digest('expected\n'),
      beforeOriginalMove: () => writeFile(target, 'concurrent\n', 'utf8'),
    }), /并发漂移/)
    assert.equal(await readFile(target, 'utf8'), 'concurrent\n')
    const recoveryFiles = (await readdir(recoveryDirectory))
      .filter((name) => name.startsWith('original-'))
    assert.equal(recoveryFiles.length, 1)
    assert.equal(await readFile(join(recoveryDirectory, recoveryFiles[0]), 'utf8'), 'observed\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('migration CAS 拒绝仓库内 symlink 父路径且不写仓库外', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-cas-'))
  const outside = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-outside-'))
  await mkdir(join(root, 'openspec'))
  await symlink(outside, join(root, 'openspec', 'specs'))
  const target = join(root, 'openspec', 'specs', 'capability', 'spec.md')
  try {
    await assert.rejects(applyFileCas({
      repoRoot: root,
      targetPath: target,
      recoveryDirectory: join(root, 'recovery'),
      observedDigest: digest('observed\n'),
      expectedBytes: Buffer.from('expected\n'),
      expectedDigest: digest('expected\n'),
    }), /非 symlink 目录/)
    assert.deepEqual(await readdir(outside), [])
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('migration CAS 拒绝锁内父目录换成仓库外 symlink，即使外部文件摘要相同也不触碰外部内容', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-cas-'))
  const outside = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-outside-'))
  const parent = join(root, 'openspec', 'specs', 'capability')
  const detachedParent = join(root, 'openspec', 'specs', 'capability.detached')
  const target = join(parent, 'spec.md')
  const outsideTarget = join(outside, 'spec.md')
  const recoveryDirectory = join(root, 'recovery')
  await mkdir(parent, { recursive: true })
  await writeFile(target, 'observed\n', 'utf8')
  await writeFile(outsideTarget, 'observed\n', 'utf8')
  try {
    await assert.rejects(applyFileCas({
      repoRoot: root,
      targetPath: target,
      recoveryDirectory,
      observedDigest: digest('observed\n'),
      expectedBytes: Buffer.from('expected\n'),
      expectedDigest: digest('expected\n'),
      beforeCommit: async () => {
        await rename(parent, detachedParent)
        await symlink(outside, parent, 'dir')
      },
    }), /目录身份已变化/)
    assert.equal(await readFile(outsideTarget, 'utf8'), 'observed\n')
    assert.equal(await readFile(join(detachedParent, 'spec.md'), 'utf8'), 'observed\n')
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('migration CAS 在原文件移入恢复区后检测父目录漂移，保留原始恢复证据且不写仓库外', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-cas-'))
  const outside = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-outside-'))
  const parent = join(root, 'openspec', 'specs', 'capability')
  const detachedParent = join(root, 'openspec', 'specs', 'capability.detached')
  const target = join(parent, 'spec.md')
  const outsideTarget = join(outside, 'spec.md')
  const recoveryDirectory = join(root, 'recovery')
  await mkdir(parent, { recursive: true })
  await writeFile(target, 'observed\n', 'utf8')
  await writeFile(outsideTarget, 'outside\n', 'utf8')
  try {
    await assert.rejects(applyFileCas({
      repoRoot: root,
      targetPath: target,
      recoveryDirectory,
      observedDigest: digest('observed\n'),
      expectedBytes: Buffer.from('expected\n'),
      expectedDigest: digest('expected\n'),
      afterOriginalMove: async () => {
        await rename(parent, detachedParent)
        await symlink(outside, parent, 'dir')
      },
    }), /目录身份已变化/)
    assert.equal(await readFile(outsideTarget, 'utf8'), 'outside\n')
    const recoveryFiles = (await readdir(recoveryDirectory))
      .filter((name) => name.startsWith('original-'))
    assert.equal(recoveryFiles.length, 1)
    assert.equal(await readFile(join(recoveryDirectory, recoveryFiles[0]), 'utf8'), 'observed\n')
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('migration CAS 在最后一次目录检查与 linkat 发布之间换成仓库外 symlink 仍零外部写入', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-cas-'))
  const outside = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-outside-'))
  const parent = join(root, 'openspec', 'specs', 'capability')
  const detachedParent = join(root, 'openspec', 'specs', 'capability.detached')
  const target = join(parent, 'spec.md')
  const outsideTarget = join(outside, 'spec.md')
  const recoveryDirectory = join(root, 'recovery')
  await mkdir(parent, { recursive: true })
  await writeFile(target, 'observed\n', 'utf8')
  await writeFile(outsideTarget, 'outside\n', 'utf8')
  try {
    await assert.rejects(applyFileCas({
      repoRoot: root,
      targetPath: target,
      recoveryDirectory,
      observedDigest: digest('observed\n'),
      expectedBytes: Buffer.from('expected\n'),
      expectedDigest: digest('expected\n'),
      beforePublish: async () => {
        await rename(parent, detachedParent)
        await symlink(outside, parent, 'dir')
      },
    }), /目录身份已变化/)
    assert.equal(await readFile(outsideTarget, 'utf8'), 'outside\n')
    assert.equal(await readFile(join(detachedParent, 'spec.md'), 'utf8'), 'expected\n')
    const recoveryFiles = (await readdir(recoveryDirectory))
      .filter((name) => name.startsWith('original-'))
    assert.equal(recoveryFiles.length, 1)
    assert.equal(await readFile(join(recoveryDirectory, recoveryFiles[0]), 'utf8'), 'observed\n')
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('migration CAS 不自动抢占已有 owner 锁', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-cas-'))
  const target = join(root, 'spec.md')
  const recoveryDirectory = join(root, 'recovery')
  await writeFile(target, 'observed\n', 'utf8')
  await mkdir(recoveryDirectory)
  await writeFile(join(recoveryDirectory, 'spec-application.lock'), '{"token":"another-owner"}\n')
  try {
    await assert.rejects(applyFileCas({
      repoRoot: root,
      targetPath: target,
      recoveryDirectory,
      observedDigest: digest('observed\n'),
      expectedBytes: Buffer.from('expected\n'),
      expectedDigest: digest('expected\n'),
    }), /拒绝自动抢占/)
    assert.equal(
      await readFile(join(recoveryDirectory, 'spec-application.lock'), 'utf8'),
      '{"token":"another-owner"}\n',
    )
    assert.equal(await readFile(target, 'utf8'), 'observed\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('migration CAS 释放 owner lock 前按 inode 校验并保留竞争方替换的新锁', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-cas-'))
  const target = join(root, 'spec.md')
  const recoveryDirectory = join(root, 'recovery')
  const lockPath = join(recoveryDirectory, 'spec-application.lock')
  await writeFile(target, 'observed\n', 'utf8')
  try {
    await assert.rejects(applyFileCas({
      repoRoot: root,
      targetPath: target,
      recoveryDirectory,
      observedDigest: digest('observed\n'),
      expectedBytes: Buffer.from('expected\n'),
      expectedDigest: digest('expected\n'),
      beforeCommit: async () => {
        await unlink(lockPath)
        await writeFile(lockPath, 'competitor-owner\n', { flag: 'wx' })
      },
    }), /owner lock identity changed/)
    assert.equal(await readFile(lockPath, 'utf8'), 'competitor-owner\n')
    assert.equal(await readFile(target, 'utf8'), 'observed\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
