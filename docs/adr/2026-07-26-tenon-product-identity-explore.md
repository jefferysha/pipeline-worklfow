# ADR：Tenon 单一产品身份、双安装入口与执行来源模型

- 日期：2026-07-26
- 状态：Explore 决议
- Change：`rename-pipeline-lite-to-tenon`

## 背景

现有产品同时暴露 `Pipeline Lite`、`pipeline-lite`、`pipeline` 与错误拼写的仓库名，
并把终端心跳形成的 `running` 展示态误当成自动运行来源。与此同时，用户要求新用户无需 clone、
可以一步安装完整插件、既有用户能够更新，并清理远端仓库中的无关图片。

## 决策

采用以下统一架构：

1. 最终公开身份只有 Tenon：品牌 `Tenon`、CLI `tenon`、插件/Marketplace `tenon@tenon`、
   Skill 前缀 `tenon-`、运行时根 `.tenon/`、环境前缀 `TENON_`、仓库 `jefferysha/tenon`。
2. 宿主标准目录保持宿主所有权：Codex 继续使用 `.codex`/`.agents`，Claude 继续使用 `.claude`。
3. Marketplace 是首选分发通道；一行 bootstrap 命令完成“注册市场 → 安装 → inventory 校验 →
   `tenon setup`”。新用户不 clone、不 build。
4. npx 是同一安装事务的第二入口，不复制完整实现。先完成可发布包和本地 pack 验证；
   npm scope/凭据就绪后发布。
5. 既有旧插件跨 identity 更新采用一次性 legacy migration channel。Tenon 本体不提供
   `pipeline` 命令、旧插件名或长期 alias。
6. 当前 Git 树删除可再生截图并加入 ignore/卫生门禁；不重写 Git 历史。
7. 执行状态与执行来源正交建模。自动运行页只接受 `executionProvenance === "automation"`，
   终端心跳只能产生 `"terminal"`。
8. Dashboard 默认端口继续为 `127.0.0.1:18765`，不创建第二前端或第二服务。

## 选择理由

- Marketplace 已是项目的完整分发面，能让新用户立即获得 CLI、Dashboard、Skills、hooks 和 adapters；
  用它作为首选入口可避免把 npm 凭据变成首装前置条件。
- npx 对跨宿主和 CI 友好，但必须建立真实发布者 scope 后才可公开承诺；把它设计为薄入口可以避免
  Marketplace 与 npm 产生两套更新状态。
- 直接长期双栈会让所有测试、文档、诊断和更新永久承担旧身份；一次性迁移桥能同时满足自动迁移与
  最终零旧入口。
- Git 历史重写会破坏 OpenSpec/ledger 引用，收益与当前约 42 MiB pack 不成比例；删除当前树资产并
  阻止回归是更安全的开源仓库治理。
- provenance 必须来自 canonical source，不能从 UI 汇总状态反推，否则 Progress 与 Auto Run 会继续矛盾。

## 被拒绝方案

### 只提供手动 clone

拒绝。它把 build、依赖和仓库结构暴露给用户，不是插件安装体验。

### 只发布 npm、移除 Marketplace

拒绝。会丢失宿主原生 inventory/update 能力，并让首次发布凭据成为现有安装功能的阻塞点。

### 永久保留 `pipeline` alias

拒绝。与用户的“不需要兼容”直接冲突，也会持续制造双真相。

### 删除整个 `design-demos/` 或重写全部历史

拒绝。文本 demo 仍是现行设计依据，OpenSpec/ledger 是审计事实；只删除可再生、未被发布面消费的图片。

## 后果

- 发布需要一个有期限的旧通道迁移步骤和一个 Tenon 主发行通道。
- npm 首发在凭据可用前保持“已构建、已验证、未发布”状态。
- 现行产品残留扫描应为零，但历史归档与 migration manifest 中允许出现旧名称。
- CI 增加仓库卫生、发布包 allowlist、两类首装和 provenance 回归测试。

