import { afterEach, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { probeRepositoryIdentity } from './repositoryIdentity.js'

const execFileAsync = promisify(execFile)
const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd })
}

describe('probeRepositoryIdentity', () => {
  it('assigns a primary checkout and its worktree the same opaque repository identity', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'tenon-repository-identity-'))
    tempRoots.push(parent)
    const primary = join(parent, 'named-repository')
    const worktree = join(parent, 'feature-worktree')
    await git(parent, ['init', primary])
    await git(primary, [
      '-c', 'user.name=Tenon Test',
      '-c', 'user.email=tenon@example.invalid',
      'commit', '--allow-empty', '-m', 'initial',
    ])
    await git(primary, ['worktree', 'add', '-b', 'feature', worktree])

    const primaryIdentity = await probeRepositoryIdentity(primary)
    const worktreeIdentity = await probeRepositoryIdentity(worktree)

    expect(primaryIdentity).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{64}$/),
      label: 'named-repository',
      workspace_kind: 'primary',
    })
    expect(worktreeIdentity).toEqual({
      id: primaryIdentity?.id,
      label: 'named-repository',
      workspace_kind: 'worktree',
    })
  })

  it('uses the fixed no-shell Git query with a bounded timeout', async () => {
    const identity = await probeRepositoryIdentity('/registered/repository', {
      runGit: async (root, args, timeoutMs) => {
        expect(root).toBe('/registered/repository')
        expect(args).toEqual([
          'rev-parse',
          '--path-format=absolute',
          '--git-common-dir',
          '--show-toplevel',
        ])
        expect(timeoutMs).toBe(1_500)
        return '/registered/repository/.git\n/registered/repository\n'
      },
    })

    expect(identity).toMatchObject({ label: 'repository', workspace_kind: 'primary' })
  })

  it('omits identity for a non-Git root, a timeout, or malformed output', async () => {
    const nonGit = await mkdtemp(join(tmpdir(), 'tenon-non-git-'))
    tempRoots.push(nonGit)
    await expect(probeRepositoryIdentity(nonGit)).resolves.toBeUndefined()
    await expect(probeRepositoryIdentity('/registered/repository', {
      runGit: async () => { throw new Error('timed out') },
    })).resolves.toBeUndefined()
    await expect(probeRepositoryIdentity('/registered/repository', {
      runGit: async () => 'relative/.git\n/registered/repository\nextra\n',
    })).resolves.toBeUndefined()
  })
})
