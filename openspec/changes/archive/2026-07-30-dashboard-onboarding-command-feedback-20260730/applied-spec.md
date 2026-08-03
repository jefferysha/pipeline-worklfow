# 已应用主规格

- Change: `dashboard-onboarding-command-feedback-20260730`
- 应用日期: `2026-07-30`
- 结果: `changed`

## dashboard-ui-ux-system

- 增量来源: `openspec/changes/dashboard-onboarding-command-feedback-20260730/specs/dashboard-ui-ux-system/spec.md`
- 主规格目标: `openspec/specs/dashboard-ui-ux-system/spec.md`
- 应用前 SHA-256: `781452bdf42a4436f271a822c87884a36c144cbd1acd323b3085b6f9b0c1d897`
- 应用后 SHA-256: `0ee286c69ef23ce0d0be201470471bb7a8bc17acc74bd669e81e16daa295f62c`
- 结果: `changed`

本次把两项已批准的新增要求写入主规格：Onboarding 命令复制的独立四态、真实失败与迟到结果隔离，
以及 1024–1920px 电脑端步骤层级、主题、无溢出和 reduced-motion 契约。未修改或删除既有要求，
也未引入手机端产品范围。主规格已通过 `openspec validate dashboard-ui-ux-system --strict`。

再次应用时，若主规格已包含以上 Requirement 与 Scenario 且摘要一致，应保持字节不变并记录为
`no-op`；不得重复追加。
