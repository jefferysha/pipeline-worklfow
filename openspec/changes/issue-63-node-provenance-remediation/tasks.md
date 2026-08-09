# 任务

## 立项

- [x] 核验 #63/#44、冻结提交、Review 2/2 失败报告与本 worktree 精确起点。
- [x] 创建并激活独立 `issue-63-node-provenance-remediation` Change，保留旧 #44 Change 不变。

## 调研

- [x] 读取全部受影响生产调用链、相邻测试和既有规格，冻结影响面、方案、风险与验收矩阵。 (explore)

## 规格

- [x] 编写 frozen Node pre-spawn replay 的 delta spec、实施计划与正式 Review 证据。 (spec)

## 实现

- [x] 由唯一 `luna_worker` 实现复合 Bash+Node binding，并接入 package/update provenance spawn。 (build)
- [x] 由同一 worker 让 setup lifecycle binding 贯穿 host mutation 与完整 skills gate，移除生产路径未绑定的 `process.execPath`。 (build)
- [x] 由同一 worker 修复 release-store provenance Bash wrapper，并补 selection/launcher/rollback 负测与兼容测试。 (build)
- [x] 由同一 worker 提取 Doctor production probe、保持公共契约并使 `main.ts` 不超过 400 行。 (build)
- [x] 由同一 worker 重建 tracked dist、跑定向矩阵后停写交接；根代理亲审 diff 与复跑验收。 (build)

## 验证

- [x] 根代理穷尽 package/update/setup/release-store/doctor 定向矩阵，并在稳定候选上只运行一次完整最终门。 (verify)
- [x] 根代理在 #63 总计最多 2 次正式 Review 内给出结论；若 2/2 仍失败则保留证据并 blocked。 (verify)

## 交付

- [ ] 应用规格，提交并推送精确 HEAD，创建同时关闭 #63 与 #44 的 PR，等待 exact-head CI。 (ship)

## 归档

- [ ] 用官方 Tenon 流程归档 Change，并保留实现、Review、CI 与残余风险证据。 (archive)
