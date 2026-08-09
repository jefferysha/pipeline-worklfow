# 任务

## 立项

- [x] 核对 issue #44、冻结点、分支、Tenon 1.0.2 与独立 worktree 身份。
- [x] 创建并绑定唯一 Change，记录目标、范围、风险假设与七阶段任务骨架。

## 调研

- [x] 盘点所有 Skill provenance/registry/lock 来源及 install、verify、doctor、bundle、CI 消费调用链。
- [x] 形成影响面、文件所有权、兼容/并发风险、候选方案与 issue Acceptance/Measurement 映射。

## 规格

- [x] 冻结 `skill-provenance`、`plugin-distribution`、`skill-content-resolution` delta spec，迁移/回滚语义、实施计划和可执行验收矩阵。

## 实现

- [x] 由 luna_worker 以 tracer bullet 打通 strict registry parser、canonical tree verifier、internal CLI 与 `verify-skills.sh`。
- [x] 迁移全部 62 个 registry entries 到 schema v3，提供原子 provenance sync，并移除/禁止 legacy `skills-lock.json`。
- [x] 覆盖所有 drift category 与三项 Measurement 的确定性 fixture/assertion。
- [x] 将 strict provenance 接入 setup/install、doctor 与 bundled content locator，保留外部 tier 兼容语义。
- [x] 验证 candidate drift/legacy 拒绝且 active/previous/launcher 与 N-1 rollback 保持安全。
- [x] 同步用户文档、受控 CLI/server dist，并返回定向测试证据；worker 不执行 review verdict 或最终 full gate。

## 验证

- [ ] 根代理检查完整 diff，并在总计最多两次 code-review 尝试内收敛已确认 finding。
- [ ] 实现稳定后执行一次完整最终门，包含定向/全量测试、build、hooks、bundle、architecture、dependency/release freshness、docs/OpenSpec 与必要 install/rollback E2E。
- [ ] 逐项证明 clean、drifted、legacy、rollback、unconsumed sources=0、unverified hashes=0 与 drift fixture coverage=100%。

## 交付

- [ ] 同步文档、applied spec 与受控分发产物，commit、push 并创建含 `Closes #44` 的 PR。
- [ ] 等待并核验 PR exact-head CI，报告兼容性与残余风险；不 merge、不发布。

## 归档

- [ ] 完成 canonical archive 与最终证据审计，向编排任务回报 Change/PR/CI/review 次数/阻塞项。
