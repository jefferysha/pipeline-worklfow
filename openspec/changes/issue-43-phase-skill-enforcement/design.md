# 设计

## 决策摘要

- default Workflow 的 `skills` 声明七个 `tenon-<phase>` hard requirements；它们属于 Workflow snapshot。
- Track matrix overlay 只来自 manifest，只有 `matrix=true` 时自动叠加；free/default 的命名 profile 仅供 artifact/AFK 显式选择。
- resolver 暴露 required（phase + mandatory overlay）、available（phase + mandatory/recommended overlay）和 explicit profile（phase + named profile）投影，稳定去重且 phase 在前。
- Hook、transition、AFK、artifact 和 doctor 必须消费该统一结果；custom Workflow 仍只认 step-declared DAG。

## 风险

- 默认 workflow、tracked bundle 与打包 Skill 文档存在多份生成/分发副本，任一未同步都会造成 CI 或发布漂移。
- Wave 0 其他 kernel 改动可能触碰 transition tests；最终完整验证前需重新 fetch/rebase 到最新可证明祖先的 `origin/main`。
- Skill receipt 与状态转换存在并发/会话绑定安全边界，修复不得放宽 custom Workflow 或 matrix-enabled Track 的 fail-closed 行为。

## 待验证问题

- Spec 必须冻结 AFK `skill_bundle_id` overlay override 与 frozen capability 的精确接口，避免 profile 与 Track capability 脱钩。
- Build 先用定向 RED 证明 Hook、transition 和 bundle 的 free/default 绕过，再做最小实现。
- 完整实现必须同步 default workflow 生成物、manifest fixtures、tracked dist、Skill/中英文文档和 CI contract check。

## 影响面与所有权

- kernel：effective plan/resolver、bundle resolver、default workflow source/generated projection 和单元测试。
- CLI/server：Hook、transition integration、AFK coordinate、doctor、artifact 与相应回归测试。
- automation：captured coordinate / preparation 接口与 admission/bundle 负例。
- release/docs：manifest 注释与 fixtures、打包 Skills、英文及 zh-CN 用户文档、freshness 检查。

完整方案与备选取舍见 `docs/superpowers/specs/issue-43-phase-skill-enforcement-design.md` 和
`docs/adr/issue-43-phase-skill-enforcement.md`。
