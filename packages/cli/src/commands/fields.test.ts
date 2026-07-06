import { describe, expect, test } from 'vitest'
import { QuoteGateError } from '@pipeline-lite/kernel'
import type { FieldName, PipelineState } from '@pipeline-lite/kernel'
import { cmdCas, cmdGet, cmdSet, cmdSetMany } from './fields.js'
import { makeDeps, mockState, spy } from '../test-support.js'

describe('get —— stdout 裸值 / exit 契约（CONTRACT §3）', () => {
  test('输出裸值一行、无尾空格，exit 0', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'build' }) })
    const code = await cmdGet(deps, 'demo', 'phase')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual(['build'])
    expect(deps.errLines).toEqual([])
  })

  test('change 定位在 <cwd>/openspec/changes/<name>（经 store.read）', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    await cmdGet(deps, 'demo', 'phase')
    expect(deps.store.read.calls[0]?.[0]).toBe('/repo/openspec/changes/demo')
  })

  test('列表字段输出逗号连接', async () => {
    const deps = makeDeps({ state: mockState({ depends_on: ['a', 'b'] }) })
    const code = await cmdGet(deps, 'demo', 'depends_on')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual(['a,b'])
  })

  test('空串值输出空行，exit 0', async () => {
    const deps = makeDeps({ state: mockState() })
    const code = await cmdGet(deps, 'demo', 'plan')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([''])
  })

  test('未知字段：空行 + exit 0（老内核 yaml_get grep 语义，oracle 实测回写）', async () => {
    const deps = makeDeps()
    const code = await cmdGet(deps, 'demo', 'nope')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([''])
  })

  test('字段缺失（state 无该键）：空行 + exit 0', async () => {
    const st = mockState()
    delete (st.fields as Partial<Record<FieldName, string | string[]>>).plan
    const deps = makeDeps({ state: st })
    const code = await cmdGet(deps, 'demo', 'plan')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([''])
  })

  test('状态文件缺失（read 抛错）exit 1', async () => {
    const deps = makeDeps()
    deps.store.read = spy(async (_d: string): Promise<PipelineState> => {
      throw new Error('ENOENT')
    })
    const code = await cmdGet(deps, 'demo', 'phase')
    expect(code).toBe(1)
  })

  test('非法 change 名 exit 1', async () => {
    const deps = makeDeps()
    const code = await cmdGet(deps, 'bad/../name', 'phase')
    expect(code).toBe(1)
    expect(deps.store.get.calls).toHaveLength(0)
  })
})

describe('set —— 无输出 / 四闸拒写 exit 1', () => {
  test('成功：无 stdout，exit 0，值透传', async () => {
    const deps = makeDeps()
    const code = await cmdSet(deps, 'demo', 'plan', 'docs/plans/p.md')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.store.set.calls).toEqual([['/repo/openspec/changes/demo', 'plan', 'docs/plans/p.md']])
  })

  test('列表字段按逗号拆成数组', async () => {
    const deps = makeDeps()
    const code = await cmdSet(deps, 'demo', 'scope', 'a, b')
    expect(code).toBe(0)
    expect(deps.store.set.calls[0]?.[2]).toEqual(['a', 'b'])
  })

  test('列表字段空串 → 空数组（清空）', async () => {
    const deps = makeDeps()
    await cmdSet(deps, 'demo', 'depends_on', '')
    expect(deps.store.set.calls[0]?.[2]).toEqual([])
  })

  test('四闸拒写（QuoteGateError）exit 1，stderr 有原因', async () => {
    const deps = makeDeps()
    deps.store.set = spy(async (_d: string, _f: FieldName, _v: string | string[]): Promise<void> => {
      throw new QuoteGateError('plan', '值含「: 」')
    })
    const code = await cmdSet(deps, 'demo', 'plan', 'x: y')
    expect(code).toBe(1)
    expect(deps.outLines).toEqual([])
    expect(deps.errLines.join('\n')).toContain('quote gate')
  })

  test('未知字段 exit 1，set 不被调用', async () => {
    const deps = makeDeps()
    const code = await cmdSet(deps, 'demo', 'nope', 'v')
    expect(code).toBe(1)
    expect(deps.store.set.calls).toHaveLength(0)
  })
})

describe('set-many —— k=v 批量原子写', () => {
  test('成功：解析 k=v 并调用 setMany，无 stdout，exit 0', async () => {
    const deps = makeDeps()
    const code = await cmdSetMany(deps, 'demo', ['build_mode=direct', 'isolation=branch'])
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.store.setMany.calls).toEqual([
      ['/repo/openspec/changes/demo', { build_mode: 'direct', isolation: 'branch' }],
    ])
  })

  test('值可含 =（只在第一个 = 处切分）', async () => {
    const deps = makeDeps()
    await cmdSetMany(deps, 'demo', ['pr_url=https://x/pr?a=b'])
    expect(deps.store.setMany.calls[0]?.[1]).toEqual({ pr_url: 'https://x/pr?a=b' })
  })

  test('列表字段值按逗号拆数组', async () => {
    const deps = makeDeps()
    await cmdSetMany(deps, 'demo', ['depends_on=a,b'])
    expect(deps.store.setMany.calls[0]?.[1]).toEqual({ depends_on: ['a', 'b'] })
  })

  test('缺 = 的 kv exit 1，setMany 不被调用', async () => {
    const deps = makeDeps()
    const code = await cmdSetMany(deps, 'demo', ['noequals'])
    expect(code).toBe(1)
    expect(deps.store.setMany.calls).toHaveLength(0)
  })

  test('未知字段 exit 1，setMany 不被调用', async () => {
    const deps = makeDeps()
    const code = await cmdSetMany(deps, 'demo', ['nope=1'])
    expect(code).toBe(1)
    expect(deps.store.setMany.calls).toHaveLength(0)
  })

  test('四闸拒写 exit 1', async () => {
    const deps = makeDeps()
    deps.store.setMany = spy(
      async (_d: string, _kv: Partial<Record<FieldName, string | string[]>>): Promise<void> => {
        throw new QuoteGateError('plan', '值含「 #」')
      },
    )
    const code = await cmdSetMany(deps, 'demo', ['plan=x #y'])
    expect(code).toBe(1)
  })
})

describe('cas —— 0 成功 / 3 不匹配 / 1 错误', () => {
  test('匹配写入：无输出，exit 0', async () => {
    const deps = makeDeps()
    const code = await cmdCas(deps, 'demo', 'automation', 'queued', 'scheduled')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.store.cas.calls).toEqual([
      ['/repo/openspec/changes/demo', 'automation', 'queued', 'scheduled'],
    ])
  })

  test('不匹配：exit 3，无 stdout', async () => {
    const deps = makeDeps()
    deps.store.cas = spy(async (_d: string, _f: FieldName, _e: string, _n: string) => false)
    const code = await cmdCas(deps, 'demo', 'automation', 'queued', 'scheduled')
    expect(code).toBe(3)
    expect(deps.outLines).toEqual([])
  })

  test('store 错误：exit 1', async () => {
    const deps = makeDeps()
    deps.store.cas = spy(async (_d: string, _f: FieldName, _e: string, _n: string): Promise<boolean> => {
      throw new Error('锁超时')
    })
    const code = await cmdCas(deps, 'demo', 'automation', 'queued', 'scheduled')
    expect(code).toBe(1)
  })

  test('未知字段 exit 1', async () => {
    const deps = makeDeps()
    const code = await cmdCas(deps, 'demo', 'nope', 'a', 'b')
    expect(code).toBe(1)
    expect(deps.store.cas.calls).toHaveLength(0)
  })
})
