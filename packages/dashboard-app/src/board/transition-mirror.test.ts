/**
 * 单源守卫（iteration-29 收敛复查）：dashboard 的 transition 边表镜像 vs kernel 单源。
 *
 * 背景：#25b 把 transition 事件表上提 kernel/flow/transition-table.ts 为单源，cli+server 已改为
 * 共消费。dashboard 是浏览器 bundle，直接 import @pipeline-lite/kernel 会拉进 node:fs 代码破坏
 * 浏览器构建——故 dashboard 保留一份纯数据镜像（types.ts TRANSITIONS + EVENT_BY_EDGE）。
 * 本测试是**跨 node/浏览器边界的单源守卫**：vitest 在 node 侧真 import kernel 单源 + dashboard
 * 镜像，断言逐边/逐事件字节相等——镜像一旦漂移即抓红（同 server 的引用相等断言，此处是数据相等）。
 */
import { describe, expect, it } from 'vitest'
import { TRANSITION_EVENTS, type EventEdge } from '@pipeline-lite/kernel'
import { TRANSITIONS, EVENT_BY_EDGE } from '../types'

describe('单源守卫 —— dashboard transition 镜像 == kernel 单源（#25b 延伸）', () => {
  it('EVENT_BY_EDGE 逐边与 kernel TRANSITION_EVENTS 字节相等（事件名+边）', () => {
    // kernel 单源：event -> { from, to }；投影成 dashboard 口径 "from->to" -> event
    const kernelByEdge: Record<string, string> = {}
    for (const [event, edge] of Object.entries(TRANSITION_EVENTS as Record<string, EventEdge>)) {
      kernelByEdge[`${edge.from}->${edge.to}`] = event
    }
    expect(EVENT_BY_EDGE).toEqual(kernelByEdge)
  })

  it('TRANSITIONS 合法边集与 kernel 单源一致（每 from 的 to 集合相等）', () => {
    // 从 kernel 单源派生每个 from 相位的合法目标集
    const kernelEdges: Record<string, string[]> = {}
    for (const edge of Object.values(TRANSITION_EVENTS as Record<string, EventEdge>)) {
      ;(kernelEdges[edge.from] ??= []).push(edge.to)
    }
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      expect([...tos].sort()).toEqual((kernelEdges[from] ?? []).sort())
    }
    // 反向：kernel 的每个 from 也在 dashboard TRANSITIONS 里（无遗漏边）
    for (const from of Object.keys(kernelEdges)) {
      expect(Object.keys(TRANSITIONS)).toContain(from)
    }
  })
})
