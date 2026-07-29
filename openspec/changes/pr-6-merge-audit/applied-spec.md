# 已应用规格

## 变更摘要

2026-07-28 在 Ship 唯一真实应用边界，将 PR #6 合并审计 delta 幂等应用到
`verification-evidence-composer` 主规格。Verify 已在隔离副本演练同一应用结果；本次真实应用
只修改主规格，不执行第二次产品实现、不改 state/schema/data，也不调用仓库迁移修复工具。

## 已应用需求

- source：
  `openspec/changes/pr-6-merge-audit/specs/verification-evidence-composer/spec.md`
- target：
  `openspec/specs/verification-evidence-composer/spec.md`
- operation：2 个 `MODIFIED Requirements`
- result：`changed`
- before SHA-256：
  `39829bf745e187ee03849579099216912a8e736cdde830a4dd34c48ac3ae8fe5`
- after SHA-256：
  `4b5e91fadd9835bf3f4f0ffb49a8077766452d20774d87614bd84cc42bcfcfa4`
- effect：
  1. 补充字段级 ARIA/首错焦点、请求取消与 late-response 隔离；
  2. 固化 shared `Dialog`、Lucide、theme/ease-out/reduced-motion、topmost keyboard、
     route/focus、neutral slot 与嵌套 modal 语义；
  3. 固化缺失/空白/非字符串 root 在 resolver 前 fail-closed；
  4. 固化普通 merge、语义解决共享冲突、正式生成物重建与 exact-head 全门禁要求。
- conflict resolution：保留主规格其余 3 个 requirement 与全部无关 scenario；两个同名
  requirement 使用审计 delta 的完整文本替换，没有重复追加或删除无关内容。

## 交付证据

- OpenSpec 1.6.0 对 Change 与目标 capability 的 strict validation 均通过。
- 真实应用的 requirement/scenario 内容与 Verify 隔离副本
  `/private/tmp/pr6-verify4-openspec.0Ud7n7/repo` 一致；官方隔离 archive 输出末尾多一个空行，
  Ship 按仓库 `git diff --check` 规则去除该空行，因此隔离 digest 为 `927a7d42...`，上述
  durable after digest 为 `4b5e91fa...`。两者 strict validation 均通过，语义无差异。
- 聚合验证报告：
  `docs/superpowers/reports/2026-07-28-pr-6-merge-audit-verify.md`。
- README/docs 决策：不修改根 README。该功能是 Verify 阶段的受限开发者工具，不新增安装、
  公共 CLI、用户配置或发布入口；现有 capability spec、设计/ADR、实施计划、三份失败报告与
  最终通过报告已经完整记录行为、安全边界、回滚和真实验证，README 新增入口会扩大已批准范围。
- 回滚：revert 本审计/PR 的普通 merge 提交，并恢复上述主规格 before digest；无需
  state/schema/data migration。禁止通过 rebase、force push 或手改生成物回滚。
