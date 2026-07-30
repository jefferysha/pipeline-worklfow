# 设计

## 已确认设计

- kernel 在根值为对象后、v1 closed-schema 校验前，只对安全整数且大于当前支持版本的 `schemaVersion` 抛出 typed error；其余异常保持 corruption。
- snapshot 增加 optional 项目级 issue，只暴露 Change 名、发现版本、支持版本、稳定原因码与 `upgrade-runtime` action，不暴露本机绝对状态路径或原始错误。
- Dashboard 在当前项目 Progress 入口显示升级要求，优先于 no-change 教学空态，并复用已有 refresh；本功能不自动执行更新。
- 项目可同时保留其他可读 Changes；不兼容 Change 不进入可操作 Changes 与计数。

## 风险

- 把任意 JSON 损坏误判为版本不兼容会弱化诊断可信度。
- 新字段若不是加法或前端解码不兼容，会破坏滚动升级。
- 进度页现有“零 Change”教学态可能遮蔽不可读 Change。

## 已裁决问题

- 识别顺序：JSON parse → 根对象 → 明确未来安全整数版本 → 当前版本 closed-schema/字段/digest 全量验证。
- 共存模型：`ProjectSnapshot.ok=false`，`compatibilityIssues` 与其他可读 `changes` 并存；issue 数组按 Change 名稳定排序。
- 交互模型：Progress notice 调用 App 现有 `refresh`；loading 时禁用，缺失/空数组不渲染，全局请求错误仍走现有错误路径。

## 证据

- 上游固定证据：`docs/superpowers/specs/2026-07-30-canonical-state-version-status-upstream-research.md`。
- 完整设计：`docs/superpowers/specs/2026-07-30-canonical-state-version-status-design.md`。
- 架构决策：`docs/adr/2026-07-30-canonical-state-version-status-20260730-explore.md`。
