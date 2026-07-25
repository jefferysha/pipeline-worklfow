/**
 * loops update —— `.pipeline/loops.yaml` 字段级文本手术（v5 T3 / 决议 #3 #12 存储侧）。
 *
 * 沿 graduation.ts::setAutonomyLevelInYaml 的 surgical 先例（只动目标行，保留其余格式/注释），
 * 扩到「已存在 loop 的标量与字符串数组字段 patch」：
 *   · 标量（loop 顶层）：cadence / goal / design_doc / change_prefix / risk / status
 *   · 标量（budget 嵌套）：max_runs_per_day / max_in_flight / max_tokens_per_day / on_exceed
 *   · 字符串数组（整块替换）：human_gates / kill_criteria / allowlist / denylist
 * 边界（deliberately 窄，见计划 open question 拍板）：
 *   · 只 patch **已存在的 loop**——不新建/删除 loop；字段行缺失时按 setAutonomyLevelInYaml
 *     先例在块尾（budget 字段在 budget 子块尾）插入（可选字段 max_tokens_per_day/allowlist/denylist
 *     在旧登记表里天然缺行）。
 *   · autonomy_level 不收——升降档必须走毕业制裁决（applyLevelChange / POST /api/loops/level），
 *     本函数是它的旁路禁区。
 *   · 值的写回格式与 registry.ts 窄解析器闭环：写前用 parseLoopsYaml 对 `k: <candidate>` 做
 *     roundtrip 判定，裸标量读不回原文（含 ` #`、引号开头、数字/布尔形等）就加双引号；
 *     含双引号/换行/控制字符的字符串直接拒绝（窄解析器无转义语义，写进去就是坏数据）。
 * 纯函数（text in → text out），零 fs：并发控制（读-判-写 CAS）由调用方（server）负责，
 * 对齐 afk retry 的 CAS 先例。
 */
import { LOOPS_SCHEMA, parseLoopsYaml, validateSchema } from './registry.js'
import type { LoopBudget, LoopKind, LoopRisk, LoopStatus } from './types.js'
import { indentOf, insertPointAtBlockEnd, locateLoop, type LoopBlock } from './yamlBlock.js'
import { required } from '../required.js'

/** loop 顶层可 patch 标量字段（schema 同名约束在写回后由调用方整文档校验）。
 * v5 T20：+runner（双 runner 数据面——编排页 runner 下拉走 POST /api/loops/update 落盘）。
 * H10 §1：+skill_bundle_id（policy 字段治理写入；本函数只搬字面量，不做词法/存在性校验——写回后
 * 调用方须重跑 parseLoopsYaml + validateSchema(LOOPS_SCHEMA) 才拦下非法值，同 cadence/risk 口径）。 */
export const PATCHABLE_SCALAR_FIELDS = [
  'cadence', 'goal', 'design_doc', 'change_prefix', 'risk', 'status', 'runner', 'skill_bundle_id',
] as const
/** budget 嵌套可 patch 标量字段。 */
export const PATCHABLE_BUDGET_FIELDS = ['max_runs_per_day', 'max_in_flight', 'max_tokens_per_day', 'on_exceed'] as const
/** 可 patch 字符串数组字段（整块替换）。 */
export const PATCHABLE_ARRAY_FIELDS = ['human_gates', 'kill_criteria', 'allowlist', 'denylist'] as const

const ALL_PATCHABLE: readonly string[] = [...PATCHABLE_SCALAR_FIELDS, ...PATCHABLE_BUDGET_FIELDS, ...PATCHABLE_ARRAY_FIELDS]

/** 控制字符（含换行/制表符）——窄解析器逐行工作且无转义语义，一律拒写。 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/

class PatchError extends Error {}

/** 裸标量能否原样读回：喂 `k: <s>` 给窄解析器做 roundtrip（公共 API 闭环，不复制解析规则）。 */
function bareRoundtrips(s: string): boolean {
  const { data, error } = parseLoopsYaml(`k: ${s}`)
  if (error !== null || data === null || typeof data !== 'object' || Array.isArray(data)) return false
  return (data as Record<string, unknown>).k === s
}

/** 序列项语境额外禁裸：`- key: value` 会被词法器读成序列内 mapping（KEY_RE 语义镜像，超集保守判定）。 */
const ITEM_KEY_LIKE_RE = /^[A-Za-z_][\w.-]*:(\s|$)/

/** 字符串 → 写回原文（裸 or 双引号包裹）；不可安全写回 → throw PatchError。 */
function formatString(s: string, field: string, asSeqItem: boolean): string {
  if (CONTROL_CHAR_RE.test(s)) throw new PatchError(`字段 '${field}' 含换行/控制字符，无法写回 loops.yaml`)
  if (bareRoundtrips(s) && !(asSeqItem && ITEM_KEY_LIKE_RE.test(s))) return s
  if (s.includes('"')) throw new PatchError(`字段 '${field}' 含双引号，窄 YAML 无转义语义，无法安全写回`)
  return `"${s}"`
}

/** 标量值 → 写回原文（string/number/null）。 */
function formatScalar(v: string | number | null, field: string): string {
  if (v === null) return 'null'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new PatchError(`字段 '${field}' 须为有限数字`)
    return String(v)
  }
  return formatString(v, field, false)
}

// 块定位内件（LoopBlock/indentOf/locateLoop/insertPointAtBlockEnd）已收编 yamlBlock.ts
// （与 graduation.ts::setAutonomyLevelInYaml 共享单份；本侧消费 fieldIndent 支持任意字段列）。

/** 在 [from, to) 找缩进恰为 indent 的 `field:` 行（键精确匹配，不吃前缀同名键）。 */
function findFieldLine(lines: string[], from: number, to: number, indent: number, field: string): number {
  const re = new RegExp(`^\\s{${indent}}${field}:(\\s|$)`)
  for (let i = from; i < to; i++) {
    if (re.test(required(lines[i]))) return i
  }
  return -1
}

/** 顶层标量：就地替换（保缩进，行尾注释随行更替）；缺行 → 块尾插入。 */
function patchTopScalar(lines: string[], block: LoopBlock, field: string, value: string | number | null): void {
  const rendered = `${' '.repeat(block.fieldIndent)}${field}: ${formatScalar(value, field)}`
  const at = findFieldLine(lines, block.start + 1, block.end, block.fieldIndent, field)
  if (at !== -1) {
    lines[at] = rendered
  } else {
    lines.splice(insertPointAtBlockEnd(lines, block.start, block.end), 0, rendered)
  }
}

/** budget 嵌套标量：在 budget 子块内替换/插入（budget 行本身必须已存在，schema 要求字段）。 */
function patchBudgetScalar(lines: string[], block: LoopBlock, field: string, value: string | number): void {
  const budgetAt = findFieldLine(lines, block.start + 1, block.end, block.fieldIndent, 'budget')
  if (budgetAt === -1) throw new PatchError(`loop 块内未找到 budget: 行，无法 patch '${field}'`)
  // budget 子块：其后缩进 > fieldIndent 的连续区（空行跳过）
  let subEnd = block.end
  for (let i = budgetAt + 1; i < block.end; i++) {
    const line = required(lines[i])
    if (line.trim() === '') continue
    if (indentOf(line) <= block.fieldIndent) {
      subEnd = i
      break
    }
  }
  // 子字段缩进：取子块内首个非空行的缩进；空 budget 块（schema 不允许，防御）回落 +2
  let childIndent = block.fieldIndent + 2
  for (let i = budgetAt + 1; i < subEnd; i++) {
    if (required(lines[i]).trim() !== '') {
      childIndent = indentOf(required(lines[i]))
      break
    }
  }
  const rendered = `${' '.repeat(childIndent)}${field}: ${formatScalar(value, field)}`
  const at = findFieldLine(lines, budgetAt + 1, subEnd, childIndent, field)
  if (at !== -1) {
    lines[at] = rendered
  } else {
    lines.splice(insertPointAtBlockEnd(lines, budgetAt, subEnd), 0, rendered)
  }
}

/** 字符串数组：整块替换（字段行 + 其子块）；缺行 → 块尾插入。空数组写内联 `[]`。 */
function patchArray(lines: string[], block: LoopBlock, field: string, values: readonly string[]): void {
  const pad = ' '.repeat(block.fieldIndent)
  const rendered = values.length === 0
    ? [`${pad}${field}: []`]
    : [`${pad}${field}:`, ...values.map((v) => `${pad}  - ${formatString(v, field, true)}`)]
  const at = findFieldLine(lines, block.start + 1, block.end, block.fieldIndent, field)
  if (at === -1) {
    lines.splice(insertPointAtBlockEnd(lines, block.start, block.end), 0, ...rendered)
    return
  }
  // 既有块范围：[at, extentEnd)——其后缩进 > fieldIndent 的连续区，收尾回缩到最后一个非空行
  let extentEnd = block.end
  for (let i = at + 1; i < block.end; i++) {
    const line = required(lines[i])
    if (line.trim() === '') continue
    if (indentOf(line) <= block.fieldIndent) {
      extentEnd = i
      break
    }
  }
  while (extentEnd > at + 1 && required(lines[extentEnd - 1]).trim() === '') extentEnd--
  lines.splice(at, extentEnd - at, ...rendered)
}

/** 单字段值的类型门（细校验交给写回后的整文档 schema 校验，此处只挡形状错误）。 */
function checkedValue(field: string, value: unknown): string | number | null | string[] {
  if ((PATCHABLE_ARRAY_FIELDS as readonly string[]).includes(field)) {
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      throw new PatchError(`字段 '${field}' 须为字符串数组`)
    }
    return value as string[]
  }
  if ((PATCHABLE_BUDGET_FIELDS as readonly string[]).includes(field) && field !== 'on_exceed') {
    if (typeof value !== 'number') throw new PatchError(`字段 '${field}' 须为数字`)
    return value
  }
  if ((field === 'change_prefix' || field === 'skill_bundle_id') && value === null) return null
  if (typeof value !== 'string') throw new PatchError(`字段 '${field}' 须为字符串`)
  return value
}

/**
 * 纯函数：在 loops.yaml 原文中 patch 已存在 loop 的标量/字符串数组字段。
 * 成功 → {text, error:null}；未知 loop / 不可 patch 字段 / 类型或写回格式错误 → {text:null, error}。
 * 注意：本函数不做 schema 值域校验（cadence pattern、risk enum 等）——调用方应对写回文本
 * 重跑 parseLoopsYaml + validateSchema(LOOPS_SCHEMA)，失败则不落盘（server 端点即如此）。
 */
export function updateLoopInYaml(text: string, loopId: string, patch: Record<string, unknown>): { text: string | null; error: string | null } {
  try {
    const fields = Object.keys(patch)
    if (fields.length === 0) throw new PatchError('patch 为空（无字段可改）')
    for (const field of fields) {
      if (field === 'autonomy_level') {
        throw new PatchError("autonomy_level 不经本手术（升降档走毕业制裁决：applyLevelChange / POST /api/loops/level）")
      }
      if (!ALL_PATCHABLE.includes(field)) {
        throw new PatchError(`字段 '${field}' 不可 patch（可改：${ALL_PATCHABLE.join(' / ')}）`)
      }
    }

    const lines = text.split('\n')
    // 逐字段应用；每次应用后行数可能变化，重新定位块（块内相对结构已变，偷懒复用旧下标会窜行）
    for (const field of fields) {
      const block = locateLoop(lines, loopId)
      if (block === null) throw new PatchError(`loop '${loopId}' 未在 loops.yaml 找到（本手术不新建 loop）`)
      const value = checkedValue(field, patch[field])
      if ((PATCHABLE_ARRAY_FIELDS as readonly string[]).includes(field)) {
        patchArray(lines, block, field, value as string[])
      } else if ((PATCHABLE_BUDGET_FIELDS as readonly string[]).includes(field)) {
        patchBudgetScalar(lines, block, field, value as string | number)
      } else {
        patchTopScalar(lines, block, field, value as string | number | null)
      }
    }
    return { text: lines.join('\n'), error: null }
  } catch (e) {
    if (e instanceof PatchError) return { text: null, error: e.message }
    throw e
  }
}

// ── loop init 原语（2026-07-12 loop-init L1）：新建 loops.yaml / 尾部追加条目 ─────────
//
// 与上方字段手术同一分工：纯函数 text-in/text-out，零 fs——fs 与读-判-写 CAS 归调用方
// （cli init / server）。产出文本在函数内自校验（parseLoopsYaml + validateSchema(LOOPS_SCHEMA)
// 全过才返回 text，否则返回 error）——调用方拿到的 text 保证是合法登记表，可直接落盘。
// 排版与 locateLoop 的 LoopBlock 定位规则闭环：`loops:` 顶格、条目 `  - id: <v>`（dash 缩进 2）、
// 字段列 4、budget 子块列 6、数组一律块序列——产文可直接再喂 updateLoopInYaml 做字段手术。
// 写回格式直接复用 formatString/formatScalar（不复制规则），拒绝路径同样以 error 回传。

/**
 * 新建 loop 条目输入：LOOPS_SCHEMA 的 required 字段（budget 的可选 token 字段随 LoopBudget）
 * + H11 可选 starter/binding 引用。刻意不含 autonomy_level / allowlist / denylist（拍板 P5）：三者
 * 载入时由 loadRegistry 派生补默认（L1 / [] / []），序列化整体省略——文件里「未声明」如实；
 * 升降档唯毕业制通道（旁路禁区同上）。
 */
export interface NewLoopEntryInput {
  id: string
  name: string
  kind: LoopKind
  goal: string
  cadence: string
  risk: LoopRisk
  runner: string
  change_prefix: string | null
  phases: string[]
  human_gates: string[]
  /** @deprecated H9 compatibility input; serializers intentionally do not persist it. */
  state?: string
  design_doc: string
  status: LoopStatus
  budget: LoopBudget
  kill_criteria: string[]
  /** H11 starter 来源；本写入层只保存安全 token，不校验 catalog 引用存在性。 */
  template_id?: string
  /** H11 starter schema 版本；当前只支持 1。 */
  template_version?: 1
  /** H11 编译后绑定的 workflow token。 */
  workflow_id?: string
  /** H10/H11 skill bundle 引用；undefined 省略，null 显式表示 unwired。 */
  skill_bundle_id?: string | null
}

/** 条目 → 行数组（排版口径见上区块注释）；值不可安全写回 → throw PatchError。 */
function renderLoopEntryLines(entry: NewLoopEntryInput): string[] {
  const lines: string[] = [`  - id: ${formatScalar(entry.id, 'id')}`]
  const scalar = (field: string, v: string | number | null): void => {
    lines.push(`    ${field}: ${formatScalar(v, field)}`)
  }
  const seq = (field: string, values: readonly string[]): void => {
    if (values.length === 0) {
      lines.push(`    ${field}: []`) // 同 patchArray 空数组口径（minItems 违规由自校验兜底拒绝）
      return
    }
    lines.push(`    ${field}:`)
    for (const v of values) lines.push(`      - ${formatString(v, field, true)}`)
  }
  scalar('name', entry.name)
  scalar('kind', entry.kind)
  scalar('goal', entry.goal)
  scalar('cadence', entry.cadence)
  scalar('risk', entry.risk)
  scalar('runner', entry.runner)
  scalar('change_prefix', entry.change_prefix) // null → 裸 null 字面量
  seq('phases', entry.phases)
  seq('human_gates', entry.human_gates)
  scalar('design_doc', entry.design_doc)
  scalar('status', entry.status)
  if (entry.template_id !== undefined) scalar('template_id', entry.template_id)
  if (entry.template_version !== undefined) scalar('template_version', entry.template_version)
  if (entry.workflow_id !== undefined) scalar('workflow_id', entry.workflow_id)
  if (entry.skill_bundle_id !== undefined) scalar('skill_bundle_id', entry.skill_bundle_id)
  lines.push('    budget:')
  const budgetScalar = (field: string, v: string | number): void => {
    lines.push(`      ${field}: ${formatScalar(v, field)}`)
  }
  budgetScalar('max_runs_per_day', entry.budget.max_runs_per_day)
  budgetScalar('max_in_flight', entry.budget.max_in_flight)
  budgetScalar('on_exceed', entry.budget.on_exceed)
  if (entry.budget.max_tokens_per_day !== undefined) budgetScalar('max_tokens_per_day', entry.budget.max_tokens_per_day)
  if (entry.budget.tokens_per_run !== undefined) budgetScalar('tokens_per_run', entry.budget.tokens_per_run)
  seq('kill_criteria', entry.kill_criteria)
  return lines
}

/** 产文自校验：窄解析 + 整文档 schema 全过 → null；否则定位 error（坏文本绝不交给调用方落盘）。 */
function selfCheckYamlText(text: string): string | null {
  const { data, error } = parseLoopsYaml(text)
  if (error !== null) return `产出文本未过窄解析器：${error}`
  const errors = validateSchema(data, LOOPS_SCHEMA)
  if (errors.length > 0) return `产出文本未过 LOOPS_SCHEMA：${errors.join('；')}`
  return null
}

/**
 * 纯函数：生成全新 loops.yaml 文本（`version: 1` + `loops:` + 单条目），以单个 \n 结尾。
 * 成功 → {text, error:null}；写回格式违规 / 条目违 schema → {text:null, error}。
 */
export function createLoopsYamlText(entry: NewLoopEntryInput): { text: string | null; error: string | null } {
  try {
    const text = `${['version: 1', 'loops:', ...renderLoopEntryLines(entry)].join('\n')}\n`
    const bad = selfCheckYamlText(text)
    if (bad !== null) throw new PatchError(bad)
    return { text, error: null }
  } catch (e) {
    if (e instanceof PatchError) return { text: null, error: e.message }
    throw e
  }
}

/**
 * 纯函数：在既有 loops.yaml 文本的 loops 数组尾部追加条目。
 * before 原文区间逐字节保留（格式/注释不动，仅在其后接续；唯一例外：before 无尾换行时先补一个 \n）。
 * entry.id 已存在（parseLoopsYaml(before) 判定）/ before 不可解析 / 产文自校验不过 → {text:null, error}。
 */
export function appendLoopToYamlText(before: string, entry: NewLoopEntryInput): { text: string | null; error: string | null } {
  try {
    const { data, error } = parseLoopsYaml(before)
    if (error !== null) throw new PatchError(`既有 loops.yaml 未过窄解析器，拒绝追加：${error}`)
    const loops = data !== null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>).loops
      : undefined
    if (Array.isArray(loops)) {
      const exists = loops.some((item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
        && (item as Record<string, unknown>).id === entry.id)
      if (exists) throw new PatchError(`loop '${entry.id}' 已存在于 loops.yaml（追加不覆盖；改字段走 updateLoopInYaml）`)
    }
    const base = before.endsWith('\n') ? before : `${before}\n`
    const text = `${base}${renderLoopEntryLines(entry).join('\n')}\n`
    const bad = selfCheckYamlText(text)
    if (bad !== null) throw new PatchError(bad)
    return { text, error: null }
  } catch (e) {
    if (e instanceof PatchError) return { text: null, error: e.message }
    throw e
  }
}
