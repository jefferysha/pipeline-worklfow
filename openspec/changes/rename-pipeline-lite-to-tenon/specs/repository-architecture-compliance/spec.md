# 仓库架构合规增量规格

## ADDED Requirements

### Requirement: 仓库 SHALL 区分正式资产与可再生验收产物

Git 当前树 SHALL 不跟踪 `design-demos/shots/`、根目录 QA 截图、Playwright 临时目录或 E2E 运行态。
仍被现行实现/设计规范引用且不含外部参考项目身份的文本 demo、OpenSpec archive、ledger 和 ADR MAY 保留。
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

### Requirement: 当前树 SHALL 不包含外部参考项目身份

受 Git 管理的当前树 SHALL 在路径名和文本内容两个维度对外部参考项目身份保持零明文。相关调研、
演示、报告和 OpenSpec 归档 SHALL 从当前树删除；仍有产品价值的通用结论 SHALL 改写为 Tenon 自有的
中性架构表述。检查 SHALL 无路径豁免、无归档豁免，并在 CI、Marketplace、npm 与 Pages 发布前运行。
Git 既有提交对象 SHALL 保留，不执行历史重写。

#### Scenario: 历史调研产物仍在当前树

- **WHEN** 受 Git 管理的任一路径或文本包含受禁参考身份
- **THEN** repository hygiene 检查失败并报告相对路径
- **AND** 构建、打包或发布不得继续。

#### Scenario: 维护者需要恢复被删除资料

- **WHEN** 维护者需要审计或恢复被清理的历史调研产物
- **THEN** 从 Git 既有提交对象中显式恢复
- **AND** 恢复内容在重新进入当前树前仍须通过参考身份门禁。
