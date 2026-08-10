# ADR：分离 default phase Skill 与 Track matrix overlay

## 状态

Accepted for issue #43.

## 背景

`matrix=false` 原本表示 Track 不参与领域 Skill 矩阵，却在 effective resolver 中同时关闭 default
Workflow 的 required/available slots。free/default 因而可以跳过当前 phase Skill；Hook、transition、
AFK、artifact 与 doctor 又各自采用不同 fallback，导致同一 Change 在不同入口得到不同合同。

## 决策

default Workflow 的七个 step 各自声明一个 `tenon-<phase>` hard requirement。该层属于 Workflow、
进入 immutable workflow snapshot，并且始终参与 required/available 解析。manifest Skill 表是
命名 profile：仅在 `trackOverlay.matrix=true` 时作为自动 Track overlay 叠加；matrix=false 时仍可由
artifact producer 或 AFK bundle 的显式 profile 选择使用，但不得反向成为 Hook/transition 要求。

统一 resolver 以 `phase + mandatory overlay` 生成 exit requirements，以
`phase + mandatory/recommended overlay` 生成自动 orchestration slots，并以
`phase + explicit profile` 生成 artifact/AFK 显式授权 slots。Hook、CLI/Server transition、AFK bundle、
artifact 与 doctor 均消费这些具名投影，不再自行解释 `matrix=false`。custom Workflow 继续只消费
自身冻结 step DAG。

## 后果

- free/default 每个阶段至少需要有效的 current-visit `tenon-<phase>` receipt；关闭 Track matrix 不再
  产生空合同。
- PM/frontend/backend 保留原 overlay，并在其前增加 phase entry requirement。
- 本版本新冻结的 default AFK snapshot 总能看到 phase slot；phase Skill 缺失时
  admission/preparation 失败关闭。已有旧 snapshot 仍按其冻结内容执行，不从当前模板补写。
- free profile 行保留为显式 artifact/bundle allowlist；router 的 matrix 开关只负责自动领域注入。
- default source、生成 runtime、doctor 与文档由 CI freshness/contract checks 机械对账。
- 历史 Change 的冻结 workflow snapshot 不做隐式迁移；迁移若需要，必须另立显式协议。

## 拒绝的方案

- 只取消 `matrix=false` 早退：会把 free profile 误当领域 overlay。
- 在每个消费者硬编码 phase Skill：会继续产生策略漂移。
- 用 manifest `_all` 充当 phase contract：会破坏 Workflow ownership 与 snapshot freeze。
