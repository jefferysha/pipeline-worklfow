# 任务

## 立项

- [x] 确认 TaskPlan 契约范围、兼容边界与非目标。
- [x] 复现并界定超过 128 个合法 Codex transcript 时 receipt discovery 错误失败的问题。

## 调研

- [x] 调研现有 todo 投影、canonical task、codec 和原子发布原语。 (explore)

## 规格

- [x] 冻结 TaskPlan v1、legacy 投影、原子 store、只读 API 和校验语义。 (spec)
- [x] 将 receipt discovery 与 `max_output_tokens` 登记为既有 capability 修改，并冻结 revision lineage、projection purity 与 ordinal ordering 语义。 (spec)
- [x] 冻结 revision store 公开预算、target 预计入、typed 零写入拒绝与幂等重试 lineage 校验语义。 (spec)
- [x] 将闭集 hostile-input 冻结到 byte-bounded JSON，并将 direct typed object 冻结为不枚举额外属性的 schema-directed snapshot。 (spec)

## 实现

- [x] 以 tracer bullet 打通 v1 codec/store/read-model 与真实只读 API。 (build)
- [x] 完成 identity、coverage、group/dependency、resource、output 与 validator 不变量。 (build)
- [x] 完成 legacy 非推断 adapter、tasks.md 投影与 pending/drift 恢复。 (build)
- [x] 修复 transcript discovery 数量预算并补完整 reconcile 回归。 (build)
- [x] 修复合法 `max_output_tokens` receipt ABI 漂移并补完成态回归。 (build)
- [x] 修复数组 accessor descriptor 边界且确保 getter 零执行。 (build)
- [x] 清理 validator 非空断言并按职责拆分超限 HTTP handler。 (build)
- [x] 拒绝同一 plan lineage 的 revision ID 复用并补 current/history 红绿回归。 (build)
- [x] 使 read-model projection 不冻结调用方输入并补 descriptor/frozen-state 回归。 (build)
- [x] 统一 locale-independent ordinal 排序并覆盖混合 ASCII/Unicode 结果。 (build)
- [x] 在任何写入前把 proposed target 计入 revision 历史预算，并让逐字节幂等重试先验证完整 lineage；补 exact-cap、byte-cap、零写入和损坏历史红绿回归。 (build)
- [x] 使 1,048,577-byte newline-terminated revision 在 publish、read 与后续 lineage 扫描中保持对称，并补精确边界红绿回归。 (build)
- [x] 使 NFC Unicode opaque ID 通过 codec/store/ordinal validation，并保留 NFD、分隔符、空白与控制字符拒绝。 (build)
- [x] 对 current 与 committed lineage 执行 frozen/freezable 语义校验，以 typed corrupt 和零写入拒绝 draft、coverage 缺口与 dependency cycle 历史。 (build)
- [x] 分离 legacy 与 canonical projection 字节预算，使超过旧 256 KiB 的合法 canonical tasks.md 在 publish/read 间保持 current。 (build)
- [x] 让公开 validator 与 codec 共用全局 entity ID 唯一性枚举，拒绝未经 codec round-trip 的重复 ID 并阻止错误 schedulable。 (build)
- [x] 将 `plan_id` 与 `revision_id` 纳入全局 entity ID 唯一性枚举，拒绝顶层相互冲突及顶层与嵌套实体冲突。 (build)
- [x] 让公共 validator/read-model 在无需 codec round-trip 时也拒绝所有 TaskPlan v1 结构、闭集、词法、预算与资源规范化违规，且 hostile accessor 零执行。 (build)
- [x] 将任一可信同 plan immutable revision ID 纳入发布前保留集合，拒绝 future orphan ID 复用且保持 current/target 零写入。 (build)
- [x] 消除公共 validator/read-model 对 caller-owned codec-invalid 对象的回退，使用安全 decoded candidate 保留 duplicate 诊断，并让 Proxy trap 与未知字段稳定失败关闭。 (build)
- [x] 在 TaskPlan GET 的 Change capture/read 全生命周期复核持久 registered-root inode anchor，并以 capture 前与读取中 root replacement 回归证明失败关闭。 (build)
- [x] 将 immutable revision addressing 纳入 plan namespace，兼容读取旧 flat history，并补 different-plan 同号同 ID 的红绿回归。 (build)
- [x] 对 canonical TaskPlan state 使用 fatal UTF-8 与原始 bytes identity，拒绝 replacement decode 后伪相等的 current/immutable。 (build)
- [x] 将 object field-name UTF-8 bytes 纳入 decoder 总预算，并使 unknown-field diagnostic path 保持有界。 (build)
- [x] 在任何 Unicode/trim 扫描前以有界 UTF-8 counter 拒绝超限 object key/text，确保 hostile object CPU 工作受契约预算约束。 (build)
- [x] 拒绝字符串末尾 lone high surrogate，保持 object/JSON codec 与 resource normalization 的非法 Unicode 失败关闭。 (build)
- [x] 分离 JSON closed mode 与 direct object schema-directed mode，彻底移除 typed object 的 own-key enumeration。 (build)
- [x] 证明大量额外 string/symbol/non-enumerable/accessor 不被读取或复制，JSON unknown-field 与已知字段失败关闭语义保持不变。 (build)
- [x] 使 phase-like TaskGroup 标题不能改变 pipeline exit gate，并补 renderer 到 guard 的红绿回归。 (build)
- [x] 统一 canonical tasks.md publication 与 snapshot/readers 字节上限，同时保留 legacy 256 KiB 和路径锚边界。 (build)
- [x] 在 Todo 兼容投影边界剥离受信 WorkItem 尾注，避免内部 identity marker 进入 API/Dashboard 文本。 (build)

## 验证

- [ ] 验证旧格式、 hostile input、循环依赖、覆盖缺口、资源冲突和稳定 ID。 (verify)
- [ ] 验证 immutable/current 原子性、投影恢复、API trust boundary 与 129+ transcript。 (verify)

## 交付

- [ ] 同步契约文档、正式生成物并创建 base=main 的独立 PR。 (ship)

## 归档

- [ ] 归档 Change 并记录迁移边界。 (archive)
