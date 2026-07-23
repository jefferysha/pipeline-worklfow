/**
 * 生产 host Git revision verifier。
 *
 * 它只通过 ExecFn 的 file+argv 面调用 Git，不经过 shell。通过条件同时要求：worktree HEAD
 * 精确指向 lifecycle 给出的权威 revision、业务工作树（含 untracked）为空、该 revision 通过
 * `git diff-tree --check`。cleanliness 只排除 wrapper 固定生成且不会进入业务 commit 的根级
 * `.sandcastle-build.agent.log` / `.sandcastle-build.agent.jsonl` / `.sandcastle-tap/**`；任意其他
 * 未提交路径仍 fail-closed。每条命令
 * 都落一条带 stdout/stderr SHA-256 的 command-result evidence；
 * ExecFn 抛错或返回畸形结果统一折成非零执行结果，因此 verifier 不会因执行层异常伪绿。
 */
import { createHash } from 'node:crypto'
import type { EvidenceRef, VerificationResult } from '@pipeline-lite/kernel'
import type { ExecFn, ExecResult } from '../runner/exec.js'
import {
  automationPolicySubjectFor,
  type VerificationIssuerIdentity, type VerifierInput, type VerifierPort,
} from './verifier.js'

export const GIT_REVISION_VERIFIER_ISSUER_IDENTITY = Object.freeze({
  kind: 'host-verifier',
  verifier: 'pipeline-git-integrity',
  version: '1',
} as const satisfies VerificationIssuerIdentity)

export interface GitRevisionVerifierOptions {
  readonly newId?: (prefix: string) => string
  readonly clock?: () => string
}

interface GitCheckResult extends ExecResult {
  readonly commandId: string
}

const defaultNewId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

const errorText = (error: unknown): string => {
  if (error instanceof Error) return error.message
  try {
    return String(error)
  } catch {
    return 'unknown execution error'
  }
}

/** Snapshot an injected result into primitives so getters cannot change values between gate and evidence reads. */
async function runGitCheck(
  exec: ExecFn,
  cwd: string,
  commandId: string,
  args: string[],
): Promise<GitCheckResult> {
  try {
    const raw = await exec('git', args, { cwd })
    const stdout = raw.stdout
    const stderr = raw.stderr
    const exitCode = raw.exitCode
    if (typeof stdout !== 'string' || typeof stderr !== 'string' || !Number.isInteger(exitCode)) {
      return { commandId, stdout: '', stderr: 'invalid ExecFn result', exitCode: 127 }
    }
    return { commandId, stdout, stderr, exitCode }
  } catch (error) {
    return { commandId, stdout: '', stderr: errorText(error), exitCode: 127 }
  }
}

const evidenceFor = (result: GitCheckResult): EvidenceRef => ({
  kind: 'command-result',
  command_id: result.commandId,
  exit_code: result.exitCode,
  stdout_sha256: sha256(result.stdout),
  stderr_sha256: sha256(result.stderr),
})

/** Build the fixed `pipeline-git-integrity@1` VerifierPort. */
export function createGitRevisionVerifier(
  exec: ExecFn,
  options: GitRevisionVerifierOptions = {},
): VerifierPort {
  const newId = options.newId ?? defaultNewId
  const clock = options.clock ?? (() => new Date().toISOString())

  return {
    async verify(input: VerifierInput): Promise<VerificationResult> {
      const revision = await runGitCheck(
        exec,
        input.worktreePath,
        'git-rev-parse-head',
        ['rev-parse', '--verify', 'HEAD^{commit}'],
      )
      const status = await runGitCheck(
        exec,
        input.worktreePath,
        'git-status-clean',
        [
          'status', '--porcelain=v1', '--untracked-files=all', '--', '.',
          ':(top,exclude).sandcastle-build.agent.log',
          ':(top,exclude).sandcastle-build.agent.jsonl',
          ':(top,exclude).sandcastle-tap',
          ':(top,exclude).sandcastle-tap/**',
        ],
      )
      const diffCheck = await runGitCheck(
        exec,
        input.worktreePath,
        'git-diff-tree-check',
        ['diff-tree', '--check', '--root', input.revisionSha],
      )

      // 真 git 的 rev-parse wire output 是目标 SHA 加且仅加一个 LF；trim/startsWith 会接受附加内容。
      const passed = revision.exitCode === 0
        && revision.stdout === `${input.revisionSha}\n`
        && status.exitCode === 0
        && status.stdout === ''
        && diffCheck.exitCode === 0

      return {
        schema_version: 1,
        verification_id: newId('git-verification'),
        subject: {
          workflow_run_id: input.workflowRunId,
          attempt_id: input.context.attempt_id,
          change: input.context.change,
          revision: { kind: 'named-branch-head', sha: input.revisionSha },
        },
        binding: input.workflowBinding,
        ...(automationPolicySubjectFor(input.context.automation_policy) === undefined ? {} : {
          automation_policy: automationPolicySubjectFor(input.context.automation_policy),
        }),
        verdict: passed ? 'passed' : 'failed',
        evidence: [evidenceFor(revision), evidenceFor(status), evidenceFor(diffCheck)],
        issuer: { ...GIT_REVISION_VERIFIER_ISSUER_IDENTITY, trusted: true },
        evaluated_at: clock(),
      }
    },
  }
}
