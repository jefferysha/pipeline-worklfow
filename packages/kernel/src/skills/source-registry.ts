import { required } from '../required.js'

/**
 * skill source registry 的纯解析契约。
 *
 * CLI setup/doctor 与 Dashboard machine readiness 必须消费同一份 token -> 安装源/真实 skill id/tier
 * 映射，否则 Codex 的 ~/.agents/skills 安装会被 UI 按旧 token 误报。这里仅负责解析文本，不负责定位文件，
 * 因而 kernel 保持零 fs/运行环境策略；各 adapter 自行选择 fail-open 或 fail-loud 的读取语义。
 */

export type SkillTool = 'claude-plugin' | 'skills-cli' | 'npm' | 'builtin' | 'bundled'
const TOOL_SET: ReadonlySet<string> = new Set<SkillTool>([
  'claude-plugin', 'skills-cli', 'npm', 'builtin', 'bundled',
])

export type SkillTier = 'mandatory' | 'recommended' | 'conditional' | 'optional'
const TIER_SET: ReadonlySet<string> = new Set<SkillTier>([
  'mandatory', 'recommended', 'conditional', 'optional',
])

export interface SkillSourceDefinition {
  token: string
  tool: SkillTool
  source: string
  skill?: string
  /** Physical SKILL.md directory id used when a logical/builtin token has no same-name content tree. */
  contentSkill?: string
  tier: SkillTier
  official: boolean
  engine?: string
  bin?: string
  unavailable?: boolean
  alt?: string
  note?: string
}

export class SkillSourcesError extends Error {
  constructor(message: string) {
    super(`skill-sources: ${message}`)
    this.name = 'SkillSourcesError'
  }
}

function stripComment(line: string): string {
  const t = line.trimStart()
  if (t.startsWith('#')) return ''
  const m = line.match(/^(.*?)\s#/)
  return (m ? m[1]! : line).trimEnd()
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote = ''
  for (const ch of s) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
    } else if (ch === sep) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function unquote(v: string): string {
  const s = v.trim()
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
    return s.slice(1, -1)
  }
  return s
}

function parseFlowBody(body: string, token: string): Map<string, string> {
  const fields = new Map<string, string>()
  for (const rawPair of splitTopLevel(body, ',')) {
    const pair = rawPair.trim()
    if (pair === '') continue
    const colon = pair.indexOf(':')
    if (colon <= 0) throw new SkillSourcesError(`token '${token}' 字段 '${pair}' 缺 'key: value' 冒号`)
    const key = pair.slice(0, colon).trim()
    const value = unquote(pair.slice(colon + 1))
    if (fields.has(key)) throw new SkillSourcesError(`token '${token}' 字段 '${key}' 重复`)
    fields.set(key, value)
  }
  return fields
}

function parseEntry(line: string, lineNo: number): SkillSourceDefinition {
  const brace = line.indexOf('{')
  const close = line.lastIndexOf('}')
  if (brace < 0 || close < brace) {
    throw new SkillSourcesError(`第 ${lineNo} 行不是 'token: { ... }' 形态: '${line.trim()}'`)
  }
  const keyPart = line.slice(0, brace).trim()
  if (!keyPart.endsWith(':')) {
    throw new SkillSourcesError(`第 ${lineNo} 行键须以 ':' 结尾: '${line.trim()}'`)
  }
  const token = keyPart.slice(0, -1).trim()
  if (token === '') throw new SkillSourcesError(`第 ${lineNo} 行 token 为空`)

  const f = parseFlowBody(line.slice(brace + 1, close), token)
  const tool = f.get('tool')
  if (!tool || !TOOL_SET.has(tool)) {
    throw new SkillSourcesError(`token '${token}' tool 非法或缺失: '${tool ?? ''}'（合法：${[...TOOL_SET].join('/')}）`)
  }
  const source = f.get('source')
  if (source === undefined || source === '') throw new SkillSourcesError(`token '${token}' 缺 source`)
  const tier = f.get('tier')
  if (!tier || !TIER_SET.has(tier)) {
    throw new SkillSourcesError(`token '${token}' tier 非法或缺失: '${tier ?? ''}'（合法：${[...TIER_SET].join('/')}）`)
  }
  const officialRaw = f.get('official')
  if (officialRaw !== 'true' && officialRaw !== 'false') {
    throw new SkillSourcesError(`token '${token}' official 须为 true/false: '${officialRaw ?? ''}'`)
  }

  const entry: SkillSourceDefinition = {
    token,
    tool: tool as SkillTool,
    source,
    tier: tier as SkillTier,
    official: officialRaw === 'true',
  }
  const skill = f.get('skill')
  if (skill !== undefined && skill !== '') entry.skill = skill
  const contentSkill = f.get('content_skill')
  if (contentSkill !== undefined && contentSkill !== '') entry.contentSkill = contentSkill
  const engine = f.get('engine')
  if (engine !== undefined && engine !== '') entry.engine = engine
  const bin = f.get('bin')
  if (bin !== undefined && bin !== '') entry.bin = bin
  const unavailableRaw = f.get('unavailable')
  if (unavailableRaw !== undefined) {
    if (unavailableRaw !== 'true' && unavailableRaw !== 'false') {
      throw new SkillSourcesError(`token '${token}' unavailable 须为 true/false: '${unavailableRaw}'`)
    }
    entry.unavailable = unavailableRaw === 'true'
  }
  const alt = f.get('alt')
  if (alt !== undefined && alt !== '') entry.alt = alt
  const note = f.get('note')
  if (note !== undefined && note !== '') entry.note = note
  return entry
}

/** 解析 templates/skill-sources.yaml 支持的窄 YAML 子集；坏结构 fail-loud。 */
export function parseSkillSources(text: string): SkillSourceDefinition[] {
  const lines = text.split('\n')
  const out: SkillSourceDefinition[] = []
  const seen = new Set<string>()
  let inSkills = false

  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(required(lines[i]))
    if (line.trim() === '') continue
    const indented = /^\s/.test(line)
    if (!inSkills) {
      if (/^skills:\s*$/.test(line)) inSkills = true
      continue
    }
    if (!indented) {
      inSkills = /^skills:\s*$/.test(line)
      continue
    }
    const entry = parseEntry(line, i + 1)
    if (seen.has(entry.token)) {
      throw new SkillSourcesError(`token '${entry.token}' 重复声明（第 ${i + 1} 行）`)
    }
    seen.add(entry.token)
    out.push(entry)
  }
  return out
}
