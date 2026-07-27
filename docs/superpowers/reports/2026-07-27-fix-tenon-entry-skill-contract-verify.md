# `fix-tenon-entry-skill-contract` 最终验证报告

## 结论

`PASS`。最终冻结候选
`workspace:sha256:3cbd445566c74e90b958239dfda98f1f591c4e1e63e39573f14927e2ad66b166`
在全部适用轨完成后才一次性聚合；Reviewer、E2E、真实二进制矩阵、OpenSpec 隔离应用与真实浏览器
均通过，最终为 **0 Critical / 0 High / 0 Medium / 0 Low**。前后 fingerprint 完全一致，Verify
期间没有写入实现或 tracked 构建产物。

本轮关闭此前一次性聚合发现的最后两项 Medium：

1. Dashboard 首次 `/api/snapshot` 失败现在显示可访问的错误与“重试加载”，重试成功后恢复项目页。
2. 自定义 `document-v1` workflow 的 `owner=spec` ADR 首次登记合法；`openspec-v1` living ADR
   仍只允许在精确 `requirements-changed` visit 重登记。

## Build 冻结前全量收敛

- 完整实现审查覆盖 379 个变更路径与五项 capability，结论
  0 Critical / 0 High / 0 Medium / 0 Low。
- 核心测试：315 个文件，5365 项通过，5 项真实外部环境测试诚实跳过。
- Dashboard：50 个文件，963/963 通过；仅有既有、非失败的 React `act(...)` 警告。
- Hooks 482/482、adapters 272/272、N-1 bundle 31/31 全部通过。
- 架构门禁覆盖 610 个生产文件；identity、repository hygiene、comments、docs、skills、diff、
  default workflow freshness 与 golden oracle（0 differences）全部通过。
- 全量审查通过后才写入 `pre_verify_review_result=pass` 并冻结上述 fingerprint。

## Verify 一次性聚合

### 独立 Reviewer

- `PASS`，覆盖 384 个路径及
  `dashboard-project-selection`、`normal-chat-routing`、`plugin-distribution`、
  `plugin-runtime`、`tenon-product-identity` 五项 capability。
- canonical revision 155、transition sequence 50、`build_sha` 与冻结 fingerprint 精确一致。
- 结论为 0 Critical / 0 High / 0 Medium / 0 Low；复核前后无仓库写入。

### E2E 与真实二进制

- 20 个 Vitest 文件 621/621、N-1 bundle 31/31、真实二进制矩阵 12/12，共 664/664。
- 文档治理 54/54、managed-host 110/110、Dashboard ownership/API 317/317、
  Dashboard root/source 140/140。
- Ordinary 与 managed 实例 health 均为 200；普通实例 transaction 为 `null`，managed 实例精确
  绑定 `full-transaction-a`。
- snapshot 协议 v2、capability=true；A/B 项目来源严格隔离；显式 root 200，缺 root 400，
  未注册 root 404。
- 临时服务与目录均已清理；前后 fingerprint 精确一致。

### 真实浏览器与视觉/故障恢复

- 1440px 与 390px 的项目总览、显式项目选择、进度页、详情抽屉和 Browser Back 全部通过，
  页面级 `scrollWidth === clientWidth`。
- loading、empty 状态清晰；详情关闭按钮可访问。
- 首次 snapshot 注入 500 后显示 `role=alert`、失败详情和“重试加载”；点击后产生第二次请求，
  alert 消失并恢复真实项目页，390px 仍无横向溢出。
- 正常流程 console warning/error 为 0、失败请求为 0；故障轨只有预期注入的 500，无未捕获异常。
- 未发现模板化/emoji 红线、对比度、可读性或主要交互态问题。

### OpenSpec 隔离演练

- 当前 Change strict valid；隔离副本为基线 `plugin-runtime` 临时补入 Verify-only Purpose 后，
  archive/apply 成功应用 14 条 delta。
- 应用后的五项主规格逐项 strict valid。
- 真实 `openspec/specs/plugin-runtime/spec.md` 前后 SHA-256 均为
  `6d06e77aba4edc047b61e4c72dfcc056a6a9f72dc31ac1eb48d67eb429d40f2c`，真实主规格与冻结
  fingerprint 均未改变。
- 基线 `plugin-runtime` 缺 Purpose 是本 Change 之外的既有债务，不伪装为已修复；应在后续独立
  Change 处理。

### Codex CLI 降级说明

本机 Codex 只读 review 轨因既有 logs DB/model cache schema 异常曾出现递归读取与超大 token
消耗，本轮未重复触发。按 Verify Skill 的降级契约，该轨登记为 pass，但报告明确标注
`DEGRADED`；它不替代独立 Reviewer、E2E、OpenSpec 和真实浏览器的成功证据。

## 文件到 capability 覆盖

- `packages/dashboard-app/**`、`packages/server/**`：
  `dashboard-project-selection` 与 Dashboard transaction/root/source 边界。
- `hooks/**`、`templates/skill-interaction-contract.md`、`tools/generate-skill-interaction-contract*`：
  `normal-chat-routing` 与持续授权/交互契约。
- `packages/cli/src/commands/{setup,update,managed-host*,release-*}.ts`、`packages/cli/src/runtime/**`：
  `plugin-distribution` 与 managed-host 可恢复事务。
- `packages/kernel/src/**`、`templates/workflows/default.yaml`、`skills/tenon-{build,verify}/SKILL.md`：
  `plugin-runtime` 的 Build→Verify 全量收敛、冻结和文档治理。
- `package.json`、发行 bundle、doctor/identity/adapter 相关实现：
  `tenon-product-identity` 与 1.0.1 发行身份。

## Verify 出口判定

- 全部适用轨已完成并一次性聚合。
- Critical / High / Medium 为 0。
- `build_sha`、Reviewer/E2E/视觉前后 fingerprint 精确一致。
- repo-zero-output 成立；只有本 canonical verification report 与 tasks 勾选在聚合后写入。
- 结论：允许精确 `verify-pass` 进入 Ship。
