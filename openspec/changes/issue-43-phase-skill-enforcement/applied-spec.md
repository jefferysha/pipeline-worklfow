# 已应用规格

## 应用记录

- Change：`issue-43-phase-skill-enforcement`
- 日期：`2026-08-10`
- 执行边界：Ship 阶段唯一一次将已验证 delta 应用到 durable main OpenSpec
- 结果：`changed`

## 应用清单

| Delta source | Durable main target | Before SHA-256 | After SHA-256 | Result |
| --- | --- | --- | --- | --- |
| `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | `openspec/specs/workflow-skill-enforcement/spec.md` | `absent` | `5351997f19c176ae4ce7cf2f6b2c112ba6e97078179a7e557727104579de7c83` | `changed` |

Source delta SHA-256：`64e5b052ac598d4dd5990804607f20455a96cf74920205fe647c42fc8d1107a3`。

## 应用摘要

目标 capability 在应用前不存在，因此按 requirement/scenario identity 创建对应主规格，未覆盖
或删除其他 capability。持久化的五项 requirement 固化：

1. Workflow-owned phase Skill 与 `matrix` Track overlay 的 phase-first、稳定去重投影，以及
   custom Workflow 仅使用冻结 step 声明的语义；
2. explicit profile 投影与 automatic overlay 的分离，并保留 free profile 的 artifact producer
   allowlist 兼容；
3. Hook、CLI transition 与 HTTP transition 对当前 Change/phase/step visit 缺失 Skill receipt
   的统一失败关闭行为；
4. AFK frozen capability、TOCTOU digest、explicit profile bundle 以及 phase Skill 内容缺失时
   不创建 sandbox、run 或收费的失败关闭行为；
5. default source、generated runtime、doctor、manifest、Skills、双语文档与 CI freshness/contract
   检查共享同一 phase map 合同。

## 冲突与幂等性

- 冲突：无。目标 capability 原不存在，delta 仅含 5 个 `ADDED Requirements`；没有既有
  requirement/scenario 需要裁决，也未改写无关主规格。
- 幂等性：再次应用前应按 requirement/scenario identity 比对。当前 target 已包含完整 delta，
  相同 source 再次应用必须报告 `no-op`，并保持 target SHA-256
  `5351997f19c176ae4ce7cf2f6b2c112ba6e97078179a7e557727104579de7c83` 不变，不得重复追加。

## 定向规格校验

- `openspec validate workflow-skill-enforcement --type spec --strict --no-interactive`：exit 0。
- `openspec validate issue-43-phase-skill-enforcement --type change --strict --no-interactive`：exit 0。
