# OpenSpec 增量规格

## MODIFIED Requirements

### Requirement: Backend adapters SHALL decode DTOs and call application boundaries

HTTP、CLI 与 hooks SHALL 只负责输入及授权校验、DTO 转换、应用用例调用和公共错误映射。
产品路径、平台与环境映射 SHALL 在进程装配或 adapter 边界解析并显式注入应用服务。
已经接收路径或环境依赖的应用服务 SHALL NOT 再读取 `process.env`、重建平台优先级或从
宿主 home 推导机器状态目录。外部值 SHALL 以 `unknown` 进入并在状态变更前完成收窄。
Adapter SHALL NOT 实现私有持久化解析器或跨聚合写协议。

#### Scenario: Malformed Workflow request reaches the server

- **WHEN** a request body is not a valid Workflow DTO
- **THEN** a boundary decoder rejects it using the existing compatible client
  error shape
- **AND** no domain compile/save or state write occurs.

#### Scenario: Loop command reads Change state

- **WHEN** a loop command needs a Change-state projection
- **THEN** it uses the kernel/application repository or codec contract
- **AND** it does not parse `.pipeline.yaml` privately.

#### Scenario: 迁移服务在共享运行环境中执行

- **GIVEN** 进程环境包含共享 `TENON_RUNTIME_HOME` 或 XDG 根
- **AND** 迁移调用方显式提供空环境与独立临时 home
- **WHEN** 项目注册表迁移执行
- **THEN** 注册表、回执和目录锁只位于该临时 home 对应的产品路径
- **AND** 共享运行目录保持未修改。

#### Scenario: 新迁移调用方省略环境依赖

- **WHEN** 代码尝试在未提供环境映射的情况下调用项目注册表迁移
- **THEN** TypeScript 契约在编译期拒绝该调用
- **AND** 应用服务不以隐式 `process.env` 作为兜底。

#### Scenario: 现有路径协议保持兼容

- **WHEN** 调用方显式传入与当前进程等价的环境、home 与 platform
- **THEN** `TENON_RUNTIME_HOME`、`TENON_RUNTIME_ROOTS` 和 XDG 的优先级保持不变
- **AND** 注册表、密钥、回执与锁文件格式保持不变。

#### Scenario: managed runtime 回滚等待事务锁

- **GIVEN** runtime adapter 已提供 home、环境和平台作用域
- **WHEN** 回滚事务解析路径并等待作用域锁
- **THEN** 锁目录和锁内全部读写复用同一个不可变路径快照
- **AND** 后续环境变化不能让事务跨到另一个状态根。

#### Scenario: runtime 命令无法解析作用域

- **WHEN** runtime adapter 的 home 或环境提供器失败
- **THEN** CLI 将失败映射为稳定的非零退出码和命令错误
- **AND** 无效或不完整子命令不读取运行时作用域。

### Requirement: 仓库 SHALL 区分正式资产与可再生验收产物

Git 当前树 SHALL 不跟踪 `design-demos/shots/`、根目录 QA 截图、Playwright 临时目录、E2E 运行态，
或不属于 Tenon 产品的历史测试项目、demo、OpenSpec 主规格、Change archive 和配套文档。
正式 Dashboard 文档图片 SHALL 只位于固定目录、使用稳定文件名，并进入显式 allowlist。
通用架构结论只有在改写为 Tenon 自有、中性表述且仍被现行规范引用时才可保留。

#### Scenario: 开发者生成浏览器验收截图

- **WHEN** Playwright 或人工验收把图片写入受禁截图目录
- **THEN** `.gitignore` 阻止其作为普通新文件进入提交
- **AND** repository hygiene 检查在文件已被强制跟踪时 fail-loud。

#### Scenario: 正式 Dashboard 图片更新

- **WHEN** 维护者更新 README/文档站引用的 allowlisted 图片
- **THEN** 检查验证格式、尺寸上限、引用和隐私扫描
- **AND** 不允许借 allowlist 提交同目录中的任意额外截图。

#### Scenario: 历史测试项目仍在当前树

- **WHEN** 当前 Git 树包含已完成验收后不再属于 Tenon 产品的测试项目资产
- **THEN** repository hygiene 检查失败并列出相对路径
- **AND** 对应 demo、文档、OpenSpec 主规格与 archive 必须作为一个完整资产族删除。

### Requirement: 当前树 SHALL 不包含外部参考项目身份

受 Git 管理的当前树 SHALL 在路径名和文本内容两个维度对外部参考项目身份保持零明文。相关调研、
演示、报告、Skill 说明和 OpenSpec 归档 SHALL 从当前树删除；仍有产品价值的通用结论 SHALL 改写为
Tenon 自有的中性架构表述。检查 SHALL 使用一份集中式禁止身份表、无路径豁免、无归档豁免，并在
CI、Marketplace、npm 与 Pages 发布前运行。Git 既有提交对象 SHALL 保留，不执行历史重写。

#### Scenario: 历史调研产物仍在当前树

- **WHEN** 受 Git 管理的任一路径或文本包含受禁参考身份
- **THEN** repository hygiene 检查失败并报告脱敏后的相对路径
- **AND** 构建、打包或发布不得继续。

#### Scenario: 维护者需要恢复被删除资料

- **WHEN** 维护者需要审计或恢复被清理的历史调研产物
- **THEN** 从 Git 既有提交对象中显式恢复
- **AND** 恢复内容在重新进入当前树前仍须通过参考身份门禁。

#### Scenario: 检查器自身保存禁止身份

- **WHEN** 维护者扩展禁止身份表
- **THEN** 禁止值以机器构造方式集中保存，检查器源码和测试不重新引入受禁明文
- **AND** 失败消息对命中身份脱敏。
