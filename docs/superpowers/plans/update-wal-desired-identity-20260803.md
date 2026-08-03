---
change: update-wal-desired-identity-20260803
design-doc: docs/superpowers/specs/update-wal-desired-identity-20260803-design.md
locale: zh-CN
---

# 实施计划

## 任务

### 阶段 1：曳光弹——失败 WAL 到安全 checkpoint

- [ ] 在 `packages/cli/src/commands/managed-host-command.test.ts` 构造真实 native desired：旧 WAL 与当前 desired 仅嵌套 marketplace HEAD 不同，当前 inventory 已满足目标；先确认测试失败，再实现最小 comparator 接口，使步骤 checkpoint 且 mutation 执行次数为 0。

此处建议 /clear。

### 阶段 2：负向边界与 completed 恢复

- [ ] 覆盖 pending/completed 两条路径，以及 target HEAD、root、source、sourceType、plugin root/version、未知键、非法 JSON 变化；所有不等价情况必须 fail closed 且不执行 mutation。
- [ ] 在 `packages/cli/src/commands/managed-host-observation.ts` 集中实现严格 native desired schema comparator，在 `managed-host-command.ts` 显式注入，在通用 reconciliation 保留默认字节级行为。

此处建议 /clear。

### 阶段 3：发布物与真实恢复

- [ ] 运行聚焦测试、CLI 全量测试、构建和 release freshness；重建 `packages/cli/dist/tenon.mjs`。
- [ ] 用本机现有 pending WAL 运行修复后 `tenon update --codex -y`，确认不重放已完成 marketplace refresh、managed release 切到最新、18765 Dashboard 健康。

此处建议 /clear。

### 阶段 4：Verify finding 收敛与归档可应用性

- [ ] 先加入非 canonical nested HEAD 的失败用例，确认当前 decoder 错误接纳；再把该字段收窄为 `null` 或 40 位小写 Git OID，并回归合法旧 WAL。
- [ ] 增加穿过 `desiredNativeHostPostcondition → runManagedHostCommand → createManagedHostStepRunner`、durable journal reload/process restart 的 pending/completed 回归；移除 comparator forwarding 时测试必须失败。
- [ ] 在隔离副本执行 strict validate + archive，确认完整 `MODIFIED` requirement 保留两个既有场景且主规范未被改写。

原型决策：现有真实 WAL 和确定性单测已构成可执行复现，持续授权下采用不增加一次性 prototype 的保守默认，避免产生第二套恢复路径。

## 验证

- `npx vitest run packages/cli/src/commands/managed-host-command.test.ts packages/cli/src/commands/managed-host-observation.test.ts packages/cli/src/commands/release-coordinator.test.ts`
- `npm test -- --minWorkers=4 --maxWorkers=4`
- `npm run build` 与 release freshness 门禁
- 真实 `tenon update --codex -y`、`tenon runtime status`、`tenon doctor --json`、`/api/health`
- 隔离副本 `openspec validate --strict` + `openspec archive --yes --json` 演练

## 回滚

代码回滚仅移除 comparator 注入与新增测试；不会修改或删除已有 WAL。若真实更新仍无法证明目标，旧 active release 保持不变并继续 fail closed。
