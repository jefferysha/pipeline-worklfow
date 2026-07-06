/**
 * loadManifest —— templates/manifest.yaml 的手写窄解析器。
 *
 * 只支持 templates/manifest.yaml 用到的子集（CONTRACT §1 禁 yaml npm 包）：
 *   · 顶层键 `key:` / `key: [inline, list]`
 *   · 块序列（两空格缩进 `- item`）
 *   · transitions 小节的 `from: [to1, to2]` 条目
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

/** 解析单行流式列表 `[a, b, c]`；`[]` → []。非法格式 → throw */
function parseFlowList(raw: string, ctx: string): string[] {
  const s = raw.trim()
  const m = s.match(/^\[(.*)\]$/)
  if (!m) throw new ManifestError(`${ctx} 期望单行流式列表 [a, b]，得到 '${raw}'`)
  const inner = m[1]!.trim()
  if (inner === '') return []
  return inner.split(',').map((x) => x.trim()).filter((x) => x !== '')
}

interface RawSections {
  phases?: string[]
  transitions?: Map<string, string[]>
  review_phases?: string[]
}

/** 逐行扫描：识别三个已知顶层小节；未知顶层键连同其缩进块整体跳过（前向兼容） */
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

export function loadManifest(path: string): ManifestData {
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

  return { phases, transitions, reviewPhases }
}
