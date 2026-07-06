import { describe, expect, test } from 'vitest'
import type { PipelineState } from '@pipeline-lite/kernel'
import { cmdImport } from './import.js'
import { FIXED_CLOCK, makeDeps, mockState } from '../test-support.js'

const TAIL = `tools_history:
  - { at: t1, tool: Skill, detail: "x" }
transitions_history:
  - { at: t2, from: verify, to: ship, event: verify-pass }
`

function stateWithTail(tail: string): PipelineState {
  const st = mockState({ phase: 'ship' })
  st.opaqueTail = tail
  return st
}

describe('import —— 老仓历史区迁移进 JSONL（BACKLOG #11）', () => {
  test('happy path：逐条 append + 末尾 import 哨兵，[IMPORT] 摘要走 stderr，exit 0', async () => {
    const deps = makeDeps({ state: stateWithTail(TAIL) })
    const code = await cmdImport(deps, 'demo', {})
    expect(code).toBe(0)
    const kinds = deps.historyEntries.map(([, e]) => e.kind)
    expect(kinds).toEqual(['tool', 'transition', 'import'])
    expect(deps.historyEntries.at(-1)?.[1]).toMatchObject({ ts: FIXED_CLOCK, kind: 'import' })
    expect(deps.errLines.join('\n')).toContain('[IMPORT] demo: 2')
    expect(deps.store.write.calls).toHaveLength(0) // 无 --strip 不碰 YAML
  })

  test('幂等：JSONL 已有 import 哨兵 → exit 1、零 append', async () => {
    const deps = makeDeps({ state: stateWithTail(TAIL), historyRaw: '{"ts":"t","kind":"import"}\n' })
    const code = await cmdImport(deps, 'demo', {})
    expect(code).toBe(1)
    expect(deps.historyEntries).toHaveLength(0)
  })

  test('--strip：写回清空历史节的 state（其余尾内容保留）', async () => {
    const deps = makeDeps({ state: stateWithTail(`${TAIL}custom_tail: keep\n`) })
    expect(await cmdImport(deps, 'demo', { strip: true })).toBe(0)
    expect(deps.store.write.calls).toHaveLength(1)
    const written = deps.store.write.calls[0]?.[1] as PipelineState
    expect(written.opaqueTail).not.toContain('_history')
    expect(written.opaqueTail).toContain('custom_tail: keep')
  })

  test('无历史区：exit 0、零 append、提示无可导入', async () => {
    const deps = makeDeps({ state: stateWithTail('') })
    expect(await cmdImport(deps, 'demo', {})).toBe(0)
    expect(deps.historyEntries).toHaveLength(0)
    expect(deps.errLines.join('\n')).toContain('无历史区')
  })
})
