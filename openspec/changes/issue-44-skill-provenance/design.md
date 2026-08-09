# 设计

## 已确认架构

- `templates/skill-sources.yaml` 是 install、doctor、server 和 bundle 已消费的 live registry，且与 62 个分发 Skill 目录精确集合相等；它升级为唯一 canonical provenance source。
- schema v3 为每个 entry 强制 `source_kind`、安全的 `source_ref`、`sha256:` canonical tree hash 与嵌入同一摘要的不可变 coordinate。生产哈希复用 automation 的 `buildCanonicalManifest()`。
- `skills-lock.json` 只有 30 条过时第三方来源且仓库内零消费者，因此安全移除；验证器对该 legacy 文件的重新出现失败关闭。
- kernel 负责纯 parser/invariants，automation 负责文件树验证，CLI 负责 install/doctor/bundle 接线，`verify-skills.sh` 只委托生产 verifier，不实现第二个 YAML parser。
- registry drift、unknown source、hash/coordinate mismatch、missing/extra Skill 与 legacy source 都返回稳定类别、具体 Skill 和修复动作。

## 兼容与回滚

- registry schema 采用显式版本迁移而非补齐缺失 trust 数据；旧候选得到可操作的升级提示。
- 候选安装/更新在 launcher 切换前验证 staged immutable root；失败不改变 active release。已存 N-1 payload 使用自身 verifier 与 payload digest，保持回滚有效。
- authoring sync 采用临时文件加原子 rename；runtime verification 保持只读并继承 canonical manifest 的 symlink/TOCTOU 防护。
- Wave 0 并行风险通过窄文件所有权规避：不修改 `templates/manifest.yaml`、无关架构 gate、UI 或版本元数据；交付前再次校验 exact upstream ancestry。

## 方案与证据

完整调用链、候选方案、失败契约、生命周期、红队检查、文件所有权与 Acceptance/Measurement 映射见 `docs/superpowers/specs/2026-08-10-issue-44-skill-provenance-design.md`；决策记录见 `docs/adr/2026-08-10-issue-44-skill-provenance-explore.md`。
