import { execFile } from 'node:child_process'
import { mkdtemp, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { hashBuildRevisionIdentity } from '../workflow/build-revision.js'
import { probeBuildRevisionIdentity } from './build-revision-identity.js'

const execFileAsync = promisify(execFile)
const roots: string[] = []

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 16_384 })
  return String(stdout).trim()
}

async function temporaryRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tenon-build-identity-'))
  roots.push(root)
  await git(root, 'init', '-q')
  await git(root, 'config', 'user.email', 'tenon-tests@example.invalid')
  await git(root, 'config', 'user.name', 'Tenon tests')
  await writeFile(join(root, 'README.md'), 'identity test\n', 'utf8')
  await git(root, 'add', 'README.md')
  await git(root, 'commit', '-qm', 'initial')
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('physical Build revision identity', () => {
  it('main and sibling worktree share repository identity but not worktree identity', async () => {
    const main = await temporaryRepository()
    const sibling = join(main, '..', `${main.split('/').pop() ?? 'repo'}-sibling`)
    await git(main, 'worktree', 'add', '-q', '-b', 'identity-sibling', sibling, 'HEAD')
    roots.push(sibling)

    const mainIdentity = await probeBuildRevisionIdentity(main)
    const siblingIdentity = await probeBuildRevisionIdentity(sibling)
    expect(mainIdentity).toBeDefined()
    expect(siblingIdentity).toBeDefined()
    expect(mainIdentity?.repository).toBe(siblingIdentity?.repository)
    expect(mainIdentity?.worktree).not.toBe(siblingIdentity?.worktree)
    const mainHashes = hashBuildRevisionIdentity(mainIdentity!)
    const siblingHashes = hashBuildRevisionIdentity(siblingIdentity!)
    expect(mainHashes.repositoryHash).toBe(siblingHashes.repositoryHash)
    expect(mainHashes.worktreeHash).not.toBe(siblingHashes.worktreeHash)
  }, 20_000)

  it('a clone has a different physical repository identity', async () => {
    const source = await temporaryRepository()
    const clone = join(source, '..', `${source.split('/').pop() ?? 'repo'}-clone`)
    await git(source, 'clone', '-q', source, clone)
    roots.push(clone)

    const sourceIdentity = await probeBuildRevisionIdentity(source)
    const cloneIdentity = await probeBuildRevisionIdentity(clone)
    expect(sourceIdentity).toBeDefined()
    expect(cloneIdentity).toBeDefined()
    expect(hashBuildRevisionIdentity(sourceIdentity!).repositoryHash)
      .not.toBe(hashBuildRevisionIdentity(cloneIdentity!).repositoryHash)
  }, 20_000)

  it('rejects non-Git, incomplete, and symlink identities without partial output', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'tenon-build-identity-plain-'))
    roots.push(plain)
    expect(await probeBuildRevisionIdentity(plain)).toBeUndefined()

    const incomplete = await mkdtemp(join(tmpdir(), 'tenon-build-identity-incomplete-'))
    roots.push(incomplete)
    await writeFile(join(incomplete, '.git'), 'gitdir: missing\n', 'utf8')
    expect(await probeBuildRevisionIdentity(incomplete)).toBeUndefined()

    const target = await temporaryRepository()
    const link = join(target, '..', `${target.split('/').pop() ?? 'repo'}-symlink`)
    await symlink(target, link, 'dir')
    roots.push(link)
    expect(await probeBuildRevisionIdentity(link)).toBeUndefined()
  }, 20_000)
})
