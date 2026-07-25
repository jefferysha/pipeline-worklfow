import type {
  WorkflowDocumentContractV1,
  WorkflowDocumentRead,
  WorkflowDocumentSlot,
} from './types.js'

export interface WorkflowParseCursor {
  lines: string[]
  i: number
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

function parseInlineList(raw: string): string[] {
  const trimmed = raw.trim()
  if (trimmed === '[]') return []
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new Error(`workflow 解析错误：期望 [a, b] 形态的单行列表，实际 '${raw}'`)
  }
  return trimmed
    .slice(1, -1)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseSlots(cursor: WorkflowParseCursor, baseIndent: number): WorkflowDocumentSlot[] {
  const slots: WorkflowDocumentSlot[] = []
  while (cursor.i < cursor.lines.length) {
    const line = cursor.lines[cursor.i] ?? ''
    if (line.trim() === '') { cursor.i++; continue }
    if (indentOf(line) < baseIndent) break
    const kindMatch = /^\s*-\s+kind:\s*(\S+)\s*$/.exec(line)
    if (!kindMatch) break
    const itemIndent = indentOf(line)
    cursor.i++
    let ownerStep: string | undefined
    let producers: string[] | undefined
    while (cursor.i < cursor.lines.length) {
      const child = cursor.lines[cursor.i] ?? ''
      if (child.trim() === '') { cursor.i++; continue }
      if (indentOf(child) <= itemIndent) break
      const ownerMatch = /^\s*owner_step:\s*(\S+)\s*$/.exec(child)
      if (ownerMatch) { ownerStep = ownerMatch[1]; cursor.i++; continue }
      const producerMatch = /^\s*producers:\s*(\[.*\])\s*$/.exec(child)
      if (producerMatch) { producers = parseInlineList(producerMatch[1] ?? ''); cursor.i++; continue }
      throw new Error(`workflow 解析错误：document slot '${kindMatch[1]}' 出现未知字段行 '${child.trim()}'`)
    }
    if (!ownerStep) throw new Error(`workflow 解析错误：document slot '${kindMatch[1]}' 缺 owner_step`)
    if (!producers || producers.length === 0) {
      throw new Error(`workflow 解析错误：document slot '${kindMatch[1]}' 缺非空 producers`)
    }
    slots.push({ kind: kindMatch[1] ?? '', ownerStep, producers })
  }
  return slots
}

function parseReads(cursor: WorkflowParseCursor, baseIndent: number): WorkflowDocumentRead[] {
  const reads: WorkflowDocumentRead[] = []
  while (cursor.i < cursor.lines.length) {
    const line = cursor.lines[cursor.i] ?? ''
    if (line.trim() === '') { cursor.i++; continue }
    if (indentOf(line) < baseIndent) break
    const stepMatch = /^\s*-\s+step:\s*(\S+)\s*$/.exec(line)
    if (!stepMatch) break
    const itemIndent = indentOf(line)
    cursor.i++
    const kindsLine = cursor.lines[cursor.i] ?? ''
    const kindsMatch = /^\s*kinds:\s*(\[.*\])\s*$/.exec(kindsLine)
    if (!kindsMatch || indentOf(kindsLine) <= itemIndent) {
      throw new Error(`workflow 解析错误：document read '${stepMatch[1]}' 缺 kinds`)
    }
    const kinds = parseInlineList(kindsMatch[1] ?? '')
    if (kinds.length === 0) {
      throw new Error(`workflow 解析错误：document read '${stepMatch[1]}' 的 kinds 不得为空`)
    }
    cursor.i++
    reads.push({ step: stepMatch[1] ?? '', kinds })
  }
  return reads
}

export function parseDocumentContract(
  cursor: WorkflowParseCursor,
  keyIndent: number,
): WorkflowDocumentContractV1 {
  let version: 'v1' | undefined
  let slots: WorkflowDocumentSlot[] | undefined
  let reads: WorkflowDocumentRead[] | undefined
  while (cursor.i < cursor.lines.length) {
    const line = cursor.lines[cursor.i] ?? ''
    if (line.trim() === '') { cursor.i++; continue }
    if (indentOf(line) <= keyIndent) break
    const versionMatch = /^\s*version:\s*(\S+)\s*$/.exec(line)
    if (versionMatch) {
      if (versionMatch[1] !== 'v1') {
        throw new Error("workflow 解析错误：document_contract version 只支持 'v1'")
      }
      version = 'v1'
      cursor.i++
      continue
    }
    if (/^\s*slots:\s*$/.test(line)) {
      const blockIndent = indentOf(line)
      cursor.i++
      slots = parseSlots(cursor, blockIndent + 2)
      continue
    }
    if (/^\s*reads:\s*\[\]\s*$/.test(line)) { reads = []; cursor.i++; continue }
    if (/^\s*reads:\s*$/.test(line)) {
      const blockIndent = indentOf(line)
      cursor.i++
      reads = parseReads(cursor, blockIndent + 2)
      continue
    }
    throw new Error(`workflow 解析错误：document_contract 出现未知字段行 '${line.trim()}'`)
  }
  if (!version) throw new Error('workflow 解析错误：document_contract 缺 version: v1')
  if (!slots || slots.length === 0) throw new Error('workflow 解析错误：document_contract 缺非空 slots')
  if (!reads) throw new Error('workflow 解析错误：document_contract 缺 reads')
  return { version, slots, reads }
}
