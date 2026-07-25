/**
 * ProjectTrackConfig → 规范化 YAML 文本。确定性：键序固定（version → builtins（内建固定序
 * chat/simple/pm/frontend/backend/free）→ tracks（声明序）；子键 label → workflow{default→allowed} →
 * policy_profile{review_seed→auto_enqueue_on_spec_complete→automation_eligible→coverage_profile→routing{enabled→pattern→
 * priority}→skills{matrix→profile}}）、引号规则固定。与 parse.ts 往返稳定：
 * parse(serialize(x)) 与 x 结构相等，其中空 section/空对象规范化为省略（serialize∘parse 幂等）。
 * registryRevision 的哈希输入就是本函数输出，规范化同时定义了 revision 的等价类。
 *
 * 注意（codex 裁决原话入档）：CRUD 走本序列化重写文件时会规范化整个文件、丢弃手写注释——
 * 需要长期说明的内容放 docs/GOAL，不放 tracks.yaml。
 *
 * 窄子集边界（fail-loud，绝不静默丢数据）：字符串拒绝面收敛在 representable.ts 的共享谓词
 * （含换行/回车/tab、同含单双引号）——validate 用同一谓词把拒绝面前移到校验层；整数字段写出前
 * 过「纯十进制可读回」防御闸（主闸是 validate 的非负安全整数规则）；mapping 键须匹配解析器
 * KEY_RE；流式列表项含 , [ ] 时自动降级为块式列表。
 */
import type {
  ProjectBuiltinOverrideConfig,
  ProjectPolicyProfileConfig,
  ProjectTrackConfig,
  ProjectWorkflowConfig,
} from './types.js'
import { BUILTIN_TRACK_IDS } from './builtins.js'
import { stringUnrepresentableReason } from './representable.js'
import { required } from '../required.js'

/** 可裸写（无引号）的标量形态：不会被 parse 误读成 int/bool/null/注释/流式结构的保守闭集。 */
const BARE_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/
const AMBIGUOUS = new Set(['true', 'false', 'null', '~'])

function emitString(s: string): string {
  const reason = stringUnrepresentableReason(s)
  if (reason !== null) {
    throw new Error(`serializeTrackRegistry: ${reason}：${JSON.stringify(s)}`)
  }
  if (BARE_RE.test(s) && !AMBIGUOUS.has(s) && !/^-?\d+$/.test(s)) return s
  if (!s.includes("'")) return `'${s}'`
  // 谓词已排除「同含单双引号」：走到这里必然不含双引号，双引号包裹恒可行
  return `"${s}"`
}

function emitInteger(n: number): string {
  if (!Number.isInteger(n)) throw new Error(`serializeTrackRegistry: 期望整数，得到 ${n}`)
  const text = String(n)
  // 纵深防御（主闸在 validate 的非负安全整数规则）：写出前确认十进制文本能被自家 parse 读回
  // 同值——parse 只认 /^-?\d+$/。1e21 这类 Number.isInteger 放行、String() 却成科学计数法的
  // 值在此拦截，绝不落盘产出 load 读不回的文件。
  if (!/^-?\d+$/.test(text) || Number(text) !== n) {
    throw new Error(
      `serializeTrackRegistry: 整数 ${n} 的写出文本 ${JSON.stringify(text)} 不是 parse 可读回的纯十进制，拒写`,
    )
  }
  return text
}

/** mapping 键必须能被解析器 KEY_RE 认回（否则产文不可往返）。 */
function emitMapKey(key: string): string {
  if (!/^[A-Za-z_][\w.-]*$/.test(key)) {
    throw new Error(`serializeTrackRegistry: mapping 键超出解析器可认子集：${JSON.stringify(key)}`)
  }
  return key
}

function pushAllowed(lines: string[], pad: string, allowed: '*' | readonly string[]): void {
  if (allowed === '*') {
    lines.push(`${pad}allowed: '*'`)
    return
  }
  if (allowed.length === 0) {
    lines.push(`${pad}allowed: []`)
    return
  }
  const items = allowed.map(emitString)
  // 流式列表按裸逗号切分（parse 侧不识别引号内逗号），含 , [ ] 的项走块式列表
  if (items.every((it) => !/[,[\]]/.test(it))) {
    lines.push(`${pad}allowed: [${items.join(', ')}]`)
    return
  }
  lines.push(`${pad}allowed:`)
  for (const it of items) lines.push(`${pad}  - ${it}`)
}

function pushWorkflow(lines: string[], pad: string, wf: ProjectWorkflowConfig): void {
  if (wf.default === undefined && wf.allowed === undefined) return
  lines.push(`${pad}workflow:`)
  if (wf.default !== undefined) lines.push(`${pad}  default: ${emitString(wf.default)}`)
  if (wf.allowed !== undefined) pushAllowed(lines, `${pad}  `, wf.allowed)
}

function pushPolicy(lines: string[], pad: string, p: ProjectPolicyProfileConfig): void {
  const sub: string[] = []
  const inner = `${pad}  `
  if (p.reviewSeed !== undefined) sub.push(`${inner}review_seed: ${emitString(p.reviewSeed)}`)
  if (p.autoEnqueueOnSpecComplete !== undefined) sub.push(`${inner}auto_enqueue_on_spec_complete: ${String(p.autoEnqueueOnSpecComplete)}`)
  if (p.automationEligible !== undefined) sub.push(`${inner}automation_eligible: ${String(p.automationEligible)}`)
  if (p.coverageProfile !== undefined) sub.push(`${inner}coverage_profile: ${emitString(p.coverageProfile)}`)
  if (p.routing !== undefined) {
    const r: string[] = []
    if (p.routing.enabled !== undefined) r.push(`${inner}  enabled: ${String(p.routing.enabled)}`)
    if (p.routing.pattern !== undefined) r.push(`${inner}  pattern: ${emitString(p.routing.pattern)}`)
    if (p.routing.excludePattern !== undefined) r.push(`${inner}  exclude_pattern: ${emitString(p.routing.excludePattern)}`)
    if (p.routing.priority !== undefined) r.push(`${inner}  priority: ${emitInteger(p.routing.priority)}`)
    if (r.length > 0) sub.push(`${inner}routing:`, ...r)
  }
  if (p.skills !== undefined) {
    const s: string[] = []
    if (p.skills.matrix !== undefined) s.push(`${inner}  matrix: ${String(p.skills.matrix)}`)
    if (p.skills.profile !== undefined) s.push(`${inner}  profile: ${emitString(p.skills.profile)}`)
    if (s.length > 0) sub.push(`${inner}skills:`, ...s)
  }
  if (sub.length === 0) return
  lines.push(`${pad}policy_profile:`, ...sub)
}

/** builtins 键序：内建固定序在前，未知键（结构校验会拒绝，但序列化保持全函数）按字典序排后。 */
function orderedOverrideKeys(builtins: NonNullable<ProjectTrackConfig['builtins']>): string[] {
  const keys = Object.keys(builtins)
  const known = (BUILTIN_TRACK_IDS as readonly string[]).filter((id) => keys.includes(id))
  const rest = keys.filter((k) => !(BUILTIN_TRACK_IDS as readonly string[]).includes(k)).sort()
  return [...known, ...rest]
}

export function serializeTrackRegistry(config: ProjectTrackConfig): string {
  const lines: string[] = [`version: ${emitInteger(config.version)}`]

  const builtins = config.builtins
  if (builtins !== undefined) {
    const emitted: string[] = []
    for (const key of orderedOverrideKeys(builtins)) {
      const ov: ProjectBuiltinOverrideConfig = required(builtins[key])
      const sub: string[] = []
      if (ov.label !== undefined) sub.push(`    label: ${emitString(ov.label)}`)
      if (ov.workflow !== undefined) pushWorkflow(sub, '    ', ov.workflow)
      if (ov.policyProfile !== undefined) pushPolicy(sub, '    ', ov.policyProfile)
      if (sub.length === 0) continue // 空覆写规范化为省略
      emitted.push(`  ${emitMapKey(key)}:`, ...sub)
    }
    if (emitted.length > 0) lines.push('builtins:', ...emitted)
  }

  const tracks = config.tracks ?? []
  if (tracks.length > 0) {
    lines.push('tracks:')
    for (const entry of tracks) {
      const sub: string[] = []
      if (entry.id !== undefined) sub.push(`    id: ${emitString(entry.id)}`)
      if (entry.label !== undefined) sub.push(`    label: ${emitString(entry.label)}`)
      if (entry.workflow !== undefined) pushWorkflow(sub, '    ', entry.workflow)
      if (entry.policyProfile !== undefined) pushPolicy(sub, '    ', entry.policyProfile)
      if (sub.length === 0) {
        // 空条目产文 '-' 会被 parse 拒绝；写路径先过结构校验（要求 id 等字段）到不了这里，
        // 保持全函数以便诊断脏配置。
        lines.push('  -')
        continue
      }
      lines.push(`  - ${required(sub[0]).slice(4)}`, ...sub.slice(1))
    }
  }

  return `${lines.join('\n')}\n`
}
