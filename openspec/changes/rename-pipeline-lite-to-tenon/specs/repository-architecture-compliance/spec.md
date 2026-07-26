# 仓库架构合规增量规格

## ADDED Requirements

### Requirement: 仓库 SHALL 区分正式资产与可再生验收产物

Git 当前树 SHALL 不跟踪 `design-demos/shots/`、根目录 QA 截图、Playwright 临时目录或 E2E 运行态。
仍被现行实现/设计规范引用的文本 demo、OpenSpec archive、ledger 和 ADR SHALL 保留。
正式 Dashboard 文档图片 SHALL 只位于固定目录、使用稳定文件名，并进入显式 allowlist。

#### Scenario: 开发者生成浏览器验收截图

- **WHEN** Playwright 或人工验收把图片写入受禁截图目录
- **THEN** `.gitignore` 阻止其作为普通新文件进入提交
- **AND** repository hygiene 检查在文件已被强制跟踪时 fail-loud。

#### Scenario: 正式 Dashboard 图片更新

- **WHEN** 维护者更新 README/文档站引用的 allowlisted 图片
- **THEN** 检查验证格式、尺寸上限、引用和隐私扫描
- **AND** 不允许借 allowlist 提交同目录中的任意额外截图。

### Requirement: 发布包 SHALL 使用显式内容 allowlist

Marketplace payload、npm tarball 与 Pages artifact SHALL 分别由确定性 allowlist 控制。它们不得包含
设计 demo、旧验收截图、内部研究、OpenSpec Change/ledger、测试运行态、凭据或本机路径。
CLI/server/SPA 受控 bundle SHALL 由源码重建并通过 freshness 检查。

#### Scenario: npm tarball 包含内部研究

- **WHEN** `npm pack --dry-run` 或 tarball audit 发现 `docs/superpowers`、`openspec/changes` 或截图目录
- **THEN** 发布检查失败并列出意外路径
- **AND** npm publish 不得执行。

#### Scenario: Marketplace 缺少运行资产

- **WHEN** allowlist 漏掉 CLI、Dashboard、Skill、hook、adapter、template 或 manifest
- **THEN** package verification 失败
- **AND** 候选不得激活。

### Requirement: 仓库优化 SHALL 不破坏审计历史

常规仓库卫生修复 SHALL 删除当前树无关资产并防止回归，但不得重写 Git 历史或改变 OpenSpec/ledger
历史 digest。若未来确需 history rewrite，必须作为独立破坏性迁移并重新评估 clone、tag、release 和审计影响。

#### Scenario: 当前树删除旧截图

- **WHEN** 本 Change 删除受跟踪的旧验收图片
- **THEN** 它们仍可从 Git 历史恢复
- **AND** 当前分支、发布包和后续提交不再携带这些工作树资产。
