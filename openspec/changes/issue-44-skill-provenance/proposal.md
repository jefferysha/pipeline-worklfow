# 提案

## Why

当前分发中的 Skill 注册表与遗留 lock 数据形成分裂真相，安装、校验、诊断和打包可能读取不同来源，无法机器证明每个 Skill 的来源与内容一致性。Issue #44 是 roadmap #41 的 Wave 0 / P1 基础能力，需要先建立可验证的单一来源，才能安全推进后续 Skill 打包与插件分发。

## What Changes

将现有运行时注册表 `templates/skill-sources.yaml` 升级为严格的 canonical Skill provenance 模型：每个分发 Skill 声明显式 source kind/reference、复用现有 canonical tree digest 的内容哈希，以及绑定相同摘要的不可变坐标。install、verify、doctor 与 bundle 共同消费并验证该模型；确认零生产/CI 消费者的 `skills-lock.json` 被安全迁移移除且禁止重新引入。

## Capabilities

### New Capabilities

- `skill-provenance`：机器可验证的 Skill 来源、版本或不可变坐标、内容哈希及漂移诊断。

### Modified Capabilities

- `plugin-distribution`：候选安装/更新、bundle 与 rollback 需要验证每个 bundled Skill 的 canonical provenance。
- `skill-content-resolution`：bundled 内容选择必须将实际 tree hash 与 registry 声明绑定并失败关闭。

## Impact

影响 Skill 分发资产、kernel registry parser、automation tree verifier、安装/更新候选校验、doctor、CLI bundle、验证/authoring 工具、相关 fixture/测试、受控 CLI dist 及用户文档。schema v3 是显式 fail-closed 迁移；已保存的 N-1 release 继续由自身不可变 verifier 与 payload digest 回滚。本 Change 不发布版本、不修改本机已安装插件、不改变 manifest 公共契约，也不改变无关 UI。
