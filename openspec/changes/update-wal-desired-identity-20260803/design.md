# 设计

## 初始假设

保留 WAL 的字节级 desired 证据，同时为 native host desired 提供受 schema 约束的等价函数。只有 marketplace identity 的 `head` 字段不同且真正目标字段完全一致时才允许恢复；通用字符串 desired 仍要求精确相等。真实失败 journal 已验证：旧 desired 的目标 HEAD 与重试目标一致，唯一无关漂移是嵌套 marketplace observation HEAD。

## 风险

- 过宽等价可能错误接纳并发宿主变更；必须对 schema、键集合、目标 HEAD 和插件版本逐项严格比较。
- 旧 WAL 可能结构非法；必须继续 fail closed。

## 待验证问题

- marketplace refresh 与 plugin install 两类 desired 中哪些字段是稳定身份、哪些是目标或 observation。
- 等价恢复后是否会先观察当前宿主状态并在满足旧 WAL 目标时只 checkpoint、不重放 mutation。

## Explore 结论

- comparator 必须由 native host 层显式注入，通用 reconciliation 不理解宿主 JSON。
- pending 与 completed checkpoint 都使用同一等价判断。
- 非法、未知或目标字段变化全部拒绝，且不执行 mutation。
