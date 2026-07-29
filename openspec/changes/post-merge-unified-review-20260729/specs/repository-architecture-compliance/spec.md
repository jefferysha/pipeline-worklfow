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
