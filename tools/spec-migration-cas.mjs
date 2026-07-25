import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  constants,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

function digest(content) {
  return createHash('sha256').update(content).digest('hex')
}

function errorCode(error) {
  return typeof error === 'object' && error !== null && typeof error.code === 'string'
    ? error.code
    : undefined
}

function escaped(root, target) {
  const rel = relative(root, target)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

async function requireOrdinaryDirectory(target) {
  const info = await lstat(target)
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`migration CAS 可信路径必须是非 symlink 目录: ${target}`)
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino
}

async function captureDirectoryIdentity(target) {
  await requireOrdinaryDirectory(target)
  const [info, canonicalPath] = await Promise.all([lstat(target), realpath(target)])
  return { dev: info.dev, ino: info.ino, canonicalPath }
}

async function assertDirectoryIdentity(target, expected) {
  let current
  try {
    current = await captureDirectoryIdentity(target)
  } catch (error) {
    throw new Error(`migration CAS 目录身份已变化: ${target}`, { cause: error })
  }
  if (!sameIdentity(current, expected) || current.canonicalPath !== expected.canonicalPath) {
    throw new Error(`migration CAS 目录身份已变化: ${target}`)
  }
}

async function requireOrdinaryFile(target) {
  const info = await lstat(target)
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`migration CAS 目标必须是非 symlink 普通文件: ${target}`)
  }
  return info
}

async function readOrdinaryFileSnapshot(target, expectedIdentity) {
  const pathInfo = await requireOrdinaryFile(target)
  const handle = await open(target, 'r')
  try {
    const handleInfo = await handle.stat()
    if (!handleInfo.isFile()
      || !sameIdentity(pathInfo, handleInfo)
      || (expectedIdentity !== undefined && !sameIdentity(handleInfo, expectedIdentity))) {
      throw new Error(`migration CAS 目标文件身份已变化: ${target}`)
    }
    return {
      bytes: await handle.readFile(),
      identity: { dev: handleInfo.dev, ino: handleInfo.ino },
    }
  } finally {
    await handle.close()
  }
}

async function ensureTrustedDirectory(repoRoot, targetDirectory) {
  const root = resolve(repoRoot)
  const target = resolve(targetDirectory)
  if (escaped(root, target)) throw new Error(`migration CAS 路径越过项目根: ${target}`)
  await requireOrdinaryDirectory(root)
  let cursor = root
  for (const segment of relative(root, target).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment)
    try {
      await requireOrdinaryDirectory(cursor)
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error
      try {
        await mkdir(cursor)
      } catch (mkdirError) {
        if (errorCode(mkdirError) !== 'EEXIST') throw mkdirError
      }
      await requireOrdinaryDirectory(cursor)
    }
  }
  const [rootReal, targetReal] = await Promise.all([realpath(root), realpath(target)])
  if (escaped(rootReal, targetReal)) {
    throw new Error(`migration CAS 真实路径越过项目根: ${target}`)
  }
  return target
}

function identityArguments(identity) {
  return [String(identity.dev), String(identity.ino)]
}

async function compileHelper(directory) {
  const source = fileURLToPath(new URL('./spec-migration-cas-helper.c', import.meta.url))
  const output = join(directory, 'spec-migration-cas-helper')
  const compiler = '/usr/bin/cc'
  const child = spawn(compiler, [
    '-std=c11',
    '-O2',
    '-Wall',
    '-Wextra',
    '-Werror',
    source,
    '-o',
    output,
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  const stdout = []
  const stderr = []
  child.stdout.on('data', (chunk) => stdout.push(chunk))
  child.stderr.on('data', (chunk) => stderr.push(chunk))
  const code = await new Promise((resolveCode, reject) => {
    child.once('error', reject)
    child.once('close', resolveCode)
  })
  if (code !== 0) {
    throw new Error(
      `migration CAS 原生 helper 编译失败（安全边界不降级）: `
      + `${Buffer.concat(stderr).toString('utf8') || Buffer.concat(stdout).toString('utf8')}`,
    )
  }
  return output
}

async function runAnchoredCas({
  helper,
  rootHandle,
  expectedHandle,
  observedHandle,
  targetParentRelative,
  recoveryRelative,
  targetName,
  temporaryName,
  snapshotName,
  quarantineName,
  rootIdentity,
  parentIdentity,
  recoveryIdentity,
  targetIdentity,
  beforeCommit,
  beforeOriginalMove,
  afterOriginalMove,
  beforePublish,
}) {
  const child = spawn(helper, [
    targetParentRelative,
    recoveryRelative,
    targetName,
    temporaryName,
    snapshotName,
    quarantineName,
    ...identityArguments(rootIdentity),
    ...identityArguments(parentIdentity),
    ...identityArguments(recoveryIdentity),
    ...identityArguments(targetIdentity),
  ], {
    stdio: [
      'pipe',
      'pipe',
      'pipe',
      rootHandle.fd,
      expectedHandle.fd,
      observedHandle.fd,
    ],
  })
  const stderr = []
  child.stderr.on('data', (chunk) => stderr.push(chunk))
  let controllerError
  let result
  const nativeError = (message) => {
    if (message.includes('target content drifted') || message.includes('target file identity changed')) {
      return new Error(`migration CAS 提交前检测到并发漂移: ${message}`)
    }
    if (message.includes('target path occupied')) {
      return new Error(`migration CAS 发布窗口检测到竞争方占用正式路径，已保留双方内容: ${message}`)
    }
    if (message.includes('owner lock already exists')) {
      return new Error(`migration CAS 已有 owner 锁；拒绝自动抢占: ${message}`)
    }
    if (
      message.includes('directory')
      || message.includes('target parent')
      || message.includes('repository root')
    ) {
      return new Error(`migration CAS 目录身份已变化: ${message}`)
    }
    return new Error(`migration CAS 原生事务拒绝提交: ${message}`)
  }
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  for await (const line of lines) {
    if (line === 'READY') {
      try {
        await beforeCommit?.()
        child.stdin.write('CONTINUE\n')
      } catch (error) {
        controllerError = error
        child.stdin.write('ABORT\n')
      }
    } else if (line === 'MOVING') {
      try {
        await beforeOriginalMove?.()
        child.stdin.write('CONTINUE\n')
      } catch (error) {
        controllerError = error
        child.stdin.write('ABORT\n')
      }
    } else if (line === 'MOVED') {
      try {
        await afterOriginalMove?.()
        child.stdin.write('CONTINUE\n')
      } catch (error) {
        controllerError = error
        child.stdin.write('ABORT\n')
      }
    } else if (line === 'PUBLISHING') {
      try {
        await beforePublish?.()
        child.stdin.write('CONTINUE\n')
      } catch (error) {
        controllerError = error
        child.stdin.write('ABORT\n')
      }
    } else if (line.startsWith('RESULT ')) {
      result = line.slice('RESULT '.length)
    } else if (line.startsWith('ERROR ')) {
      controllerError ??= nativeError(line.slice('ERROR '.length))
    }
  }
  const code = await new Promise((resolveCode, reject) => {
    child.once('error', reject)
    child.once('close', resolveCode)
  })
  if (controllerError !== undefined) throw controllerError
  if (code !== 0 || (result !== 'changed' && result !== 'no-op')) {
    throw new Error(
      `migration CAS 原生事务失败（安全边界不降级）: `
      + `${Buffer.concat(stderr).toString('utf8') || `exit=${code}`}`,
    )
  }
  return result
}

export async function applyFileCas({
  repoRoot,
  targetPath,
  recoveryDirectory,
  observedDigest,
  expectedBytes,
  expectedDigest,
  beforeCommit,
  beforeOriginalMove,
  afterOriginalMove,
  beforePublish,
}) {
  if (!Buffer.isBuffer(expectedBytes)) {
    throw new TypeError('migration CAS expectedBytes 必须是 Buffer')
  }
  if (digest(expectedBytes) !== expectedDigest) {
    throw new Error('migration CAS 期望内容摘要不匹配')
  }

  const root = resolve(repoRoot)
  const target = resolve(targetPath)
  const recovery = resolve(recoveryDirectory)
  if (escaped(root, target) || escaped(root, recovery)) {
    throw new Error('migration CAS 目标或恢复目录越过项目根')
  }
  const targetParent = await ensureTrustedDirectory(root, dirname(target))
  const trustedRecovery = await ensureTrustedDirectory(root, recovery)
  const [rootIdentity, parentIdentity, recoveryIdentity, initialTarget] = await Promise.all([
    captureDirectoryIdentity(root),
    captureDirectoryIdentity(targetParent),
    captureDirectoryIdentity(trustedRecovery),
    readOrdinaryFileSnapshot(target),
  ])
  const suffix = `${process.pid}-${randomUUID()}`
  const temporaryName = `expected-${suffix}.tmp`
  const snapshotName = `original-${suffix}.md`
  const quarantineName = `quarantined-${suffix}.tmp`
  const backupPath = join(recovery, snapshotName)
  const helperDirectory = await mkdtemp(join(tmpdir(), 'pipeline-spec-cas-helper-'))
  const contentDirectory = await mkdtemp(join(tmpdir(), 'pipeline-spec-cas-content-'))
  let rootHandle
  let expectedHandle
  let observedHandle
  try {
    const beforeDigest = digest(initialTarget.bytes)
    if (beforeDigest !== observedDigest && beforeDigest !== expectedDigest) {
      throw new Error(`migration CAS 当前内容不在允许闭集: ${beforeDigest}`)
    }
    const helper = await compileHelper(helperDirectory)
    const expectedPath = join(contentDirectory, 'expected')
    const observedPath = join(contentDirectory, 'observed')
    await Promise.all([
      writeFile(expectedPath, expectedBytes, { flag: 'wx', mode: 0o600 }),
      writeFile(observedPath, initialTarget.bytes, { flag: 'wx', mode: 0o600 }),
    ])
    rootHandle = await open(
      root,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
    expectedHandle = await open(expectedPath, 'r')
    observedHandle = await open(observedPath, 'r')
    const openedRootIdentity = await rootHandle.stat()
    if (!sameIdentity(openedRootIdentity, rootIdentity)) {
      throw new Error(`migration CAS 项目根身份已变化: ${root}`)
    }
    const effect = await runAnchoredCas({
      helper,
      rootHandle,
      expectedHandle,
      observedHandle,
      targetParentRelative: relative(root, targetParent) || '.',
      recoveryRelative: relative(root, trustedRecovery),
      targetName: basename(target),
      temporaryName,
      snapshotName,
      quarantineName,
      rootIdentity,
      parentIdentity,
      recoveryIdentity,
      targetIdentity: initialTarget.identity,
      beforeCommit,
      beforeOriginalMove,
      afterOriginalMove,
      beforePublish,
    })
    await Promise.all([
      assertDirectoryIdentity(root, rootIdentity),
      assertDirectoryIdentity(targetParent, parentIdentity),
      assertDirectoryIdentity(trustedRecovery, recoveryIdentity),
    ])
    const published = await readOrdinaryFileSnapshot(target)
    const afterDigest = digest(published.bytes)
    if (afterDigest !== expectedDigest) {
      throw new Error(
        `migration CAS 提交后摘要不匹配: expected=${expectedDigest} actual=${afterDigest}`,
      )
    }
    if (effect === 'no-op') {
      return { effect, beforeDigest, afterDigest }
    }
    return {
      effect,
      beforeDigest,
      afterDigest,
      recoveryPath: relative(root, backupPath),
    }
  } finally {
    await Promise.allSettled([
      rootHandle?.close(),
      expectedHandle?.close(),
      observedHandle?.close(),
    ])
    await Promise.all([
      rm(helperDirectory, { recursive: true, force: true }),
      rm(contentDirectory, { recursive: true, force: true }),
    ])
  }
}
