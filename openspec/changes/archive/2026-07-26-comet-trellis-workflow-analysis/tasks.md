# 任务

## 立项

- [x] 建立独立 PM/default Change，不复用现有 Build Change。
- [x] 固定研究目标、范围、非目标、验收信号与初始风险。
- [x] 建立七阶段任务源并准备 Open 文档登记。

## 调研

- [x] 确认 Comet 与 Trellis 的精确上游仓库、版本和一手资料。
- [x] 拆解两者的阶段图、Skill 触发方式、OpenSpec / Superpowers 嵌入点。
- [x] 追踪文档的创建、命名、索引、更新、归档和下一阶段读取链。
- [x] 读取本仓当前 workflow、document ledger、evidence、breadcrumb 与 context 恢复实现。
- [x] 盘点 canonical `skills/`、原生插件 payload、Codex 项目 `.agents/skills` 兼容投影和
  历史 cache 的重复发现路径。
- [x] 形成有来源的研究稿、Superpowers 设计稿与 ADR。

## 规格

- [x] 将证据转化为逐阶段对照矩阵和明确差距。
- [x] 定义改进需求、非目标、兼容边界、验收场景和迁移顺序。
- [x] 定义唯一 Skill 内容源、Selected Skill Root、重复投影/冲突检测与安全迁移契约。
- [x] 形成用户旅程、delta specs、Superpowers 实施计划与可执行任务。

## 实现

- [x] 复验 sibling worktree 的显式 Git common-dir Skill-read 证据兼容。
- [x] 实现自然语言 contextual approval、拒绝/约束优先和低置信度 fail closed。
- [x] 实现 pending interaction 下的严格只读 ActionEffect 放行。
- [x] 实现原生 Selected Skill Root 与静态项目投影互斥。
- [x] 实现 ownership-safe 旧 Skill 链接迁移与 duplicate/shadow 诊断。
- [x] 实现 `pipeline handoff --bundle --target <phase>` 的 Context Bundle v1。
- [x] 修复 free track 在 `matrix=false` 时无法登记声明式 artifact producer 的治理死锁。
- [x] 更新用户文档、最终深度研究报告和受影响的 phase Skill。

## 验证

- [x] 复核所有关键结论的一手来源和本地代码位置。
- [x] 运行 worktree evidence、hook、adapter、doctor、bundle 局部测试。
- [x] 运行全量测试、bundle smoke、shell syntax 和 `git diff --check`。
- [x] 验证原工作树没有本次修改，native/static 均只有一个 Skill 发现根。
- [x] 生成 verification report 并完成 review。

## 交付

- [x] 整理执行摘要、优先级路线图和受影响模块清单。
- [x] 若有行为改动，应用主 spec 并完成交付检查。

## 归档

- [x] 读取全部最终产物，完成 Change 归档与经验沉淀。
