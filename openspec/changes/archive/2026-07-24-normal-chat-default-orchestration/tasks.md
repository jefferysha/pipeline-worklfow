# Tasks

> 一级任务严格对应 default workflow 的七个 phase。checkbox 是该 change 的可审计工作项；
> canonical phase 仍以 `pipeline status` 为准，禁止通过编辑本文件推进状态。

## Open

- [x] 明确普通开发对话必须进入 default pipeline，普通问答与显式快速修复不触发。
- [x] 建立并补全本 change 的 OpenSpec proposal、design 与初始 tasks 骨架。
- [x] 记录 18765 为全局 Dashboard 默认端口，8765 为显式兼容覆盖端口。

## Explore

- [x] 定位根因：`UserPromptSubmit` 只注入提示、`.pipeline-active` 被错误当作会话绑定、phase skill 与 Todo 投影没有共同真相源。
- [x] 定义 `new` / `resume` / `select` 路由契约，禁止新主题复用旧 change。
- [x] 形成文档证据账本设计与 ADR，规定 OpenSpec、Superpowers、ADR 的 producer、hash 与后续 read receipt。

## Spec

- [x] 为 default / `openspec_contract: required` 定义文档产出与回读矩阵。
- [x] 补充 `document-evidence-contract` delta spec、Superpowers 实施计划与验收边界。
- [x] 将本清单改为七 phase 分组，供 Dashboard 只读投影而非自由文本 Todo。
- [x] 定义内建 simple Track：严格正向/否决分类、`change → verify → done` 轻量 workflow 与 scope-expanded 升级路径。
- [x] 准备 spec review 包：文档链、路由隔离、端口、安装/更新与 simple 轻量轨边界均已形成可校验产物。

## Build

- [x] 在 canonical build phase 复核并固化 router、breadcrumb、SessionStart 和 Codex wrapper 的新主题隔离实现。
- [x] 在 canonical build phase 复核并固化 `pipeline document` 账本、exact-event review receipt、Dashboard 证据投影与七阶段 Todo。
- [x] 在 canonical build phase 复核并固化 `pipeline setup --codex` 的受管 runtime、skills 安装、健康检查后自动打开 Dashboard、日更无感刷新和 18765/8765 契约。
- [x] 在 canonical build phase 复核并固化 PM `spec-complete` 的 post-commit AFK 自动挂队：独立 Track policy、CLI/HTTP 同源调用、普通开发轨不被接管、runner 不被隐式启动。
- [x] 实现 simple 内建 Track/workflow、否决优先路由、`simple-task` 打包 skill、执行中 scope-expanded 升级及 Dashboard 轻量阶段投影。

## Verify

- [x] 运行 kernel / CLI / server / Dashboard / hook / adapter / bundle 验证，并验证缺文档、改文档、漏回读和错误 review event 均被拒绝。
- [x] 通过真实稳定安装路径验证：新 SkillHub 调研主题为 `intent: new` / `phase: open`，不会读取本 change 的旧任务。
- [x] 验证全局 Dashboard 在 `127.0.0.1:18765` 健康可用，并且 doctor 不再把 Codex 安装误报为 Claude statusLine 缺失。
- [x] 验证局部 typo/文案命中 simple 且不生成完整文档链；API/schema/auth/多模块等否决项稳定升级到完整 Track。

## Ship

- [x] 在 verify 通过并得到 ship 确认后，生成/登记 applied spec，发布可安装 bundle，并只推送经用户授权的目标分支与远程。

## Archive

- [x] 在发布验收后归档 change，保留最终文档账本、验证报告和 applied spec 作为可追溯证据。
