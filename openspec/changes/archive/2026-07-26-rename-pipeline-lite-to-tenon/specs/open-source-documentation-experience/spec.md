# 开源文档体验增量规格

## ADDED Requirements

### Requirement: README 与正式文档 SHALL 以 Tenon 为唯一现行产品身份

中文 README、英文 README、VitePress 中文/英文内容、`llms.txt`、CLI 示例、仓库链接与 Pages base
SHALL 使用 Tenon 现行身份。历史说明 MAY 提及旧名，但不得把旧 CLI、旧插件或旧仓库作为当前安装入口。
中文仍是默认读者路径，英文内容 SHALL 与中文命令、端口和安全边界等价。

#### Scenario: 新用户从 GitHub 首页安装

- **WHEN** 用户打开根 README
- **THEN** 首选路径是一行 Marketplace bootstrap 且不要求 clone
- **AND** 明确宿主选择、hook 信任、新会话生效、18765 Dashboard 和验证命令
- **AND** npx 只有在 npm 包真实发布后才作为可执行入口展示。

### Requirement: README 与中文文档站 SHALL 提供精选 Dashboard 图文

仓库 SHALL 生成 3–4 张当前 Tenon Dashboard 正式图片，覆盖项目/总览、进度、自动运行和工作台中的
核心能力。图片 SHALL 使用稳定命名、压缩格式、尺寸阈值和隐私检查。README SHALL 使用核心总览图与
紧凑说明；中文文档站 SHALL 使用响应式图文块解释各视图之间的关系，不得把旧 QA 截图图库直接公开。

#### Scenario: 读者在 GitHub 查看 README

- **WHEN** GitHub Markdown 渲染根 README
- **THEN** 相对图片链接可加载且 alt text 描述视图和用途
- **AND** 图片不会把安装步骤和核心文字推到首屏之外
- **AND** 暗色 GitHub 背景下仍可辨识边界。

#### Scenario: 读者在 Pages 查看中文文档

- **WHEN** 用户在桌面或移动宽度打开 Dashboard 概览/教程
- **THEN** 图片 URL 在 `/tenon/` production base 下有效
- **AND** 图文块响应式堆叠、无横向溢出、可键盘访问
- **AND** 图片不含本机用户名、临时目录、真实私有任务或错误状态。

### Requirement: 文档图片 SHALL 进入确定性公开资产清单

正式图片 SHALL 同时进入 repository hygiene allowlist、文档 source manifest 或固定 public asset 清单、
链接检查与 Pages artifact audit。未引用图片、超阈值图片和未知二进制 SHALL fail-loud。

#### Scenario: 新增未登记图片

- **WHEN** `docs-site/public/images/` 出现未被 allowlist 和公开页面引用的图片
- **THEN** 文档检查失败并列出该文件
- **AND** Pages deploy 不执行。

#### Scenario: 删除或重命名正式图片

- **WHEN** README 或生成文档仍引用不存在的图片
- **THEN** GitHub/VitePress 链接检查失败
- **AND** 维护者必须同步更新引用和 allowlist。
