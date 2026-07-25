import { required } from '../required.js'

/**
 * loops yamlBlock —— `.pipeline/loops.yaml` 条目块定位共享内件（**包内私有**：不进 loops/index.ts
 * 亦即不进 kernel 公共出口；只供 update.ts / graduation.ts 直接 import）。
 *
 * 此前 update.ts（字段手术）与 graduation.ts::setAutonomyLevelInYaml（改档手术）各持一份同款
 * 块定位（idRe / 块界定 / 块尾插入点），本文件收编为单份。**只共享定位内件，不合并手术本身**：
 * 两侧公共 API 的责任分离原样保留——update 拒收 autonomy_level（升降档旁路禁区），
 * graduation 只改 autonomy_level。
 *
 * 两侧消费差异（刻意保留，不悄悄统一）：
 *   · update.ts 用 fieldIndent（= id 键真实列，dash 后空白任意长均对齐）渲染/匹配同级字段行；
 *   · graduation.ts 沿历史口径用 dashIndent + 2 硬编码插入缩进（登记表 dash 后恒一空格时两者等值）。
 * 故 LoopBlock 同时给出 dashIndent 与 fieldIndent，由消费方各取所需。
 */

export interface LoopBlock {
  /** `- id:` 行下标。 */
  start: number
  /** 块结束（不含）：下一个缩进 ≤ dashIndent 的非空行（下个 loop 项 / 顶层 key）。 */
  end: number
  /** dash 所在列（`- id:` 行首空白长度）。 */
  dashIndent: number
  /** 同级字段列（= id 键所在列，即 dash 后首个非空字符）。 */
  fieldIndent: number
}

/** 行首空白长度。 */
export function indentOf(line: string): number {
  return line.length - line.replace(/^\s*/, '').length
}

/** 定位目标 loop 块（idRe 容行尾注释，id 值精确比对不吃前缀同名）。 */
export function locateLoop(lines: string[], loopId: string): LoopBlock | null {
  const idRe = /^(\s*)-(\s+)id:\s+(.+?)\s*(?:#.*)?$/
  for (let i = 0; i < lines.length; i++) {
    const m = required(lines[i]).match(idRe)
    if (!m || required(m[3]).trim() !== loopId) continue
    const dashIndent = required(m[1]).length
    const fieldIndent = dashIndent + 1 + required(m[2]).length
    let end = lines.length
    for (let j = i + 1; j < lines.length; j++) {
      const line = required(lines[j])
      if (line.trim() === '') continue
      if (indentOf(line) <= dashIndent) {
        end = j
        break
      }
    }
    return { start: i, end, dashIndent, fieldIndent }
  }
  return null
}

/** 块尾插入点：(start, end) 内最后一个非空行之后；全空 → end。子块同样适用（start 传子块头行）。 */
export function insertPointAtBlockEnd(lines: string[], start: number, end: number): number {
  for (let i = end - 1; i > start; i--) {
    if (required(lines[i]).trim() !== '') return i + 1
  }
  return end
}
