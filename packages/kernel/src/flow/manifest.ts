/**
 * loadManifest —— templates/manifest.yaml 的手写窄解析器 + 全派生面（BACKLOG #18 / GOAL A1）。
 *
 * 单一真相源护城河（GOAL B2/D8）：所有派生字段都从 yaml 数据真解析而来，零硬编码——
 * 改 yaml 即改派生，正是老仓 review_phases「半接线」欠账（manifest.py 能派生但消费方
 * state-transition.sh:159-161 硬编码未读）的构造性反面。回归锚见 manifest-derive.test.ts。
 *
 * 派生函数盘点（× = 派生什么 → 消费方；括号内为老仓 skills/pipeline/scripts/manifest.py 行号）：
 *   · phases/transitions/reviewPhases  ← 老 sorted_phases 212 / get_transitions 372 / review_phases。
 *       消费方：createFlowEngine（引擎真读，engine.ts:30-34）。
 *   · mandatorySkills / recommendedSkills ← 老 evidence 346-355（per phase×track，`_all` 兜底）。
 *       老消费方：pipeline-guard.sh（经 gen_sh 563 派生的 manifest_mandatory/_recommended）。
 *       新仓消费方两条：① router 缓存链——hooks/router-gen.mjs:74-77 与等价的
 *         packages/cli/src/commands/gen-router.ts:41-44 经 skillsFor 派生
 *         RECSKILL_/MANDSKILL_<phase>_<track> 写进 .pipeline-router.generated.sh，
 *         hooks/router.sh:202-203 source 后每轮注入提示；② dashboard 配置面——
 *         packages/server/src/config.ts:60 flattenMandatorySkills → server.ts:512 GET /api/config。
 *       两表在 router 注入面的差别**只是文案分级**（router.sh:215-216「推荐 skill」/「本相位强制 skill」）：
 *       老仓 evidence 的「强制缺失 = [HARD] 阻断」判定未移植（GUARD-RULES.md:119，O6/E4/S6/B7/V8/V9/P5
 *       全 ❌），故 mandatory 缺失**不阻断 phase transition，也不影响 AFK scheduler**。
 *       但它并非全无后果：`pipeline doctor` 对两表分级处置（doctor.ts:236 起——mandatory 缺失报
 *       **red 且返回非零**，recommended 缺失只报 yellow），即它会让 doctor 的就绪检查失败。
 *       gate.sh / session-start.sh 不读本派生（前者走 internal-skill-gate 的 skill DAG 判定，
 *       后者只打印静态横幅）——它们曾被规划为消费方，实际接线落在了 router 与 server。
 *   · routerPatterns ← 老 gen_router_sh 890-898（FE/BE/PM_PATTERN）。
 *       老消费方：pipeline-router.sh score_track。新仓消费方：经 genRouterSh 落进 router 缓存 →
 *       hooks/router.sh:168-170 score_track 每轮 grep 打分选 Track。
 *   · breadcrumbs ← 老 breadcrumb 子命令 1031-1037（phases.<phase>.breadcrumb block scalar）。
 *       老消费方：pipeline-router.sh breadcrumb_body（每轮被动注入）。
 *       新仓消费方：router-gen.mjs:66-67 / gen-router.ts:35-36 派生 BREADCRUMB_<phase> →
 *       hooks/router.sh:201 间接变量取值，每轮随注入体输出。
 *   · genRouterSh（纯派生 helper）← 老 gen_router_sh 890-898。
 *       消费方：hooks/router-gen.mjs:62、packages/cli/src/commands/gen-router.ts:32。
 *   · skillsFor（纯 helper）← 老 evidence 346-355 的三级回退（per-track → `_all` → 空）。
 *       消费方：同 mandatorySkills/recommendedSkills 的 ① router 缓存链。
 *
 * 窄解析子集（CONTRACT §1 禁 yaml npm 包）：
 *   · 顶层键 `key:` / `key: [inline, list]`
 *   · 块序列（两空格缩进 `- item`）
 *   · transitions / *_skills 小节的 `from: [to1, to2]` 条目（skill token 逐字保留，含 a|b 备选与 : 前缀）
 *   · router_patterns 小节：`track: 'regex'`（单/双引号标量，保内部空格）
 *   · breadcrumb 小节：`phase: |` 字面块标量（缩进决定块界，末尾换行 rstrip，对齐老 CLI）
 *   · `#` 整行注释、行尾注释（前置空白 + #）、空行
 * 其余 YAML 特性一律不支持；结构错误 fail-loud（ManifestError），
 * 对齐老内核 state-transition.sh「manifest 不可用 → HARD STOP，绝不静默丢 review-gate」。
 */
import { readFileSync } from 'node:fs'
import { PHASES } from '../types.js'
import type { ManifestData, Phase } from '../types.js'

export class ManifestError extends Error {
  constructor(message: string) {
    super(`manifest: ${message}`)
    this.name = 'ManifestError'
  }
}

const PHASE_SET: ReadonlySet<string> = new Set(PHASES)

/** skill 表的 track 键：三真 track + `_all` 全 track 兜底哨兵（对齐老 evidence 的 _VALID_TRACKS） */
export type SkillTrackKey = 'pm' | 'frontend' | 'backend' | '_all'
const SKILL_TRACK_SET: ReadonlySet<string> = new Set<SkillTrackKey>(['pm', 'frontend', 'backend', '_all'])

/** phase → track → skill token 列表（a|b 备选逐字保留，消费方自择其一） */
export type SkillTable = Readonly<Record<Phase, Readonly<Partial<Record<SkillTrackKey, readonly string[]>>>>>

/** router Track 评分正则（老 gen_router_sh 的 FE/BE/PM_PATTERN 三值） */
export interface RouterPatterns {
  frontend: string
  backend: string
  pm: string
}
const ROUTER_TRACK_SET: ReadonlySet<string> = new Set(['frontend', 'backend', 'pm'])

/**
 * loadManifest 的完整返回面（types.ts::ManifestData 的扩展）。
 * 字段留在本文件、没有并进 types.ts::ManifestData：后者是**引擎面最小契约**
 * （FlowEngine/createFlowEngine 只需 phases/transitions/reviewPhases），本接口是解析器的全量产出，
 * 二者分开可让引擎不依赖 router/skill 派生。导出链：flow/index.ts **具名** re-export（:7-12），
 * kernel index.ts 再 `export *`；消费方从 `@pipeline-lite/kernel` 具名导入（如 server/src/config.ts:60）。
 */
export interface ExtendedManifestData extends ManifestData {
  /** phase×track 强制 skill 表。消费方与「强制」在新仓的实际效力（仅注入文案）见文件头盘点。 */
  mandatorySkills: SkillTable
  /** phase×track 推荐 skill 表。与 mandatorySkills 同链路，仅注入文案措辞不同。 */
  recommendedSkills: SkillTable
  /** router Track 评分正则；经 genRouterSh 进缓存，hooks/router.sh:168-170 打分用。 */
  routerPatterns: RouterPatterns
  /** phase → breadcrumb prose；hooks/router.sh:201 每轮注入。缺相位则键缺省。 */
  breadcrumbs: Readonly<Partial<Record<Phase, string>>>
}

/**
 * skill 三级回退查询（对齐老 evidence 346-355：per-track → `_all` → 空）。
 * 纯 helper；消费方 hooks/router-gen.mjs:74-75 与 cli/src/commands/gen-router.ts:41-42 调用之，
 * 回退逻辑单源于此、两处消费方都不重抄。
 */
export function skillsFor(table: SkillTable, phase: Phase, track: string): readonly string[] {
  const row = table[phase]
  if (!row) return []
  if (track in row) return row[track as SkillTrackKey] ?? []
  if ('_all' in row) return row._all ?? []
  return []
}

/** bash 单引号安全包裹（对齐老 manifest.py::_bash_squote 613-614，防 token 逃逸成命令注入） */
function bashSquote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

/**
 * 生成 router 评分正则的 bash 赋值（对齐老 gen_router_sh 890-898）。
 * 纯派生 helper；消费方 hooks/router-gen.mjs:62 与 cli/src/commands/gen-router.ts:32 把它写进
 * .pipeline-router.generated.sh，hooks/router.sh 命中缓存时纯 source 之——正是为了让热路径
 * （每轮 UserPromptSubmit）零 node spawn，见 router.sh:153-156 的热路径红线。
 */
export function genRouterSh(patterns: RouterPatterns): string {
  return [
    '# AUTO-GENERATED from manifest.yaml (kernel loadManifest) — 不要手改',
    `FE_PATTERN=${bashSquote(patterns.frontend)}`,
    `BE_PATTERN=${bashSquote(patterns.backend)}`,
    `PM_PATTERN=${bashSquote(patterns.pm)}`,
  ].join('\n')
}

function assertPhase(name: string, ctx: string): Phase {
  if (!PHASE_SET.has(name)) {
    throw new ManifestError(`${ctx} 含未知相位 '${name}'（合法：${PHASES.join('/')}）`)
  }
  return name as Phase
}

/** 去掉整行/行尾注释（子集里值不含引号与 #，安全裁剪）；返回 trimEnd 后的行 */
function stripComment(line: string): string {
  const t = line.trimStart()
  if (t.startsWith('#')) return ''
  // 行尾注释：空白 + '#' 起裁剪
  const m = line.match(/^(.*?)\s#/)
  return (m ? m[1]! : line).trimEnd()
}

/** 前导空格数（缩进量）；块标量缩进判界用。全空/空行由调用方先以 trim()==='' 排除 */
function indentOf(line: string): number {
  let n = 0
  while (n < line.length && line[n] === ' ') n++
  return n
}

/** 解析单行流式列表 `[a, b, c]`；`[]` → []。非法格式 → throw */
function parseFlowList(raw: string, ctx: string): string[] {
  const s = raw.trim()
  const m = s.match(/^\[(.*)\]$/)
  if (!m) throw new ManifestError(`${ctx} 期望单行流式列表 [a, b]，得到 '${raw}'`)
  const inner = m[1]!.trim()
  if (inner === '') return []
  return inner.split(',').map((x) => x.trim()).filter((x) => x !== '')
}

/** 解析单/双引号标量或裸标量（router_patterns 值）；引号内内容逐字保真（含空格），裸值裁行尾注释 */
function parseScalarValue(rest: string, ctx: string): string {
  const s = rest.trim()
  if (s.startsWith("'")) {
    const end = s.indexOf("'", 1)
    if (end < 0) throw new ManifestError(`${ctx} 单引号未闭合: '${rest}'`)
    return s.slice(1, end)
  }
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1)
    if (end < 0) throw new ManifestError(`${ctx} 双引号未闭合: '${rest}'`)
    return s.slice(1, end)
  }
  const m = s.match(/^(.*?)\s#/)
  return (m ? m[1]! : s).trimEnd()
}

interface RawSections {
  phases?: string[]
  transitions?: Map<string, string[]>
  review_phases?: string[]
  mandatory_skills?: Map<string, string[]>
  recommended_skills?: Map<string, string[]>
  router_patterns?: Map<string, string>
  breadcrumb?: Map<string, string>
}

/** 块小节 `key: [flowlist]`（*_skills 用；key 允许含 `.` 与 `_all`）；返回 {map, next} */
function parseSkillBlock(lines: string[], start: number, path: string, section: string): { map: Map<string, string[]>; next: number } {
  const map = new Map<string, string[]>()
  let i = start
  while (i < lines.length) {
    const l = stripComment(lines[i]!)
    if (l.trim() === '') { i++; continue }
    if (!/^\s/.test(l)) break // 回到顶层
    const entry = l.match(/^\s+([A-Za-z_][A-Za-z0-9_.-]*):\s*(\[.*\])\s*$/)
    if (!entry) {
      throw new ManifestError(`${path}:${i + 1} ${section} 条目须为 'phase.track: [skill, ...]'，得到 '${lines[i]}'`)
    }
    map.set(entry[1]!, parseFlowList(entry[2]!, `${section}.${entry[1]}`))
    i++
  }
  return { map, next: i }
}

/** 块小节 `key: 'scalar'`（router_patterns 用）；返回 {map, next} */
function parseScalarBlock(lines: string[], start: number, path: string, section: string): { map: Map<string, string>; next: number } {
  const map = new Map<string, string>()
  let i = start
  while (i < lines.length) {
    const raw = lines[i]!
    if (raw.trim() === '') { i++; continue }
    if (raw.trimStart().startsWith('#')) { i++; continue }
    if (!/^\s/.test(raw)) break // 回到顶层
    const entry = raw.match(/^\s+([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/)
    if (!entry) {
      throw new ManifestError(`${path}:${i + 1} ${section} 条目须为 'key: value'，得到 '${lines[i]}'`)
    }
    map.set(entry[1]!, parseScalarValue(entry[2]!, `${section}.${entry[1]}`))
    i++
  }
  return { map, next: i }
}

/** 块小节 `phase: |`（breadcrumb block scalar）；缩进决定块界，末尾换行 rstrip；返回 {map, next} */
function parseBreadcrumbBlock(lines: string[], start: number, path: string): { map: Map<string, string>; next: number } {
  const map = new Map<string, string>()
  let i = start
  while (i < lines.length) {
    const raw = lines[i]!
    if (raw.trim() === '') { i++; continue }
    const ind = indentOf(raw)
    if (ind === 0) break // 回到顶层（含顶层注释：交回主循环 stripComment 处理）
    if (raw.trimStart().startsWith('#')) { i++; continue } // 小节内注释
    const entry = raw.match(/^(\s+)([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/)
    if (!entry) {
      throw new ManifestError(`${path}:${i + 1} breadcrumb 条目须为 'phase: |' 或 'phase: value'，得到 '${lines[i]}'`)
    }
    const keyIndent = entry[1]!.length
    const key = entry[2]!
    const rest = entry[3]!.trim()
    i++
    if (rest === '|' || rest === '|-' || rest === '|+') {
      const blk: string[] = []
      while (i < lines.length) {
        const bl = lines[i]!
        if (bl.trim() === '') { blk.push(''); i++; continue }
        if (indentOf(bl) <= keyIndent) break // 缩进回退 = 块结束
        blk.push(bl)
        i++
      }
      const firstContent = blk.find((x) => x !== '')
      let value = ''
      if (firstContent !== undefined) {
        const blockIndent = indentOf(firstContent)
        value = blk.map((x) => (x === '' ? '' : x.slice(blockIndent))).join('\n').replace(/\n+$/, '')
      }
      map.set(key, value)
    } else {
      map.set(key, parseScalarValue(rest, `breadcrumb.${key}`))
    }
  }
  return { map, next: i }
}

/** 逐行扫描：识别已知顶层小节；未知顶层键连同其缩进块整体跳过（前向兼容） */
function scanSections(text: string, path: string): RawSections {
  const lines = text.split('\n')
  const out: RawSections = {}
  let i = 0
  while (i < lines.length) {
    const line = stripComment(lines[i]!)
    if (line.trim() === '') { i++; continue }
    const top = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/)
    if (!top) {
      throw new ManifestError(`${path}:${i + 1} 无法解析的顶层行 '${lines[i]}'（窄解析子集外）`)
    }
    const key = top[1]!
    const rest = top[2]!.trim()
    if (key === 'phases' || key === 'review_phases') {
      const items: string[] = []
      if (rest !== '') {
        items.push(...parseFlowList(rest, key))
        i++
      } else {
        i++
        while (i < lines.length) {
          const l = stripComment(lines[i]!)
          if (l.trim() === '') { i++; continue }
          const item = l.match(/^\s+-\s+(\S+)\s*$/)
          if (!item) break // 下一个顶层键或子集外结构，交回主循环
          items.push(item[1]!)
          i++
        }
      }
      if (key === 'phases') out.phases = items
      else out.review_phases = items
    } else if (key === 'transitions') {
      if (rest !== '') throw new ManifestError(`${path}:${i + 1} transitions 必须是块小节`)
      const map = new Map<string, string[]>()
      i++
      while (i < lines.length) {
        const l = stripComment(lines[i]!)
        if (l.trim() === '') { i++; continue }
        if (!/^\s/.test(l)) break // 回到顶层
        const entry = l.match(/^\s+([A-Za-z_][A-Za-z0-9_-]*):\s*(\[.*\])\s*$/)
        if (!entry) {
          throw new ManifestError(`${path}:${i + 1} transitions 条目须为 'from: [to, ...]'，得到 '${lines[i]}'`)
        }
        map.set(entry[1]!, parseFlowList(entry[2]!, `transitions.${entry[1]}`))
        i++
      }
      out.transitions = map
    } else if (key === 'mandatory_skills' || key === 'recommended_skills') {
      if (rest !== '') throw new ManifestError(`${path}:${i + 1} ${key} 必须是块小节`)
      const r = parseSkillBlock(lines, i + 1, path, key)
      if (key === 'mandatory_skills') out.mandatory_skills = r.map
      else out.recommended_skills = r.map
      i = r.next
    } else if (key === 'router_patterns') {
      if (rest !== '') throw new ManifestError(`${path}:${i + 1} router_patterns 必须是块小节`)
      const r = parseScalarBlock(lines, i + 1, path, 'router_patterns')
      out.router_patterns = r.map
      i = r.next
    } else if (key === 'breadcrumb') {
      if (rest !== '') throw new ManifestError(`${path}:${i + 1} breadcrumb 必须是块小节`)
      const r = parseBreadcrumbBlock(lines, i + 1, path)
      out.breadcrumb = r.map
      i = r.next
    } else {
      // 未知顶层键：跳过它与其整个缩进块（允许 manifest 未来加节而不破 kernel）
      i++
      while (i < lines.length) {
        const l = lines[i]!
        const stripped = stripComment(l)
        if (stripped.trim() !== '' && !/^\s/.test(stripped)) break
        i++
      }
    }
  }
  return out
}

/** 建空 skill 表（全相位 → {}），供缺节 / 增量填充的基座 */
function emptySkillTable(): Record<Phase, Partial<Record<SkillTrackKey, readonly string[]>>> {
  const t = {} as Record<Phase, Partial<Record<SkillTrackKey, readonly string[]>>>
  for (const p of PHASES) t[p] = {}
  return t
}

/** 派生 skill 表：校验 phase 已声明、track 合法（fail-loud，老 evidence fail-open 的改进），逐条填入 */
function deriveSkillTable(
  raw: Map<string, string[]> | undefined,
  declared: ReadonlySet<Phase>,
  section: string,
): SkillTable {
  const table = emptySkillTable()
  if (!raw) return table
  for (const [pt, list] of raw) {
    const dot = pt.indexOf('.')
    if (dot <= 0 || dot === pt.length - 1) {
      throw new ManifestError(`${section} 键 '${pt}' 须为 'phase.track' 形式`)
    }
    const phaseName = pt.slice(0, dot)
    const track = pt.slice(dot + 1)
    const phase = assertPhase(phaseName, section)
    if (!declared.has(phase)) throw new ManifestError(`${section}.${pt} 相位 '${phaseName}' 未在 phases 声明`)
    if (!SKILL_TRACK_SET.has(track)) {
      throw new ManifestError(`${section}.${pt} 含未知 track '${track}'（合法：pm/frontend/backend/_all）`)
    }
    table[phase][track as SkillTrackKey] = list
  }
  return table
}

export function loadManifest(path: string): ExtendedManifestData {
  const text = readFileSync(path, 'utf8')
  const raw = scanSections(text, path)

  if (!raw.phases || raw.phases.length === 0) throw new ManifestError(`${path} 缺 phases 小节`)
  if (!raw.transitions) throw new ManifestError(`${path} 缺 transitions 小节`)
  if (!raw.review_phases) {
    // fail-loud：review-gate 名单缺失绝不静默（老内核 HARD STOP 语义）
    throw new ManifestError(`${path} 缺 review_phases 键（review-gate 名单不许静默缺失）`)
  }

  const phases = raw.phases.map((p) => assertPhase(p, 'phases'))
  const declared = new Set<Phase>(phases)
  if (declared.size !== phases.length) throw new ManifestError('phases 含重复相位')

  // transitions：每个已声明相位必须有条目（可为 []）；from/to 都必须是已声明相位
  const transitions = {} as Record<Phase, readonly Phase[]>
  for (const p of PHASES) transitions[p] = []
  for (const [from, targets] of raw.transitions) {
    const fromPh = assertPhase(from, 'transitions')
    if (!declared.has(fromPh)) throw new ManifestError(`transitions.${from} 不在已声明 phases 中`)
    transitions[fromPh] = targets.map((t) => {
      const toPh = assertPhase(t, `transitions.${from}`)
      if (!declared.has(toPh)) throw new ManifestError(`transitions.${from} 指向未声明相位 '${t}'`)
      return toPh
    })
  }
  for (const p of phases) {
    if (!raw.transitions.has(p)) {
      throw new ManifestError(`transitions 缺相位 '${p}' 的条目（终态也须显式声明，可为 []）`)
    }
  }

  const reviewPhases = raw.review_phases.map((p) => {
    const ph = assertPhase(p, 'review_phases')
    if (!declared.has(ph)) throw new ManifestError(`review_phases 含未声明相位 '${p}'`)
    return ph
  })

  // —— 全派生面（本轮新增，全部从 yaml 数据真派生，缺节安全降级为空，零硬编码）——
  const mandatorySkills = deriveSkillTable(raw.mandatory_skills, declared, 'mandatory_skills')
  const recommendedSkills = deriveSkillTable(raw.recommended_skills, declared, 'recommended_skills')

  const routerPatterns: RouterPatterns = { frontend: '', backend: '', pm: '' }
  if (raw.router_patterns) {
    for (const [track, pat] of raw.router_patterns) {
      if (!ROUTER_TRACK_SET.has(track)) {
        throw new ManifestError(`router_patterns 含未知 track '${track}'（合法：frontend/backend/pm）`)
      }
      routerPatterns[track as keyof RouterPatterns] = pat
    }
  }

  const breadcrumbs: Partial<Record<Phase, string>> = {}
  if (raw.breadcrumb) {
    for (const [phaseName, prose] of raw.breadcrumb) {
      const ph = assertPhase(phaseName, 'breadcrumb')
      if (!declared.has(ph)) throw new ManifestError(`breadcrumb 含未声明相位 '${phaseName}'`)
      breadcrumbs[ph] = prose
    }
  }

  return { phases, transitions, reviewPhases, mandatorySkills, recommendedSkills, routerPatterns, breadcrumbs }
}
