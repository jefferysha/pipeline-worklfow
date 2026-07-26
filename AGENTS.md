# Agent Rules

<!-- create-rule:start -->
本文件是 agent 规则入口和决策层。具体约束放在 `.agent-rules/`，本文件只负责选择本次任务需要读取哪些规则以及处理当前请求与长期规则之间的关系。

Claude Code 使用本文件时，不得用未转义的 `@path` 导入规则文件；必须按任务范围手动读取，避免启动时加载全部规则。

## 规则目录

- 通用规则：`.agent-rules/COMMON.md`
- 前端规则：`.agent-rules/FRONTEND.md`
- 后端规则：`.agent-rules/BACKEND.md`

## 本次任务规则选择

| 任务范围 | 必须读取 | 非必要时不读取 |
| --- | --- | --- |
| 仅前端 | `.agent-rules/COMMON.md` + `.agent-rules/FRONTEND.md` | `.agent-rules/BACKEND.md` |
| 仅后端 | `.agent-rules/COMMON.md` + `.agent-rules/BACKEND.md` | `.agent-rules/FRONTEND.md` |
| 前后端或共享契约 | `.agent-rules/COMMON.md` + `.agent-rules/FRONTEND.md` + `.agent-rules/BACKEND.md` | 无 |
| 通用文档、工具或流程 | `.agent-rules/COMMON.md` | 与任务无关的领域规则 |

如果范围不确定，先根据用户目标、涉及文件、调用链和风险边界判断；只有不同选择会实质改变结果时才询问用户。

## 当前请求与长期规则

- 用户当前清晰、明确的要求可以在本次任务中覆盖长期偏好；只要没有超出授权范围或安全边界，说明偏离后直接执行，不要求先修改长期规则。
- 只有当覆盖要求可能反复出现、用户重复纠正，或不持久化会让未来 agent 持续犯错时，才询问是否写入长期规则。
- 请求含糊、实质扩大范围、意外改变公共契约或安全边界，或会造成不可逆的外部/生产影响时，先澄清再执行。
- 持久化规则时，通用流程、安全、验证、交付和项目结构写入 `.agent-rules/COMMON.md`。
- 前端技术栈、组件、状态、样式、可访问性和前端架构规则写入 `.agent-rules/FRONTEND.md`。
- 后端技术栈、服务分层、API、数据库、迁移和后端架构规则写入 `.agent-rules/BACKEND.md`。

## 执行纪律

- 修改前读取相关实现、调用方、测试和已选规则，不得只根据文件名猜测行为。
- 用户请求已经授权且操作可合理回退时，可以直接完成正常的代码、测试、依赖、schema、配置、CI 和文件变更，不得仅因操作类别重复请求确认。
- 操作超出请求、难以回退，或在授权不清晰时改变外部/生产状态、发布或发送内容、产生费用、访问 secrets、影响真实用户/数据，必须先确认。
- 不得伪造验证结果；未运行的验证必须说明原因和剩余风险。
- 不得提交 secrets、真实用户数据、私钥或 tokens，不得执行未经授权的破坏性操作。
- 最终回复遵循 `.agent-rules/COMMON.md` 的交付要求。
<!-- create-rule:end -->

<!-- PIPELINE:CODEX:START -->
## Tenon Workflow（Codex 静态层）

7-phase 流水线：open → explore → spec ⇄ build ⇄ verify → ship → archive。状态操作一律走
`tenon status` / `tenon get` / `tenon set` /
`tenon transition` / `tenon check`，勿手改 canonical state 或
`.pipeline.yaml` 投影。

正常开发对话默认走 default workflow：先调用 `tenon:tenon`，由入口 Skill 创建或恢复 Change、
初始化 OpenSpec 并分派当前 phase Skill；Todo 的一级项必须是七个 pipeline phase，任务来自该 Change 的
`tasks.md`，不得先生成脱离 phase 的通用 Todo。
`tasks.md` 出口检查只计算截至当前 phase 的任务；未来 phase 必须保留在 Todo 中但不得提前阻塞。
若 build 发现 proposal/design 的需求语义已变化，必须以 `requirements-changed` 回退 spec，重新登记、
读取并复核修订证据，禁止在 build 中覆盖旧 SHA 或绕过 spec review。

离开 review phase（explore / spec / verify）须对**确切 transition event**取得人类显式确认；先运行
`tenon review request <change> --event <event>`，再由用户确认触发
`tenon review acknowledge <change>`。档 A/B 的普通对话中，用户下一条明确回复“确认继续”或
“继续执行”会写入该 receipt；档 C 必须保留确认事实并显式 acknowledge，不能删除 marker 绕过
review-gate。verify-fail 与 verify-pass 的确认不可互用。
<!-- PIPELINE:CODEX:END -->
