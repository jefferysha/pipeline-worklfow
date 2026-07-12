/**
 * skillSources —— templates/skill-sources.yaml 的手写窄解析器 + 载入器（批 2 Wave A · S1）。
 *
 * 技能源 registry 的数据地基：把「token → 官方最新源/安装通道」的 yaml 解析成结构化 SkillSource[]，
 * 供批 2 Wave B 的 setup 安装段（S2）与 doctor 技能检测（S3）消费。
 *
 * 选型（报告登记）：**不引新 yaml npm 库**（CONTRACT §1 禁；仓库现无 js-yaml/yaml 依赖）。
 *   复用 packages/kernel/src/flow/manifest.ts 的手写窄解析先例思路，但结构不同——manifest 解析器只认
 *   `key: [list]` / block-scalar 等 manifest 专用子集，无法解析本文件的 `token: { inline-map }` 形态，
 *   故此处另写一个针对「单行流式映射」的最小解析器（引号感知的逗号/冒号切分），仍是纯手写、零外部依赖。
 *
 * 容错双出口（brief 规格「S2/S3 要能容错」）：
 *   · readSkillSources(path?)  —— **fail-open**：缺文件 / 坏 yaml → 返回 []（永不抛，setup/doctor 不崩）。
 *   · parseSkillSources(text)  —— **fail-loud**：结构/字段错误抛 SkillSourcesError（清晰消息带 token 上下文），
 *                                供需要严格校验的消费方（或本测试）直接用。
 *   （对齐仓库两先例：readHooksMatrix fail-open [] / loadManifest fail-loud——这里下层严格、上层兜底。）
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 安装通道：claude-plugin=官方/agents-inc 插件；skills-cli=`npx skills add`；npm；builtin=CC 自带；bundled=本仓自带 */
export type SkillTool = 'claude-plugin' | 'skills-cli' | 'npm' | 'builtin' | 'bundled'
const TOOL_SET: ReadonlySet<string> = new Set<SkillTool>([
  'claude-plugin', 'skills-cli', 'npm', 'builtin', 'bundled',
])

/** 缺失时 doctor 的裁决级别：mandatory 红阻断；recommended/conditional/optional WARN */
export type SkillTier = 'mandatory' | 'recommended' | 'conditional' | 'optional'
const TIER_SET: ReadonlySet<string> = new Set<SkillTier>([
  'mandatory', 'recommended', 'conditional', 'optional',
])

/** registry 单条：token → 官方最新源（只记 source，绝不 pin 版本）。字段语义见 skill-sources.yaml 头注。 */
export interface SkillSource {
  /** 流程 token（= yaml 键；= manifest / EXTERNAL-SKILLS.md 里引用的名字） */
  token: string
  tool: SkillTool
  /** repo(owner/repo) / marketplace 名 / npm 包名；builtin/bundled 记逻辑来源 */
  source: string
  /** skills-cli 的 `--skill <名>` / claude-plugin 的 plugin id；省略 = 单技能仓 bare add 或 = token */
  skill?: string
  tier: SkillTier
  /** Anthropic 官方（claude-plugins-official / anthropics/skills / CC builtin）= true */
  official: boolean
  /** 该技能额外需要的 MCP 引擎（如 browser-qa 需 playwright@claude-plugins-official） */
  engine?: string
  /** manifest `a|b` 备选的另一侧 token */
  alt?: string
  /** 软状态/特例说明（candidate / removed / 已装跳过 / 兜底 等） */
  note?: string
}

export class SkillSourcesError extends Error {
  constructor(message: string) {
    super(`skill-sources: ${message}`)
    this.name = 'SkillSourcesError'
  }
}

/** 运行期定位插件仓根（对齐 cli main.ts pluginRoot / integration-harness REPO_ROOT）：
 *  src 与 dist 同深度（packages/cli/{src,dist}），三级上溯 → 仓根，测试(src)与运行(dist)皆对。 */
function defaultRegistryPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates', 'skill-sources.yaml')
}

/** 去掉整行/行尾注释（值里不含裸 # —— note/engine 已加引号且不含 #）；返回 trimEnd 后的行 */
function stripComment(line: string): string {
  const t = line.trimStart()
  if (t.startsWith('#')) return ''
  const m = line.match(/^(.*?)\s#/)
  return (m ? m[1]! : line).trimEnd()
}

/** 引号感知地在顶层分隔符处切分（不切引号内的分隔符）；用于 `k: v, k: v` 的逗号切分。 */
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

/** 去引号（首尾成对的单/双引号）；裸值原样 trim */
function unquote(v: string): string {
  const s = v.trim()
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
    return s.slice(1, -1)
  }
  return s
}

/** 解析单行流式映射体 `tool: x, source: y, ...`（已剥去外层 {}）→ 字段 Map。冒号按每字段首个切分（值内冒号保留）。 */
function parseFlowBody(body: string, token: string): Map<string, string> {
  const fields = new Map<string, string>()
  for (const rawPair of splitTopLevel(body, ',')) {
    const pair = rawPair.trim()
    if (pair === '') continue
    const colon = pair.indexOf(':')
    if (colon <= 0) {
      throw new SkillSourcesError(`token '${token}' 字段 '${pair}' 缺 'key: value' 冒号`)
    }
    const key = pair.slice(0, colon).trim()
    const value = unquote(pair.slice(colon + 1))
    if (fields.has(key)) {
      throw new SkillSourcesError(`token '${token}' 字段 '${key}' 重复`)
    }
    fields.set(key, value)
  }
  return fields
}

/** 把一条 `<token>: { ... }` 行解析成 SkillSource（字段校验 fail-loud）。 */
function parseEntry(line: string, lineNo: number): SkillSource {
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
  if (source === undefined || source === '') {
    throw new SkillSourcesError(`token '${token}' 缺 source`)
  }
  const tier = f.get('tier')
  if (!tier || !TIER_SET.has(tier)) {
    throw new SkillSourcesError(`token '${token}' tier 非法或缺失: '${tier ?? ''}'（合法：${[...TIER_SET].join('/')}）`)
  }
  const officialRaw = f.get('official')
  if (officialRaw !== 'true' && officialRaw !== 'false') {
    throw new SkillSourcesError(`token '${token}' official 须为 true/false: '${officialRaw ?? ''}'`)
  }

  const entry: SkillSource = {
    token,
    tool: tool as SkillTool,
    source,
    tier: tier as SkillTier,
    official: officialRaw === 'true',
  }
  const skill = f.get('skill')
  if (skill !== undefined && skill !== '') entry.skill = skill
  const engine = f.get('engine')
  if (engine !== undefined && engine !== '') entry.engine = engine
  const alt = f.get('alt')
  if (alt !== undefined && alt !== '') entry.alt = alt
  const note = f.get('note')
  if (note !== undefined && note !== '') entry.note = note
  return entry
}

/**
 * 解析 skill-sources.yaml 文本 → SkillSource[]（fail-loud）。
 * 结构：跳过 `version:` 等前置行，定位 `skills:` 块，逐条解析其下缩进的 `token: {…}` 行（含冒号 token 如 commit-commands:commit）。
 * 结构/字段错误 → SkillSourcesError。找不到 `skills:` 块或块为空 → 返回 []（空 registry 合法）。
 */
export function parseSkillSources(text: string): SkillSource[] {
  const lines = text.split('\n')
  const out: SkillSource[] = []
  const seen = new Set<string>()

  let inSkills = false
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const line = stripComment(raw)
    if (line.trim() === '') continue

    const indented = /^\s/.test(line)
    if (!inSkills) {
      // 顶层：找 `skills:`；其余顶层键（version: 等）跳过
      if (/^skills:\s*$/.test(line)) inSkills = true
      continue
    }
    // 已在 skills 块内
    if (!indented) {
      // 回到顶层（另一个顶层键）→ skills 块结束
      inSkills = false
      if (/^skills:\s*$/.test(line)) inSkills = true
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

/**
 * 读并解析 templates/skill-sources.yaml（默认路径经 pluginRoot 三级上溯定位；可传 path 覆盖，测试用）。
 * **fail-open**：文件缺失 / 读失败 / 解析报错 → 返回 []（永不抛；doctor 端凭空数组降级，不崩）。
 * 需要区分「空 registry」与「读失败/解析失败」的消费方（如 setup 装机段），请改用 loadSkillSources。
 */
export function readSkillSources(path?: string): SkillSource[] {
  try {
    const p = path ?? defaultRegistryPath()
    return parseSkillSources(readFileSync(p, 'utf8'))
  } catch {
    return []
  }
}

/** loadSkillSources 结果：ok 携 sources（含合法空 registry []）；失败携人读 error（读失败/解析失败）。 */
export type SkillSourcesResult =
  | { ok: true; sources: SkillSource[] }
  | { ok: false; error: string }

/**
 * 载入 registry 并**区分**「读失败/解析失败」与「合法空 registry」（fail-loud，供 setup 装机段消费）：
 *   · 读文件失败（缺失/权限） → { ok:false, error }
 *   · 解析失败（结构/字段错） → { ok:false, error }
 *   · 成功（含合法空 registry []）→ { ok:true, sources }
 * 与 readSkillSources 的 fail-open 分工：doctor 只需降级用 readSkillSources；setup 装机不能把
 * 「坏/缺 registry → []」当空计划走「无待装 exit 0」假成功（破 full-install 前提），故用本函数。
 */
export function loadSkillSources(path?: string): SkillSourcesResult {
  let text: string
  try {
    text = readFileSync(path ?? defaultRegistryPath(), 'utf8')
  } catch (e) {
    return { ok: false, error: `读取 registry 失败: ${e instanceof Error ? e.message : String(e)}` }
  }
  try {
    return { ok: true, sources: parseSkillSources(text) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
