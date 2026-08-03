# 任务

## 立项

- [x] 建立 updater pending WAL 身份漂移问题、边界与验收目标。

## 调研

- [x] 复核 desired schema、recovery decision 与真实失败 journal。 (explore)

## 规格

- [x] 固化稳定身份等价、严格拒绝条件与回归测试计划。 (spec)

## 实现

- [x] 先写失败测试，再实现受约束的 desired 等价恢复并重建 CLI bundle。 (build)

## 验证

- [ ] 运行聚焦、全量、发布物一致性及真实本机 pending WAL 恢复验证。 (verify)

## 交付

- [ ] 统一 review、CI、创建并合并 hotfix PR。 (ship)

## 归档

- [ ] 应用规格并通过官方 CLI 归档 Change。 (archive)
