/** 人读渲染原语：对齐宽度的紧凑表 / key-value 块 + 字段值显示口径 */

/** 字段值 → 字符串（列表按逗号连接；undefined → 空串） */
export function str(v: string | string[] | undefined): string {
  if (v === undefined) return ''
  return Array.isArray(v) ? v.join(',') : v
}

/** 人读显示：空值统一显示 '-' */
export function display(v: string | string[] | undefined): string {
  const s = str(v)
  return s === '' ? '-' : s
}

/** 紧凑表：各列 padEnd 到列最大宽、双空格分隔、行尾无空白 */
export function renderTable(headers: readonly string[], rows: readonly (readonly string[])[]): string[] {
  const all = [headers, ...rows]
  const widths = headers.map((_, i) => Math.max(...all.map((r) => (r[i] ?? '').length)))
  return all.map((r) =>
    r
      .map((cell, i) => (i === r.length - 1 ? cell : cell.padEnd(widths[i] ?? 0)))
      .join('  ')
      .trimEnd(),
  )
}

/** key-value 块：label padEnd 到最长 label + 2 */
export function renderKV(pairs: ReadonlyArray<readonly [string, string]>): string[] {
  const width = Math.max(...pairs.map(([k]) => k.length)) + 2
  return pairs.map(([k, v]) => `${k.padEnd(width)}${v}`.trimEnd())
}
