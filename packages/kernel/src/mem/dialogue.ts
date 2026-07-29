/**
 * mem/dialogue —— 对话清洗：注入标签剥除 + bootstrap turn 检测（纯逻辑）。
 * 对位老仓 skills/pipeline/scripts/mem/dialogue.py。
 *
 * 清洗是 includes 排序可行的前提——不清洗注入标签，pipeline/平台注入标签会霸榜所有命中。
 * 注：老仓 docstring 写「19 个」但 tuple 实为 18 项（含空格的 "permissions instructions"）；
 * 以 tuple 为真相源，此处 18 项与之逐字对齐（老仓 dialogue.py:10-29）。
 */
import type { DialogueTurn } from './types.js'

const HOST_SUMMARY_TURN = Symbol('tenon.mem.host-summary')

export const INJECTION_TAGS = [
  'system-reminder',
  'task-status',
  'ready',
  'current-state',
  'workflow',
  'workflow-state',
  'guidelines',
  'instructions',
  'command-name',
  'command-message',
  'command-args',
  'local-command-stdout',
  'local-command-stderr',
  'permissions instructions',
  'collaboration_mode',
  'environment_context',
  'auto_compact_summary',
  'user_instructions',
] as const

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g
function escapeRe(s: string): string {
  return s.replace(ESCAPE_RE, (m) => '\\' + m)
}

// 每个注入标签：带属性开标签 + 块体 + 闭标签，gi 大小写不敏感、跨行（[\s\S] 代 dotAll）。
const TAG_RES = INJECTION_TAGS.map(
  (t) => new RegExp('<' + escapeRe(t) + '[^>]*>[\\s\\S]*?</' + escapeRe(t) + '>', 'gi'),
)
// AGENTS.md 前导剥：剥到 \n\n[A-Z 或 CJK] 边界或行末（老仓 re.M|re.S 语义）。
const AGENTS_RE = /^# AGENTS\.md instructions for[\s\S]*?(?=\n\n[A-Z一-龥]|$)/gm
const COLLAPSE_RE = /\n{3,}/g
const INSTRUCTIONS_RE = /^<INSTRUCTIONS>/i

/** True → 该 turn 是平台 bootstrap 注入（整段丢弃而非部分清洗）。size 阈值算 original_length。 */
export function isBootstrapTurn(cleaned: string, originalLength: number): boolean {
  if (cleaned.startsWith('# AGENTS.md instructions for')) return true
  if (originalLength > 4000 && INSTRUCTIONS_RE.test(cleaned)) return true
  return false
}

/** 删每个 <tag>...</tag> 注入块 + AGENTS.md 前言，折叠 3+ 换行成段落断 + trim。 */
export function stripInjectionTags(text: string): string {
  let out = text
  for (const re of TAG_RES) out = out.replace(re, '')
  out = out.replace(AGENTS_RE, '')
  out = out.replace(COLLAPSE_RE, '\n\n')
  return out.trim()
}

/** Preserve host-summary provenance internally without changing serialized CLI dialogue output. */
export function hostSummaryTurn(text: string): DialogueTurn {
  const turn: DialogueTurn = { role: 'user', text }
  Object.defineProperty(turn, HOST_SUMMARY_TURN, { value: true })
  return turn
}

export function isHostSummaryTurn(turn: DialogueTurn): boolean {
  return Reflect.get(turn, HOST_SUMMARY_TURN) === true
}
