/**
 * workflow 定义文件窄解析器——同 packages/kernel/src/flow/manifest.ts 的策略：手写扫描，
 * 只支持本文件格式实际用到的 YAML 子集（flat key/value + 固定形状的 block 序列 +
 * `[a, b]` 单行 flow-list），禁引入 yaml 包（kernel 零第三方依赖硬规则）。格式错误
 * fail-loud（throw），不吞错静默返回残缺结构。
 */
import { GUARD_DATA_KEYS } from './types.js'
import type {
  ArtifactProducerPolicy, FieldRef, FieldType, GateKind, SkillRef, StepDef, StepTransition,
  WorkflowActionConfig, WorkflowArtifactConfig, WorkflowConditional, WorkflowDef,
  WorkflowDocumentContractV1, WorkflowGuardConfig,
} from './types.js'
import type { FieldName } from '../types.js'
import type { TrackPredicate } from './predicates.js'
import { parseDocumentContract, type WorkflowParseCursor as Cursor } from './parse-document-contract.js'

function parseInlineList(raw: string): string[] {
  const trimmed = raw.trim()
  if (trimmed === '[]') return []
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new Error(`workflow 解析错误：期望 [a, b] 形态的单行列表，实际 '${raw}'`)
  }
  return trimmed
    .slice(1, -1)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

/** `prompt: |-` 的窄 literal-block 解析。内容固定比键多 2 空格；serializer 也只写这一种形态。 */
function parsePromptBlock(cur: Cursor, keyIndent: number): string {
  const contentIndent = keyIndent + 2
  const out: string[] = []
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    // serializer 会给 literal block 的空行也写足缩进；无缩进空行属于字段间空白，不吞进 prompt。
    if (line.trim() === '' && line.length < contentIndent) break
    if (indentOf(line) < contentIndent) break
    out.push(line.slice(contentIndent))
    cur.i++
  }
  if (out.length === 0) throw new Error('workflow 解析错误：prompt: |- 后必须有缩进内容行')
  return out.join('\n')
}

function parseSkillsBlock(cur: Cursor, baseIndent: number): SkillRef[] {
  const skills: SkillRef[] = []
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '' ) { cur.i++; continue }
    if (indentOf(line) < baseIndent) break
    const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/.exec(line)
    if (!idMatch) break
    const id = idMatch[1] ?? ''
    cur.i++
    let depends_on: string[] | undefined
    const next = cur.lines[cur.i] ?? ''
    const depMatch = /^\s*depends_on:\s*(\[.*\])\s*$/.exec(next)
    if (depMatch && indentOf(next) > baseIndent) {
      depends_on = parseInlineList(depMatch[1] ?? '')
      cur.i++
    }
    skills.push(depends_on ? { id, depends_on } : { id })
  }
  return skills
}

function parseFieldRefBlock(cur: Cursor, baseIndent: number): FieldRef[] {
  const refs: FieldRef[] = []
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '') { cur.i++; continue }
    if (indentOf(line) < baseIndent) break
    const fieldMatch = /^\s*-\s+field:\s*(\S+)\s*$/.exec(line)
    if (!fieldMatch) break
    cur.i++
    const typeLine = cur.lines[cur.i] ?? ''
    const typeMatch = /^\s*type:\s*(string|file_path|boolean)\s*$/.exec(typeLine)
    if (!typeMatch) throw new Error(`workflow 解析错误：field '${fieldMatch[1]}' 缺 type`)
    cur.i++
    refs.push({ field: fieldMatch[1] ?? '', type: typeMatch[1] as FieldType })
  }
  return refs
}

/** guard/edge-action 的 track 条件块（G2 P2）：`when:` 下唯一一行 `track_in: [..]` 或
 *  `track_not_in: [..]`（YAML 侧 snake_case，对齐全仓「YAML snake_case → TS kebab kind」惯例，
 *  见 tracks/types.ts L76）。谓词行缩进必须深于 `when:` 键，否则 fail-loud。 */
function parseWhenBlock(cur: Cursor, whenIndent: number): TrackPredicate {
  while (cur.i < cur.lines.length && (cur.lines[cur.i] ?? '').trim() === '') cur.i++
  const line = cur.lines[cur.i] ?? ''
  if (indentOf(line) <= whenIndent) {
    throw new Error('workflow 解析错误：when 块缺 track_in/track_not_in 谓词行')
  }
  const m = /^\s*(track_in|track_not_in):\s*(\[.*\])\s*$/.exec(line)
  if (!m) throw new Error(`workflow 解析错误：when 谓词只支持 'track_in: [..]' 或 'track_not_in: [..]'，实际 '${line.trim()}'`)
  cur.i++
  return { kind: m[1] === 'track_in' ? 'track-in' : 'track-not-in', values: parseInlineList(m[2] ?? '') }
}

/** 显式 artifact 声明块（G2 P4）：每项 `- field: X` 后跟 `type: file_path`、`producer_policy: <token>`
 *  与可选 `required_when:` 块（复用 parseWhenBlock，YAML snake_case → TS kebab kind）。type 只支持
 *  file_path，缺 type/producer_policy 或出现未知子字段行 → fail-loud；field/producer_policy 闭集的深
 *  校验留 compileWorkflow（parse 只做语法层构造，同 guard field 的 as FieldName 惯例）。 */
function parseArtifactsBlock(cur: Cursor, baseIndent: number): WorkflowArtifactConfig[] {
  const arts: WorkflowArtifactConfig[] = []
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '') { cur.i++; continue }
    if (indentOf(line) < baseIndent) break
    const fieldMatch = /^\s*-\s+field:\s*(\S+)\s*$/.exec(line)
    if (!fieldMatch) break
    const itemIndent = indentOf(line)
    cur.i++
    let type: 'file_path' | undefined
    let producerPolicy: ArtifactProducerPolicy | undefined
    let requiredWhen: TrackPredicate | undefined
    while (cur.i < cur.lines.length) {
      const l = cur.lines[cur.i] ?? ''
      if (l.trim() === '') { cur.i++; continue }
      if (indentOf(l) <= itemIndent) break
      let m: RegExpExecArray | null
      if ((m = /^\s*type:\s*(\S+)\s*$/.exec(l))) {
        if (m[1] !== 'file_path') throw new Error(`workflow 解析错误：artifact '${fieldMatch[1]}' 的 type 只支持 file_path（实际 '${m[1]}'）`)
        type = 'file_path'; cur.i++; continue
      }
      if ((m = /^\s*producer_policy:\s*(\S+)\s*$/.exec(l))) { producerPolicy = m[1] as ArtifactProducerPolicy; cur.i++; continue }
      if (/^\s*required_when:\s*$/.test(l)) { const wi = indentOf(l); cur.i++; requiredWhen = parseWhenBlock(cur, wi); continue }
      throw new Error(`workflow 解析错误：artifact '${fieldMatch[1]}' 出现未知字段行 '${l.trim()}'`)
    }
    if (type === undefined) throw new Error(`workflow 解析错误：artifact '${fieldMatch[1]}' 缺 type`)
    if (producerPolicy === undefined) throw new Error(`workflow 解析错误：artifact '${fieldMatch[1]}' 缺 producer_policy`)
    const field = fieldMatch[1]! as FieldName
    arts.push(requiredWhen === undefined ? { field, type, producerPolicy } : { field, type, producerPolicy, requiredWhen })
  }
  return arts
}

interface GuardFields {
  n?: number
  field?: string
  value?: string
  values?: string[]
  when?: TrackPredicate
}

/** guard 项的 sub-field 读取（缩进深于 `- type:` 行的 n/field/value/values/when），到下一 guard
 *  项或退出块为止；未知 sub-field 行 fail-loud（定义层现在是闭集，不静默吞）。 */
function parseGuardEntry(cur: Cursor, type: string, itemIndent: number): WorkflowGuardConfig {
  const f: GuardFields = {}
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '') { cur.i++; continue }
    if (indentOf(line) <= itemIndent) break
    let m: RegExpExecArray | null
    if ((m = /^\s*n:\s*(\d+)\s*$/.exec(line))) { f.n = Number(m[1]); cur.i++; continue }
    if ((m = /^\s*field:\s*(\S+)\s*$/.exec(line))) { f.field = m[1]; cur.i++; continue }
    // value 允许内部空格（field-equals 可比对含空格的字段值，如 'needs review'）——用 (.+?) 而非
    // (\S+)，否则 serialize 写出的含空格 value 会成为 parse 读不回的行（往返破坏）。首尾空白按全仓
    // 窄解析器惯例 trim（无引号语义）；逗号仍受 [a,b] 内联列表分隔约束，同 depends_on/scope。
    if ((m = /^\s*value:\s*(.+?)\s*$/.exec(line))) { f.value = m[1]; cur.i++; continue }
    if ((m = /^\s*values:\s*(\[.*\])\s*$/.exec(line))) { f.values = parseInlineList(m[1] ?? ''); cur.i++; continue }
    if (/^\s*when:\s*$/.test(line)) { const wi = indentOf(line); cur.i++; f.when = parseWhenBlock(cur, wi); continue }
    throw new Error(`workflow 解析错误：guard '${type}' 出现未知字段行 '${line.trim()}'`)
  }
  return buildGuard(type, f)
}

function requireGuardField(f: GuardFields, type: string): FieldName {
  if (f.field === undefined) throw new Error(`workflow 解析错误：guard '${type}' 缺 field`)
  return f.field as FieldName // FIELD_ORDER 闭集校验在 compileWorkflow，parse 只做语法层构造
}

/** parse 读到的是 YAML 扁平子字段（n/field/value/values；when 对所有变体恒可选，不在此表）。
 *  与定义层 GUARD_DATA_KEYS（types.ts，附加字段校验单一真相源）逐键一致，唯 file-exists 的叶子在
 *  YAML 里写作扁平 `field:`（parseGuardEntry 桥接成 path.field），故把定义层的 'path' 折叠成 'field'。
 *  共用同一张表 → parse 的早期报错与 compile 的纵深防线不再各持一份会漂移的白名单（阻断 3）。 */
const GUARD_FLAT_FIELDS: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries(GUARD_DATA_KEYS).map(([type, keys]) => [type, keys.map((k) => (k === 'path' ? 'field' : k))]),
)

/** 出现该变体不认识的附加子字段 → fail-loud（对齐 parseGuardEntry 未知字段行的错误风格）。
 *  未知 type 不在表里（返回 undefined）→ 不在此报，留给 buildGuard 的 default 报「未知 guard type」。 */
function rejectExtraGuardFields(type: string, f: GuardFields): void {
  // hasOwnProperty（非直接下标）：未知 type（含原型链上的 'toString' 等）→ 返回，交 buildGuard 的
  // switch default 报「未知 guard type」，不把继承成员误当允许键表。
  if (!Object.prototype.hasOwnProperty.call(GUARD_FLAT_FIELDS, type)) return
  const allowed = GUARD_FLAT_FIELDS[type]!
  for (const key of ['n', 'field', 'value', 'values'] as const) {
    if (f[key] !== undefined && !allowed.includes(key)) {
      const permitted = allowed.length ? `${allowed.join('/')}（+ 可选 when）` : '仅可选 when'
      throw new Error(`workflow 解析错误：guard '${type}' 不接受附加字段 '${key}'（该变体只允许 ${permitted}）`)
    }
  }
}

/** 由 type + 已读 sub-field 构造定义层 guard；缺必填 sub-field / 未知 type / 附加字段 → fail-loud。
 *  field 位一律 as FieldName（真实闭集由 compileWorkflow 深校验）。 */
function buildGuard(type: string, f: GuardFields): WorkflowGuardConfig {
  rejectExtraGuardFields(type, f)
  const cond: WorkflowConditional = f.when ? { when: f.when } : {}
  switch (type) {
    case 'tasks-at-least':
      if (f.n === undefined) throw new Error("workflow 解析错误：guard 'tasks-at-least' 缺 n")
      return { type: 'tasks-at-least', n: f.n, ...cond }
    case 'nonempty-output':
      return { type: 'nonempty-output', ...cond }
    case 'field-nonempty':
      return { type: 'field-nonempty', field: requireGuardField(f, type), ...cond }
    case 'file-exists':
      return { type: 'file-exists', path: { kind: 'field', field: requireGuardField(f, type) }, ...cond }
    case 'field-equals':
      if (f.value === undefined) throw new Error("workflow 解析错误：guard 'field-equals' 缺 value")
      return { type: 'field-equals', field: requireGuardField(f, type), value: f.value, ...cond }
    case 'field-in':
      if (f.values === undefined || f.values.length === 0) {
        throw new Error("workflow 解析错误：guard 'field-in' 缺非空 values")
      }
      return { type: 'field-in', field: requireGuardField(f, type), values: f.values as [string, ...string[]], ...cond }
    case 'full-direct-override':
      return { type: 'full-direct-override', ...cond }
    case 'build-head-unchanged':
      return { type: 'build-head-unchanged', field: requireGuardField(f, type) as 'build_sha', ...cond }
    case 'spec-migration-applied':
      return { type: 'spec-migration-applied', ...cond }
    default:
      throw new Error(`workflow 解析错误：未知 guard type '${type}'（闭集见 types.ts WorkflowGuardConfig）`)
  }
}

function parseGuardsBlock(cur: Cursor, baseIndent: number): WorkflowGuardConfig[] {
  const guards: WorkflowGuardConfig[] = []
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '') { cur.i++; continue }
    if (indentOf(line) < baseIndent) break
    const m = /^\s*-\s+type:\s*(\S+)\s*$/.exec(line)
    if (!m) break
    const itemIndent = indentOf(line)
    cur.i++
    guards.push(parseGuardEntry(cur, m[1] ?? '', itemIndent))
  }
  return guards
}

const ACTION_TYPES = [
  'freeze-build-sha',
  'reset-pre-verify-review',
  'mark-verification-passed',
  'mark-verification-failed',
  'archive-run',
] as const

/** edge action 块（G2 P2）：`- type: X` 逐项（闭集、无 sub-field）；未知 type → fail-loud。 */
function parseActionsBlock(cur: Cursor, baseIndent: number): WorkflowActionConfig[] {
  const actions: WorkflowActionConfig[] = []
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '') { cur.i++; continue }
    if (indentOf(line) < baseIndent) break
    const m = /^\s*-\s+type:\s*(\S+)\s*$/.exec(line)
    if (!m) break
    const type = m[1] ?? ''
    cur.i++
    if (!(ACTION_TYPES as readonly string[]).includes(type)) {
      throw new Error(`workflow 解析错误：未知 action type '${type}'（闭集见 types.ts WorkflowActionConfig）`)
    }
    actions.push({ type: type as WorkflowActionConfig['type'] })
  }
  return actions
}

function parseTransitionsBlock(cur: Cursor, baseIndent: number): StepTransition[] {
  const transitions: StepTransition[] = []
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '') { cur.i++; continue }
    if (indentOf(line) < baseIndent) break
    const eventMatch = /^\s*-\s+event:\s*(\S+)\s*$/.exec(line)
    if (!eventMatch) break
    const itemIndent = indentOf(line)
    cur.i++
    const toLine = cur.lines[cur.i] ?? ''
    const toMatch = /^\s*to:\s*(\S+)\s*$/.exec(toLine)
    if (!toMatch) throw new Error(`workflow 解析错误：transitions 里 event '${eventMatch[1]}' 缺 to`)
    cur.i++
    // 可选 edge 级 guards/actions（缩进深于 `- event:` 行）；缺省 = undefined（旧 YAML 逐字不变）。
    let guards: WorkflowGuardConfig[] | undefined
    let actions: WorkflowActionConfig[] | undefined
    while (cur.i < cur.lines.length) {
      const l = cur.lines[cur.i] ?? ''
      if (l.trim() === '') { cur.i++; continue }
      if (indentOf(l) <= itemIndent) break
      if (/^\s*guards:\s*\[\]\s*$/.test(l)) { guards = []; cur.i++; continue }
      if (/^\s*guards:\s*$/.test(l)) { const gi = indentOf(l); cur.i++; guards = parseGuardsBlock(cur, gi); continue }
      if (/^\s*actions:\s*\[\]\s*$/.test(l)) { actions = []; cur.i++; continue }
      if (/^\s*actions:\s*$/.test(l)) { const ai = indentOf(l); cur.i++; actions = parseActionsBlock(cur, ai); continue }
      throw new Error(`workflow 解析错误：transition event '${eventMatch[1]}' 出现未知字段行 '${l.trim()}'`)
    }
    transitions.push({
      event: eventMatch[1] ?? '', to: toMatch[1] ?? '',
      ...(guards !== undefined ? { guards } : {}),
      ...(actions !== undefined ? { actions } : {}),
    })
  }
  return transitions
}

function parseStep(cur: Cursor): StepDef {
  const idLine = cur.lines[cur.i] ?? ''
  const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/.exec(idLine)
  if (!idMatch) throw new Error(`workflow 解析错误：期望 '- id: <name>'，实际 '${idLine}'`)
  const id = idMatch[1] ?? ''
  const baseIndent = indentOf(idLine) + 2 // step 内字段比 "- id:" 多缩进 2
  cur.i++

  let label = ''
  let gate: GateKind = null
  let prompt: string | undefined
  let skills: SkillRef[] = []
  let inputs: FieldRef[] = []
  let outputs: FieldRef[] = []
  let artifacts: WorkflowArtifactConfig[] | undefined
  let guards: WorkflowGuardConfig[] = []
  let transitions: StepTransition[] = []

  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '') { cur.i++; continue }
    if (indentOf(line) < baseIndent - 2) break
    const labelMatch = /^\s*label:\s*(.+)$/.exec(line)
    if (labelMatch) { label = (labelMatch[1] ?? '').trim(); cur.i++; continue }
    const gateMatch = /^\s*gate:\s*(review|confirm|null)\s*$/.exec(line)
    if (gateMatch) {
      const v = gateMatch[1] ?? ''
      gate = v === 'null' ? null : (v as GateKind)
      cur.i++
      continue
    }
    if (/^\s*prompt:\s*\|-\s*$/.test(line)) {
      const keyIndent = indentOf(line)
      cur.i++
      prompt = parsePromptBlock(cur, keyIndent)
      continue
    }
    if (/^\s*skills:\s*\[\]\s*$/.test(line)) { skills = []; cur.i++; continue }
    if (/^\s*skills:\s*$/.test(line)) { cur.i++; skills = parseSkillsBlock(cur, baseIndent); continue }
    if (/^\s*inputs:\s*\[\]\s*$/.test(line)) { inputs = []; cur.i++; continue }
    if (/^\s*inputs:\s*$/.test(line)) { cur.i++; inputs = parseFieldRefBlock(cur, baseIndent); continue }
    if (/^\s*outputs:\s*\[\]\s*$/.test(line)) { outputs = []; cur.i++; continue }
    if (/^\s*outputs:\s*$/.test(line)) { cur.i++; outputs = parseFieldRefBlock(cur, baseIndent); continue }
    if (/^\s*artifacts:\s*\[\]\s*$/.test(line)) { artifacts = []; cur.i++; continue }
    if (/^\s*artifacts:\s*$/.test(line)) { cur.i++; artifacts = parseArtifactsBlock(cur, baseIndent); continue }
    if (/^\s*guards:\s*\[\]\s*$/.test(line)) { cur.i++; continue }
    if (/^\s*guards:\s*$/.test(line)) { cur.i++; guards = parseGuardsBlock(cur, baseIndent); continue }
    if (/^\s*transitions:\s*\[\]\s*$/.test(line)) { transitions = []; cur.i++; continue }
    if (/^\s*transitions:\s*$/.test(line)) { cur.i++; transitions = parseTransitionsBlock(cur, baseIndent); continue }
    break
  }

  return {
    id, label, gate, skills, inputs, outputs, guards, transitions,
    ...(prompt !== undefined ? { prompt } : {}),
    ...(artifacts !== undefined ? { artifacts } : {}),
  }
}

export function parseWorkflow(content: string): WorkflowDef {
  const lines = content.split('\n')
  const nameMatch = /^name:\s*(\S+)\s*$/.exec(lines[0] ?? '')
  if (!nameMatch) throw new Error("workflow 解析错误：第一行必须是 'name: <name>'")
  let stepLine = 1
  let openspecContract: 'required' | undefined
  let documentContract: WorkflowDocumentContractV1 | undefined
  const contractLine = /^openspec_contract:\s*(\S+)\s*$/.exec(lines[stepLine] ?? '')
  if (contractLine) {
    if (contractLine[1] !== 'required') {
      throw new Error("workflow 解析错误：openspec_contract 只支持 'required'")
    }
    openspecContract = 'required'
    stepLine++
  }
  if ((lines[stepLine] ?? '').trim() === 'document_contract:') {
    const cur: Cursor = { lines, i: stepLine + 1 }
    documentContract = parseDocumentContract(cur, indentOf(lines[stepLine] ?? ''))
    stepLine = cur.i
  }
  if (openspecContract && documentContract) {
    throw new Error('workflow 解析错误：openspec_contract 与 document_contract 不得同时声明')
  }
  if ((lines[stepLine] ?? '').trim() !== 'steps:') {
    throw new Error("workflow 解析错误：name 后必须是 'steps:'、'openspec_contract: required' 或 document_contract")
  }

  const cur: Cursor = { lines, i: stepLine + 1 }
  const steps: StepDef[] = []
  while (cur.i < lines.length) {
    if ((lines[cur.i] ?? '').trim() === '') { cur.i++; continue }
    if (!/^\s*-\s+id:/.test(lines[cur.i] ?? '')) {
      throw new Error(`workflow 解析错误：steps 下每项必须以 '- id:' 开头，实际 '${lines[cur.i]}'`)
    }
    steps.push(parseStep(cur))
  }
  return {
    name: nameMatch[1] ?? '',
    ...(openspecContract ? { openspecContract } : {}),
    ...(documentContract ? { documentContract } : {}),
    steps,
  }
}
