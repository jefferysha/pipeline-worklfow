# PR #6 合并审计设计

## 目标

在不扩大 `verification-evidence-composer` 产品范围、不弱化 Verify 信任边界的前提下，
把 PR #6 语义化合入最新 `main`，重新验证 kernel、受保护 HTTP API、Verify-only
Dashboard 工作区、生成物和治理证据，并为合并决定留下可复核链路。

## 固定输入

- PR：`#6 feat: add verification evidence composer`。
- 初始 head：`3d99795a8b5b1ca23c0dc18c1bf4184285893cc6`。
- Explore 时最新 `origin/main`：`2394ac71efc87193350d476266a3219c320bb5b1`。
- merge-base：`2d103e330f847e003ff5909097d892f5722cca04`。
- 原功能 Change：`verification-evidence-composer`，已归档；其 PASS/FAIL 报告只作为输入，
  不替代本审计 Change 在最新 main 上重新冻结的证据。
- GitHub 当前事实：PR 非 Draft、无 review 或 review thread，旧 head CI `verify` 成功，
  但 `mergeable=CONFLICTING`、`mergeStateStatus=DIRTY`。

## 审计发现

### 领域、协议与信任边界

- kernel formatter 是零副作用纯领域服务，独立于可信 `VerificationResult`；闭集字段、
  result/skipReason 互斥、Unicode/control character、UTF-8 byte budget、错误上限、
  Markdown fence 和确定性输出均有定向回归。
- POST handler 经过共享 Host、Bearer token、`application/json` 三重守卫；registered-root
  和 root anchor 在 compose 前后校验。它不执行命令、不落 canonical state、ledger 或报告。
- Dashboard client 集中解码 success 与结构化 validation envelope；UI 仅在 Verify 文档区
  展示，并覆盖空、加载、本地/服务端/网络错误、成功、复制和焦点恢复。
- 现有生产文件均低于强制拆分上限；formatter 为 397 行领域服务，低于 450 行硬上限且
  单一职责、测试同位，本次不做无收益拆分。
- `npm run check:architecture`、`npm run check:comments`、目标 OpenSpec strict validate
  和三点 diff whitespace 检查均通过。

### 最新 main 冲突

只读 `git merge-tree --write-tree origin/main HEAD` 确认两个文本冲突：

1. `packages/dashboard-app/dist/index.html` 是生产构建生成物，不能手工拼接；源代码解决后
   由 `npm run build:web` 重建并检查引用新鲜度。
2. `packages/dashboard-app/src/shared/Dialog.tsx` 是真实语义冲突。PR #6 增加本地化
   `closeLabel` 与 Escape 的 `preventDefault`/`stopImmediatePropagation`，最新 main
   把工作区关闭字形统一为 Lucide `X`。三者都必须保留。

`packages/dashboard-app/src/progress/useProgressDrawer.ts` 自动合并，但最新 main 已把关闭
缓动修正为 ease-out；Build 后必须用源码、测试和真实浏览器确认没有被旧分支语义覆盖。

### 规则、文档与兼容性

- PR #6 没有新增依赖、schema、持久化、命令执行、gate 绕行或公共版本路径。
- feature-local 组件位于 `src/verification/`，协议位于 `src/api/`，共享层只保留稳定
  `Dialog` 和文档区装配；依赖方向符合仓库规则。
- README 不需要新增通用使用说明：该能力是 Verify 详情内的辅助入口，已有 capability、
  设计、ADR、计划和验证报告描述边界。合并前仍需检查 README 与发布说明没有过度承诺。
- 原报告曾发现并修复 `__proto__`、正文 whitespace、validation envelope、嵌套 Escape/Tab
  和功能目录边界；本轮必须把这些作为回归矩阵，而不能凭旧 PASS 推断仍然成立。

## 合并方案比较

### A. 普通 merge commit 纳入最新 main（采用）

在 Build 执行 `git merge --no-ff origin/main`，只对冲突源文件做语义合并，重建生成物。
它保留 PR 历史和原 Change 证据身份，无需强推，且冲突处理可单独审查。

### B. rebase 到最新 main（拒绝）

提交图更线性，但会改写 PR head 历史并需要强推；违反本次自动化禁止 force push 的边界。

### C. 新分支重放功能提交（拒绝）

可以避开当前冲突，但会割裂 PR、归档 Change 与已有验证证据的身份，并扩大审查差异。

## Build 实施边界

1. 重新 fetch 并确认 PR head 未变化、`origin/main` 未退回。
2. 以 merge commit 纳入最新 main。
3. `Dialog` 同时保留本地化关闭标签、顶层键盘事件消费和 Lucide `X`；不改变 default
   Dialog 的公共行为。
4. 保留 progress drawer 的 nested-modal 让渡和最新 main 的 ease-out 关闭语义。
5. 由源码重建 Dashboard、server 与 CLI bundle；不得手改生成 HTML/bundle。
6. 除上述冲突与验证发现外，不修改 formatter/API/UI 产品语义；若出现需求语义变化，
   以 `requirements-changed` 返回 Spec。
7. 只做非强制 push；远端必需 CI、review、mergeability 或冻结验证失败时保留 PR。

## 验收矩阵

| 风险 | 自动验证 | 真实行为验证 |
| --- | --- | --- |
| formatter 信任边界 | kernel 全场景：闭集、prototype、Unicode、byte budget、XOR、fence、determinism | 真实 API 输出免责声明且不写 state/ledger |
| HTTP 安全与错误 | server route：Host/token/content-type/root、400 envelope、零持久化 | 带同源 token 成功；未鉴权失败；字段路径可见 |
| Dialog 冲突 | shared Dialog 与 composer 集成测试；Lucide import/label/Escape 断言 | 单 Escape 只关内层、焦点归还、Tab 双向不逃逸 |
| drawer/motion | progress drawer nested-modal 与 ease-out 源码回归 | 打开/关闭无双层退场，reduced-motion 可用 |
| 响应式/i18n | zh/en key、类型、组件、生产 CSS/HTML | 桌面与移动、亮暗主题、无横向溢出 |
| 全仓与分发 | architecture、comments、docs、hygiene、hooks、adapters、skills、bundle、全量测试/构建 | 正确标题、root、Change、API version |
| GitHub 合并 | 新 head CI 成功、无未解决 thread、mergeable、main 未前进导致新冲突 | 合并后 main CI 成功 |

## 回滚与停止条件

- 没有数据迁移；回滚锚点为最终 GitHub merge SHA。
- 回滚可整体 revert merge commit，移除纯 formatter/export、POST route/client、
  Verify-only UI/i18n 与相应生成 bundle。
- 任一必需 CI、review、OpenSpec、真实 HTTP/浏览器或安全门禁失败且不能在 PR 边界内安全
  修复时，停止合并并保留 PR。

```coverage
touches: kernel-domain, protected-api, frontend-ui, shared-dialog, generated-bundles, governance
L1_api: filled -> #领域、协议与信任边界, #验收矩阵
L2_data: waived -> 无 schema、数据库或持久化变更，且明确验证 state/ledger 零变化
L3_rules: filled -> #审计发现, #Build 实施边界, #验收矩阵
L4_state: filled -> #领域、协议与信任边界, #验收矩阵
L5_errors: filled -> #领域、协议与信任边界, #验收矩阵
L6_security: filled -> #领域、协议与信任边界, #Build 实施边界
L7_perf: waived -> 输入与输出均有固定 byte/entry 上限，不新增长任务或持久队列
L8_deps: waived -> package 与 lockfile 不变，不新增或升级依赖
L10_terms: filled -> #固定输入, #回滚与停止条件
```
