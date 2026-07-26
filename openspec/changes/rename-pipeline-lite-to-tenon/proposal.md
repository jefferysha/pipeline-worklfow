# 提案

## Why

当前产品同时暴露 `Pipeline Lite`、`pipeline-lite`、`pipeline` 等多套身份，CLI、插件、
安装目录、Dashboard 与文档无法形成一致认知。用户已确定新品牌为 **Tenon**，并要求一次性
完成全局迁移，不保留旧名称或旧命令兼容层。

## What Changes

- 将面向用户的产品名称、命令、包与插件标识、Skill 命名、安装和自动更新路径统一为 Tenon。
- 将 Dashboard、README、中文文档站、示例、测试和发布资产中的现行品牌统一为 Tenon。
- 新命令以 `tenon` 为唯一入口，包括 `tenon setup --codex` 等安装与管理命令。
- 采用受控的自举迁移顺序完成仓库自身改名；最终交付物不提供旧命令、旧包名或旧插件名的兼容入口。
- 保留已归档 Change、不可变 ledger 与 Git 历史中的旧名称，仅作为历史证据，不把它们视为现行产品入口。
- 修复 Dashboard 执行来源建模：终端会话不得因处于 `running` 展示态而进入自动运行队列；
  自动运行页只展示具有真实 automation provenance 的任务。
- 提供无需手动 clone 的一步安装：Marketplace bootstrap 为首选入口，npx 为同一发行包的可发布入口。
- 清理当前仓库树中与正式产品无关的可再生截图，补充精确 ignore、发布 allowlist 与仓库卫生门禁。
- 为 README 与中文 GitHub Pages 文档生成少量正式 Tenon Dashboard 图，并完成响应式图文排版。

## Capabilities

### New Capabilities

- `tenon-product-identity`：定义 Tenon 在 CLI、分发、运行时、Dashboard、文档和发布链路中的唯一产品身份。

### Modified Capabilities

- 现有安装、自动更新、CLI、Skill 分发、Dashboard 和文档能力的公开身份与调用入口。
- Dashboard 进度与自动运行视图的执行来源分类契约。

## Impact

这是破坏性品牌迁移，预计影响根包与 workspace 包、可执行文件、运行时目录、插件清单、Skill 元数据、
安装器、更新器、Dashboard 前后端、测试夹具、GitHub Pages/Actions、README 与完整中文文档。
Explore 阶段将枚举全部现行引用、不可变历史边界、执行来源数据流、仓库资产分类、一步安装契约以及
仓库自举和发布顺序。
