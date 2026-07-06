/**
 * build_sha 全链同源派生（BACKLOG #29）—— 移植老仓 scheduler/barrier.ts:1-128（ROUND-6 核心）。
 *
 * barrier（ADR 0005）要求端到端同一个 SHA：
 *   沙箱 build commit → merge 回 host → host 冻结 build_sha → host verify 校验 HEAD==build_sha。
 *
 * 权威 build_sha = per-change **命名分支** HEAD（refs/heads/sandcastle-pipeline/<name>）——
 * 不可变、sibling-proof、== host build-complete 从 worktree HEAD 冻的那个 commit。**绝不**是
 * 沙箱自报 SHA（buggy/hostile agent 能打印任意 build_sha；若 host 冻它就锁了移动靶）。
 *
 * 口径（诚实，DESIGN §4.3）：build_sha 与 commits[last] 读同一不可变命名 ref，故
 * `branchHead !== landed` 守卫在诚实生产路径是同义反复；「merge-back drift」生产不可达。守卫真正
 * 武装的是「named-branch post-freeze drift」：带外写者在 build-complete 冻结后把命名分支推过该
 * commit（本 lite 由 barrier.test.ts / barrier.integration.test.ts 手工补 commit 触发，证明 reflex
 * 仍武装 = fail-loud）。
 *
 * git 抽象成注入 GitFace（revParse）——纯逻辑单测走 fake git、真 git 走 barrier.integration.test.ts。
 */

/** git 只读注入面（barrier 只需 rev-parse 一个 ref）。真实现走 execFile git（IT）。 */
export interface GitFace {
  revParse(ref: string): Promise<string>
}

/** verify 目标无法锚定 reviewed host commit 时抛（fail LOUD，绝不 prefer）。 */
export class BarrierDriftError extends Error {
  override readonly name = 'BarrierDriftError'
  readonly _tag = 'BarrierDriftError'
  constructor(message: string) {
    super(message)
  }
}

export interface DeriveBarrierShaInput {
  readonly git: GitFace
  /** 沙箱 commits 落地的命名分支（sandcastle-pipeline/<name>）。 */
  readonly branch: string
  /** lifecycle merge-back 收集的 commits（FIFO；last = build HEAD）。 */
  readonly commits: ReadonlyArray<{ sha: string }>
  /** 沙箱 <output> 握手自报的 SHA（UNTRUSTED）。 */
  readonly sandboxReportedSha?: string
}

export interface BarrierSha {
  /** 权威 host-derived build_sha（verify 目标）。undefined = no-op run。 */
  readonly buildSha?: string
}

/** 解析一个 merged-back change 的权威 build_sha，违反不变量即 BarrierDriftError。 */
export const deriveBarrierSha = async (input: DeriveBarrierShaInput): Promise<BarrierSha> => {
  const { git, branch, commits, sandboxReportedSha } = input

  // no-op run：无 commit 落地 → 无目标可冻（fail-open，绝不凭空造）。
  if (commits.length === 0) return { buildSha: undefined }

  const landed = commits[commits.length - 1]?.sha
  if (landed === undefined) return { buildSha: undefined }

  // verify 目标 = per-change 命名分支 HEAD（不可变；build-complete 冻的那个 commit）。
  let branchHead: string
  try {
    branchHead = await git.revParse(`refs/heads/${branch}`)
  } catch (err) {
    throw new BarrierDriftError(`barrier: cannot resolve host branch ${branch} for build_sha: ${String(err)}`)
  }

  // 命名分支必须恰指向 lifecycle 收集的 commit；越过它 = verify 目标是未复核 commit（篡改）。
  if (branchHead !== landed) {
    throw new BarrierDriftError(
      `barrier: named branch ${branch} HEAD=${branchHead} != landed build commit ${landed} ` +
        `(named-branch post-freeze drift — verify would target an unreviewed commit)`,
    )
  }

  // 沙箱自报 SHA 不可信；若声称一个不同的非空 40-char 目标 = drift 信号 → 拒（不 prefer 任一侧）。
  if (sandboxReportedSha && sandboxReportedSha.length === 40 && sandboxReportedSha !== branchHead) {
    throw new BarrierDriftError(
      `barrier: sandbox-reported build_sha=${sandboxReportedSha} diverges from the ` +
        `host-landed commit ${branchHead} (no moving-target verify-pass)`,
    )
  }

  return { buildSha: branchHead }
}
