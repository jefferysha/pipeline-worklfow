# 任务

## 立项

- [x] 确认 TaskPlan 契约范围、兼容边界与非目标。
- [x] 复现并界定超过 128 个合法 Codex transcript 时 receipt discovery 错误失败的问题。

## 调研

- [x] 调研现有 todo 投影、canonical task、codec 和原子发布原语。 (explore)

## 规格

- [x] 冻结 TaskPlan v1、legacy 投影、原子 store、只读 API 和校验语义。 (spec)

## 实现

- [x] 以 tracer bullet 打通 v1 codec/store/read-model 与真实只读 API。 (build)
- [x] 完成 identity、coverage、group/dependency、resource、output 与 validator 不变量。 (build)
- [x] 完成 legacy 非推断 adapter、tasks.md 投影与 pending/drift 恢复。 (build)
- [x] 修复 transcript discovery 数量预算并补完整 reconcile 回归。 (build)

## 验证

- [ ] 验证旧格式、 hostile input、循环依赖、覆盖缺口、资源冲突和稳定 ID。 (verify)
- [ ] 验证 immutable/current 原子性、投影恢复、API trust boundary 与 129+ transcript。 (verify)

## 交付

- [ ] 同步契约文档、正式生成物并创建 base=main 的独立 PR。 (ship)

## 归档

- [ ] 归档 Change 并记录迁移边界。 (archive)
