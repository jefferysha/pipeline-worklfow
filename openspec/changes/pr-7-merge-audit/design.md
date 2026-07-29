# 设计

## 初始假设

- 以 `origin/main` 的当前状态作为唯一集成基线，PR #7 现有实现只是待审材料，不继承其历史 Change 的通过结论。
- 预算计算与不变量应归 kernel，文件系统可信读取归基础设施/server adapter，Dashboard 只消费稳定 DTO 并负责展示。
- 所有合并冲突按最新主线公共契约和安全边界解决；不得通过删除测试、放宽校验或手改生成物消除冲突。
- Dashboard 视觉与交互由实际 `design-taste-frontend` 审查和多视口真实浏览器证据决定，不以单元测试或构建成功替代。

## 风险

- PR 跨越 kernel、server、CLI 与 Dashboard，旧基线重放可能引入契约漂移、重复实现或持久化兼容问题。
- 读取 workflow/ledger 数据涉及 root 信任锚、路径规范化、Host/token/content-type、资源上限和错误信息泄露。
- 预算预览可能在大数据、恶意/损坏记录、revision 变化或并发读取下产生不一致或无界工作。
- Dashboard 可能在小屏、主题、语言、键盘/焦点或加载失败时出现不可达或误导状态。

## 待验证问题

- Build 合并后，是否还有未被文本冲突暴露的 main 语义回归？
- 文件职责拆分和组合测试完成后，是否发现需要改变已确认 requirement 的问题？

## Explore 结论

- PR head `c52a2bce...` 的 merge base 为 `15fe619b...`，当前 main 为 `8f9c5fa2...`；GitHub
  `DIRTY/CONFLICTING`。只读 merge 模拟报告 API facade 与生成物冲突。
- capability 为新增 `context-bundle-budget-preview`；现有 `context-bundle-handoff` 保持兼容，
  kernel 共享 compiler 是唯一 policy/预算规则源。
- server 必须保持 Host guard、registered root、逐层 fd/inode/realpath、`O_NOFOLLOW`、
  fatal UTF-8、资源上限和 safe error DTO；不支持 fd-relative traversal 的平台在读 Change 前 501。
- Dashboard 必须同时保留 Context Bundle preview 与最新 main 的 Verify evidence composer；
  `client.ts` 同时导出两组 facade/type，dist 由最终源码生成。
- 默认七阶段 workflow 的阶段/前进/回退标签必须通过 `phases.*` 随 Dashboard locale 切换；
  custom workflow 继续原样显示作者标签，不做语言启发式改写。
- `ContextBundlePreview.tsx` 和 `contextBundlePreview.ts` 在 Build 按职责拆分，并增加组合、负面和
  真实浏览器证据；不新增依赖或全局状态。
- 完整设计与红队结果见
  `docs/superpowers/specs/2026-07-28-pr-7-merge-audit-design.md`，长期取舍见
  `docs/adr/2026-07-28-pr-7-merge-audit-explore.md`。
