# ADR: 以 edge-aware effective lifecycle 统一 custom revision guard

## 背景

#42 候选分别在 actual transition、readiness 与 CLI check 组合 custom lifecycle。semantic policy 能停止给 rollback **新增** revision guard，却不能删除 step/edge/fixed 已声明的 guard；CLI check 又只看 step guards，无法识别 semantic Verify-like success edge。这导致同一 custom graph 同时出现“rollback 假阻断”和“check 假绿”。

## 决策

在 kernel 建立按单条 compiled edge 计算的 effective lifecycle 单一真相：合并 declared、document-governed fixed 与 semantic guards/actions，按结构去重；若 effective actions 含 `mark-verification-failed`，仅过滤 `build-head-unchanged`，保留所有其他 guard 与失败 action。actual transition、readiness 与 CLI step-graph check 都消费该结果。

CLI 的无 event `check` 只扩展 revision invariant，不顺带改变历史非 revision edge-guard 预览面；review request 已有 exact event，必须把它传入内部 check，使 rollback 与 success proof 不可互相借用或互相阻断。

## 备选方案

- 在 engine/readiness/check 三处分别补 if：改动快，但延续本次缺陷的分叉根因，拒绝。
- 在 step 层全局删除显式 revision guard：会放过同一 Verify-like step 的 success edge，拒绝。
- 仅修 semantic policy 不修 declared guard：无法解决冻结/custom definition 显式 guard，拒绝。

## 后果

- custom/frozen plan、任意 step id 与 document-governed fixed lifecycle 获得相同 rollback/success 语义。
- kernel helper 成为唯一新增抽象；adapter 仍只做输入、错误/DTO 映射与展示。
- 需要覆盖 exact event 的 CLI review preflight、guard 求值次数、零 mutation 与受控 dist freshness。
- stable blocker code、reason、remediation、hash 隐私及无 `build_sha` workflow 兼容性保持不变。
- TransitionApplication/RunRepository 继续独占 mutation；readiness/check 仍是纯评估，不新增 schema、DTO、依赖或迁移。
- plain check 只补 revision invariant，不顺带执行任意非 revision edge guard；event-aware review 则按确切 edge 求值完整 effective revision lifecycle。
- 若一条 edge 同时具有 rollback 与其他 action，本决策仅以 `mark-verification-failed` 排除 revision success guard，不定义新的 action 冲突或 workflow validity 规则。
- server/SSE/Dashboard 通过 success-blocked 与 rollback-ready 的成对投影测试证明一致性；Automation 先复用现有 authoritative barrier 负例。
