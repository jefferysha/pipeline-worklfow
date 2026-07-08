import { describe, expect, it } from 'vitest'
import { layoutNodes } from './layout'

describe('layoutNodes —— 确定性分层布局（无外部布局库，纯函数真单测锁定输出）', () => {
  it('无边的孤立节点：全部落在第 0 列，按输入顺序分行', () => {
    const positions = layoutNodes([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [])
    expect(positions.get('a')).toEqual({ x: 0, y: 0 })
    expect(positions.get('b')?.x).toBe(0)
    expect(positions.get('c')?.x).toBe(0)
    // 三行纵向不重叠
    const ys = ['a', 'b', 'c'].map((id) => positions.get(id)!.y)
    expect(new Set(ys).size).toBe(3)
  })

  it('线性链 a→b→c：按拓扑深度分列，深度依次递增', () => {
    const positions = layoutNodes(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
    )
    expect(positions.get('a')!.x).toBeLessThan(positions.get('b')!.x)
    expect(positions.get('b')!.x).toBeLessThan(positions.get('c')!.x)
  })

  it('分支 a→b, a→c：b/c 同列（深度相同），不同行', () => {
    const positions = layoutNodes(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }],
    )
    expect(positions.get('b')!.x).toBe(positions.get('c')!.x)
    expect(positions.get('b')!.y).not.toBe(positions.get('c')!.y)
  })

  it('含环（真实自定义 workflow 允许 verify-fail 这类回边）：不死循环，环内节点仍各自拿到确定坐标', () => {
    const positions = layoutNodes(
      [{ id: 'a' }, { id: 'b' }],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
    )
    expect(positions.size).toBe(2)
    expect(positions.get('a')).toBeDefined()
    expect(positions.get('b')).toBeDefined()
  })

  it('确定性：同样的输入两次调用产出完全一样的坐标（不依赖 Math.random/Date.now）', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const edges = [{ from: 'a', to: 'b' }]
    expect(layoutNodes(items, edges)).toEqual(layoutNodes(items, edges))
  })
})
