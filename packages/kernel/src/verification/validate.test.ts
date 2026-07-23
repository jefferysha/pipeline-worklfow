import { describe, expect, test } from 'vitest'
import { collectVerificationResultErrors, isTrustedPass, sanitizeVerificationResultForEncode, validateVerificationResult } from './validate.js'
import type { EvidenceRef, VerificationIssuer, VerificationResult } from './types.js'

// ── 样本工厂（合法为基底，override 注入变体）──────────────────────────────────
const SHA40 = 'a'.repeat(40) // git SHA-1 对象名
const SHA64 = 'b'.repeat(64) // git SHA-256 对象名 / 内容 sha256
const CONTENT = 'c'.repeat(64) // 内容 sha256
const POLICY_VERSION = 'd'.repeat(64)
const GOAL_SHA256 = 'e'.repeat(64)

function repoFileEvidence(over: Partial<Extract<EvidenceRef, { kind: 'repo-file' }>> = {}): EvidenceRef {
  return { kind: 'repo-file', path: 'packages/kernel/src/verification/types.ts', sha256: CONTENT, revision_sha: SHA40, ...over }
}

function valid(over: Partial<VerificationResult> = {}): VerificationResult {
  return {
    schema_version: 1,
    verification_id: 'ver-1',
    subject: {
      workflow_run_id: 'wfr-1',
      attempt_id: 'att-1',
      change: 'w3-verifier',
      revision: { kind: 'named-branch-head', sha: SHA40 },
    },
    binding: { kind: 'workflow-transition', workflow_digest: 'wf-digest-1', workflow: 'default', step: 'verify', event: 'verify-pass' },
    verdict: 'passed',
    evidence: [repoFileEvidence()],
    issuer: { kind: 'host-verifier', verifier: 'kernel-verify', version: '1.0.0', trusted: true },
    evaluated_at: '2026-07-18T05:00:00.000Z',
    ...over,
  }
}

/** 绕过类型面拿到可任意增删字段的普通对象。 */
function asObj(r: VerificationResult): Record<string, unknown> {
  return JSON.parse(JSON.stringify(r)) as Record<string, unknown>
}

function expectOk(input: unknown): void {
  const r = validateVerificationResult(input)
  expect(r.ok).toBe(true)
}

function expectReject(input: unknown, hint: string): void {
  const r = validateVerificationResult(input)
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.join('; ')).toContain(hint)
}

describe('verification/validate —— VerificationResult 手写窄校验（H7）', () => {
  describe('H4 AutomationPolicy goal 归属', () => {
    test('完整 policy_id/policy_version/goal_sha256 被 canonical 保留并冻结', () => {
      const result = validateVerificationResult({
        ...valid(),
        automation_policy: { policy_id: 'loop-1', policy_version: POLICY_VERSION, goal_sha256: GOAL_SHA256 },
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.automation_policy).toEqual({
          policy_id: 'loop-1', policy_version: POLICY_VERSION, goal_sha256: GOAL_SHA256,
        })
        expect(Object.isFrozen(result.value.automation_policy)).toBe(true)
      }
    })

    test('goal_sha256 非 SHA-256 → 拒绝，不允许伪造 goal 归属', () => {
      expectReject({
        ...valid(),
        automation_policy: { policy_id: 'loop-1', policy_version: POLICY_VERSION, goal_sha256: 'not-a-hash' },
      }, 'automation_policy.goal_sha256')
    })
  })

  describe('合法样本（各 union variant）', () => {
    test('host-verifier passed + repo-file evidence', () => expectOk(valid()))

    test('human-review passed（trusted:true）', () => {
      const issuer: VerificationIssuer = { kind: 'human-review', actor_id: 'user-7', trusted: true }
      expectOk(valid({ issuer }))
    })

    test('sandbox-report failed（untrusted，failed 不强制 evidence）', () => {
      const issuer: VerificationIssuer = { kind: 'sandbox-report', runner: 'claude-code', trusted: false }
      expectOk(valid({ issuer, verdict: 'failed', evidence: [] }))
    })

    test('inconclusive 判决，evidence 可空', () => expectOk(valid({ verdict: 'inconclusive', evidence: [] })))

    test('binding default-transition', () => expectOk(valid({ binding: { kind: 'default-transition', event: 'verify-pass' } })))

    test('binding runtime-verifier', () => expectOk(valid({ binding: { kind: 'runtime-verifier', verifier: 'host-vitest', version: '2' } })))

    test('binding workflow-transition 含 guard_index/action_index（非负整数）', () => {
      expectOk(valid({ binding: { kind: 'workflow-transition', workflow_digest: 'd', workflow: 'wf', step: 's', event: 'e', guard_index: 0, action_index: 3 } }))
    })

    test('evidence command-result（含/不含 stdout/stderr sha256）', () => {
      const withHashes: EvidenceRef = { kind: 'command-result', command_id: 'vitest', exit_code: 0, stdout_sha256: CONTENT, stderr_sha256: CONTENT }
      const bare: EvidenceRef = { kind: 'command-result', command_id: 'tsc', exit_code: 0 }
      expectOk(valid({ evidence: [withHashes, bare] }))
    })

    test('revision.sha 允许 64 位 git 对象名（evidence.revision_sha 同步对齐，否则触发跨字段一致性校验）', () => {
      expectOk(valid({
        subject: { ...valid().subject, revision: { kind: 'named-branch-head', sha: SHA64 } },
        evidence: [repoFileEvidence({ revision_sha: SHA64 })],
      }))
    })
  })

  describe('ID / 时间 / subject 非空', () => {
    test('verification_id 空串 → 拒', () => expectReject({ ...asObj(valid()), verification_id: '' }, 'verification_id'))
    test('verification_id 缺失 → 拒', () => { const o = asObj(valid()); delete o.verification_id; expectReject(o, 'verification_id') })
    test('evaluated_at 空串 → 拒', () => expectReject({ ...asObj(valid()), evaluated_at: '' }, 'evaluated_at'))
    test('evaluated_at 非 ISO-8601（纯日期，无时间/时区）→ 拒（H7 复审次要项：此前只校非空）', () => {
      expectReject({ ...asObj(valid()), evaluated_at: '2026-07-18' }, 'evaluated_at')
    })
    test('evaluated_at 非 ISO-8601（缺时区）→ 拒', () => {
      expectReject({ ...asObj(valid()), evaluated_at: '2026-07-18T05:00:00' }, 'evaluated_at')
    })
    test('evaluated_at 完全非日期字符串 → 拒', () => expectReject({ ...asObj(valid()), evaluated_at: 'not-a-date' }, 'evaluated_at'))
    test('evaluated_at 允许 +HH:MM 时区偏移（非仅 Z）', () => expectOk(valid({ evaluated_at: '2026-07-18T05:00:00.000+08:00' })))
    test('subject 缺失 → 拒', () => { const o = asObj(valid()); delete o.subject; expectReject(o, 'subject') })
    test('subject.change 空串 → 拒', () => expectReject({ ...asObj(valid()), subject: { ...asObj(valid()).subject as object, change: '' } }, 'change'))
    test('subject.workflow_run_id 缺失 → 拒', () => {
      const s = asObj(valid()).subject as Record<string, unknown>; delete s.workflow_run_id
      expectReject({ ...asObj(valid()), subject: s }, 'workflow_run_id')
    })
    test('schema_version ≠ 1 → 拒', () => expectReject({ ...asObj(valid()), schema_version: 2 }, 'schema_version'))
    test('顶层非对象 → 拒', () => expectReject('not-an-object', '对象'))
  })

  describe('verdict / passed evidence 约束', () => {
    test('verdict 闭集外 → 拒', () => expectReject({ ...asObj(valid()), verdict: 'maybe' }, 'verdict'))
    test('passed 但 evidence 空 → 拒', () => expectReject({ ...asObj(valid()), verdict: 'passed', evidence: [] }, 'evidence'))
    test('evidence 非数组 → 拒', () => expectReject({ ...asObj(valid()), evidence: 'lots' }, 'evidence'))
  })

  describe('trusted issuer ≠ sandbox（不可自报冒充）', () => {
    test('sandbox-report 冒充 trusted:true → 拒', () => {
      expectReject({ ...asObj(valid()), issuer: { kind: 'sandbox-report', runner: 'claude-code', trusted: true } }, 'trusted')
    })
    test('host-verifier trusted:false（信任降级伪造）→ 拒', () => {
      expectReject({ ...asObj(valid()), issuer: { kind: 'host-verifier', verifier: 'v', version: '1', trusted: false } }, 'trusted')
    })
    test('issuer.kind 闭集外 → 拒', () => {
      expectReject({ ...asObj(valid()), issuer: { kind: 'ci-bot', trusted: true } }, 'kind')
    })
  })

  describe('repo path 逃逸 / 绝对路径 / hash 格式', () => {
    test('绝对路径 /etc/passwd → 拒', () => expectReject({ ...asObj(valid()), evidence: [{ ...repoFileEvidence(), path: '/etc/passwd' }] }, '绝对路径'))
    test('盘符绝对路径 C:\\x → 拒', () => expectReject({ ...asObj(valid()), evidence: [{ ...repoFileEvidence(), path: 'C:\\x' }] }, '绝对'))
    test('路径逃逸 ../secret → 拒', () => expectReject({ ...asObj(valid()), evidence: [{ ...repoFileEvidence(), path: '../secret' }] }, '..'))
    test('中段逃逸 a/../../b → 拒', () => expectReject({ ...asObj(valid()), evidence: [{ ...repoFileEvidence(), path: 'a/../../b' }] }, '..'))
    test('路径含 NUL 字节 → 拒（H7 复审次要项：git tree 路径不可含 NUL）', () => {
      expectReject({ ...asObj(valid()), evidence: [{ ...repoFileEvidence(), path: 'a/b\0c' }] }, 'NUL')
    })
    test("单独 '.' 段 a/./b → 拒（git tree 不产生此形式）", () => {
      expectReject({ ...asObj(valid()), evidence: [{ ...repoFileEvidence(), path: 'a/./b' }] }, "'.'")
    })
    test("路径本身就是 '.' → 拒", () => expectReject({ ...asObj(valid()), evidence: [{ ...repoFileEvidence(), path: '.' }] }, "'.'"))
    test('空路径段（连续分隔符 a//b）→ 拒', () => expectReject({ ...asObj(valid()), evidence: [{ ...repoFileEvidence(), path: 'a//b' }] }, '空路径段'))
    test('空路径段（尾部分隔符 a/b/）→ 拒', () => expectReject({ ...asObj(valid()), evidence: [{ ...repoFileEvidence(), path: 'a/b/' }] }, '空路径段'))
    test('sha256 非 64 hex（坏 hash）→ 拒', () => expectReject({ ...asObj(valid()), evidence: [{ ...repoFileEvidence(), sha256: 'deadbeef' }] }, 'sha256'))
    test('sha256 含大写非法字符 → 拒', () => expectReject({ ...asObj(valid()), evidence: [{ ...repoFileEvidence(), sha256: 'A'.repeat(64) }] }, 'sha256'))
    test('revision_sha 非 40/64 hex → 拒', () => expectReject({ ...asObj(valid()), evidence: [{ ...repoFileEvidence(), revision_sha: 'xyz' }] }, 'revision_sha'))
    test('subject.revision.sha 坏 git SHA → 拒', () => expectReject({ ...asObj(valid()), subject: { ...asObj(valid()).subject as object, revision: { kind: 'named-branch-head', sha: 'nope' } } }, 'sha'))
    test('subject.revision.kind 错 → 拒', () => expectReject({ ...asObj(valid()), subject: { ...asObj(valid()).subject as object, revision: { kind: 'tag', sha: SHA40 } } }, 'kind'))
    test('evidence.kind 闭集外 → 拒', () => expectReject({ ...asObj(valid()), evidence: [{ kind: 'screenshot' }] }, 'kind'))
    test('command-result exit_code 非整数 → 拒', () => expectReject({ ...asObj(valid()), verdict: 'failed', evidence: [{ kind: 'command-result', command_id: 'x', exit_code: 1.5 }] }, 'exit_code'))
  })

  describe('阻断3（H7 复审）：repo-file evidence.revision_sha 必须绑定 subject.revision.sha', () => {
    const OLD_SHA = 'c'.repeat(40) // 两者各自都是合法格式的 40 位 SHA，但彼此不同——旧 revision 证据
    const NEW_SHA = SHA40 // valid() 默认 subject.revision.sha

    test('evidence.revision_sha ≠ subject.revision.sha（均为合法格式）→ 拒（此前只校格式，放行跨 revision 复用）', () => {
      expectReject(
        { ...asObj(valid()), subject: { ...asObj(valid()).subject as object, revision: { kind: 'named-branch-head', sha: NEW_SHA } }, evidence: [repoFileEvidence({ revision_sha: OLD_SHA })] },
        'revision_sha',
      )
    })

    test('多条 evidence 中一条 mismatch → 拒（逐条比对，不因其余条目合法而放行）', () => {
      expectReject(
        {
          ...asObj(valid()),
          evidence: [repoFileEvidence({ path: 'a.ts', revision_sha: NEW_SHA }), repoFileEvidence({ path: 'b.ts', revision_sha: OLD_SHA })],
        },
        'evidence[1].revision_sha',
      )
    })

    test('evidence.revision_sha === subject.revision.sha（一致）→ 放行', () => {
      expectOk({ ...asObj(valid()), evidence: [repoFileEvidence({ revision_sha: NEW_SHA })] })
    })

    test('command-result evidence（无 revision_sha 字段）不受本约束影响 → 放行', () => {
      expectOk({ ...asObj(valid()), evidence: [{ kind: 'command-result', command_id: 'x', exit_code: 0 }] })
    })

    test('verdict=failed 时 evidence.revision_sha 不等 subject sha → 不因本约束被拒（约束只管 passed，未过度收紧）', () => {
      expectOk({ ...asObj(valid()), verdict: 'failed', evidence: [repoFileEvidence({ revision_sha: OLD_SHA })] })
    })

    test('verdict=inconclusive 时 evidence.revision_sha 不等 subject sha → 不因本约束被拒', () => {
      expectOk({ ...asObj(valid()), verdict: 'inconclusive', evidence: [repoFileEvidence({ revision_sha: OLD_SHA })] })
    })
  })

  describe('guard/action index 非负整数', () => {
    test('guard_index 负数 → 拒', () => {
      expectReject({ ...asObj(valid()), binding: { kind: 'workflow-transition', workflow_digest: 'd', workflow: 'w', step: 's', event: 'e', guard_index: -1 } }, 'guard_index')
    })
    test('action_index 非整数(1.5) → 拒', () => {
      expectReject({ ...asObj(valid()), binding: { kind: 'workflow-transition', workflow_digest: 'd', workflow: 'w', step: 's', event: 'e', action_index: 1.5 } }, 'action_index')
    })
    test('workflow-transition 缺 workflow_digest → 拒', () => {
      expectReject({ ...asObj(valid()), binding: { kind: 'workflow-transition', workflow: 'w', step: 's', event: 'e' } }, 'workflow_digest')
    })
    test('binding.kind 闭集外 → 拒', () => expectReject({ ...asObj(valid()), binding: { kind: 'phase', event: 'e' } }, 'kind'))
  })

  describe('collectVerificationResultErrors（供 ledger-codec 内嵌，路径前缀可定制）', () => {
    test('合法输入 → 零错误', () => {
      const errors: string[] = []
      collectVerificationResultErrors(valid(), 'run.verification', errors)
      expect(errors).toEqual([])
    })
    test('非法输入 → 错误带自定义路径前缀', () => {
      const errors: string[] = []
      collectVerificationResultErrors({ ...asObj(valid()), verification_id: '' }, 'run.verification', errors)
      expect(errors.join('; ')).toContain('run.verification.verification_id')
    })
  })

  describe('isTrustedPass —— merge 授权谓词（inconclusive 绝不当 pass）', () => {
    test('host-verifier passed → true', () => expect(isTrustedPass(valid())).toBe(true))
    test('human-review passed → true', () => expect(isTrustedPass(valid({ issuer: { kind: 'human-review', actor_id: 'u', trusted: true } }))).toBe(true))
    test('sandbox passed（untrusted）→ false', () => {
      expect(isTrustedPass(valid({ issuer: { kind: 'sandbox-report', runner: 'r', trusted: false } }))).toBe(false)
    })
    test('trusted 但 failed → false', () => expect(isTrustedPass(valid({ verdict: 'failed', evidence: [] }))).toBe(false))
    test('trusted 但 inconclusive → false（inconclusive 不当 pass）', () => {
      expect(isTrustedPass(valid({ verdict: 'inconclusive', evidence: [] }))).toBe(false)
    })
  })

  describe('H7-S1（r2 裁决对抗模型）：单次读取抽取 → 校验 → 深冻结，绝不向外 throw', () => {
    test('抽取成功但错误格式化触发敌意 toJSON 抛错 → ok:false，绝不向外 throw', () => {
      const input = valid() as unknown as Record<string, unknown>
      input.schema_version = { toJSON: () => { throw new Error('boom-after-snapshot') } }
      expect(() => validateVerificationResult(input)).not.toThrow()
      const result = validateVerificationResult(input)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors.join('\n')).toContain('boom-after-snapshot')
    })
    test('校验期 toJSON 抛出连 Symbol.toPrimitive 都不可读取的值 → ok:false，绝不向外 throw', () => {
      const unstringifiable = Object.defineProperty({}, Symbol.toPrimitive, {
        get(): never { throw new Error('hostile Symbol.toPrimitive getter') },
      })
      const input = valid() as unknown as Record<string, unknown>
      input.schema_version = { toJSON: () => { throw unstringifiable } }
      expect(() => validateVerificationResult(input)).not.toThrow()
      const result = validateVerificationResult(input)
      expect(result.ok).toBe(false)
    })
    test('r2 四拍循环 evidence getter PoC：读序不一致让「非空/格式」检查与「revision_sha 跨字段」检查看见不同数组 → 拒（经验证：旧实现对本输入误判 ok:true，见 collectVerificationResultErrors 对 evidence 的 5 次独立读取）', () => {
      const OLD_SHA = 'c'.repeat(40) // 与 valid().subject.revision.sha（SHA40）不同——旧 revision 的证据
      const badItem: EvidenceRef = { kind: 'repo-file', path: 'a.ts', sha256: CONTENT, revision_sha: OLD_SHA }
      let calls = 0
      const hostile = {
        ...valid(),
        get evidence() {
          calls += 1
          // 前 4 次读取都吐出「看起来合法」的单条证据（先后骗过 missing/isArray/格式 forEach/非空
          // 长度检查）；第 5 次读取（旧实现里专管 revision_sha 跨字段核验的第二个 forEach）改口吐空
          // 数组，让那条检查永远看不到真正存在的 mismatched 证据。
          return calls <= 4 ? [badItem] : []
        },
      }
      const r = validateVerificationResult(hostile)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join('; ')).toMatch(/evidence/)
    })

    test('抛错 getter（非 Proxy）→ ok:false，绝不向外 throw', () => {
      const hostile = {
        ...valid(),
        get evidence() { throw new Error('hostile getter boom') },
      }
      expect(() => validateVerificationResult(hostile)).not.toThrow()
      const r = validateVerificationResult(hostile)
      expect(r.ok).toBe(false)
    })

    test('getter 抛出连 Symbol.toPrimitive 都不可读取的值 → ok:false，绝不向外 throw', () => {
      const unstringifiable = Object.defineProperty({}, Symbol.toPrimitive, {
        get(): never { throw new Error('hostile Symbol.toPrimitive getter') },
      })
      const hostile = {
        ...valid(),
        get evidence(): never { throw unstringifiable },
      }
      expect(() => validateVerificationResult(hostile)).not.toThrow()
      const r = validateVerificationResult(hostile)
      expect(r.ok).toBe(false)
    })

    test('sanitize 的 getter 抛出连 Symbol.toPrimitive 都不可读取的值 → 返回 unreadable 占位，绝不向外 throw', () => {
      const unstringifiable = Object.defineProperty({}, Symbol.toPrimitive, {
        get(): never { throw new Error('hostile Symbol.toPrimitive getter') },
      })
      const hostile = {
        ...valid(),
        get evidence(): never { throw unstringifiable },
      }
      expect(() => sanitizeVerificationResultForEncode(hostile)).not.toThrow()
      expect(sanitizeVerificationResultForEncode(hostile)).toEqual({
        __verification_unreadable__: true,
        __read_error__: '<无法安全读取异常信息>',
      })
    })

    test('Proxy get trap 抛错（全字段）→ ok:false，绝不向外 throw', () => {
      const hostile = new Proxy(valid(), {
        get(): never { throw new Error('proxy trap boom') },
      })
      expect(() => validateVerificationResult(hostile)).not.toThrow()
      const r = validateVerificationResult(hostile)
      expect(r.ok).toBe(false)
    })

    test('Proxy get trap 只对某一已知字段抛错（其余字段正常）→ 仍是 ok:false，不产出半成品 value', () => {
      const base = valid()
      const hostile = new Proxy(base, {
        get(target, prop, receiver) {
          if (prop === 'issuer') throw new Error('issuer 读取抛错')
          return Reflect.get(target, prop, receiver)
        },
      })
      const r = validateVerificationResult(hostile)
      expect(r.ok).toBe(false)
      expect((r as { value?: unknown }).value).toBeUndefined()
    })

    test('多余键与 toJSON 一律丢弃：副本只含 schema 已知字段，不因 toJSON 而失真', () => {
      const input = {
        ...valid(),
        extra_evil_field: 'haha',
        toJSON() { return { verdict: 'failed' } },
      }
      const r = validateVerificationResult(input)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect('extra_evil_field' in r.value).toBe(false)
      expect('toJSON' in r.value).toBe(false)
      expect(r.value.verdict).toBe('passed') // 没被 toJSON 污染
    })

    test('value 绝不是原引用（顶层与嵌套结构皆是新副本），即便输入本身完全合法', () => {
      const input = valid()
      const r = validateVerificationResult(input)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.value).not.toBe(input)
      expect(r.value.subject).not.toBe(input.subject)
      expect(r.value.evidence).not.toBe(input.evidence)
      expect(r.value).toEqual(input) // 内容仍然逐字段相等，只是不再是同一引用
    })

    test('校验通过后突变原对象，不影响已返回的副本（阻断4「撕裂」在 kernel 侧的根因）', () => {
      const input = valid() as unknown as Record<string, unknown>
      const r = validateVerificationResult(input)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      input.verdict = 'failed'
      ;(input.subject as Record<string, unknown>).change = 'other-change'
      expect(r.value.verdict).toBe('passed')
      expect(r.value.subject.change).toBe('w3-verifier')
    })

    test('返回副本已递归冻结：严格模式下对副本任意层级赋值均 throw', () => {
      const r = validateVerificationResult(valid())
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(Object.isFrozen(r.value)).toBe(true)
      expect(Object.isFrozen(r.value.subject)).toBe(true)
      expect(Object.isFrozen(r.value.evidence)).toBe(true)
      expect(Object.isFrozen(r.value.evidence[0])).toBe(true)
      expect(() => { (r.value as { verdict: string }).verdict = 'failed' }).toThrow(TypeError)
      expect(() => { (r.value.evidence as unknown as unknown[]).push('x') }).toThrow(TypeError)
    })
  })
})
