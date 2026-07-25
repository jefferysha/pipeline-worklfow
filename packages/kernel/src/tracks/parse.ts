/**
 * `.pipeline/tracks.yaml` 窄 YAML 解析器——镜像 loops/registry.ts 的技术路线（逐行 tokenize、
 * 缩进定层级、零 yaml npm 包，CONTRACT kernel 零第三方依赖）。与 loops 版的三点差异：
 * - token 带行号，全部错误 fail-loud 抛 TrackConfigParseError（loops 版返回 error string）；
 * - 解析后立刻做 schema 形状 walk（已知键闭集 + 标量类型 + snake_case→camelCase），
 *   产出 ProjectTrackConfig；
 * - mapping 重复键报错（loops 版静默后者覆盖前者）。
 *
 * 支持子集：块式 mapping / 块式序列 / 流式标量列表 / 单双引号与裸标量 / int·bool·null / 注释
 * （整行注释、裸标量行尾 ` #…`、引号闭合后的 ` #…` 都剥；引号未闭合、闭合后带非注释残留、
 * 值以 '{' 开头的流式 mapping 一律带行号报错——codex R1 review 钉死的畸形标量 fail-loud 三案）。
 * 锚点/别名、多行标量、比父键浅或平级缩进的块序列同样不支持，
 * 结构外内容按行号报错。裸 `*` 按字面字符串 '*' 接受（本子集无别名语义）。
 *
 * 职责边界：语义校验（id 词法/闭集/引用存在性/内建覆写限制）不在本层，见 validate.ts。
 * 特例：builtins 覆写节的 policy_profile 在本层照常解析带出（形状正确即过），由 validate
 * 统一拒绝（v1 锁死内建 policy）——错误归属对齐裁决的校验面划分。
 */
import type {
  ProjectBuiltinOverrideConfig,
  ProjectTrackConfig,
  ProjectTrackEntryConfig,
} from './types.js'
import { TrackConfigParseError } from './parse-error.js'

export { TrackConfigParseError } from './parse-error.js'

// ── 词法（loops/registry.ts tokenize 的带行号版）────────────────────────────────

interface Token {
  line: number
  indent: number
  kind: 'kv' | 'dash' | 'scalar'
  key?: string
  rest?: string // kv 的值原文（未解析）；空串 = 嵌套块 / null
  raw?: string // scalar 的原文
}

// 值捕获用 [\s\S]* 而非 .*：JS 的 . 不匹配 U+2028/U+2029 行分隔符，而这两个字符是可表示的
// （representable 放行、serialize 引号包裹写得出），窄到 .* 会让含它们的引号标量解析失败——
// write→load 自毁（codex R1 R3 阻断 1：拒绝面前移只对齐了 serialize，parser 词法漏了）。
const KEY_RE = /^([A-Za-z_][\w.-]*):(?:\s+([\s\S]*)|\s*)$/

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  const lines = text.split('\n')
  for (let n = 0; n < lines.length; n++) {
    const lineNo = n + 1
    const line = lines[n]!.replace(/\r$/, '')
    if (line.trim() === '') continue
    if (/^ *\t/.test(line)) throw new TrackConfigParseError(lineNo, '缩进不允许 tab（YAML 规范同样禁止）')
    const content = line.replace(/^ */, '')
    if (content.startsWith('#')) continue
    const indent = line.length - content.length

    if (content === '-' || content.startsWith('- ')) {
      const dashRest = content.slice(1)
      const after = dashRest.replace(/^\s*/, '')
      const itemCol = indent + 1 + (dashRest.length - after.length)
      tokens.push({ line: lineNo, indent, kind: 'dash' })
      if (after !== '') {
        const km = after.match(KEY_RE)
        if (km) tokens.push({ line: lineNo, indent: itemCol, kind: 'kv', key: km[1]!, rest: km[2] ?? '' })
        else tokens.push({ line: lineNo, indent: itemCol, kind: 'scalar', raw: after })
      }
      continue
    }

    const km = content.match(KEY_RE)
    if (km) tokens.push({ line: lineNo, indent, kind: 'kv', key: km[1]!, rest: km[2] ?? '' })
    else tokens.push({ line: lineNo, indent, kind: 'scalar', raw: content })
  }
  return tokens
}

// ── 结构解析：token 流 → 带行号节点树 ───────────────────────────────────────────

type ScalarValue = string | number | boolean | null

interface ScalarNode {
  kind: 'scalar'
  line: number
  value: ScalarValue
}
interface SeqNode {
  kind: 'seq'
  line: number
  items: Node[]
}
interface MapEntry {
  key: string
  line: number
  node: Node
}
interface MapNode {
  kind: 'map'
  line: number
  entries: MapEntry[]
}
type Node = ScalarNode | SeqNode | MapNode

/**
 * 引号标量：本子集无转义语义（serialize 侧拒绝同时含单双引号的字符串），故起始引号后第一个
 * 同款引号即闭合。未闭合报错；闭合后仅允许 ` #…` 行内注释尾巴（空白 + '#'，对齐裸标量剥注释
 * 的 /\s+#/ 口径与 YAML「注释须与前一 token 以空白分隔」规则），其余残留报错。
 */
function parseQuotedScalar(s: string, line: number): ScalarNode {
  const quote = s[0]!
  const close = s.indexOf(quote, 1)
  if (close === -1) {
    throw new TrackConfigParseError(line, `引号未闭合：${s}（起始 ${quote} 无配对闭合；本子集不支持多行标量）`)
  }
  const after = s.slice(close + 1)
  if (after !== '' && !/^\s+#/.test(after)) {
    throw new TrackConfigParseError(
      line,
      `引号闭合后存在非注释残留：${JSON.stringify(after)}（行内注释须以空白 + '#' 开始）`,
    )
  }
  return { kind: 'scalar', line, value: s.slice(1, close) }
}

function parseScalarText(raw: string, line: number): Node {
  const s = raw.trim()
  if (s === '') return { kind: 'scalar', line, value: null }
  // 值以 '#' 开头 = 源行形如 `key: #…`（KEY_RE 已吃掉 ':' 后的分隔空白）——整值是注释，按空值
  // 处理（YAML 注释语义），让形状校验对缺失的值 fail-loud，而不是吞成 '#…' 字符串。
  // loops/registry.ts parseScalar 在这一处保留字符串属其自身怪癖，刻意不对齐。
  if (s.startsWith('#')) return { kind: 'scalar', line, value: null }
  // 流式 mapping 不在支持子集内：值以 '{' 开头直接报错（流式列表 [a, b] 是已支持语法，不受影响）
  if (s.startsWith('{')) {
    throw new TrackConfigParseError(line, `不支持流式 mapping（值以 '{' 开头）：${s}——mapping 请用块式缩进`)
  }
  if (s.startsWith('"') || s.startsWith("'")) return parseQuotedScalar(s, line)
  if (s.startsWith('[')) {
    // 流式列表内部不裁注释（项自身的引号/注释语义由逐项递归处理）
    if (!s.endsWith(']')) throw new TrackConfigParseError(line, `流式列表未闭合：${s}`)
    const inner = s.slice(1, -1).trim()
    const items = inner === '' ? [] : inner.split(',').map((x) => parseScalarText(x, line))
    for (const it of items) {
      if (it.kind !== 'scalar') throw new TrackConfigParseError(line, '流式列表只支持标量项（不支持嵌套列表）')
    }
    return { kind: 'seq', line, items }
  }
  // 裸标量：剥行尾 ` #…` 行内注释——口径对齐 loops/registry.ts parseScalar 的 /\s+#/ 规则
  // （state/parse.ts 是另一契约面：写侧四闸拒含 ' #' 的值、读侧从不剥注释，不取其口径）。
  let bare = s
  const cm = bare.match(/^(.*?)\s+#.*$/)
  if (cm) bare = cm[1]!.trimEnd()
  if (bare === 'null' || bare === '~') return { kind: 'scalar', line, value: null }
  if (bare === 'true') return { kind: 'scalar', line, value: true }
  if (bare === 'false') return { kind: 'scalar', line, value: false }
  if (/^-?\d+$/.test(bare)) return { kind: 'scalar', line, value: Number(bare) }
  return { kind: 'scalar', line, value: bare }
}

function parseMapping(tokens: Token[], start: number, indent: number): { node: MapNode; next: number } {
  const entries: MapEntry[] = []
  const seen = new Set<string>()
  const line = tokens[start]!.line
  let i = start
  while (i < tokens.length && tokens[i]!.indent === indent && tokens[i]!.kind === 'kv') {
    const t = tokens[i]!
    if (seen.has(t.key!)) throw new TrackConfigParseError(t.line, `重复键 '${t.key}'`)
    seen.add(t.key!)
    i++
    let node: Node
    if ((t.rest ?? '') === '') {
      if (i < tokens.length && tokens[i]!.indent > indent) {
        const r = parseNode(tokens, i, tokens[i]!.indent)
        node = r.node
        i = r.next
      } else {
        node = { kind: 'scalar', line: t.line, value: null }
      }
    } else {
      node = parseScalarText(t.rest!, t.line)
    }
    entries.push({ key: t.key!, line: t.line, node })
  }
  return { node: { kind: 'map', line, entries }, next: i }
}

function parseSequence(tokens: Token[], start: number, indent: number): { node: SeqNode; next: number } {
  const items: Node[] = []
  const line = tokens[start]!.line
  let i = start
  while (i < tokens.length && tokens[i]!.indent === indent && tokens[i]!.kind === 'dash') {
    const dashLine = tokens[i]!.line
    i++
    if (i < tokens.length && tokens[i]!.indent > indent) {
      const r = parseNode(tokens, i, tokens[i]!.indent)
      items.push(r.node)
      i = r.next
    } else {
      items.push({ kind: 'scalar', line: dashLine, value: null })
    }
  }
  return { node: { kind: 'seq', line, items }, next: i }
}

function parseNode(tokens: Token[], i: number, indent: number): { node: Node; next: number } {
  const t = tokens[i]!
  if (t.kind === 'dash') return parseSequence(tokens, i, indent)
  if (t.kind === 'kv') return parseMapping(tokens, i, indent)
  return { node: parseScalarText(t.raw!, t.line), next: i + 1 }
}

function parseDocumentRoot(text: string): MapNode {
  const tokens = tokenize(text)
  if (tokens.length === 0) throw new TrackConfigParseError(null, '空文档（缺少必填顶层键 version）')
  const first = tokens[0]!
  if (first.indent !== 0) throw new TrackConfigParseError(first.line, `顶层意外缩进（indent=${first.indent}）`)
  if (first.kind !== 'kv') {
    throw new TrackConfigParseError(first.line, '顶层必须是 mapping（version/builtins/tracks 键）')
  }
  const r = parseMapping(tokens, 0, 0)
  if (r.next !== tokens.length) {
    throw new TrackConfigParseError(tokens[r.next]!.line, '残留未解析内容（缩进错乱或超出支持的 YAML 子集）')
  }
  return r.node
}

// ── 形状 walk：节点树 → ProjectTrackConfig（已知键闭集 + 标量类型）──────────────

function describeNode(n: Node): string {
  if (n.kind === 'map') return 'mapping'
  if (n.kind === 'seq') return '列表'
  const v = n.value
  if (v === null) return '空值'
  if (typeof v === 'string') return `字符串 ${JSON.stringify(v)}`
  if (typeof v === 'number') return `整数 ${v}`
  return `布尔 ${String(v)}`
}

function isNullScalar(n: Node): boolean {
  return n.kind === 'scalar' && n.value === null
}

function expectMap(n: Node, at: string): MapNode {
  if (n.kind !== 'map') throw new TrackConfigParseError(n.line, `${at} 应为 mapping，得到 ${describeNode(n)}`)
  return n
}

function expectSeq(n: Node, at: string): SeqNode {
  if (n.kind !== 'seq') throw new TrackConfigParseError(n.line, `${at} 应为列表，得到 ${describeNode(n)}`)
  return n
}

function expectString(n: Node, at: string): string {
  if (n.kind !== 'scalar' || typeof n.value !== 'string') {
    throw new TrackConfigParseError(n.line, `${at} 应为字符串，得到 ${describeNode(n)}（歧义标量请加引号）`)
  }
  return n.value
}

function expectBoolean(n: Node, at: string): boolean {
  if (n.kind !== 'scalar' || typeof n.value !== 'boolean') {
    throw new TrackConfigParseError(n.line, `${at} 应为布尔（true/false），得到 ${describeNode(n)}`)
  }
  return n.value
}

function expectInteger(n: Node, at: string): number {
  if (n.kind !== 'scalar' || typeof n.value !== 'number') {
    throw new TrackConfigParseError(n.line, `${at} 应为整数，得到 ${describeNode(n)}`)
  }
  return n.value
}

function checkKeys(map: MapNode, allowed: readonly string[], at: string): void {
  for (const e of map.entries) {
    if (!allowed.includes(e.key)) {
      throw new TrackConfigParseError(e.line, `${at} 存在未知键 '${e.key}'（只支持 ${allowed.join('/')}）`)
    }
  }
}

function getEntry(map: MapNode, key: string): MapEntry | undefined {
  return map.entries.find((e) => e.key === key)
}

/** 防 '__proto__' 键改写对象原型：一律 defineProperty 落成自有可枚举属性。 */
function defineKey<T>(rec: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(rec, key, { value, enumerable: true, writable: true, configurable: true })
}

interface MutableWorkflow {
  default?: string
  allowed?: '*' | string[]
}
interface MutableRouting {
  enabled?: boolean
  pattern?: string
  excludePattern?: string
  priority?: number
}
interface MutableSkills {
  matrix?: boolean
  profile?: string
}
interface MutablePolicy {
  reviewSeed?: string
  autoEnqueueOnSpecComplete?: boolean
  automationEligible?: boolean
  coverageProfile?: string
  routing?: MutableRouting
  skills?: MutableSkills
}

function walkAllowed(n: Node, at: string): '*' | string[] {
  if (n.kind === 'scalar') {
    if (n.value === '*') return '*'
    throw new TrackConfigParseError(n.line, `${at}.allowed 只支持 '*' 或工作流 id 列表，得到 ${describeNode(n)}`)
  }
  const seq = expectSeq(n, `${at}.allowed`)
  return seq.items.map((item, j) => expectString(item, `${at}.allowed[${j}]`))
}

function walkWorkflow(n: Node, at: string): MutableWorkflow {
  if (isNullScalar(n)) return {}
  const map = expectMap(n, `${at}.workflow`)
  checkKeys(map, ['default', 'allowed'], `${at}.workflow`)
  const out: MutableWorkflow = {}
  const d = getEntry(map, 'default')
  if (d) out.default = expectString(d.node, `${at}.workflow.default`)
  const a = getEntry(map, 'allowed')
  if (a) out.allowed = walkAllowed(a.node, `${at}.workflow`)
  return out
}

function walkRouting(n: Node, at: string): MutableRouting {
  if (isNullScalar(n)) return {}
  const map = expectMap(n, `${at}.routing`)
  checkKeys(map, ['enabled', 'pattern', 'exclude_pattern', 'priority'], `${at}.routing`)
  const out: MutableRouting = {}
  const e = getEntry(map, 'enabled')
  if (e) out.enabled = expectBoolean(e.node, `${at}.routing.enabled`)
  const p = getEntry(map, 'pattern')
  if (p) out.pattern = expectString(p.node, `${at}.routing.pattern`)
  const ep = getEntry(map, 'exclude_pattern')
  if (ep) out.excludePattern = expectString(ep.node, `${at}.routing.exclude_pattern`)
  const pr = getEntry(map, 'priority')
  if (pr) out.priority = expectInteger(pr.node, `${at}.routing.priority`)
  return out
}

function walkSkills(n: Node, at: string): MutableSkills {
  if (isNullScalar(n)) return {}
  const map = expectMap(n, `${at}.skills`)
  checkKeys(map, ['matrix', 'profile'], `${at}.skills`)
  const out: MutableSkills = {}
  const m = getEntry(map, 'matrix')
  if (m) out.matrix = expectBoolean(m.node, `${at}.skills.matrix`)
  const p = getEntry(map, 'profile')
  if (p) out.profile = expectString(p.node, `${at}.skills.profile`)
  return out
}

function walkPolicy(n: Node, at: string): MutablePolicy {
  if (isNullScalar(n)) return {}
  const map = expectMap(n, `${at}.policy_profile`)
  checkKeys(map, ['review_seed', 'auto_enqueue_on_spec_complete', 'automation_eligible', 'coverage_profile', 'routing', 'skills'], `${at}.policy_profile`)
  const out: MutablePolicy = {}
  const rs = getEntry(map, 'review_seed')
  if (rs) out.reviewSeed = expectString(rs.node, `${at}.policy_profile.review_seed`)
  const aes = getEntry(map, 'auto_enqueue_on_spec_complete')
  if (aes) out.autoEnqueueOnSpecComplete = expectBoolean(aes.node, `${at}.policy_profile.auto_enqueue_on_spec_complete`)
  const ae = getEntry(map, 'automation_eligible')
  if (ae) out.automationEligible = expectBoolean(ae.node, `${at}.policy_profile.automation_eligible`)
  const cp = getEntry(map, 'coverage_profile')
  if (cp) out.coverageProfile = expectString(cp.node, `${at}.policy_profile.coverage_profile`)
  const r = getEntry(map, 'routing')
  if (r) out.routing = walkRouting(r.node, `${at}.policy_profile`)
  const s = getEntry(map, 'skills')
  if (s) out.skills = walkSkills(s.node, `${at}.policy_profile`)
  return out
}

function walkOverride(n: Node, at: string): ProjectBuiltinOverrideConfig {
  if (isNullScalar(n)) return {}
  const map = expectMap(n, at)
  checkKeys(map, ['label', 'workflow', 'policy_profile'], at)
  const out: { label?: string; workflow?: MutableWorkflow; policyProfile?: MutablePolicy } = {}
  const l = getEntry(map, 'label')
  if (l) out.label = expectString(l.node, `${at}.label`)
  const w = getEntry(map, 'workflow')
  if (w) out.workflow = walkWorkflow(w.node, at)
  const p = getEntry(map, 'policy_profile')
  if (p) out.policyProfile = walkPolicy(p.node, at)
  return out
}

function walkTrackEntry(n: Node, at: string): ProjectTrackEntryConfig {
  const map = expectMap(n, `${at}（须为 '- id: …' 形式的 mapping）`)
  checkKeys(map, ['id', 'label', 'workflow', 'policy_profile'], at)
  const out: { id?: string; label?: string; workflow?: MutableWorkflow; policyProfile?: MutablePolicy } = {}
  const id = getEntry(map, 'id')
  if (id) out.id = expectString(id.node, `${at}.id`)
  const l = getEntry(map, 'label')
  if (l) out.label = expectString(l.node, `${at}.label`)
  const w = getEntry(map, 'workflow')
  if (w) out.workflow = walkWorkflow(w.node, at)
  const p = getEntry(map, 'policy_profile')
  if (p) out.policyProfile = walkPolicy(p.node, at)
  return out
}

/**
 * 解析 tracks.yaml 文本 → ProjectTrackConfig。任何结构/类型问题抛 TrackConfigParseError
 * （带行号）；语义合法性交给 validateTrackRegistry。
 */
export function parseTrackRegistry(text: string): ProjectTrackConfig {
  const root = parseDocumentRoot(text)
  checkKeys(root, ['version', 'builtins', 'tracks'], '顶层')

  const versionEntry = getEntry(root, 'version')
  if (!versionEntry) throw new TrackConfigParseError(null, "缺少必填顶层键 version（须为 'version: 1'）")
  const vn = versionEntry.node
  if (vn.kind !== 'scalar' || vn.value !== 1) {
    throw new TrackConfigParseError(versionEntry.line, `version 只支持 1，得到 ${describeNode(vn)}`)
  }

  const config: {
    version: 1
    builtins?: Record<string, ProjectBuiltinOverrideConfig>
    tracks?: ProjectTrackEntryConfig[]
  } = { version: 1 }

  const b = getEntry(root, 'builtins')
  if (b && !isNullScalar(b.node)) {
    const map = expectMap(b.node, 'builtins')
    if (map.entries.length > 0) {
      const rec: Record<string, ProjectBuiltinOverrideConfig> = {}
      for (const e of map.entries) defineKey(rec, e.key, walkOverride(e.node, `builtins.${e.key}`))
      config.builtins = rec
    }
  }

  const t = getEntry(root, 'tracks')
  if (t && !isNullScalar(t.node)) {
    const seq = expectSeq(t.node, 'tracks')
    if (seq.items.length > 0) {
      config.tracks = seq.items.map((item, i) => walkTrackEntry(item, `tracks[${i}]`))
    }
  }

  return config
}
