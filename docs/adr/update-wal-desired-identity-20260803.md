# 架构决策记录

## 背景

native marketplace 的当前 HEAD 是 observation，不是 marketplace 稳定身份。现有 desired 同时保存目标 HEAD 与 before marketplace 对象，导致合法刷新后同一目标的序列化文本发生漂移。

## 决策

保留 WAL 原文不变，在 managed host step 上增加调用方限定的 desired 等价判断。native comparator 只忽略已通过 canonical decoder 的嵌套 marketplace observation HEAD；该值必须是 `null` 或 40 位小写 Git OID，所有真正身份与目标字段必须精确一致。

## 备选方案

改写/删除 pending WAL；回退宿主 checkout；或全局放宽字符串比较。三者分别破坏审计、越过宿主所有权边界或扩大并发风险，因此不采用。

## 后果

旧格式 pending WAL 可安全恢复，新事务仍保留完整原始 desired。非 native 调用方和未知 schema 继续字节级 fail closed；实现需要覆盖 pending 与 completed 两条恢复路径、非 canonical HEAD、负向字段变化，以及 native producer 到 durable runner 的真实接线恢复测试。
