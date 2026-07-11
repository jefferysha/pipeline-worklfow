/**
 * loops 草稿标记 sidecar —— `<repoRoot>/.pipeline/loops.drafts.json`（loop-init P2）。
 *
 * 用途：「agent 草稿 · 待你审阅」标记，纯展示元数据（非敏感，只存 loop id 列表）。
 * 向导/结构化通道起草 loop 时登记 id；dashboard 据此渲染徽章与批准/驳回动作；任何 status
 * 写回（批准或驳回）即视为已审阅，server 侧清标记。标记缺失只降级掉徽章，loop 本身照常可审可改。
 *
 * 读：fail-open——缺失/不可读/坏 JSON/形状不符（非 `{version:1, ids:string[]}`）一律 []，绝不抛，
 * 绝不阻断消费方（对齐 projectRegistry.readProjectRegistry 容错语义）。
 * 写：同目录 tmp+rename 原子写 + mkdir -p（对齐 projectRegistry.writeProjectRegistry 先例——
 * 同款 tmp 命名/rename/mkdir 模式；drafts 是独立文件域，不复用其原语）。序列化格式：
 * `JSON.stringify({version:1, ids}, null, 2)` + 尾换行（与注册表文件同款人工可编辑格式）。
 */
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const DRAFT_MARKS_FILE = 'loops.drafts.json'

/** 草稿标记缺省路径：<repoRoot>/.pipeline/loops.drafts.json */
export function draftMarksPath(repoRoot: string): string {
  return join(repoRoot, '.pipeline', DRAFT_MARKS_FILE)
}

/** 读草稿标记：缺失/坏 JSON/形状不符（非 `{version:1, ids:string[]}`）→ []（fail-open，绝不抛） */
export function readDraftMarks(path: string): string[] {
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (
      typeof data === 'object'
      && data !== null
      && !Array.isArray(data)
      && (data as { version?: unknown }).version === 1
      && Array.isArray((data as { ids?: unknown }).ids)
      && (data as { ids: unknown[] }).ids.every((x) => typeof x === 'string')
    ) {
      return [...(data as { ids: string[] }).ids]
    }
    return []
  } catch {
    return []
  }
}

let tmpSeq = 0

/**
 * 原子写草稿标记原语：mkdir -p + 同目录 tmp+rename（崩溃不留半截 JSON）。
 * 序列化：`{version:1, ids}` + 2 空格缩进 + 尾换行（人工可编辑，逐字节对齐注册表格式）。
 */
async function writeDraftMarks(path: string, ids: string[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp.${process.pid}.${tmpSeq++}`
  await writeFile(tmp, `${JSON.stringify({ version: 1, ids }, null, 2)}\n`, 'utf8')
  await rename(tmp, path)
}

/** 登记草稿标记：幂等（已存在则不写盘）；首写自动建 .pipeline 目录。 */
export async function addDraftMark(path: string, id: string): Promise<void> {
  const existing = readDraftMarks(path)
  if (existing.includes(id)) return
  await writeDraftMarks(path, [...existing, id])
}

/** 清草稿标记：只删目标 id（其余保留）；id 不存在则幂等无错、不写盘；清空后保留 {version:1, ids:[]} 文件，不删文件。 */
export async function clearDraftMark(path: string, id: string): Promise<void> {
  const existing = readDraftMarks(path)
  if (!existing.includes(id)) return
  await writeDraftMarks(path, existing.filter((x) => x !== id))
}
