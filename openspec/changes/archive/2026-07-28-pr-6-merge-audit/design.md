# 设计

## 初始假设

- 审计 Change 继续使用 PR #6 的 frontend/full 身份，但规则覆盖前端、后端与共享契约。
- PR head `3d99795a8b5b1ca23c0dc18c1bf4184285893cc6` 是初始审计靶；Explore 将确认最新
  `origin/main`、merge-base、冲突文件和所有实际调用方。
- 采用最小充分修复；需求语义若变化，必须在 Build 前回到 Spec，不能在实现中覆盖旧规格。

## 风险

- PR #5 已修改 Dashboard 共享层与主规格，merge-main 可能产生语义冲突而不只是文本冲突。
- 编排器跨 kernel、HTTP 与 UI；单层测试通过不能证明闭集校验、可信边界和错误反馈一致。
- 原 Change 已归档，历史验证不能替代最新 main 上的新冻结证据。

## 已验证结论

- compose endpoint 位于共享 POST 守卫之后，复用 Host、Bearer、JSON content-type、
  registered-root 与 root anchor；compose 前后都校验 anchor，且无持久化。
- formatter 对 byte budget、Unicode、prototype/descriptor、闭集字段、result/skip XOR、
  error overflow、动态 fence 和确定性输出均有定向测试。
- Verify-only UI 的局部状态、API decoder、错误保留、复制和焦点路径边界清晰；最新 main
  的共享 Dialog 冲突必须在 Build 采用语义并集并重新跑嵌套浏览器验收。
- README 不需要把局部辅助入口提升为通用命令；原 capability、设计、ADR、计划和报告已
  描述边界，最终发布说明仍须避免暗示 Tenon 自动执行或保存证据。
- 首轮冻结 Verify 的四轨与 OpenSpec 隔离演练已完整结束：E2E 通过，Reviewer/Codex
  分别发现 shared 反向依赖、root 失败关闭、title 空白保真和请求取消问题，视觉轨发现
  字段级错误关联不足；MODIFIED Requirement 省略既有键盘场景导致隔离 apply 失败。

## 决策

- 采用普通 merge commit 纳入最新 main；拒绝需要强推的 rebase 和割裂证据身份的重放。
- `Dialog.tsx` 保留 PR #6 的 `closeLabel`、Escape 事件消费，同时采用 main 的 Lucide `X`。
- `dist/index.html` 和其他 bundle 通过构建重生；保留 main 的 ease-out motion。
- canonical formatter 规格优先于原设计中的 title trim 描述：`trim()` 只用于非空判定，
  合法 title 原文只做 CRLF→LF，不丢 Tab、前后空白或换行。
- shared 文档区通过中性 slot 接收 composer；缺失/空白/非字符串 root 在 resolver 前返回 400；
  dialog 关闭时 abort 进行中请求并拒绝旧响应；字段错误关联控件并聚焦首个无效项。
- audit delta 的 MODIFIED Requirement 必须携带主规格全部既有场景；隔离 archive/apply
  成功是下一轮 Verify 的硬门。
- 详细发现、三方案比较、验证矩阵和停止条件见
  `docs/superpowers/specs/2026-07-28-pr-6-merge-audit-design.md`；决策记录见
  `docs/adr/2026-07-28-pr-6-merge-audit.md`。
