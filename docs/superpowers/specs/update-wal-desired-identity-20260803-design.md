# 技术设计

## 背景

真实更新事务记录了 `marketplace-refresh` 的 before=`ba30d447`、目标 HEAD=`dc53843e`。Codex CLI 首次返回成功时权威 inventory 仍是 before，Tenon 因未证明 postcondition 而保留 WAL；宿主随后完成刷新。重试时新计算的 desired 目标仍是 `dc53843e`，但其中嵌套 marketplace observation 的 `head` 已从 `ba30d447` 变成 `dc53843e`，当前字节级比较因此拒绝恢复。

## 决策

在通用 `ManagedHostStepExecution` 增加可选、由调用方提供的 desired 等价判断。默认仍为字节级相等；只有 native host command 提供受严格 schema 约束的 comparator：

- `marketplace-present`：所有字段精确一致；
- `marketplace-head`：marketplace 的 `root/source/sourceType`、目标 `head` 精确一致，忽略嵌套 observation `marketplace.head`；
- `plugin-version`：marketplace 稳定身份、`pluginRoot`、`pluginVersion` 精确一致，忽略嵌套 observation `marketplace.head`；
- 任意非法 JSON、未知/多余键、版本或 kind 不同都返回不等价。

恢复仍先观察权威 inventory；只有当前状态满足原 WAL desired 时 checkpoint，仍等于 before 时才允许执行，第三状态继续 fail closed。

## 备选方案

- 直接删除或改写 WAL：破坏证据链，拒绝。
- 把 desired schema 改为不写嵌套 HEAD：能修复新事务，但无法恢复已经落盘的旧格式 WAL。
- 放宽为任意 JSON 语义比较：无法证明哪些字段可忽略，拒绝。

## 风险

- comparator 过宽会把目标变化误当成相同；以精确键集合和逐字段测试约束。
- completed checkpoint 也必须使用相同 comparator，否则恢复到下一步后仍可能卡住。

## 状态机

`started(before=A, desired=B-old-shape)` → 重试计算 `B-new-shape` → 仅 identity observation HEAD 不同且目标字段相同 → 观察当前 inventory → 满足 B 则 `completed`；否则仍按 A/B/第三状态三分支裁决。

## 关键业务规则

宿主 cache 仍只由宿主 CLI 写入；Tenon 只读 inventory 并提交自己的 WAL/runtime。任何来源、路径、sourceType、目标 HEAD、插件版本或插件根变化都不能借用该兼容路径。

## Decision Log

- 采用最小、向后兼容 comparator，不迁移或重写历史 WAL。
- 不新增公共 CLI/API；这是内部恢复语义修正。

```coverage
touches:
L1_api:      waived -> 无公共 API 变化
L2_data:     filled -> #状态机
L3_rules:    filled -> #关键业务规则
L4_state:    filled -> #状态机
L5_errors:   filled -> #风险
L6_security: filled -> #关键业务规则
L7_perf:     waived -> 仅比较小型 JSON desired
L8_deps:     waived -> 无新增依赖
L10_terms:   filled -> #背景
```
