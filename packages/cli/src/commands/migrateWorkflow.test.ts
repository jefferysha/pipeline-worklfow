import { describe, expect, test } from 'vitest'
import type { FieldName } from '@pipeline-lite/kernel'
import { cmdMigrateWorkflow } from './migrateWorkflow.js'
import { makeDeps, mockState, spy } from '../test-support.js'

/**
 * Task 10 实测结论（task-10-report.md 有完整命令+输出）：genuine 老 change（Task 4 之前创建，
 * 文件里物理上完全没有 `workflow:` 这一行）经真实 store.get(dir,'workflow') 读出来本来就已经
 * 是 'default'——parsePipeline() 起手于 emptyFields()，后者把 workflow 缺省为 'default'
 * （Task 4），且解析器只在文件里找到对应行时才覆写骨架值。也就是说"老 change 字段物理缺失"
 * 和"已迁移/新建 change 字段物理写着 workflow: default"这两种情况经 store.get 读出来完全无法
 * 区分。因此下面用 mockState() 缺省（workflow='default'，镜像 emptyFields()）来代表这两种
 * 情况——它们本就是同一个 store.get 观测结果，测试无需（也无法）区分。
 *
 * 唯一可观测信号是"当前值是不是 default"：非 default 只可能是真实自定义 workflow
 * （Task 5-9 落地的合法产物），绝不能当成旧格式覆写掉——这与任务简报 Step 3 示例代码的判定方向
 * 相反（示例代码是 current==='default' 时跳过、否则覆写，验证后发现这个方向会在遇到真实自定义
 * workflow 时把它冲回 default，是破坏性 bug）。
 */

describe('migrate-workflow —— 老格式 workflow 字段一次性迁移（Task 10）', () => {
  test('老 change / 已迁移 change（store.get 层面二者不可区分）→ 补齐/确认落盘 default，phase 不受影响', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'build' }) })
    const code = await cmdMigrateWorkflow(deps, 'legacy-change')
    expect(code).toBe(0)
    // TOCTOU 修复：落盘走 store.cas（expect=刚读到的 current，next='default'），不再是无条件 set
    expect(deps.store.cas.calls).toEqual([
      ['/repo/openspec/changes/legacy-change', 'workflow', 'default', 'default'],
    ])
    expect(deps.store.set.calls).toHaveLength(0)
  })

  test('真实自定义 workflow（非 default）→ 禁止覆盖，零写入，且不尝试 cas', async () => {
    const deps = makeDeps({ state: mockState({ workflow: 'ship-fast' }) })
    const code = await cmdMigrateWorkflow(deps, 'custom-change')
    expect(code).toBe(0)
    expect(deps.store.set.calls).toHaveLength(0)
    expect(deps.store.cas.calls).toHaveLength(0)
    expect(deps.errLines.join('\n')).toContain('ship-fast')
  })

  test('幂等：连续调用两次均 exit 0 不报错', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'build' }) })
    expect(await cmdMigrateWorkflow(deps, 'legacy-change')).toBe(0)
    expect(await cmdMigrateWorkflow(deps, 'legacy-change')).toBe(0)
  })

  test('非法 change 名 → exit 1，store 不被调用', async () => {
    const deps = makeDeps()
    const code = await cmdMigrateWorkflow(deps, 'bad/../name')
    expect(code).toBe(1)
    expect(deps.store.get.calls).toHaveLength(0)
    expect(deps.store.set.calls).toHaveLength(0)
    expect(deps.store.cas.calls).toHaveLength(0)
  })

  test('store 读取失败 → exit 1，stderr 带错误信息', async () => {
    const deps = makeDeps()
    deps.store.get = spy(async (_d: string, _f: FieldName): Promise<string | string[] | undefined> => {
      throw new Error('ENOENT')
    })
    const code = await cmdMigrateWorkflow(deps, 'demo')
    expect(code).toBe(1)
    expect(deps.errLines.join('\n')).toContain('ENOENT')
  })

  test('TOCTOU 防护：cas 落败（get 之后、写入之前被并发改写）→ 优雅跳过，绝不无条件覆写', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'build' }) })
    // 模拟并发：本命令 get 读到 'default' 之后、真正落盘之前，另一个合法 `pipeline set` 已把
    // workflow 改成了真实自定义值——store.cas 的 expect 比对在锁内失败，返回 false。
    deps.store.cas = spy(async (_d: string, _f: FieldName, _e: string, _n: string) => false)
    const code = await cmdMigrateWorkflow(deps, 'legacy-change')
    expect(code).toBe(0)
    // 必须走 cas（而非无条件 set）尝试写入，且 expect 参数是本命令刚读到的值
    expect(deps.store.cas.calls).toEqual([
      ['/repo/openspec/changes/legacy-change', 'workflow', 'default', 'default'],
    ])
    // cas 落败后绝不回退成无条件 set——这正是本测试要锁死的行为
    expect(deps.store.set.calls).toHaveLength(0)
    expect(deps.errLines.join('\n')).toMatch(/并发/)
  })
})
