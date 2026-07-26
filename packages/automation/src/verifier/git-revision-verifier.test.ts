import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { compileAutomationPolicySnapshot, type LoopEntry } from '@tenon/kernel'
import type { ExecutionContext } from '../admission/execution-context.js'
import { nodeExec, type ExecFn, type ExecResult } from '../runner/exec.js'
import {
  createGitRevisionVerifier,
  GIT_REVISION_VERIFIER_ISSUER_IDENTITY,
} from './git-revision-verifier.js'
import type { VerifierInput } from './verifier.js'

const SHA = 'a'.repeat(40)
const OTHER_SHA = 'b'.repeat(40)
const FIXED_TIME = '2026-07-19T00:00:00.000Z'
const policy = compileAutomationPolicySnapshot({
  id: 'loop-1', name: 'Loop', kind: 'continuous', goal: 'Keep release checks green', cadence: 'manual', risk: 'low',
  runner: 'codex', change_prefix: 'change-', phases: [], human_gates: [], state: 'iteration', design_doc: 'GOAL.md',
  status: 'active', budget: { max_runs_per_day: 2, max_in_flight: 1, on_exceed: 'skip' }, kill_criteria: [],
  autonomy_level: 'L3', allowlist: ['packages/**'], denylist: [], skill_bundle_id: '_all',
} satisfies LoopEntry, { capturedAt: FIXED_TIME })

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

const context = (): ExecutionContext => ({
  attempt_id: 'att-1',
  reservation_id: 'res-1',
  loop_id: 'loop-1',
  change: 'change-1',
  level: 'L3',
  runner: 'codex',
  admitted_at: '2026-07-19T00:00:00.000Z',
  reservation: { runs: 1, tokens: 2_000, token_basis: 'risk-default' },
  policy_epoch: 'epoch-1',
  skill_bundle_id: null,
})

const input = (over: Partial<VerifierInput> = {}): VerifierInput => ({
  context: context(),
  workflowRunId: 'wfr-1',
  workflowBinding: { kind: 'runtime-verifier', verifier: 'pipeline-git-integrity', version: '1' },
  revisionSha: SHA,
  worktreePath: '/worktree/change-1',
  expectedIssuerIdentity: GIT_REVISION_VERIFIER_ISSUER_IDENTITY,
  ...over,
})

const successResults = (revisionSha = SHA): ExecResult[] => [
  { stdout: `${revisionSha}\n`, stderr: '', exitCode: 0 },
  { stdout: '', stderr: '', exitCode: 0 },
  { stdout: '', stderr: '', exitCode: 0 },
]

const sequentialExec = (results: readonly ExecResult[]): {
  readonly exec: ExecFn
  readonly calls: { file: string; args: string[]; cwd?: string }[]
} => {
  const calls: { file: string; args: string[]; cwd?: string }[] = []
  let index = 0
  return {
    calls,
    exec: async (file, args, opts) => {
      calls.push({ file, args: [...args], cwd: opts?.cwd })
      const result = results[index++]
      if (result === undefined) throw new Error(`unexpected exec call ${index}`)
      return result
    },
  }
}

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function checkedGit(cwd: string, args: string[]): Promise<string> {
  const result = await nodeExec('git', args, { cwd })
  expect(result.exitCode, `git ${args.join(' ')}: ${result.stderr}`).toBe(0)
  return result.stdout
}

async function initRealRepository(): Promise<{ root: string; sha: string }> {
  const root = await mkdtemp(join(tmpdir(), 'git-revision-verifier-'))
  roots.push(root)
  await checkedGit(root, ['init', '-q'])
  await checkedGit(root, ['config', 'user.name', 'Pipeline Test'])
  await checkedGit(root, ['config', 'user.email', 'pipeline@example.invalid'])
  await writeFile(join(root, 'clean.txt'), 'clean\n')
  await checkedGit(root, ['add', '--', 'clean.txt'])
  await checkedGit(root, ['commit', '-q', '-m', 'initial'])
  const sha = (await checkedGit(root, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim()
  return { root, sha }
}

describe('createGitRevisionVerifier —— host git revision integrity verifier', () => {
  it('H4：trusted verdict 显式绑定 policy version 与 goal hash', async () => {
    const fake = sequentialExec(successResults())
    const result = await createGitRevisionVerifier(fake.exec).verify(input({ context: { ...context(), automation_policy: policy } }))
    expect(result.automation_policy).toEqual({
      policy_id: policy.policy_id,
      policy_version: policy.policy_version,
      goal_sha256: sha256(policy.goal),
    })
  })

  it('只用 argv 调三条固定 git 命令；全绿时签发固定 identity、原样 subject/binding 与三条哈希 evidence', async () => {
    const fake = sequentialExec(successResults())
    const binding = { kind: 'runtime-verifier', verifier: 'pipeline-git-integrity', version: '1' } as const
    const verifierInput = input({ workflowBinding: binding })
    const verifier = createGitRevisionVerifier(fake.exec, {
      newId: (prefix) => `${prefix}-fixed`,
      clock: () => FIXED_TIME,
    })

    const result = await verifier.verify(verifierInput)

    expect(fake.calls).toEqual([
      { file: 'git', args: ['rev-parse', '--verify', 'HEAD^{commit}'], cwd: verifierInput.worktreePath },
      {
        file: 'git',
        args: [
          'status', '--porcelain=v1', '--untracked-files=all', '--', '.',
          ':(top,exclude).sandcastle-build.agent.log',
          ':(top,exclude).sandcastle-build.agent.jsonl',
          ':(top,exclude).sandcastle-tap',
          ':(top,exclude).sandcastle-tap/**',
        ],
        cwd: verifierInput.worktreePath,
      },
      { file: 'git', args: ['diff-tree', '--check', '--root', SHA], cwd: verifierInput.worktreePath },
    ])
    expect(result).toMatchObject({
      schema_version: 1,
      verification_id: 'git-verification-fixed',
      subject: {
        workflow_run_id: 'wfr-1',
        attempt_id: 'att-1',
        change: 'change-1',
        revision: { kind: 'named-branch-head', sha: SHA },
      },
      verdict: 'passed',
      issuer: { kind: 'host-verifier', verifier: 'pipeline-git-integrity', version: '1', trusted: true },
      evaluated_at: FIXED_TIME,
    })
    expect(result.binding).toBe(binding)
    expect(result.evidence).toEqual([
      {
        kind: 'command-result', command_id: 'git-rev-parse-head', exit_code: 0,
        stdout_sha256: sha256(`${SHA}\n`), stderr_sha256: sha256(''),
      },
      {
        kind: 'command-result', command_id: 'git-status-clean', exit_code: 0,
        stdout_sha256: sha256(''), stderr_sha256: sha256(''),
      },
      {
        kind: 'command-result', command_id: 'git-diff-tree-check', exit_code: 0,
        stdout_sha256: sha256(''), stderr_sha256: sha256(''),
      },
    ])
  })

  it('rev-parse 恶意附加 stdout 即使以目标 SHA 开头也失败（只接受精确单行）', async () => {
    const fake = sequentialExec([
      { stdout: `${SHA}\n${OTHER_SHA}\n`, stderr: '', exitCode: 0 },
      ...successResults().slice(1),
    ])
    const result = await createGitRevisionVerifier(fake.exec).verify(input())
    expect(result.verdict).toBe('failed')
    expect(result.evidence).toHaveLength(3)
  })

  it('rev-parse 返回另一 SHA → failed', async () => {
    const fake = sequentialExec(successResults(OTHER_SHA))
    const result = await createGitRevisionVerifier(fake.exec).verify(input())
    expect(result.verdict).toBe('failed')
  })

  it('status 返回任意脏树字节（含 untracked）→ failed', async () => {
    const fake = sequentialExec([
      successResults()[0]!,
      { stdout: '?? attacker-created\n', stderr: '', exitCode: 0 },
      successResults()[2]!,
    ])
    const result = await createGitRevisionVerifier(fake.exec).verify(input())
    expect(result.verdict).toBe('failed')
  })

  it('diff-tree --check 非零 → failed，真实 exit code 原样进入 evidence', async () => {
    const fake = sequentialExec([
      ...successResults().slice(0, 2),
      { stdout: 'bad whitespace\n', stderr: 'check failed\n', exitCode: 2 },
    ])
    const result = await createGitRevisionVerifier(fake.exec).verify(input())
    expect(result.verdict).toBe('failed')
    expect(result.evidence[2]).toMatchObject({ command_id: 'git-diff-tree-check', exit_code: 2 })
  })

  it('注入 ExecFn 抛异常时 verify 不向外 throw，归一成非零 evidence 且绝不伪绿', async () => {
    let calls = 0
    const throwingExec: ExecFn = async () => {
      calls += 1
      if (calls === 1) throw new Error('spawn exploded')
      return successResults()[calls - 1]!
    }
    const result = await createGitRevisionVerifier(throwingExec).verify(input())
    expect(result.verdict).toBe('failed')
    expect(result.evidence).toHaveLength(3)
    expect(result.evidence[0]).toMatchObject({ command_id: 'git-rev-parse-head', exit_code: 127 })
  })

  it('真 git 临时仓库：HEAD 精确、工作树 clean、diff-tree check 通过 → passed', async () => {
    const repo = await initRealRepository()
    const verifierInput = input({ worktreePath: repo.root, revisionSha: repo.sha })
    const result = await createGitRevisionVerifier(nodeExec, {
      newId: () => 'git-real', clock: () => FIXED_TIME,
    }).verify(verifierInput)

    expect(result.verdict).toBe('passed')
    expect(result.subject.revision.sha).toBe(repo.sha)
    expect(result.evidence.map((entry) => entry.exit_code)).toEqual([0, 0, 0])
  })

  it('真 git 临时仓库新增未跟踪文件 → failed', async () => {
    const repo = await initRealRepository()
    await writeFile(join(repo.root, 'untracked.txt'), 'not committed\n')
    const result = await createGitRevisionVerifier(nodeExec).verify(
      input({ worktreePath: repo.root, revisionSha: repo.sha }),
    )
    expect(result.verdict).toBe('failed')
  })

  it('真 git：wrapper 自有未提交日志/JSONL/tap 不污染业务 cleanliness，但普通未跟踪文件仍由相邻用例 fail-closed', async () => {
    const repo = await initRealRepository()
    await writeFile(join(repo.root, '.sandcastle-build.agent.log'), 'runtime-only\n')
    await writeFile(join(repo.root, '.sandcastle-build.agent.jsonl'), '{"type":"turn.completed"}\n')
    await mkdir(join(repo.root, '.sandcastle-tap', 'records'), { recursive: true })
    await writeFile(join(repo.root, '.sandcastle-tap', 'capture.enabled'), '1')
    await writeFile(join(repo.root, '.sandcastle-tap', 'records', 'trace.jsonl'), '{}\n')

    const result = await createGitRevisionVerifier(nodeExec).verify(
      input({ worktreePath: repo.root, revisionSha: repo.sha }),
    )
    expect(result.verdict).toBe('passed')
  })
})
