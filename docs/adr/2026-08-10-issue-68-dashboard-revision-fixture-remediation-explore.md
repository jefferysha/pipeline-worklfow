# ADR: Dashboard 正向 Verify fixture 显式携带 trusted readiness

## 背景

#64 的冻结 Dashboard full gate 在四个测试文件中稳定出现 17 个失败。生产链已将 Verify success readiness 绑定 canonical build revision/provenance；旧 Dashboard fixture 仍只填三轨字段或阶段，未携带逐事件 readiness，于是前端按设计 fail closed，把卡判为 `agent`。

## 决策

只在 `App.test.tsx`、`inbox.test.tsx`、`ProjectsView.test.tsx`、`TaskDetail.test.tsx` 的正向 Verify fixture 中显式注入 server-shaped `workflowExecution.readinessByTransition.verify`，同时保留 `verify-pass` 与 `verify-fail` 的 trusted `{ ready: true, blockers: [] }`。该投影代表 assessor 已在 server 端完成 canonical revision/provenance 校验；测试不填裸 SHA、不新增 ready 字段、不修改 `makeChange` 默认行为。

缺失 readiness、typed revision blocker、rules 缺失、automation running/queued、rollback/zero-mutation/privacy 负测保持原输入和断言。Dashboard model、server snapshot、kernel lifecycle 与公共 DTO 不变。

## 备选方案

- 全局把 testkit 默认 Verify 改成 trusted：会让负测共享 ambient state，拒绝。
- 在 Dashboard model 只凭三轨字段放行：复制后端规则并破坏 fail-closed，拒绝。
- 在测试中调用 kernel assessor：引入前端到 kernel 的反向依赖，且无法代表真实 server snapshot，拒绝。

## 后果

- 四个失败文件恢复其原本想验证的徽标、收件箱、need 分区与 verdict 语义。
- trusted 前置显式且局部，fixture 扫描可发现遗漏；默认 `makeChange` 仍能暴露未来遗漏。
- 负测继续证明不可信 revision 不会被 UI 误报为可操作，公共契约与生产代码没有新增风险。
