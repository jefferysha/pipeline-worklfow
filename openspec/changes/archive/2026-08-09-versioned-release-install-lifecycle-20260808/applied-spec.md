# 已应用主规格

- Change: `versioned-release-install-lifecycle-20260808`
- 日期: `2026-08-09`
- 结果: `changed`
- 冲突处理: 无；七份 delta 均按 requirement/scenario identity 应用，保留无关主规格内容。

| Delta | 主规格目标 | Before SHA-256 | After SHA-256 | 结果 |
| --- | --- | --- | --- | --- |
| `specs/host-target-plan/spec.md` | `openspec/specs/host-target-plan/spec.md` | `766a79430dfe97d5425884d01e78a56209a5abdf617a3e299c89d4ca08045869` | `0dd5b591ff968b0dea3fdff7636a5451b267ebe75ef77788dc25676ab46d27b0` | `changed` |
| `specs/open-source-documentation-experience/spec.md` | `openspec/specs/open-source-documentation-experience/spec.md` | `5d8e53c7639f9c65aabecff01f785d215fd6c6ffe457481d0caf25f02cc00a72` | `da45e9c39805c031d8a4016c3d2e676ada76a342e334478e22eac7183adc569f` | `changed` |
| `specs/plugin-distribution/spec.md` | `openspec/specs/plugin-distribution/spec.md` | `02ac5acf4e39ebc9f259b79096b1ab3bb401452ed8d793bc9a2489e1f2ea94be` | `ffd7d074f680a354c8357e47ddb2acd2cd12b2bd03a7c16a0e757d0426d35352` | `changed` |
| `specs/plugin-runtime/spec.md` | `openspec/specs/plugin-runtime/spec.md` | `2d96506b15d34663da15292118067213f170f6acc7115e8253d9348708d2084c` | `4b2447915c13d31ef7ce7585ccbe3d326a431825b2e52cadbdbbca48e505081a` | `changed` |
| `specs/review-attempt-budget/spec.md` | `openspec/specs/review-attempt-budget/spec.md` | `absent` | `492ed3e2c26bd417457154a29db2dfadc7dc889f0a02c5d2eba716abcf77be36` | `changed` |
| `specs/tenon-product-identity/spec.md` | `openspec/specs/tenon-product-identity/spec.md` | `34158ae22b60d47809075cd5343e973fd3660e8c13a08ac47228df7deefd1555` | `9c50f5751c9ee22ee64602bb9214632284d5e23c3f48e0013c185cfe5609f920` | `changed` |
| `specs/versioned-plugin-release-lifecycle/spec.md` | `openspec/specs/versioned-plugin-release-lifecycle/spec.md` | `absent` | `0037ecb14ca7bdfb66285c9aba79c55cad58f2969ee92b6617a173c40afcdba7` | `changed` |

## 应用效果

- 固化 `vX.Y.Z` tag/commit、公开一行安装、latest stable update 与禁止 `main` 发布源。
- 固化 host rebind/WAL、可信可执行文件、managed runtime/launcher/rollback 与 N-1 bridge。
- 固化 Dashboard readiness/打开策略、产品版本对账和有限 Review attempt 预算。
- `npx openspec validate --all --strict` 在应用后为 43/43，通过。
