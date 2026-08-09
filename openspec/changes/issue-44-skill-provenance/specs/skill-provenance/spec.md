# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 单一 canonical registry 声明全部分发 Skill provenance

Tenon SHALL 只使用 `templates/skill-sources.yaml` 作为分发 Skill 的 tracked provenance 声明。该 registry SHALL 使用受支持的显式 schema version 与 hash algorithm；每个 entry SHALL 包含唯一 token、已知 `source_kind`、安全且规范化的 `source_ref`、`sha256:` content hash，以及嵌入相同 Skill identity 与 digest 的 immutable coordinate。install、verify、doctor 和 bundle assembly SHALL 消费该 canonical registry，不得消费或生成另一份未受约束的 tracked provenance registry。

#### Scenario: 干净的 canonical registry 被消费

- **GIVEN** registry schema、全部 entry 与物理 Skill trees 都合法且相互一致
- **WHEN** Tenon 执行 setup/install、package verification、doctor 或 bundled content assembly
- **THEN** 四条路径从同一 registry 获得 source 与 expected hash
- **AND** 不读取 legacy lock 或另一个 tracked provenance source

#### Scenario: Registry schema 或 source kind 未知

- **WHEN** registry version 不受支持，或 entry 声明未知 `source_kind`
- **THEN** parser 与所有严格生产消费者失败关闭
- **AND** diagnostic 标识 `unsupported-registry-version` 或 `unknown-source-kind` 及迁移动作

### Requirement: 每个分发 Skill 与 canonical tree hash 一一对应

Tenon SHALL 对 registry 的 normalized `source_ref` 集合与 canonical `skills/` 根中的分发 Skill 目录执行双向完整性校验。每个 Skill SHALL 恰好对应一个 entry。`content_hash` SHALL 复用 `buildCanonicalManifest()` 的 canonical tree digest，覆盖排序后的相对路径、文件 bytes 与 executable bit，并排除绝对路径、mtime 与 ownership。Bundle assembly SHALL 在返回 bundled content 前验证所选物理 tree 与 entry 的 expected hash。

#### Scenario: 全部分发 Skill 都可验证

- **WHEN** verifier 扫描 clean release root
- **THEN** registry source refs 与 physical Skill directories 集合精确相等
- **AND** 每个 Skill 的 actual tree digest 同时匹配 `content_hash` 与 immutable coordinate
- **AND** distributed Skills without verified hashes 的测量值为 0

#### Scenario: 内容 bytes 或 executable bit 漂移

- **WHEN** 已登记 Skill 的文件 bytes 或 executable bit 在 registry hash 未更新时改变
- **THEN** verifier 与 bundle assembly 以 `content-hash-mismatch` 失败
- **AND** diagnostic 标识 Skill、expected/actual digest 与 provenance sync 修复命令

#### Scenario: Registry 与物理集合不完整

- **WHEN** canonical Skill root 出现未登记目录，或 registry 指向缺失/重复的 physical source
- **THEN** verifier 以 `unregistered-distributed-skill`、`missing-distributed-skill` 或 `duplicate-distributed-source` 失败
- **AND** 不把未验证内容当成可分发 Skill

### Requirement: Provenance 错误具有稳定且可操作的失败契约

Strict parser、filesystem verifier、internal CLI 与 shell verification SHALL 保留稳定的 error category。至少 SHALL 区分 unsupported registry、unknown source、unsafe source reference、missing/extra/duplicate Skill、content hash mismatch、coordinate mismatch 与 legacy provenance source。Machine-readable 输出 SHALL 不依赖本地化 prose；human output SHALL 指出受影响 Skill、可安全披露的 expected/actual 值及修复动作。解析、读取或安全检查失败 SHALL NOT 被降级为空 registry 或成功结果。

#### Scenario: Immutable coordinate 与 hash 不一致

- **WHEN** entry 的 coordinate identity/digest 与 token 或 `content_hash` 不一致
- **THEN** strict parser 或 verifier 以 `coordinate-mismatch` 失败
- **AND** install、doctor、verify 与 bundle 不得各自推导一个替代值继续

#### Scenario: Quiet verification 成功与失败

- **WHEN** `verify-skills.sh --quiet --root <root>` 验证 clean root
- **THEN** 它以 0 退出且不输出内容
- **WHEN** provenance 不合法
- **THEN** 它非 0 退出且仍向 stderr 输出稳定 category 与修复指引

### Requirement: Legacy lock 被安全迁移并持续禁止

确认无生产或 CI 消费者的 `skills-lock.json` SHALL 从 tracked release 中移除。Canonical verifier SHALL 把该历史文件的重新出现视为 `legacy-provenance-source`，而不是尝试合并、优先选择或静默忽略。用户文档 SHALL 说明 schema v3、移除原因、authoring sync 与 verification 命令。

#### Scenario: Legacy lock 被重新加入 candidate

- **WHEN** candidate root 同时存在 clean canonical registry 与 `skills-lock.json`
- **THEN** candidate verification 以 `legacy-provenance-source` 失败
- **AND** diagnostic 指向删除 legacy source 并重新运行 canonical verification

### Requirement: Provenance authoring 原子且与验证独立

Tenon SHALL 提供显式 authoring operation，从 canonical Skill roots 计算全部 entry hashes/coordinates，并通过同目录 temporary file 加 atomic rename 更新 registry。普通 install、doctor、verify 与 bundle reads SHALL 保持只读且不得自动修复 drift。生成后的 registry SHALL 再由独立 strict production verifier 校验。

#### Scenario: Authoring 在写入前失败

- **WHEN** 任一 Skill tree 无法安全读取、缺 `SKILL.md` 或 registry identity 无法解析
- **THEN** sync operation 非 0 退出
- **AND** 原 registry bytes 保持不变且不存在半写入文件

#### Scenario: Skill 作者完成受控更新

- **WHEN** 作者修改 bundled Skill 后运行 documented provenance sync command
- **THEN** 所有 affected hashes 与 coordinates 确定性更新
- **AND** 随后的 independent verification 对 clean root 通过

### Requirement: Drift fixture 与 measurement 完整覆盖

测试 SHALL 覆盖 clean、content drift、unknown source、unsafe/missing/extra/duplicate source、coordinate mismatch、legacy lock 与 rollback preservation。每个 verifier 声明的 drift category SHALL 至少有一个确定性 failing fixture；clean fixture SHALL 通过。Repository assertion SHALL 证明 unconsumed tracked provenance sources 为 0，完整性 assertion SHALL 证明 distributed Skills without verified hashes 为 0。

#### Scenario: CI 审计 drift coverage

- **WHEN** CI 执行 provenance fixture suite
- **THEN** 每个公开 drift category 都映射到 failing fixture
- **AND** 缺少 category fixture、遗留 tracked source 或无 hash 的 distributed Skill 均使 CI 失败
