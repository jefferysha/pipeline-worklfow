/**
 * workflow 定义文件窄解析器——同 packages/kernel/src/flow/manifest.ts 的策略：手写扫描，
 * 只支持本文件格式实际用到的 YAML 子集（flat key/value + 固定形状的 block 序列 +
 * `[a, b]` 单行 flow-list），禁引入 yaml 包（kernel 零第三方依赖硬规则）。格式错误
 * fail-loud（throw），不吞错静默返回残缺结构。
 */
import type { FieldRef, FieldType, GateKind, GuardConfig, SkillRef, StepDef, StepTransition, WorkflowDef } from './types.js'

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

interface Cursor {
  lines: string[]
  i: number
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

function parseSkillsBlock(cur: Cursor, baseIndent: number): SkillRef[] {
  const skills: SkillRef[] = []
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '' ) { cur.i++; continue }
    if (indentOf(line) < baseIndent) break
    const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/.exec(line)
    if (!idMatch) break
    cur.i++
    let depends_on: string[] | undefined
    const next = cur.lines[cur.i] ?? ''
    const depMatch = /^\s*depends_on:\s*(\[.*\])\s*$/.exec(next)
    if (depMatch && indentOf(next) > baseIndent) {
      depends_on = parseInlineList(depMatch[1]!)
      cur.i++
    }
    skills.push(depends_on ? { id: idMatch[1]!, depends_on } : { id: idMatch[1]! })
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
    refs.push({ field: fieldMatch[1]!, type: typeMatch[1] as FieldType })
  }
  return refs
}

function parseGuardsBlock(cur: Cursor, baseIndent: number): GuardConfig[] {
  const guards: GuardConfig[] = []
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '') { cur.i++; continue }
    if (indentOf(line) < baseIndent) break
    const typeMatch = /^\s*-\s+type:\s*(tasks-at-least|nonempty-output)\s*$/.exec(line)
    if (!typeMatch) break
    cur.i++
    const kind = typeMatch[1]!
    if (kind === 'tasks-at-least') {
      const nLine = cur.lines[cur.i] ?? ''
      const nMatch = /^\s*n:\s*(\d+)\s*$/.exec(nLine)
      if (!nMatch) throw new Error(`workflow 解析错误：guard 'tasks-at-least' 缺 n`)
      cur.i++
      guards.push({ type: 'tasks-at-least', n: Number(nMatch[1]) })
    } else {
      guards.push({ type: 'nonempty-output' })
    }
  }
  return guards
}

function parseTransitionsBlock(cur: Cursor, baseIndent: number): StepTransition[] {
  const transitions: StepTransition[] = []
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '') { cur.i++; continue }
    if (indentOf(line) < baseIndent) break
    const eventMatch = /^\s*-\s+event:\s*(\S+)\s*$/.exec(line)
    if (!eventMatch) break
    cur.i++
    const toLine = cur.lines[cur.i] ?? ''
    const toMatch = /^\s*to:\s*(\S+)\s*$/.exec(toLine)
    if (!toMatch) throw new Error(`workflow 解析错误：transitions 里 event '${eventMatch[1]}' 缺 to`)
    cur.i++
    transitions.push({ event: eventMatch[1]!, to: toMatch[1]! })
  }
  return transitions
}

function parseStep(cur: Cursor): StepDef {
  const idLine = cur.lines[cur.i] ?? ''
  const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/.exec(idLine)
  if (!idMatch) throw new Error(`workflow 解析错误：期望 '- id: <name>'，实际 '${idLine}'`)
  const baseIndent = indentOf(idLine) + 2 // step 内字段比 "- id:" 多缩进 2
  cur.i++

  let label = ''
  let gate: GateKind = null
  let skills: SkillRef[] = []
  let inputs: FieldRef[] = []
  let outputs: FieldRef[] = []
  let guards: GuardConfig[] = []
  let transitions: StepTransition[] = []

  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '') { cur.i++; continue }
    if (indentOf(line) < baseIndent - 2) break
    if (/^\s*label:\s*(.+)$/.test(line)) { label = /^\s*label:\s*(.+)$/.exec(line)![1]!.trim(); cur.i++; continue }
    if (/^\s*gate:\s*(review|confirm|null)\s*$/.test(line)) {
      const v = /^\s*gate:\s*(review|confirm|null)\s*$/.exec(line)![1]!
      gate = v === 'null' ? null : (v as GateKind)
      cur.i++
      continue
    }
    if (/^\s*skills:\s*\[\]\s*$/.test(line)) { skills = []; cur.i++; continue }
    if (/^\s*skills:\s*$/.test(line)) { cur.i++; skills = parseSkillsBlock(cur, baseIndent); continue }
    if (/^\s*inputs:\s*\[\]\s*$/.test(line)) { inputs = []; cur.i++; continue }
    if (/^\s*inputs:\s*$/.test(line)) { cur.i++; inputs = parseFieldRefBlock(cur, baseIndent); continue }
    if (/^\s*outputs:\s*\[\]\s*$/.test(line)) { outputs = []; cur.i++; continue }
    if (/^\s*outputs:\s*$/.test(line)) { cur.i++; outputs = parseFieldRefBlock(cur, baseIndent); continue }
    if (/^\s*guards:\s*\[\]\s*$/.test(line)) { cur.i++; continue }
    if (/^\s*guards:\s*$/.test(line)) { cur.i++; guards = parseGuardsBlock(cur, baseIndent); continue }
    if (/^\s*transitions:\s*\[\]\s*$/.test(line)) { transitions = []; cur.i++; continue }
    if (/^\s*transitions:\s*$/.test(line)) { cur.i++; transitions = parseTransitionsBlock(cur, baseIndent); continue }
    break
  }

  return { id: idMatch[1]!, label, gate, skills, inputs, outputs, guards, transitions }
}

export function parseWorkflow(content: string): WorkflowDef {
  const lines = content.split('\n')
  const nameMatch = /^name:\s*(\S+)\s*$/.exec(lines[0] ?? '')
  if (!nameMatch) throw new Error("workflow 解析错误：第一行必须是 'name: <name>'")
  if ((lines[1] ?? '').trim() !== 'steps:') throw new Error("workflow 解析错误：第二行必须是 'steps:'")

  const cur: Cursor = { lines, i: 2 }
  const steps: StepDef[] = []
  while (cur.i < lines.length) {
    if ((lines[cur.i] ?? '').trim() === '') { cur.i++; continue }
    if (!/^\s*-\s+id:/.test(lines[cur.i] ?? '')) {
      throw new Error(`workflow 解析错误：steps 下每项必须以 '- id:' 开头，实际 '${lines[cur.i]}'`)
    }
    steps.push(parseStep(cur))
  }
  return { name: nameMatch[1]!, steps }
}
