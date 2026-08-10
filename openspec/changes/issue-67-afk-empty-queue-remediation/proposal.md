# 提案

## Why

Issue #43 的最终 exact-head CI 在 6,726 个测试中只剩一个 AFK 空就绪队列用例失败；本地主机环境掩盖了 Linux 干净环境中的前置差异。#43 已达到约定的 CI 上限，因此需要独立 remediation 保留原审计并恢复可合并状态。

## What Changes

- 复现并修复 AFK 真实 CLI 在空就绪队列下错误返回非零状态的问题。
- 保留 Docker 不可用、策略拒绝与 Skill 能力缺失时的 fail-closed 行为，以及 #43 已建立的 phase Skill enforcement。
- 以独立 Change、有限 Review 和一次 exact-head CI 交付；不修改旧 #43 Review/CI 证据，不合并、不发布、不更新本机插件。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workflow-skill-enforcement`：修正 AFK 空队列验收前置，保持分阶段 Skill 强制与错误分类一致。

## Impact

主要影响 CLI AFK dispatcher 的 hermetic 测试依赖与必要的最小实现边界，不引入新依赖或公共 API。下游 #47 及其依赖图在本修复和其他 Wave 0 remediation 合并前继续阻塞。
