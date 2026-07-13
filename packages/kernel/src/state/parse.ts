/**
 * 窄解析器 —— 仅支持 CONTRACT §1 子集（flat `key: value` + 4 个列表字段的块序列 +
 * 单层去引号 + 尾部不透明历史区）。禁 yaml 包：通用解析器的引号/锚点语义会
 * 悄悄偏离老内核三读取器（grep/sed / pyyaml-fallback / dashboard）契约。
 */
import {
  FIELD_ORDER,
  LIST_FIELDS,
  QuoteGateError,
  type FieldName,
  type PipelineState,
} from '../types.js'

const KNOWN_FIELDS: ReadonlySet<string> = new Set(FIELD_ORDER)
const LIST_FIELD_SET: ReadonlySet<string> = new Set(LIST_FIELDS)
/** 块序列项前缀（两空格 + `- `），对齐老内核 yaml_append_list_item / trim_history 的 `^  - ` */
const LIST_ITEM_PREFIX = '  - '
const KEY_RE = /^([A-Za-z0-9_]+):(.*)$/

/**
 * 单层去引号 —— 口径同老内核 state-lib.sh `_unquote_scalar`：
 * 三条件才剥（长度≥2、首尾同字符、是 " 或 '），只剥最外一层、不递归。
 */
export function unquoteScalar(s: string): string {
  if (s.length >= 2) {
    const first = s.charAt(0)
    const last = s.charAt(s.length - 1)
    if (first === last && (first === '"' || first === "'")) return s.slice(1, -1)
  }
  return s
}

/**
 * 全量 40 字段骨架，缺省空串（CONTRACT §1：写回时缺省字段写空串）；
 * `workflow` 例外，缺省 `'default'`——下游需能直接判断"是否为默认 workflow"，
 * 不应该还要处理"空串等价于 default"这种隐式约定。
 */
export function emptyFields(): Record<FieldName, string | string[]> {
  const fields = {} as Record<FieldName, string | string[]>
  for (const f of FIELD_ORDER) fields[f] = f === 'workflow' ? 'default' : ''
  return fields
}

/**
 * 四闸 —— 对齐老内核 yaml_set：值含换行/回车、「: 」、「 #」或首字符为引号 → fail-loud 拒写。
 * 时间戳的「:」无空格、不触闸；空串无首字符、不触引号闸（序列化为 ""）。
 */
export function quoteGate(field: FieldName, value: string): void {
  if (value.includes('\n') || value.includes('\r')) {
    throw new QuoteGateError(field, 'value contains a newline/carriage return (would inject fake fields)')
  }
  if (value.includes(': ')) {
    throw new QuoteGateError(field, 'value contains ": " (would break YAML parsing)')
  }
  if (value.includes(' #')) {
    throw new QuoteGateError(field, 'value contains " #" (would be eaten as an inline comment)')
  }
  const first = value.charAt(0)
  if (first === '"' || first === "'") {
    throw new QuoteGateError(field, 'value starts with a quote (would break YAML parsing)')
  }
}

/**
 * 解析 `.pipeline.yaml` 全文：
 * - 自顶向下消费「已知字段」行（含列表字段的块序列续行）；
 * - 第一行未知 key / 非 key 行起，整段到 EOF 作 opaqueTail 逐字保留
 *   （老内核 tools_history:/prompts_history:/transitions_history: base64 区块与
 *   pipeline_mode 等未知平字段都落在这里——读跳过、写回原样）。
 */
export function parsePipeline(content: string): PipelineState {
  const lines = content.split('\n')
  const fields = emptyFields()
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const m = KEY_RE.exec(line)
    if (!m) break
    const key = m[1] ?? ''
    if (!KNOWN_FIELDS.has(key)) break
    const field = key as FieldName
    const rest = (m[2] ?? '').trim()
    i++
    if (LIST_FIELD_SET.has(field)) {
      if (rest === '') {
        // 块序列：`key:` 换行 + 两空格 `- item`
        const items: string[] = []
        while (i < lines.length && (lines[i] ?? '').startsWith(LIST_ITEM_PREFIX)) {
          items.push(unquoteScalar((lines[i] ?? '').slice(LIST_ITEM_PREFIX.length).trim()))
          i++
        }
        fields[field] = items
      } else if (rest === '[]') {
        fields[field] = []
      } else {
        // flat 标量（如 `scope: null` / 逗号串）保持 string
        fields[field] = unquoteScalar(rest)
      }
    } else {
      fields[field] = unquoteScalar(rest)
    }
  }
  return { fields, opaqueTail: lines.slice(i).join('\n') }
}

/**
 * 严格按 FIELD_ORDER 全量写回；每个值过四闸；opaqueTail 逐字拼回文件尾。
 * 空串标量写 `""`（对齐老内核 heredoc 的 automation_* 空值表示），空列表写 `[]`。
 */
export function serializePipeline(state: PipelineState): string {
  const out: string[] = []
  for (const field of FIELD_ORDER) {
    const value = state.fields[field] ?? ''
    if (Array.isArray(value)) {
      for (const item of value) quoteGate(field, item)
      if (value.length === 0) {
        out.push(`${field}: []`)
      } else {
        out.push(`${field}:`)
        for (const item of value) out.push(`${LIST_ITEM_PREFIX}${item}`)
      }
    } else {
      quoteGate(field, value)
      out.push(`${field}: ${value === '' ? '""' : value}`)
    }
  }
  return out.join('\n') + '\n' + state.opaqueTail
}
