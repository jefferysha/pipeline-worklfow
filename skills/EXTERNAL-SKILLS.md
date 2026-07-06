# EXTERNAL-SKILLS — 外部 skill 依赖显式清单（CONTRACT §5.7）

本插件引用的所有**非本仓** skill 必须在下方「已声明依赖」中列出（每行 `- <plugin>:<skill>`
或 `- <skill>`）。`tools/verify-skills.sh` 会扫描 `skills/**/SKILL.md`、`hooks/hooks.json`、
`templates/manifest.yaml` 中形如 `external-skill: <名字>` 的引用，未在本清单声明者
→ 安装/CI **硬失败并逐条列出**——不允许运行时才发现「skill 找不到」
（老内核靠 manifest 选装外部 skills 曾出现此坑，本仓封死）。

安装/CI 校验命令：

```bash
bash tools/verify-skills.sh          # 全量校验（路径存在 + 脚本可执行 + SKILL.md + 外部依赖声明）
bash tools/verify-skills.sh --quiet  # 静默模式（SessionStart hook 使用；仅失败时输出）
```

## 已声明依赖

> 来源：BACKLOG #22/#23 从老仓移植的 7 相位 SKILL + openspec 四操作 + learn-record 所引用的
> 外部 skill（各 SKILL.md 末尾「外部 skill 依赖」节逐条标注了 强制/推荐/条件/可选 级别）。
> 声明 ≠ 必装：缺失时按各 SKILL 内标注降级（强制项缺失 → 停流程提示安装，不许静默替代）。

**superpowers 系（工作流方法论）**
- superpowers:brainstorming — 深度设计/需求对话
- superpowers:writing-plans — 实施计划
- superpowers:test-driven-development — TDD 红绿重构
- superpowers:subagent-driven-development — build 并发编排
- superpowers:dispatching-parallel-agents — 并行 agent 编排
- superpowers:verification-before-completion — 验收 checklist
- superpowers:finishing-a-development-branch — 分支收尾

**commit-commands 系**
- commit-commands:commit — 仅提交
- commit-commands:commit-push-pr — 提交+push+PR

**调研 / 提问**
- grill-with-docs — 领域知识压测（一次一问）
- search-first — 现成方案检索
- deep-research — 多源深度调研
- market-research — 市场/竞品方法论（researcher 子 agent 内用）
- zoom-out — 跑偏纠航
- find-skills — 可复用 skill 检索
- improve-codebase-architecture — 架构机会扫描

**需求 / 交付产物**
- triage — issue 流归类（条件）
- to-prd — PRD 沉淀
- to-issues — 拆 GitHub issues
- handoff — 团队对接文档
- github-ops — GitHub 自动化（标签/里程碑/Actions，可选）
- code-tour — 代码导览
- skill-creator — 经验沉淀为新 skill

**设计 / 原型 / 前端**
- prototype — UI 变体原型引擎
- huashu-design — HTML 设计师原型引擎
- hallmark — 反 AI-slop 设计层
- hue — 设计语言/配色生成
- uiforge — mockup → HTML
- web-artifacts-builder — 复杂多组件原型
- uiuxdesign-pro — UX 高级模板（可选）
- frontend-design — 前端设计评审
- web-design-guidelines — UI 设计规范
- taste-skill — 设计品味评审
- shadcn-ui — shadcn 组件库（条件）
- tailwind-css-patterns — Tailwind 排版（条件）
- react-patterns — React 项目（条件）
- react-best-practices — React 性能最佳实践（条件）
- frontend-patterns — 前端通用模式（可选）

**后端 / 基建 stack**
- nestjs-patterns — NestJS（条件）
- postgres-patterns — Postgres（条件）
- python-patterns — Python（条件）
- python-testing — Python 测试（条件）
- docker-patterns — Docker（条件）
- deployment-patterns — 部署 checklist（可选）

**验证**
- browser-qa — 浏览器走查
- e2e-testing — Playwright/API E2E
- verify — 真跑 app 验证（builtin）
- run — 启动 app（builtin）
- security-review — 安全专项（builtin）
- code-review — 代码评审（builtin）
