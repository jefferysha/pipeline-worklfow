# Applied spec：workflow-decomposition-policy

- 日期：`2026-08-07`
- Change：`workflow-decomposition-policy`
- 应用前主规格 aggregate digest：`08a6648a747ba939f4e47d42b8684bc9ef0224689e42d49272af171e78baf748`
- 应用后主规格 aggregate digest：`1eb8d14c716bc10974d237be5d3219ce1cc7dfbf6d14c69516974ce6ac0c8459`
- 严格校验：`npx openspec validate --specs --strict`，`36 passed / 0 failed`

## 应用明细

| Delta source | Main spec target | Before digest | After digest | Result | 效果 |
| --- | --- | --- | --- | --- | --- |
| `openspec/changes/workflow-decomposition-policy/specs/codex-skill-receipt-current-turn/spec.md` | `openspec/specs/codex-skill-receipt-current-turn/spec.md` | `d181713b4c314c36c684b50a951de37183831af2f6013d4be9e2a6c824c0f02e` | `48d5fe66b8b377c681f0872e1e13d851e40b377173ada2f0fd44643905a95d69` | `changed` | 追加 stable runtime 可信 Codex cache provenance requirement，保留全部既有 receipt 约束。 |
| `openspec/changes/workflow-decomposition-policy/specs/workflow-decomposition-policy/spec.md` | `openspec/specs/workflow-decomposition-policy/spec.md` | `missing` | `eef3f388c0432934783fe3586a8c7fdedee5f9ac195718765f75e45df7184080` | `changed` | 新建正交 decomposition/interaction、权限、frozen/admission、API 与 Dashboard 主规格。 |
| `openspec/changes/workflow-decomposition-policy/specs/workflow-definition/spec.md` | `openspec/specs/workflow-definition/spec.md` | `missing` | `f1d6b716c00e20fa4baecc25c1618e44bcb39bbbd57fac17b49302442afdb3e0` | `changed` | 新建闭集 codec、V1/V2/V3 snapshot 兼容与 track overlay 主规格。 |

## 冲突与幂等性

- 三份 delta 都是 `ADDED Requirements`；requirement/scenario identity 与现有主规格无冲突。
- `codex-skill-receipt-current-turn` 只追加尚不存在的 requirement，未改写既有 requirements。
- 两个新 capability 在应用前不存在；内容由已验证 delta 转为持久主规格，并补充明确 Purpose。
- 隔离 Verify 已完成官方 archive 演练；本次 Ship 应用结果与演练的 13 个 added requirements 一致。
- 再次执行时必须比较 requirement identity 与上述 after digest；已应用内容保持 byte-preserving `no-op`，不得重复追加。
