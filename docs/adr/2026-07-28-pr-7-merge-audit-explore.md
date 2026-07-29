# ADR：以共享 compiler 和可信读取集成 PR #7

- 状态：Accepted
- 日期：2026-07-28
- Change：`pr-7-merge-audit`

## 背景

PR #7 从旧 `main` 提取 CLI 私有的 ledger→Context Bundle 编排，并新增 server/Dashboard 预览。
当前主线已经合并新的 canonical revision 安全检查和 Verify evidence composer，GitHub 报告 PR
冲突。直接接受原 PR 的归档证据或让自动合并任选一边，会造成规则源漂移、生成物不可信，或删除最新
Dashboard 能力。

## 决策

1. 保留 kernel `compileLedgerContextBundleWithPorts` 为 policy、reason、mode、digest、资源和预算的
   单一规则源。
2. CLI 使用可信本地 Node adapter；server 仅在 registered root 可通过 fd-relative traversal 时
   使用 trusted reader，否则读取 Change 前返回 501。
3. Dashboard 通过严格 DTO decoder 读取不含正文的 safe preview；target/budget 不持久化。
4. Build 普通合并最新 `origin/main`，显式保留 verification evidence 与 context budget 两套
   facade/抽屉装配，并从最终源码重生成全部 dist。
5. 拆分接近硬上限的 server handler 与超过建议线的 Dashboard 组件；kernel 原子用例只有在不分散
   不变量的前提下才拆分。
6. 通过组合测试、全仓门禁、安全负面路径、真实 Linux/Darwin API 与多视口 Dashboard 验收后才合并。

## 备选方案

- server 调 CLI：拒绝，因 cwd/root、错误与进程边界不稳定。
- server 或客户端复制规则：拒绝，因形成第二套 policy。
- 仅解决文本冲突：拒绝，因 `ProgressDrawer` 等存在无冲突语义重叠。
- rebase/force-push：拒绝，因自动化明确禁止 force push，且普通 merge 更可审计。

## 后果

- 正面：CLI/API 同源、浏览器不接触正文、最新 main 能力共存、生成物有可追溯来源。
- 成本：需要额外的组合回归、文件职责拆分和全量重新验证。
- 兼容：不改变 `context-bundle/v1`、CLI 默认预算、ledger schema、write endpoint 或持久化状态。
- 平台：Linux 可完整预览；无 fd-relative traversal 的运行时明确 501，CLI 不受影响。
- 回滚：移除 Dashboard 组件和 GET route；共享 compiler 可继续服务 CLI。无数据迁移或回填。
