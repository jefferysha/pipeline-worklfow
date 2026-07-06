import { describe, expect, it } from 'vitest'
import { BarrierDriftError, type GitFace, deriveBarrierSha } from './barrier.js'

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

/** fake git：revParse 返回预设命名分支 HEAD。 */
const fakeGit = (branchHead: string): GitFace => ({
  revParse: async () => branchHead,
})

describe('build_sha barrier 派生（老仓 scheduler/barrier.ts:81-128）', () => {
  it('空 commits（no-op run）→ buildSha undefined（不冻结、不假推进）', async () => {
    const r = await deriveBarrierSha({ git: fakeGit(SHA_A), branch: 'sandcastle-pipeline/x', commits: [] })
    expect(r.buildSha).toBeUndefined()
  })

  it('happy：命名分支 HEAD == landed commit → 冻结该 SHA', async () => {
    const r = await deriveBarrierSha({
      git: fakeGit(SHA_A),
      branch: 'sandcastle-pipeline/x',
      commits: [{ sha: SHA_A }],
    })
    expect(r.buildSha).toBe(SHA_A)
  })

  it('named-branch post-freeze drift：HEAD 越过 landed → BarrierDriftError（fail-loud）', async () => {
    await expect(
      deriveBarrierSha({
        git: fakeGit(SHA_B), // 命名分支被带外写者推过
        branch: 'sandcastle-pipeline/x',
        commits: [{ sha: SHA_A }],
      }),
    ).rejects.toBeInstanceOf(BarrierDriftError)
  })

  it('沙箱自报 SHA 与 host-landed 分歧 → 拒（不信容器自报，ADR 0005）', async () => {
    await expect(
      deriveBarrierSha({
        git: fakeGit(SHA_A),
        branch: 'sandcastle-pipeline/x',
        commits: [{ sha: SHA_A }],
        sandboxReportedSha: SHA_B,
      }),
    ).rejects.toBeInstanceOf(BarrierDriftError)
  })

  it('沙箱自报 SHA == host-landed → 通过', async () => {
    const r = await deriveBarrierSha({
      git: fakeGit(SHA_A),
      branch: 'sandcastle-pipeline/x',
      commits: [{ sha: SHA_A }],
      sandboxReportedSha: SHA_A,
    })
    expect(r.buildSha).toBe(SHA_A)
  })
})
