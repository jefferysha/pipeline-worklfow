# Host Target Plan Center 增量规格

## MODIFIED Requirements

### Requirement: 稳定且零副作用的宿主目标目录

系统 SHALL 以 `host-target-plan/v1` DTO 按当前 `TENON_HOSTS` 的唯一既有顺序返回全部已注册宿主。每个目标 SHALL 包含稳定的 `id`、`kind`、`cli_flag`、`target_scope`、`supported_operations` 与受限能力 token。生成过程 MUST NOT 读取项目、宿主安装/认证状态、网络、环境、机器状态或任何可变 runtime 选择，也 MUST NOT 执行 setup/update。

#### Scenario: 获取完整目录

- **WHEN** 调用 `tenon host-target-plan --json`
- **THEN** 返回 `schema_version: "host-target-plan/v1"` 和按 `TENON_HOSTS` 顺序排列的全部 12 个目标
- **AND** Codex 与 Claude 为 `native`，其余为 `adapter`
- **AND** 文件、网络、环境、host auth、runtime 与 setup/update 写指纹均保持不变

#### Scenario: 拒绝非规范输入

- **WHEN** 未指定 `--json`、重复 `--host|--operation`、只提供其中一项、host 未注册或 operation 不等于 `setup|update`
- **THEN** CLI 非零退出并返回稳定、脱敏错误
- **AND** 不输出部分 JSON，不解释 `.foo`、任意目录或 project custom target

### Requirement: 单目标 setup/update 计划

系统 SHALL 为恰好一个已注册宿主和一个 `setup|update` 生成确定性 `HostTargetPlan`。计划 SHALL 包含 `side_effects: "none"`、目标、operation、结构化可复制命令、有序稳定层级步骤与 notices。native 的外部宿主命令 MUST 从当前 `nativeInstallPlan/nativeUpdatePlan` owner 派生；adapter 只描述当前稳定 release adapter 外层流程，并以执行命令时的当前工作目录作为项目目标。计划不得把粗粒度摘要声称为逐条执行日志。

#### Scenario: native setup/update 与当前 owner 一致

- **WHEN** 对 Codex 或 Claude 请求 setup/update 计划
- **THEN** native marketplace/plugin 命令逐项等于当前真实 owner 的 argv
- **AND** `managed-runtime`、Codex `codex-auth-status` 及 setup-only skills/readiness 的稳定层级与当前编排一致
- **AND** 计划生成不探测真实登录、不执行外部命令、不进入事务/WAL 或 Dashboard handoff

#### Scenario: adapter setup/update

- **WHEN** 对已注册 adapter 请求 setup 或 update
- **THEN** 命令使用 `tenon <operation> --<host> --target .` 的结构化 argv，`.` 明确表示用户执行命令时的当前项目目录
- **AND** setup 展示 `package-assets → managed-runtime → adapter-deploy → bundled-skills → runtime-readiness`
- **AND** update 只展示 `package-assets → managed-runtime → adapter-deploy`
- **AND** 不接收调用方真实 root 或任意路径，也不返回会被 shell 解释为输入重定向的尖括号占位符

#### Scenario: 可复制展示与副作用告知

- **WHEN** 计划返回结构化命令及 `display`
- **THEN** `display` 必须与结构化 argv 的明确 shell 展示契约一致，且所有可复制 token 均来自封闭协议值，不含未转义的空白、控制字符或 shell 元字符
- **AND** UI 明确说明生成计划无副作用、手工执行所示终端命令有真实副作用
- **AND** adapter UI 明确说明命令作用于终端当前目录，用户应先进入目标项目

### Requirement: 严格只读且有界的 Dashboard API

server SHALL 暴露 `GET /api/host-targets` 与 `GET /api/host-target-plan`。请求 MUST 先通过统一 loopback Host 守卫，再完成 exact query 白名单校验，之后才可通过 `PipelineCliRunner` 固定 argv 调用 CLI。stdout 必须是 trim 后的一个完整 JSON 文档，并通过严格 DTO、请求 host/operation 匹配校验。错误不得泄露 stderr、路径或内部异常。

#### Scenario: exact GET catalog/plan

- **WHEN** 合法请求 catalog 或单计划
- **THEN** runner 仅收到规范固定 argv 数组
- **AND** 只有 CLI exit 0、完整 JSON 和严格 DTO 全部通过才返回 `200`
- **AND** endpoint 不要求或接受 project root

#### Scenario: 输入与上游失败关闭

- **WHEN** query 缺失、重复、多余、空、未知，CLI 不可用/非零，stdout 混合输出，DTO 多字段/缺字段/顺序或命令不匹配，或 runner 抛错
- **THEN** 分别返回稳定 `400/503/502` code
- **AND** runner-before-validation 次数为零或一，错误正文不含 stderr、绝对路径、token、env 或原始异常

#### Scenario: 有界并发、共享、缓存与重试

- **WHEN** 同一 canonical key 并发请求
- **THEN** 共享一个 in-flight child
- **AND** 不同 key 的 child 并发/排队行为有明确上限与超时，不可无界阻塞
- **AND** 只缓存有限 key 空间中的成功 `200`
- **AND** 失败不缓存，下一次请求可真实重试，in-flight 在 resolve/reject 后均清理

### Requirement: Dashboard 宿主计划中心

Dashboard SHALL 提供不依赖 project context 的 Host Plan 视图，通过统一 API client/decoder 展示目标、operation 和 copy-only 计划。它 MUST NOT 提供 Run/Execute 或任何写端点，并必须与当前 Dashboard IA、主题 token、i18n 和共享状态边界共存。

#### Scenario: 完整请求状态与陈旧响应抑制

- **WHEN** catalog/plan 处于 loading、empty、network/HTTP/decoder/mismatch error、retry 或 ready
- **THEN** 显示对应可感知状态与恢复操作
- **AND** 选择新 host 清除旧 operation/plan
- **AND** 慢的旧 Promise 不覆盖更新选择，unmount 后不提交状态

#### Scenario: copy-only 可访问交互

- **WHEN** 用户用键盘选择 host、operation 并复制命令
- **THEN** 原生 button、可见 focus、`aria-pressed`、operation group、live status 和 copy success/error 均可用
- **AND** 页面和 API trace 不存在 setup/update 执行控件或 mutation

#### Scenario: Dashboard 视觉与响应式验收

- **WHEN** 在 1440、1024、768、769、390 视口，以 zh/en、light/dark 和 reduced-motion 打开 production Dashboard
- **THEN** Host Plan 与当前所有 rail view 共存、层级清晰、目标/计划单列切换正确
- **AND** 长命令、长宿主名和错误文案不造成 body 横向溢出或不可达控件
- **AND** `design-taste-frontend`、Web guideline 与可访问性复审均为 C0/H0/M0

### Requirement: 当前主线兼容、生成物与许可边界

能力 SHALL additive 地保留当前 `setup`、`update`、host selector、managed runtime/事务、Dashboard、本机 API 与已合并 capability 行为。实现 SHALL 不新增运行时依赖，不复制受限上游源码/测试/文案。源码、测试、CLI/server bundle、Dashboard hashed assets、OpenSpec 与用户文档必须来自同一最终源码并原子提交。

#### Scenario: 普通主线集成

- **WHEN** 把最新 `origin/main` 普通合并到 PR 分支
- **THEN** 4 个已知内容冲突按调用链解决，所有已合并能力与治理证据保留
- **AND** 生成物从最终源码重建而非手工拼接

#### Scenario: 全量兼容与依赖现实

- **WHEN** 运行当前主线全仓、前端、分发、oracle、OpenSpec、hygiene、依赖与真实浏览器门禁
- **THEN** 所有适用门禁通过且无未解决 C/H/M finding
- **AND** 依赖 manifest/lock 未被本 PR 意外改变；任何现存 audit finding 诚实记录并由独立 release Change 修复或阻断发布

#### Scenario: clean-room 许可审查

- **WHEN** 审查源码、测试、文案、依赖与历史研究
- **THEN** 只保留可核验上游引用与独立设计结论
- **AND** 不引入外部参考项目源码或 AGPL 依赖
