/**
 * 确定性分层布局——不引入 @dagrejs/dagre 等外部布局库（图规模小：几个 step、每 step
 * 几个 skill，简单分层布局够用，还能整个纯函数真单测锁定输出，不依赖第三方算法版本行为）。
 * 按 BFS 拓扑深度分列（深度 = 到任一"入度为 0 的根"的最短距离，环用"访问过就不回头"打断，
 * 不会死循环），同列内按输入数组的相对顺序分行。不持久化坐标——见设计文档 §2.3。
 */
const COL_WIDTH = 220
const ROW_HEIGHT = 100

export interface Point { x: number; y: number }

export function layoutNodes<T extends { id: string }>(
  items: readonly T[],
  edges: readonly { from: string; to: string }[],
): Map<string, Point> {
  const ids = items.map((i) => i.id)
  const idSet = new Set(ids)
  const outgoing = new Map<string, string[]>(ids.map((id) => [id, []]))
  const hasIncoming = new Set<string>()
  for (const e of edges) {
    if (!idSet.has(e.from) || !idSet.has(e.to)) continue
    outgoing.get(e.from)!.push(e.to)
    hasIncoming.add(e.to)
  }

  const depth = new Map<string, number>()
  const roots = ids.filter((id) => !hasIncoming.has(id))
  const queue: Array<{ id: string; d: number }> = roots.map((id) => ({ id, d: 0 }))
  const visited = new Set<string>()
  while (queue.length > 0) {
    const { id, d } = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    depth.set(id, d)
    for (const next of outgoing.get(id) ?? []) {
      if (!visited.has(next)) queue.push({ id: next, d: d + 1 })
    }
  }
  // 环内但从未被任何根触达的节点（如整张图全是环、没有入度为 0 的根）：兜底落在深度 0。
  for (const id of ids) if (!depth.has(id)) depth.set(id, 0)

  const rowCounters = new Map<number, number>()
  const positions = new Map<string, Point>()
  for (const id of ids) {
    const d = depth.get(id)!
    const row = rowCounters.get(d) ?? 0
    rowCounters.set(d, row + 1)
    positions.set(id, { x: d * COL_WIDTH, y: row * ROW_HEIGHT })
  }
  return positions
}
