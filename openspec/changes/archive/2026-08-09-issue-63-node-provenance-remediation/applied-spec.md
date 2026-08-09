# 已应用规格

## 变更摘要

- Change：issue-63-node-provenance-remediation
- 日期：2026-08-10
- 结果：changed
- 摘要：把可信 Bash 委托 frozen Node 的复合 immediate pre-spawn replay、Node drift
  fail-closed 与 v1.0.1/v1.0.2 兼容场景应用到持久 plugin-distribution 主规格。

## 已应用需求

| Delta source | Main spec target | Before SHA-256 | After SHA-256 | Result |
| --- | --- | --- | --- | --- |
| openspec/changes/issue-63-node-provenance-remediation/specs/plugin-distribution/spec.md | openspec/specs/plugin-distribution/spec.md | ffd7d074f680a354c8357e47ddb2acd2cd12b2bd03a7c16a0e757d0426d35352 | a55457e4a6f8fec9cdca29e7a3e70240729dd7016b46a0d32f6fccddbf4adc52 | changed |

应用内容：

- 在既有“可执行工具冻结 SHALL 绑定文件身份与可信路径链” requirement 中加入
  Bash+Node 复合 spawn binding 与同步 proof-before-spawn 约束。
- 加入 provenance Bash、Node drift、standalone setup/Doctor 完整 verifier 与已发布数据兼容场景。
- 保留全部无关 requirement/scenario；没有删除或改写 registry、release manifest、
  selection、launcher 或 audit 公共契约。
- 冲突处理：无。主规格沿用仓库既有单一 EOF newline；语义与 Verify 隔离 archive 演练一致。

## 交付证据

- openspec validate issue-63-node-provenance-remediation --strict：PASS。
- Verify 隔离 clone 的 openspec archive 演练与应用后 plugin-distribution strict validate：PASS。
- 主规格差异只包含上述 approved delta；再次按本 Skill 应用将是 byte-preserving no-op。
- Verification report：
  docs/superpowers/reports/2026-08-10-issue-63-node-provenance-remediation-verify.md。
