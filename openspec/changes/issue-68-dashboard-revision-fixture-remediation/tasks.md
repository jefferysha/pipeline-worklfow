# 任务

## 立项

- [x] 证明当前工作树、冻结分支/HEAD、origin/main ancestry 与 #42/#64 Review 2/2 审计边界。
- [x] 读取 #68/#64/#42、#64 Attempt 2 最终报告、项目规则与 Tenon phase Skill。
- [x] 创建并激活唯一 Change，记录持续授权、唯一 worker、Review 2 次上限与 fail-closed 初始契约。
- [x] 登记 proposal、design、tasks 并通过 Open 出口。

## 调研

- [x] 精确复现 4 files / 17 failures，记录每个断言的输入、实际投影和缺失 canonical 前置。
- [x] 读取实现、调用方、测试与 API contract，并一次性扫描同类 verdict、attention、progress fixture。
- [x] 分类 fixture stale 与必要 production projection RED，形成设计、ADR、风险和验收矩阵。

## 规格

- [x] 冻结可信正向、缺失/不可信负向、rollback 恢复的产品契约和兼容边界。
- [x] 产出 delta spec 与可执行计划，明确唯一 worker 文件边界、RED→GREEN、定向/完整门和 Review 预算。

## 实现

- [x] 根代理只派出一个 `luna_worker`；worker 复现 RED、修复正向 fixture，并仅在独立 RED 证明时修改必要 production projection。
- [x] 同一 worker 增补 presentation/view-model/API contract 聚焦覆盖并扫描修复同类陈旧 fixture。
- [x] worker 交接后停止写入；根代理逐文件审查、判级并完成 build-readiness，返工只发回同一 worker。

## 验证

- [x] 对冻结候选执行最多 2 次正式 Review；E2E/CI 不计 Review，不得由 Skill 或 agent 重置预算。
- [x] 运行聚焦回归、`ProgressView` 相邻回归与一次稳定候选 `test:web` 完整门；按风险补 typecheck/build/共享门。
- [x] 以真实当前 phase receipt 登记 verification report；任何产品失败均 exact `verify-fail` 回 Build。

## 交付

- [ ] 应用 delta spec，提交并推送 #68 分支，创建含 `Closes #68`、`Closes #64`、`Closes #42` 的非草稿 PR。
- [ ] 只允许一个 exact-head CI run，分别核对 mergeability、checks、review threads 与残余风险；不 merge、不发布。

## 归档

- [ ] 在 Ship 与 exact-head CI 证据完成后归档唯一 Change，保留 #42/#64 历史不变。
- [ ] 最终回报 branch、exact HEAD、Change、Review 次数、测试、PR、CI 与残余风险。
