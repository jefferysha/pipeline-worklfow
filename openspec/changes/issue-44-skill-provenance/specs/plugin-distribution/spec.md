# Plugin Distribution 增量规格

## ADDED Requirements

### Requirement: Candidate activation 验证 canonical Skill provenance

每个 native install/update candidate 与 release payload SHALL 在 launcher 或 active release selection 改变前，通过 candidate 自带的 canonical Skill provenance verifier。验证 SHALL 同时要求 canonical registry、完整 physical Skill set、每项 source/hash/coordinate 一致且 legacy provenance source 不存在。该检查 SHALL 与现有 whole-payload digest、hook、CLI 和 server 检查共同生效。

#### Scenario: Candidate 存在 Skill hash drift

- **GIVEN** 当前 active release 与 launchers 已验证可用
- **WHEN** 新 candidate 的任一 bundled Skill actual hash 不匹配 canonical registry
- **THEN** candidate publication/activation 以 `candidate-invalid` 失败
- **AND** active release、previous release 与 stable launchers 保持不变
- **AND** diagnostic 保留 provenance failure category 与受影响 Skill

#### Scenario: Clean candidate 被安装或更新

- **WHEN** candidate provenance 与 whole-payload checks 全部通过
- **THEN** install/update 才可将其发布为 immutable release 并原子选择
- **AND** setup、standalone Skill setup 与 package verification 使用同一 canonical registry semantics

### Requirement: 历史 immutable release 保持有界回滚兼容

已经存储的 N-1 release SHALL 继续由其自身 immutable verifier 与 payload digest 判定可回滚，不要求旧 verifier 理解未来 registry schema。新的 candidate SHALL 使用其自身 schema contract 严格验证；运行时 SHALL NOT 为旧 schema、缺 hash 或 legacy lock 合成 trust 数据。

#### Scenario: 新 candidate provenance 失败后回滚

- **GIVEN** previous immutable release 的 payload digest 与其自身 verifier 均有效
- **WHEN** 新 candidate 因 unsupported registry、legacy lock 或 hash drift 被拒绝
- **THEN** previous release 仍是允许的 exact stable rollback target
- **AND** 失败 candidate 不替换 previous release 或 active launcher
