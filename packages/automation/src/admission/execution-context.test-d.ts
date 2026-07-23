/**
 * H10 r1 复审阻断3（D5 返工，任务B1）编译期钉子——纯类型测试，不参与运行时执行。
 *
 * 裸 `ExecutionContext` 不含 `PreparedExecutionContext` 的私有 brand 字段
 * （`PREPARED_EXECUTION_BRAND`）与判别字段（`preparedKind`），结构赋值必须编译失败——原判据
 * （`skillBundle?` 可选、其余字段全部继承自 `ExecutionContext`）下裸 context 曾经天然满足整个
 * 接口，H14 编译期接缝形同虚设，见 H10 r1 复审第3节原文：「按 TypeScript 结构类型，裸
 * `ExecutionContext` 可直接赋给它」。
 *
 * 本文件用 `vitest --typecheck` 运行（`.test-d.ts` 后缀命中 vitest 默认 `typecheck.include`
 * glob `**\/*.{test,spec}-d.ts`），不参与普通 `vitest run`（根 vitest.config.ts 的 test.include
 * 只匹配 `*.test.ts`，两者互不干扰、互不重复计数）。typecheck 模式只做类型诊断，不执行文件内的
 * 运行时代码——`declare const` 系列的类型专用绑定不需要真实运行时初始化值。
 *
 * 唯一合法构造点是 `markLoopPrepared`/`markNonLoopPrepared`（`createExecutionPreparation` 成功
 * 路径 / `sdk.ts` 缺省装配），见 execution-context.ts 头注与两个工厂函数头注。
 */
import { test } from 'vitest'
import type {
  ExecutionContext, LoopPreparedExecutionContext, NonLoopExecutionContext, PreparedExecutionContext,
} from './execution-context.js'

declare const bareCtx: ExecutionContext

test('PreparedExecutionContext 拒绝裸 ExecutionContext 的结构赋值（brand 编译期钉子）', () => {
  // @ts-expect-error —— 裸 ExecutionContext 缺 preparedKind 判别字段与 PREPARED_EXECUTION_BRAND
  // 私有品牌，不能满足 PreparedExecutionContext（H10 r1 复审阻断3：结构类型下裸 context 曾经天然
  // 满足整个接口，本行必须编译失败才说明 brand 真的钉住了）。
  const shouldNotCompile: PreparedExecutionContext = bareCtx
  void shouldNotCompile
})

test('LoopPreparedExecutionContext 分支同样拒绝裸 ExecutionContext（不是只挡了 union 的外壳）', () => {
  // @ts-expect-error —— 同上，且额外缺 preparedKind:'loop-bundle' 与必填 skillBundle。
  const shouldNotCompile: LoopPreparedExecutionContext = bareCtx
  void shouldNotCompile
})

test('NonLoopExecutionContext 分支同样拒绝裸 ExecutionContext（非 loop 直跑分支不是免检后门）', () => {
  // @ts-expect-error —— 同上，且额外缺 preparedKind:'non-loop'。
  const shouldNotCompile: NonLoopExecutionContext = bareCtx
  void shouldNotCompile
})
