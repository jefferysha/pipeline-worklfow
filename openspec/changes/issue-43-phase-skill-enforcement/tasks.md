# 任务

## 立项

- [x] 核验 issue #43 最新 body、labels、依赖与 Acceptance/Measurement。
- [x] 核验独立 worktree、指定分支、冻结点与最新 `origin/main` 祖先关系。
- [x] 创建并激活唯一 default/full Tenon Change，建立 Open 文档骨架。

## 调研

- [x] 追踪 resolver、Hook、transition、AFK admission、doctor 与生成/分发资产的完整调用链。
- [x] 明确兼容、并发、freshness 风险及 issue 验收证据矩阵。

## 规格

- [x] 形成 capability delta spec、ADR 与可执行计划。
- [x] 划定唯一 `luna_worker` 的文件所有权、非目标、定向测试与交付标准。

## 实现

- [x] 由 `luna_worker` 以 RED→GREEN 实现 phase/overlay/explicit-profile resolver 与 Hook/transition 接线。
- [x] 由 `luna_worker` 接通 AFK frozen capability、保留 artifact 显式 profile 合同并覆盖失败路径。
- [x] 由 `luna_worker` 同步 doctor、manifest、Skills、中英文文档、CI checks 与受控生成/发行资产。
- [x] 根代理逐项检查 worker diff 与定向验证证据，仅围绕确认 finding 返修。

## 验证

- [ ] 运行风险匹配的定向测试与一次完整最终门，核对 Acceptance/Measurement。
- [ ] 根代理完成最多两次 code-review 尝试并处置已确认 finding。

## 交付

- [ ] 提交、推送并创建含 `Closes #43`、Change、验证与风险说明的 PR。
- [ ] 等待并核对 exact-head CI，不 merge、不发布版本。

## 归档

- [ ] 完成 Tenon archive 与最终 thread/worktree/branch/commit/PR/CI/Review 证据汇总。
