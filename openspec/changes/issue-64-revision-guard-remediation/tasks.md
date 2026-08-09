# 任务

## 立项

- [x] 读取 #64、#42、旧 Verify Attempt 2 报告、候选实现与测试，确认起点和旧 Review 2/2 审计不变。
- [x] 新建并激活唯一 Change，冻结影响面、风险、唯一 worker 约束与验收矩阵。
- [x] 生成并登记 proposal、design 与七阶段任务骨架。

## 调研

- [x] 追踪 actual transition、readiness、CLI check、API/SSE、Automation 与 Dashboard 的 revision guard 调用链。
- [x] 形成 custom rollback 与 arbitrary Verify-like semantic guard 的单一真相设计、兼容性和测试策略。

## 规格

- [x] 编写 `trustworthy-build-revision`、`workflow-definition` 与 `workspace-verification-integrity` delta requirements，完整承接 #42 未 apply 的 durable contract 并增加 #64 remediation。
- [x] 产出可执行计划，冻结唯一 worker 文件边界、三段 Build 定向矩阵、一次完整门与 Review 2 次上限。

## 实现

- [x] 唯一 `luna_worker` 完成 tracer bullet：edge-aware effective lifecycle 贯通 actual/readiness 与 custom check/review exact event。
- [x] 同一 worker 扩展 step/edge/fixed/semantic/frozen guard 来源矩阵，并修复两个旧 integration fixture，保留 typed blocker 与零 mutation 负证据。
- [x] 同一 worker 补 server/SSE、Automation、Dashboard 成对投影回归，仅在测试证明旁路时改 adapter，并重建必要受控 dist。
- [x] worker 停止写入并交接文件/命令/计数后，根代理逐文件 review；任何实现返工只发回同一 worker。
- [x] 根代理跑完定向 Build readiness、架构/OpenSpec/comment 门，冻结新的 `build_sha` 候选。

## 验证

- [ ] 根代理对精确候选执行 Review Attempt 1；E2E 独立计数，确认 rollback、fail-closed、跨入口与负向 fixture。
- [ ] 若 Attempt 1 有 Medium/High，限定返工后执行最后的 Review Attempt 2；不得启动第 3 次。
- [ ] 稳定候选只运行一次完整门，并以当前 host/phase 的真实 current-turn receipt 登记 verification report。

## 交付

- [ ] 应用 delta spec，提交并推送新分支，创建同时含 `Closes #64` 与 `Closes #42` 的非草稿 PR。
- [ ] 等待 exact-head CI，分别报告 mergeability、checks 与残余风险；不 merge、不发布。

## 归档

- [ ] 读取 Ship 证据并通过官方 Tenon 命令归档 #64 Change，保留 #42 原审计。
