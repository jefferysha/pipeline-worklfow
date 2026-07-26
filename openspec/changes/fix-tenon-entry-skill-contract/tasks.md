# 任务

## 立项

- [x] 记录入口 Skill 漂移、影响范围和非目标。
- [x] 建立从 simple 升级到 default 的机器可读依赖链。

## 调研

- [x] 核对主入口 Skill、doctor 合约、Agent 规则生成链和发布 inventory。
- [x] 复现并定位旧插件 hook 与当前 Tenon Skill 根并存导致的来源拒绝。
- [x] 形成单一入口决策、ADR 与可审计设计结论。

## 规格

- [x] 更新三项 capability delta spec 与可执行实施计划。
- [x] 明确入口存在性、生成规则新鲜度和安装态 doctor 验收标准。
- [x] 明确宿主插件唯一性与外部参考名称零残留的机器验收标准。
- [x] 增加 Dashboard 显式项目选择 capability，并把无选择/失效选择/URL/API 行为写入规格与计划。

## 实现

- [x] 在身份真相源声明 `entrySkill`，生成 TypeScript 与 Codex managed block 两类投影。
- [x] 将 doctor、根 Agent 规则和 Codex adapter 统一到 `tenon:tenon`，不保留第二入口。
- [x] 增加宿主插件身份冲突诊断与仓库路径/正文名称卫生回归。
- [x] 将产品版本推进到 1.0.1，更新中英文发布说明并重建所有发行产物。
- [x] 将 setup/update 重构为“候选激活 → 新会话证明 → 官方管理器清理”的持久化迁移事务，并对库存、
  清理、验证和发布失败全部 fail closed。 (build)
- [x] 加固产品身份生成、Agent 哨兵块、Codex adapter marker 和入口 Skill 路径边界。 (build)
- [x] 规范化 `normal-chat-routing` 主规格的 OpenSpec 1.6 Purpose，并通过隔离归档演练。 (build)
- [x] 消除公开发行 bundle 中的退役身份文本并补全发行资产零残留门禁。 (build)
- [x] 重构 Dashboard 项目上下文为 `none | selected(root)` 单一真相源，删除首项目、可达项目和
  localStorage 的隐式选择；以失败优先回归覆盖 URL、视图与 per-root API。 (build)

## 验证

- [ ] 运行聚焦测试、身份/仓库卫生门禁、完整构建和全量测试。
- [ ] 从最终插件更新本机 managed runtime，确认 doctor 无入口 Skill 红黄项。
- [ ] 在 18765 复验未选项目时 URL 无 `root` 且不访问 per-root API；显式选择后才进入对应项目。
- [ ] 在 18765 复验唯一项目、进度与自动运行来源隔离。

## 交付

- [ ] 提交并推送修复，通过远端 CI。
- [ ] 发布并验证 `v1.0.1` GitHub Release 与 Pages。

## 归档

- [ ] 归档 Change，清理临时状态并确认工作区、远端和运行时一致。
