/**
 * 老仓 .pipeline.yaml 历史区（opaqueTail 里的 tools/prompts/transitions_history）
 * → lite JSONL 条目（BACKLOG #11 导入工具的 kernel 半边）。
 *
 * 老仓行格式（flow-style 单行 map，键形取自真实 fixture）：
 *   tools_history:        - { at, tool, detail_b64|detail }
 *   prompts_history:      - { at, phase, track, kind, q_b64, a_b64 }
 *   transitions_history:  - { at, from, to, event }
 * fail-open：坏行/坏 base64 跳过不抛（导入宁缺勿断）。
 */
import type { HistoryEntry } from '../types.js'

const SECTION_KIND: Record<string, 'tool' | 'prompt' | 'transition'> = {
  tools_history: 'tool',
  prompts_history: 'prompt',
  transitions_history: 'transition',
}

function b64(s: string | undefined): string | undefined {
  // Buffer 对非法输入宽容（静默丢字符），先正则校验防把垃圾当成功
  if (!s || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return undefined
  try {
    return Buffer.from(s, 'base64').toString('utf8')
  } catch {
    return undefined
  }
}

/** 解析 `{ k: v, k2: "v2", ... }` 内部：顶层逗号切分（双引号内逗号不切） */
function parseFlowMap(inner: string): Record<string, string> {
  const out: Record<string, string> = {}
  let depth = false
  let cur = ''
  const parts: string[] = []
  for (const ch of inner) {
    if (ch === '"') depth = !depth
    if (ch === ',' && !depth) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) parts.push(cur)
  for (const p of parts) {
    const i = p.indexOf(':')
    if (i <= 0) continue
    const k = p.slice(0, i).trim()
    let v = p.slice(i + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

export function parseLegacyHistory(tail: string): HistoryEntry[] {
  const entries: HistoryEntry[] = []
  let kind: 'tool' | 'prompt' | 'transition' | null = null
  for (const line of tail.split('\n')) {
    const section = /^(\w+_history):\s*$/.exec(line)
    if (section) {
      kind = SECTION_KIND[section[1] ?? ''] ?? null
      continue
    }
    if (!line.startsWith('  ')) {
      if (line.trim() !== '') kind = null
      continue
    }
    if (!kind) continue
    const m = /^\s*-\s*\{\s*(.*?)\s*\}\s*$/.exec(line)
    if (!m) continue
    const kv = parseFlowMap(m[1] ?? '')
    const ts = kv.at ?? ''
    if (kind === 'tool') {
      const detail = b64(kv.detail_b64) ?? kv.detail ?? ''
      entries.push({ ts, kind, raw: `${kv.tool ?? '?'}: ${detail}` })
    } else if (kind === 'prompt') {
      entries.push({ ts, kind, raw: `Q: ${b64(kv.q_b64) ?? ''} | A: ${b64(kv.a_b64) ?? ''}` })
    } else {
      entries.push({ ts, kind, from: kv.from ?? '', to: kv.to ?? '', raw: kv.event ?? '' })
    }
  }
  return entries
}

/** 移除三个历史节（节头 + 其 `  - ` 条目行），其余尾内容逐字保留 */
export function stripLegacyHistory(tail: string): string {
  if (tail === '') return ''
  const kept: string[] = []
  let inSection = false
  for (const line of tail.split('\n')) {
    const section = /^(\w+_history):\s*$/.exec(line)
    if (section && SECTION_KIND[section[1] ?? '']) {
      inSection = true
      continue
    }
    if (inSection && /^\s+-\s/.test(line)) continue
    inSection = false
    kept.push(line)
  }
  return kept.join('\n')
}
