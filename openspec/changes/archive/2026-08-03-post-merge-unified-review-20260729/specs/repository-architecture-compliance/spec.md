# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 可发布主干 SHALL 通过依赖安全门

候选版本在干净 `npm ci` 后 SHALL 对完整 workspace 运行可复现的依赖审计与依赖树校验。
Critical 或 High 漏洞 SHALL 阻止发布；Moderate 漏洞 SHOULD 在存在兼容稳定修复时消除。若上游没有
稳定修复且必须接受 Moderate，证据 SHALL 记录 advisory、受影响路径、补偿控制、owner 和截止日期。
精确 override MAY 用于收敛间接依赖，但 SHALL 由 `npm ls`、全量测试、正式 build、文档 build 和
精确 head CI 共同证明，且不得依赖 `--force` 或 pre-release 工具链。

#### Scenario: 干净安装包含 Critical 或 High

- **WHEN** `npm audit --json` 在干净 workspace 报告任一 Critical 或 High
- **THEN** release verification 失败
- **AND** 版本、tag 和 GitHub Release 不得创建

#### Scenario: 安全稳定升级可消除 advisory

- **WHEN** 直接或间接依赖存在兼容的稳定安全版本
- **THEN** manifest 与 lockfile 作为同一原子变更升级
- **AND** 干净审计、依赖树、全量测试、正式 assets、docs build 和 CI 全部通过

#### Scenario: 使用 override 修复间接依赖

- **WHEN** stable 顶层工具尚未放宽其间接依赖声明，但隔离原型证明安全版本兼容
- **THEN** override 使用精确版本并在设计或 ADR 中记录原因和回滚边界
- **AND** `npm ls` 不报告 invalid/extraneous，正式文档与应用构建均通过

#### Scenario: 本 Change 的安全候选

- **WHEN** Vitest、Vite、AJV 与 VitePress 的本次安全组合安装完成
- **THEN** `npm audit --json` 报告 total 为 0
- **AND** 不引入 VitePress 2 alpha、Vite 8 或更高 Node engine 要求

### Requirement: 可发布仓库 SHALL 保持 OpenSpec 活跃树可严格验证

`openspec/changes/` SHALL 只包含具有真实 proposal、design、tasks 和 capability delta 的活跃
Change。已经结束且仅剩 Tenon 状态证据的历史目录 SHALL 通过 OpenSpec 官方 archive 操作完整迁移
到日期化 archive；不得删除历史证据、手改 canonical state，或补写虚假 delta 以骗过校验。

#### Scenario: 历史 state-only 目录滞留活跃树

- **WHEN** 一个目录不在 Tenon 活跃 Change 清单、phase 已为 `done` 或 `escalated`，且没有 proposal 或 delta
- **THEN** 使用精确枚举的 OpenSpec archive 操作保留其全部文件并移出活跃树
- **AND** 迁移前后的逐文件内容摘要和文件数量一致

#### Scenario: 发布候选执行全仓严格校验

- **WHEN** release candidate 运行 `openspec validate --all --strict --no-interactive`
- **THEN** 所有真实 active Change 和主规格均通过
- **AND** 不以忽略失败、删除证据或伪造 requirement 作为通过手段

### Requirement: 聚合快照 SHALL 只发布稳定的 tasks 内容

服务端读取受项目工作树控制的 `tasks.md` 时 SHALL 使用有界、nofollow 的普通文件 fd，并在读取前后
同时验证 fd 与 pathname 的文件身份和变化元数据。仅 dev/ino/size 相同不足以证明内容稳定；mtime 或
ctime 变化、fd/path 身份漂移、特殊文件、越界路径或超限输入均 SHALL fail closed，不发布该 tasks 投影。

#### Scenario: 同 inode同长度原地覆写

- **GIVEN** 服务端已经打开一个合法且有界的 `tasks.md`
- **WHEN** 文件在 fd 读取期间被原地覆写为相同字节长度，inode 与 size 均保持不变
- **THEN** fd 读前/读后或 pathname 元数据 fence 检出 mtime/ctime 变化
- **AND** 聚合快照省略该 tasks 内容，不发布 stale 或 torn bytes
