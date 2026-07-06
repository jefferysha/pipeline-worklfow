/**
 * inbox [--json] —— 收件箱：等待人工决策的 change 一屏清单（BACKLOG #9a）。
 * 回答的唯一问题：「现在哪个 change 在等我做什么决定」（老仓 UI 病灶 2 的 lite 解法）。
 *
 * 两类来源，按等待时长降序：
 *   1. 项目根新鲜（< GATE_FRESH_MS，同 gate.sh TTL）三门 marker → gate:<kind>
 *      （marker 三行格式：相位\n指引\nchange 名，transition 落、老内核同款）
 *   2. 复核相位（manifest.reviewPhases 单一真相源）且 phase_status ≠ done 的活跃
 *      change → phase-review（同名已有 marker 时 marker 优先，不重复列）
 * 坏 change 跳过 + WARN（fail-open）；exit 恒 0。
 */
import { join } from 'node:path'
import { GATE_FRESH_MS } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { str } from '../render.js'

interface InboxItem {
  name: string
  phase: string
  waiting_on: string
  waiting_s: number
  hint: string
}

/** 90 → "1m30s" 级别的紧凑时长（人读列） */
function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}m` : ''}`
}

const REVIEW_HINT = '完成该相位产出后用 AskUserQuestion 交用户复核'

export async function cmdInbox(deps: CliDeps, opts: { json?: boolean }): Promise<number> {
  const items: InboxItem[] = []
  const seen = new Set<string>()

  // 1. 三门 marker（新鲜判定同 gate.sh）
  const markers = (await deps.readGateMarkers?.()) ?? []
  for (const m of markers) {
    if (m.ageMs >= GATE_FRESH_MS) continue
    const [phase = '?', hint = '', name = '?'] = m.raw.split('\n')
    items.push({
      name,
      phase,
      waiting_on: `gate:${m.kind}`,
      waiting_s: Math.floor(m.ageMs / 1000),
      hint,
    })
    seen.add(name)
  }

  // 2. 复核相位停留的活跃 change（manifest.reviewPhases 单一真相源）
  const now = Date.parse(deps.clock())
  const changesRoot = join(deps.cwd, 'openspec', 'changes')
  for (const name of await deps.listChanges(changesRoot)) {
    if (seen.has(name)) continue
    let fields
    try {
      fields = (await deps.store.read(join(changesRoot, name))).fields
    } catch (e) {
      deps.io.err(`WARN: 跳过坏 change ${name}: ${errMsg(e)}`)
      continue
    }
    if (str(fields.archived) === 'true') continue
    const phase = str(fields.phase)
    if (!(deps.flow.manifest.reviewPhases as readonly string[]).includes(phase)) continue
    if (str(fields.phase_status) === 'done') continue
    const updated = Date.parse(str(fields.updated_at))
    const waitingS = Number.isNaN(updated) ? 0 : Math.max(0, Math.floor((now - updated) / 1000))
    items.push({ name, phase, waiting_on: 'phase-review', waiting_s: waitingS, hint: REVIEW_HINT })
  }

  items.sort((a, b) => b.waiting_s - a.waiting_s)

  if (opts.json) {
    deps.io.out(JSON.stringify({ inbox: items }))
    return 0
  }
  if (items.length === 0) {
    deps.io.out('收件箱空——没有在等你的事。')
    return 0
  }
  const nameW = Math.max(6, ...items.map((i) => i.name.length))
  const phaseW = Math.max(5, ...items.map((i) => i.phase.length))
  const waitW = Math.max(4, ...items.map((i) => fmtDuration(i.waiting_s).length))
  deps.io.out(`${'CHANGE'.padEnd(nameW)}  ${'PHASE'.padEnd(phaseW)}  ${'等待'.padEnd(waitW)}  在等什么`)
  for (const i of items) {
    deps.io.out(
      `${i.name.padEnd(nameW)}  ${i.phase.padEnd(phaseW)}  ${fmtDuration(i.waiting_s).padEnd(waitW)}  [${i.waiting_on}] ${i.hint}`,
    )
  }
  return 0
}
