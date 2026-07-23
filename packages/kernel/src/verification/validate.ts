/**
 * VerificationResult 手写窄校验（H7，H7-S1 补敌意输入防御）——对齐 loops/ledger-codec.ts 与
 * workflow/validate.ts 的仓约：零 schema 库、逐字段窄校验、错误消息带字段路径。
 *
 * H7-S1（对齐 codex r2 裁决「阻断1/2/4」的 kernel 半边）：input 在敌意模型下不可信——getter 能在
 * 同一属性上跨次读取返回不同值（骗过形状检查与跨字段一致性检查各看见不同数据，r2 给出的四拍循环
 * evidence getter PoC 即是一例）、Proxy trap 能在任意一次读取上抛错、附加 toJSON 能让 JSON.stringify
 * 落盘另一份数据。三者共同的解法是同一个：先把 input 的每个已知字段恰好读取一次、拷入全新 plain
 * 字面量树（未知键、方法/toJSON 一律不读取因而不残留），后续校验与序列化永远消费这棵新树而非原对象；
 * 读取阶段本身抛出（敌意 getter/Proxy trap）一律吞成 {ok:false}，不向调用方 throw——这是本文件「校验
 * 绝不 throw」这句话第一次对敌意输入也成立，不再是只对老实对象成立的半真话。全部窄校验通过后递归
 * Object.freeze 这棵新树再返回：返回的 value 永远不是 input 的引用，调用方后续无论怎样突变原对象，
 * 已拿到手的 value 不受影响；试图写 value 本身在严格模式（本仓全 ESM）下会 throw TypeError。
 *
 * 出口：
 *   · validateVerificationResult(input, path='verification')：单次读取抽取 → 在副本上跑窄校验 →
 *     全过则递归冻结副本返回 {ok:true,value}（value 是冻结副本，绝不是 input 本身）；抽取期读取抛错
 *     或窄校验不过 → {ok:false,errors}，绝不向外 throw。
 *   · collectVerificationResultErrors(value, path, errors)：推错风格窄校验器本体，假设 value 已是
 *     经抽取的安全副本（本函数自身不做 read-once 防护，多次读取同一 value 字段是安全的——前提是
 *     value 不再是敌意 getter/Proxy）。供 validateVerificationResult 内部复用，也继续独立导出供
 *     单测直验；本仓内任何消费未经抽取的原始输入的路径都不得再直接调用本函数（那样敌意 getter 的
 *     跨次读序攻击对它没有防护）——loops/ledger-codec.ts 的 decode 内嵌校验已改走
 *     validateVerificationResult，不再直接传裸 parsed 字段进本函数。
 *   · sanitizeVerificationResultForEncode(input)：只抽取不校验，供 loops/ledger-codec.ts 的 encode
 *     侧在 JSON.stringify 之前消毒——杀 toJSON、杀多余键，但不判断字段是否合法（encode 从不拒绝
 *     写入；合法性由 decode 侧的 validateVerificationResult 负责，encode/decode 往返一致性不因
 *     抽取而改变：非法字段原样抽取、原样落盘、decode 仍会拒）。
 * 另附 isTrustedPass 纯谓词（merge 授权原语，不变）。
 *
 * 校验清单（设计纲要 §1/§6，逐条对应下方实现，未变）：
 *   ID / 时间 / subject 非空；verdict 闭集；passed 至少一条 evidence；trusted issuer 由 kind 派生
 *   （sandbox 恒 false、host/human 恒 true，杜绝自报冒充）；repo-file 路径须项目相对（禁绝对 / `..`
 *   逃逸）；sha256 = 64 位小写 hex、git SHA = 40 或 64 位小写 hex；guard/action index 为非负整数。
 */
import type { VerificationResult } from './types.js'

export type VerificationValidation =
  | { readonly ok: true; readonly value: VerificationResult }
  | { readonly ok: false; readonly errors: readonly string[] }

// ── 窄校验小工具（自包含，风格对齐 ledger-codec.ts）─────────────────────────────
type Obj = Record<string, unknown>

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function typeName(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/** 敌意 thrown value 也可能在 message 读取或字符串强制转换时再次抛错；错误报告本身不得越界 throw。 */
function safeErrorText(value: unknown): string {
  try {
    if (value instanceof Error) {
      const message = value.message
      if (message.length > 0) return message
    }
  } catch {
    // 继续尝试通用字符串化；Error/Proxy 的 message 读取本身也可能是敌意 getter。
  }
  try {
    return String(value)
  } catch {
    return '<无法安全读取异常信息>'
  }
}

function missing(o: Obj, key: string): boolean {
  return !(key in o) || o[key] === undefined
}

/** 必填非空 string（ID/时间/坐标等语义键：空串一律非法）。optional 时缺席放行、存在仍校非空。 */
function checkNonEmptyStr(o: Obj, key: string, path: string, errors: string[], optional = false): void {
  if (missing(o, key)) {
    if (!optional) errors.push(`${path}.${key}: 缺失（必填非空 string）`)
    return
  }
  const v = o[key]
  if (typeof v !== 'string') { errors.push(`${path}.${key}: 应为 string，实得 ${typeName(v)}`); return }
  if (v.length === 0) errors.push(`${path}.${key}: 不得为空字符串`)
}

/** 精确字面量（schema_version:1 / trusted:false / revision.kind 单值等）。 */
function checkLit(o: Obj, key: string, literal: unknown, path: string, errors: string[]): void {
  if (missing(o, key)) { errors.push(`${path}.${key}: 缺失（必填字面量 ${JSON.stringify(literal)}）`); return }
  if (o[key] !== literal) errors.push(`${path}.${key}: 应为字面量 ${JSON.stringify(literal)}，实得 ${JSON.stringify(o[key])}`)
}

function checkEnum(o: Obj, key: string, allowed: readonly string[], path: string, errors: string[]): void {
  if (missing(o, key)) { errors.push(`${path}.${key}: 缺失（必填闭集 ${allowed.join('|')}）`); return }
  const v = o[key]
  if (typeof v !== 'string' || !allowed.includes(v)) {
    errors.push(`${path}.${key}: 应在闭集 [${allowed.join('|')}] 内，实得 ${JSON.stringify(v)}`)
  }
}

/** 非负整数（guard_index / action_index）。optional 时缺席放行、存在仍校型。 */
function checkNonNegInt(o: Obj, key: string, path: string, errors: string[], optional = false): void {
  if (missing(o, key)) {
    if (!optional) errors.push(`${path}.${key}: 缺失（必填非负整数）`)
    return
  }
  const v = o[key]
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    errors.push(`${path}.${key}: 应为非负整数，实得 ${JSON.stringify(v)}`)
  }
}

/** 整数（command-result.exit_code）。 */
function checkInt(o: Obj, key: string, path: string, errors: string[]): void {
  if (missing(o, key)) { errors.push(`${path}.${key}: 缺失（必填整数）`); return }
  const v = o[key]
  if (typeof v !== 'number' || !Number.isInteger(v)) errors.push(`${path}.${key}: 应为整数，实得 ${JSON.stringify(v)}`)
}

const SHA256_RE = /^[0-9a-f]{64}$/
const GIT_SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

/** 内容 sha256 = 64 位小写十六进制。optional 时缺席放行、存在仍校格式。 */
function checkSha256(o: Obj, key: string, path: string, errors: string[], optional = false): void {
  if (missing(o, key)) {
    if (!optional) errors.push(`${path}.${key}: 缺失（必填 sha256）`)
    return
  }
  const v = o[key]
  if (typeof v !== 'string') { errors.push(`${path}.${key}: 应为 string，实得 ${typeName(v)}`); return }
  if (!SHA256_RE.test(v)) errors.push(`${path}.${key}: 应为 64 位小写十六进制 sha256，实得 ${JSON.stringify(v)}`)
}

/** git 对象名 = 40（SHA-1）或 64（SHA-256）位小写十六进制（完整对象名，禁缩写，绑定精确 revision）。 */
function checkGitSha(o: Obj, key: string, path: string, errors: string[]): void {
  if (missing(o, key)) { errors.push(`${path}.${key}: 缺失（必填 git SHA）`); return }
  const v = o[key]
  if (typeof v !== 'string') { errors.push(`${path}.${key}: 应为 string，实得 ${typeName(v)}`); return }
  if (!GIT_SHA_RE.test(v)) errors.push(`${path}.${key}: 应为 40 或 64 位小写十六进制 git SHA（完整对象名），实得 ${JSON.stringify(v)}`)
}

/**
 * repo-file evidence 路径：必须是项目相对路径。禁绝对路径（POSIX `/` 前导、Windows 盘符 `X:`、`\` 前导）、
 * 任何 `..` 段（含 `\` 分隔的 Windows 逃逸）、NUL 字节、`.` 段与空段（连续/首尾分隔符）——这些都是 git tree
 * 实际不产生或不可核的非规范形式，裸路径逃逸/畸形即无法在 revision tree 内准确重算 hash（H7 复审次要项）。
 */
function checkRepoRelPath(o: Obj, key: string, path: string, errors: string[]): void {
  if (missing(o, key)) { errors.push(`${path}.${key}: 缺失（必填项目相对路径）`); return }
  const v = o[key]
  if (typeof v !== 'string') { errors.push(`${path}.${key}: 应为 string，实得 ${typeName(v)}`); return }
  if (v.length === 0) { errors.push(`${path}.${key}: 不得为空字符串`); return }
  if (v.includes('\0')) { errors.push(`${path}.${key}: 禁 NUL 字节（git tree 路径不可含 NUL），实得 ${JSON.stringify(v)}`); return }
  if (v.startsWith('/') || v.startsWith('\\') || /^[a-zA-Z]:/.test(v)) {
    errors.push(`${path}.${key}: 禁绝对路径（须项目相对），实得 ${JSON.stringify(v)}`)
    return
  }
  const segs = v.split(/[/\\]/)
  if (segs.some((seg) => seg === '..')) {
    errors.push(`${path}.${key}: 禁路径逃逸 '..'，实得 ${JSON.stringify(v)}`)
  }
  if (segs.some((seg) => seg === '.')) {
    errors.push(`${path}.${key}: 禁 '.' 路径段（git tree 不产生此形式，非规范路径），实得 ${JSON.stringify(v)}`)
  }
  if (segs.some((seg) => seg.length === 0)) {
    errors.push(`${path}.${key}: 禁空路径段（开头/结尾/连续分隔符），实得 ${JSON.stringify(v)}`)
  }
}

/** ISO-8601 时间戳（evaluated_at）：日期+时间+时区都必须存在，且需可被 Date 解析——拒绝纯日期、
 *  拒绝缺时区、拒绝 Date.parse 都认不出的畸形值（H7 复审次要项：此前只校非空字符串）。 */
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

function checkIsoTimestamp(o: Obj, key: string, path: string, errors: string[]): void {
  if (missing(o, key)) { errors.push(`${path}.${key}: 缺失（必填 ISO-8601 时间戳）`); return }
  const v = o[key]
  if (typeof v !== 'string') { errors.push(`${path}.${key}: 应为 string，实得 ${typeName(v)}`); return }
  if (!ISO_TIMESTAMP_RE.test(v) || Number.isNaN(Date.parse(v))) {
    errors.push(`${path}.${key}: 应为 ISO-8601 时间戳（如 2026-07-18T00:00:00.000Z），实得 ${JSON.stringify(v)}`)
  }
}

/** 安全读 subject.revision.sha（subject 已过 subObj 校验，但 revision 子对象/字段仍可能独立畸形；
 *  读不到就返回 undefined，调用方据此跳过跨字段比对，不重复报「subject 本身非法」的错）。 */
function subjectRevisionSha(subject: Obj): string | undefined {
  const revision = subject.revision
  if (!isObj(revision)) return undefined
  const sha = revision.sha
  return typeof sha === 'string' ? sha : undefined
}

/** 必填嵌套对象：对象性不成立时报错并返回 null（调用方跳过子字段校验）。 */
function subObj(o: Obj, key: string, path: string, errors: string[]): Obj | null {
  if (missing(o, key)) { errors.push(`${path}.${key}: 缺失（必填对象）`); return null }
  const v = o[key]
  if (!isObj(v)) { errors.push(`${path}.${key}: 应为对象，实得 ${typeName(v)}`); return null }
  return v
}

// ── 各判别子的校验 ────────────────────────────────────────────────────────────
const VERDICTS = ['passed', 'failed', 'inconclusive'] as const
const BINDING_KINDS = ['workflow-transition', 'default-transition', 'runtime-verifier'] as const
const ISSUER_KINDS = ['host-verifier', 'human-review', 'sandbox-report'] as const
const EVIDENCE_KINDS = ['repo-file', 'command-result'] as const

function validateSubject(o: Obj, path: string, errors: string[]): void {
  checkNonEmptyStr(o, 'workflow_run_id', path, errors)
  checkNonEmptyStr(o, 'attempt_id', path, errors)
  checkNonEmptyStr(o, 'change', path, errors)
  const rev = subObj(o, 'revision', path, errors)
  if (rev !== null) {
    const rp = `${path}.revision`
    checkLit(rev, 'kind', 'named-branch-head', rp, errors)
    checkGitSha(rev, 'sha', rp, errors)
  }
}

function validateBinding(o: Obj, path: string, errors: string[]): void {
  switch (o.kind) {
    case 'workflow-transition':
      checkNonEmptyStr(o, 'workflow_digest', path, errors)
      checkNonEmptyStr(o, 'workflow', path, errors)
      checkNonEmptyStr(o, 'step', path, errors)
      checkNonEmptyStr(o, 'event', path, errors)
      checkNonNegInt(o, 'guard_index', path, errors, true)
      checkNonNegInt(o, 'action_index', path, errors, true)
      break
    case 'default-transition':
      checkNonEmptyStr(o, 'event', path, errors)
      break
    case 'runtime-verifier':
      checkNonEmptyStr(o, 'verifier', path, errors)
      checkNonEmptyStr(o, 'version', path, errors)
      break
    default:
      errors.push(`${path}.kind: 应在闭集 [${BINDING_KINDS.join('|')}] 内，实得 ${JSON.stringify(o.kind)}`)
  }
}

function validateIssuer(o: Obj, path: string, errors: string[]): void {
  switch (o.kind) {
    case 'host-verifier':
      checkNonEmptyStr(o, 'verifier', path, errors)
      checkNonEmptyStr(o, 'version', path, errors)
      checkLit(o, 'trusted', true, path, errors)
      break
    case 'human-review':
      checkNonEmptyStr(o, 'actor_id', path, errors)
      checkLit(o, 'trusted', true, path, errors)
      break
    case 'sandbox-report':
      checkNonEmptyStr(o, 'runner', path, errors)
      checkLit(o, 'trusted', false, path, errors)
      break
    default:
      errors.push(`${path}.kind: 应在闭集 [${ISSUER_KINDS.join('|')}] 内，实得 ${JSON.stringify(o.kind)}`)
  }
}

function validateEvidenceRef(v: unknown, path: string, errors: string[]): void {
  if (!isObj(v)) { errors.push(`${path}: 应为对象，实得 ${typeName(v)}`); return }
  switch (v.kind) {
    case 'repo-file':
      checkRepoRelPath(v, 'path', path, errors)
      checkSha256(v, 'sha256', path, errors)
      checkGitSha(v, 'revision_sha', path, errors)
      break
    case 'command-result':
      checkNonEmptyStr(v, 'command_id', path, errors)
      checkInt(v, 'exit_code', path, errors)
      checkSha256(v, 'stdout_sha256', path, errors, true)
      checkSha256(v, 'stderr_sha256', path, errors, true)
      break
    default:
      errors.push(`${path}.kind: 应在闭集 [${EVIDENCE_KINDS.join('|')}] 内，实得 ${JSON.stringify(v.kind)}`)
  }
}

// ── H7-S1 单次读取抽取（read-once extraction）──────────────────────────────────
// 下面这组 extractXxx 函数只做一件事：对已知字段名恰好读取一次、拷入全新 plain 对象/数组，未知键与
// 非对象/非数组分支原样透传（把「形状错」这件事留给 collectVerificationResultErrors 在副本上判）。
// 判别式子结构（binding/issuer/evidence[] 的 kind）只在读到具体 kind 值之后，才读该 kind 名下的
// 已知字段——kind 落在闭集外时只保留 kind 本身，其余字段一律不读（闭集外分支的下游校验只看 kind，
// 保留别的字段没有意义，还会把「已知字段」的边界搞模糊）。任意一次属性读取抛出（敌意 getter/Proxy
// trap）由外层 snapshotVerificationResultFields 统一捕获，本组函数自身不吞异常、原样向上抛。

function extractEvidenceItem(raw: unknown): unknown {
  if (!isObj(raw)) return raw
  const out: Obj = {}
  const kind = raw.kind
  if (kind !== undefined) out.kind = kind
  switch (kind) {
    case 'repo-file': {
      const path = raw.path; if (path !== undefined) out.path = path
      const sha256 = raw.sha256; if (sha256 !== undefined) out.sha256 = sha256
      const revision_sha = raw.revision_sha; if (revision_sha !== undefined) out.revision_sha = revision_sha
      break
    }
    case 'command-result': {
      const command_id = raw.command_id; if (command_id !== undefined) out.command_id = command_id
      const exit_code = raw.exit_code; if (exit_code !== undefined) out.exit_code = exit_code
      const stdout_sha256 = raw.stdout_sha256; if (stdout_sha256 !== undefined) out.stdout_sha256 = stdout_sha256
      const stderr_sha256 = raw.stderr_sha256; if (stderr_sha256 !== undefined) out.stderr_sha256 = stderr_sha256
      break
    }
    default:
      break // kind 闭集外：只留 kind，交给 validateEvidenceRef 的 default 分支报错。
  }
  return out
}

/** 数组本身可能是 Proxy：length 只读一次并夹紧成非负整数，避免敌意 length 拖出无界/负数循环。 */
function extractEvidenceArray(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw
  const rawLength = raw.length
  const length = Number.isInteger(rawLength) && rawLength >= 0 ? rawLength : 0
  const out: unknown[] = []
  for (let i = 0; i < length; i++) out.push(extractEvidenceItem(raw[i])) // 每个下标恰好读一次
  return out
}

function extractRevision(raw: unknown): unknown {
  if (!isObj(raw)) return raw
  const out: Obj = {}
  const kind = raw.kind; if (kind !== undefined) out.kind = kind
  const sha = raw.sha; if (sha !== undefined) out.sha = sha
  return out
}

function extractSubject(raw: unknown): unknown {
  if (!isObj(raw)) return raw
  const out: Obj = {}
  const workflow_run_id = raw.workflow_run_id; if (workflow_run_id !== undefined) out.workflow_run_id = workflow_run_id
  const attempt_id = raw.attempt_id; if (attempt_id !== undefined) out.attempt_id = attempt_id
  const change = raw.change; if (change !== undefined) out.change = change
  const revision = raw.revision; if (revision !== undefined) out.revision = extractRevision(revision)
  return out
}

function extractBinding(raw: unknown): unknown {
  if (!isObj(raw)) return raw
  const out: Obj = {}
  const kind = raw.kind
  if (kind !== undefined) out.kind = kind
  switch (kind) {
    case 'workflow-transition': {
      const workflow_digest = raw.workflow_digest; if (workflow_digest !== undefined) out.workflow_digest = workflow_digest
      const workflow = raw.workflow; if (workflow !== undefined) out.workflow = workflow
      const step = raw.step; if (step !== undefined) out.step = step
      const event = raw.event; if (event !== undefined) out.event = event
      const guard_index = raw.guard_index; if (guard_index !== undefined) out.guard_index = guard_index
      const action_index = raw.action_index; if (action_index !== undefined) out.action_index = action_index
      break
    }
    case 'default-transition': {
      const event = raw.event; if (event !== undefined) out.event = event
      break
    }
    case 'runtime-verifier': {
      const verifier = raw.verifier; if (verifier !== undefined) out.verifier = verifier
      const version = raw.version; if (version !== undefined) out.version = version
      break
    }
    default:
      break // kind 闭集外：只留 kind，交给 validateBinding 的 default 分支报错。
  }
  return out
}

function extractIssuer(raw: unknown): unknown {
  if (!isObj(raw)) return raw
  const out: Obj = {}
  const kind = raw.kind
  if (kind !== undefined) out.kind = kind
  switch (kind) {
    case 'host-verifier': {
      const verifier = raw.verifier; if (verifier !== undefined) out.verifier = verifier
      const version = raw.version; if (version !== undefined) out.version = version
      const trusted = raw.trusted; if (trusted !== undefined) out.trusted = trusted
      break
    }
    case 'human-review': {
      const actor_id = raw.actor_id; if (actor_id !== undefined) out.actor_id = actor_id
      const trusted = raw.trusted; if (trusted !== undefined) out.trusted = trusted
      break
    }
    case 'sandbox-report': {
      const runner = raw.runner; if (runner !== undefined) out.runner = runner
      const trusted = raw.trusted; if (trusted !== undefined) out.trusted = trusted
      break
    }
    default:
      break // kind 闭集外：只留 kind，交给 validateIssuer 的 default 分支报错。
  }
  return out
}

function extractAutomationPolicy(raw: unknown): unknown {
  if (!isObj(raw)) return raw
  const out: Obj = {}
  const policy_id = raw.policy_id; if (policy_id !== undefined) out.policy_id = policy_id
  const policy_version = raw.policy_version; if (policy_version !== undefined) out.policy_version = policy_version
  const goal_sha256 = raw.goal_sha256; if (goal_sha256 !== undefined) out.goal_sha256 = goal_sha256
  return out
}

function extractTopLevel(raw: Obj): Obj {
  const out: Obj = {}
  const schema_version = raw.schema_version; if (schema_version !== undefined) out.schema_version = schema_version
  const verification_id = raw.verification_id; if (verification_id !== undefined) out.verification_id = verification_id
  const evaluated_at = raw.evaluated_at; if (evaluated_at !== undefined) out.evaluated_at = evaluated_at
  const verdict = raw.verdict; if (verdict !== undefined) out.verdict = verdict
  const subject = raw.subject; if (subject !== undefined) out.subject = extractSubject(subject)
  const binding = raw.binding; if (binding !== undefined) out.binding = extractBinding(binding)
  const automation_policy = raw.automation_policy
  if (automation_policy !== undefined) out.automation_policy = extractAutomationPolicy(automation_policy)
  const issuer = raw.issuer; if (issuer !== undefined) out.issuer = extractIssuer(issuer)
  const evidence = raw.evidence; if (evidence !== undefined) out.evidence = extractEvidenceArray(evidence)
  return out
}

/**
 * 单次读取抽取的唯一入口：非对象原样返回（形状判断留给 collectVerificationResultErrors），
 * 对象则拷入全新字面量树。会向上抛出——调用方（validateVerificationResult /
 * sanitizeVerificationResultForEncode）各自决定如何兜底敌意 getter/Proxy trap 抛出的异常。
 */
function snapshotVerificationResultFields(input: unknown): unknown {
  if (!isObj(input)) return input
  return extractTopLevel(input)
}

/** 递归冻结：抽取产物是自包含的全新 plain 对象/数组树（不含任何指回 input 的引用），不可能成环。 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (!Object.isFrozen(value)) {
    const asObj = value as unknown as Obj
    Object.freeze(asObj)
    for (const key of Object.keys(asObj)) deepFreeze(asObj[key])
  }
  return value
}

/**
 * encode 专用：只抽取、不校验，且吞掉读取期本身抛出的异常（encode 从不拒绝写入）。读取失败
 * （敌意 getter/Proxy trap）时返回一个必然通不过 decode 窄校验的占位对象——不把「读不出来」悄悄
 * 当合法数据落盘，也不让 encode 本身向外抛。供 loops/ledger-codec.ts 的 encode 侧调用。
 */
export function sanitizeVerificationResultForEncode(input: unknown): unknown {
  try {
    return snapshotVerificationResultFields(input)
  } catch (e) {
    return {
      __verification_unreadable__: true,
      __read_error__: safeErrorText(e),
    }
  }
}

/**
 * VerificationResult 窄校验（推错风格）：把 value 的全部字段错误推入 errors，path 为字段路径前缀
 * （独立校验时为 'verification'，内嵌 RunRecord 时由 ledger-codec 传 'run.verification'）。
 * value 必须已是经 snapshotVerificationResultFields 抽取的安全副本——本函数不做 read-once 防护。
 */
export function collectVerificationResultErrors(value: unknown, path: string, errors: string[]): void {
  if (!isObj(value)) { errors.push(`${path}: 应为对象，实得 ${typeName(value)}`); return }

  checkLit(value, 'schema_version', 1, path, errors)
  checkNonEmptyStr(value, 'verification_id', path, errors)
  checkIsoTimestamp(value, 'evaluated_at', path, errors)
  checkEnum(value, 'verdict', VERDICTS, path, errors)

  const subject = subObj(value, 'subject', path, errors)
  if (subject !== null) validateSubject(subject, `${path}.subject`, errors)

  const binding = subObj(value, 'binding', path, errors)
  if (binding !== null) validateBinding(binding, `${path}.binding`, errors)

  if (!missing(value, 'automation_policy')) {
    const policy = subObj(value, 'automation_policy', path, errors)
    if (policy !== null) {
      checkNonEmptyStr(policy, 'policy_id', `${path}.automation_policy`, errors)
      checkSha256(policy, 'policy_version', `${path}.automation_policy`, errors)
      checkSha256(policy, 'goal_sha256', `${path}.automation_policy`, errors)
    }
  }

  const issuer = subObj(value, 'issuer', path, errors)
  if (issuer !== null) validateIssuer(issuer, `${path}.issuer`, errors)

  // evidence 必须是数组；每条按 kind 窄校验；passed 判决至少一条（裸判决不成立）。
  if (missing(value, 'evidence')) {
    errors.push(`${path}.evidence: 缺失（必填 EvidenceRef[]）`)
  } else if (!Array.isArray(value.evidence)) {
    errors.push(`${path}.evidence: 应为数组，实得 ${typeName(value.evidence)}`)
  } else {
    value.evidence.forEach((item, i) => validateEvidenceRef(item, `${path}.evidence[${i}]`, errors))
    if (value.verdict === 'passed' && value.evidence.length === 0) {
      errors.push(`${path}.evidence: verdict=passed 至少需一条 evidence`)
    }
    // H7 复审阻断3：repo-file evidence 必须绑定当次 subject revision——旧 revision 的文件 evidence
    // 不得撑起新 revision 的 passed（两者各自都是合法格式的 git SHA 不等于「核的是这个 revision」；
    // 此前只校格式、不校相等，见复审 §1）。只在 passed 时强制：failed/inconclusive 判决不据 evidence
    // 授权 merge（isTrustedPass 只认 passed），旧 revision 证据出现在那两类判决里不构成绕过。
    if (value.verdict === 'passed' && subject !== null) {
      const subjectSha = subjectRevisionSha(subject)
      if (subjectSha !== undefined) {
        value.evidence.forEach((item, i) => {
          if (isObj(item) && item.kind === 'repo-file' && typeof item.revision_sha === 'string' && item.revision_sha !== subjectSha) {
            errors.push(
              `${path}.evidence[${i}].revision_sha: repo-file evidence 必须绑定 subject.revision.sha`
              + `（期望 ${JSON.stringify(subjectSha)}，实得 ${JSON.stringify(item.revision_sha)}——旧 revision 的证据不得支撑新 revision 的 passed）`,
            )
          }
        })
      }
    }
  }
}

/**
 * 独立校验入口（H7-S1：单次读取抽取 → 副本上窄校验 → 递归冻结）：input 每个已知字段先恰好读取一次
 * 拷入全新副本（杀 toJSON/多余键/敌意 getter 跨次读序不一致），窄校验全过 → 递归冻结副本、返回
 * {ok:true,value}（value 是冻结副本，绝不是 input 引用）；抽取期读取本身抛出（敌意 getter/Proxy
 * trap）或窄校验不过 → {ok:false,errors}（汇总全部字段错误）。绝不向外 throw——这对任意 input 成立，
 * 包括读取时会抛错的敌意 getter/Proxy。
 */
export function validateVerificationResult(input: unknown, path = 'verification'): VerificationValidation {
  let snapshot: unknown
  try {
    snapshot = snapshotVerificationResultFields(input)
  } catch (e) {
    return {
      ok: false,
      errors: [`${path}: 读取字段时抛出异常（疑似敌意 getter/Proxy trap），一律判失败：${safeErrorText(e)}`],
    }
  }
  const errors: string[] = []
  try {
    collectVerificationResultErrors(snapshot, path, errors)
  } catch (e) {
    return {
      ok: false,
      errors: [`${path}: 校验字段时抛出异常，一律判失败：${safeErrorText(e)}`],
    }
  }
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: deepFreeze(snapshot) as VerificationResult }
}

/**
 * merge 授权谓词（纯函数）：只有 trusted 签发方的 passed 判决才授权放行。failed / inconclusive、以及
 * 任何 untrusted（sandbox）判决一律 false——inconclusive 在授权面绝不被当 pass、sandbox 自报绝不授权 merge。
 */
export function isTrustedPass(result: VerificationResult): boolean {
  return result.verdict === 'passed' && result.issuer.trusted === true
}
