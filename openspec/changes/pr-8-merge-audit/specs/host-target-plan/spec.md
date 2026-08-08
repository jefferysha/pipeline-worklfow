# Host Target Plan Center 增量规格

## MODIFIED Requirements

### Requirement: 稳定且零副作用的宿主目标目录

系统 SHALL 以 `host-target-plan/v1` DTO 按当前 `TENON_HOSTS` 的唯一既有顺序返回全部已注册宿主。每个目标 SHALL 包含稳定的 `id`、`kind`、`cli_flag`、`target_scope`、`supported_operations` 与受限能力 token。生成过程 MUST NOT 读取项目、宿主安装/认证状态、网络、环境、机器状态或任何可变 runtime 选择，也 MUST NOT 执行 setup/update。

#### Scenario: 获取完整目录

- **WHEN** 调用 `tenon host-target-plan --json`
- **THEN** 返回 `schema_version: "host-target-plan/v1"` 和按 `TENON_HOSTS` 顺序排列的全部已注册目标（当前为 12 个）
- **AND** Codex 与 Claude 为 `native`，其余为 `adapter`
- **AND** 文件、网络、环境、host auth、runtime 与 setup/update 写指纹均保持不变

#### Scenario: 不接受自定义目标

- **WHEN** 请求一个不在 `TENON_HOSTS` 中的宿主 ID
- **THEN** 命令以非零状态和稳定、脱敏错误拒绝
- **AND** 不输出部分 JSON
- **AND** 不把任意 `.foo`、目录名或 project custom target 解释为宿主

#### Scenario: 拒绝非规范输入

- **WHEN** 未指定 `--json`、重复 `--host|--operation`、只提供其中一项或 operation 不等于 `setup|update`
- **THEN** CLI 非零退出并返回稳定、脱敏错误
- **AND** 不输出部分 JSON

### Requirement: 单目标 setup/update 计划

系统 SHALL 为恰好一个已注册宿主和一个 `setup|update` 生成确定性 `HostTargetPlan`。计划 SHALL 包含 `side_effects: "none"`、目标、operation、结构化可复制命令、有序稳定层级步骤与 notices。native 与 adapter 步骤 SHALL 分别与当前真实 setup/update 命令编排一致；native 的外部宿主命令 MUST 从当前 `nativeInstallPlan/nativeUpdatePlan` owner 派生。adapter 只描述当前稳定 release adapter 外层流程，不执行或解析脚本，并以执行命令时的当前工作目录作为项目目标。计划不得把粗粒度摘要声称为逐条执行日志。

#### Scenario: native setup 计划

- **WHEN** 调用 `tenon host-target-plan --host codex --operation setup --json`
- **THEN** 返回 Codex 目标、可复制的 `tenon setup --codex` 命令与当前 `nativeInstallPlan` owner 的有序 argv
- **AND** `side_effects` 等于 `none`
- **AND** 计划包含 `managed-runtime` 与 setup-only `bundled-skills`、`runtime-readiness`
- **AND** 计划生成不探测真实登录、不执行外部命令、不进入事务/WAL 或 Dashboard handoff

#### Scenario: native update 计划

- **WHEN** 为 Codex 或 Claude 请求 update 计划
- **THEN** 外部宿主命令逐项等于当前 `nativeUpdatePlan` owner 的 argv
- **AND** 追加稳定的 `managed-runtime` 层级
- **AND** 不包含仅由完整 setup 调用的 `bundled-skills` 或 `runtime-readiness`

#### Scenario: Codex 认证状态与引导

- **WHEN** 为 Codex 请求 setup 或手工 update 计划
- **THEN** 在 `managed-runtime` 后返回 `codex-auth-status` 步骤，命令为 `codex login status`
- **AND** setup 的 `bundled-skills` 与 `runtime-readiness` 位于该步骤之后
- **AND** 返回稳定的认证引导 notice，但计划生成不读取真实登录状态
- **AND** Claude 和 adapter 计划不包含 Codex 认证步骤或 notice

#### Scenario: adapter update 计划

- **WHEN** 为已注册 adapter 请求 update 计划
- **THEN** 命令使用 `tenon update --<host> --target .` 的结构化 argv
- **AND** `.` 明确表示用户执行命令时的当前项目目录
- **AND** 只展示 `package-assets → managed-runtime → adapter-deploy`
- **AND** 不包含仅由完整 setup 后续执行的 `bundled-skills` 或 `runtime-readiness`
- **AND** 不接收调用方真实 root 或任意路径，也不返回会被 shell 解释为输入重定向的尖括号占位符

#### Scenario: adapter setup 计划

- **WHEN** 为已注册 adapter 请求 setup 计划
- **THEN** 命令使用 `tenon setup --<host> --target .` 的结构化 argv
- **AND** 按 `package-assets → managed-runtime → adapter-deploy → bundled-skills → runtime-readiness` 展示五个稳定层级
- **AND** `.` 明确表示用户执行命令时的当前项目目录
- **AND** 不接收调用方真实 root 或任意路径，也不返回尖括号占位符

#### Scenario: 非法操作

- **WHEN** operation 缺失或不等于 `setup|update`
- **THEN** 命令以非零状态和稳定、脱敏错误拒绝
- **AND** 不生成部分计划

#### Scenario: 可复制展示与副作用告知

- **WHEN** 计划返回结构化命令及 `display`
- **THEN** `display` 必须与结构化 argv 的明确 shell 展示契约一致，且所有可复制 token 均来自封闭协议值，不含未转义的空白、控制字符或 shell 元字符
- **AND** UI 明确说明生成计划无副作用、手工执行所示终端命令有真实副作用
- **AND** adapter UI 明确说明命令作用于终端当前目录，用户应先进入目标项目

### Requirement: 严格只读 Dashboard API

server SHALL 暴露 `GET /api/host-targets` 与 `GET /api/host-target-plan`。请求 MUST 先通过统一 loopback Host 守卫，再完成 exact query 白名单校验，之后才可通过 `PipelineCliRunner` 固定 argv 调用 CLI。stdout 必须是 trim 后的一个完整 JSON 文档，并通过严格 DTO、请求 host/operation 匹配校验。错误不得泄露 stderr、路径或内部异常。

#### Scenario: 获取 catalog

- **WHEN** 对 `/api/host-targets` 发起无查询参数的合法 loopback GET
- **THEN** runner 仅收到固定 argv `["host-target-plan", "--json"]`
- **AND** 只有 CLI exit 0、完整 JSON 和严格 catalog DTO 全部通过才返回 `200`

#### Scenario: 获取单目标计划

- **WHEN** 对 `/api/host-target-plan?host=codex&operation=update` 发起合法 loopback GET
- **THEN** runner 仅收到固定 argv `["host-target-plan", "--host", "codex", "--operation", "update", "--json"]`
- **AND** 只有 CLI exit 0、完整 JSON、严格 plan DTO 和请求 host/operation 匹配全部通过才返回 `200`
- **AND** endpoint 不要求或接受 project root

#### Scenario: 查询参数失败关闭

- **WHEN** query 存在缺失、重复、多余、空、未知 host 或未知 operation
- **THEN** 返回 `400 HOST_TARGET_QUERY_INVALID`
- **AND** 不调用 `PipelineCliRunner`

#### Scenario: CLI 不可用

- **WHEN** server 未配置可用的 CLI runner
- **THEN** 返回 `503 HOST_TARGET_PLAN_UNAVAILABLE`
- **AND** 不泄露路径、环境或内部配置

#### Scenario: CLI stdout 或 DTO 无效

- **WHEN** CLI 非零退出、runner 抛错、trim 后的 stdout 不是恰好一个完整 JSON 文档，或 DTO 多字段、缺字段、顺序、命令、host 或 operation 不满足 v1 契约
- **THEN** 返回稳定的 `502 HOST_TARGET_PLAN_INVALID` 或已声明的 unavailable code
- **AND** 不向客户端透传 stderr、绝对路径、token、env 或原始异常

#### Scenario: Host header 保护

- **WHEN** 请求未通过现有 loopback Host header 守卫
- **THEN** 在进入 HTML、cadence、catalog 或 plan 路由前沿用统一 `403` 拒绝行为
- **AND** runner 调用次数为零

#### Scenario: 有界并发、共享、缓存与重试

- **WHEN** 同一 canonical key 并发请求
- **THEN** 共享一个 in-flight child
- **AND** 不同 key 的 child 并发上限明确，单请求 deadline 从 enqueue 开始计算且默认不超过 10 秒
- **AND** 已过期的排队 item 不启动 child，不可因 queue wait 逃逸 timeout
- **AND** 只缓存有限 key 空间中的成功 `200`
- **AND** 失败不缓存，下一次请求可真实重试，in-flight 在 resolve/reject 后均清理

### Requirement: Dashboard 宿主计划中心

Dashboard SHALL 提供无需 project context 即可访问的 Host Plan 视图，通过统一 API client/decoder 展示目标卡、native/adapter、scope、能力、setup/update operation 和 copy-only 只读计划。所有用户可见文本 SHALL 同时提供中文与英文翻译。页面 MUST NOT 提供 Run/Execute、setup/update 执行入口或任何写端点，并 SHALL 清楚说明计划生成不会安装或更新，只有用户复制并在终端运行命令才会产生副作用。推荐宿主/操作与手动候选 SHALL 使用一致、整齐的 master-detail 层级，并必须与当前 Dashboard IA、主题 token、i18n 和共享状态边界共存。

#### Scenario: 初始加载与选择

- **WHEN** 用户进入 Host Plan 视图
- **THEN** 先显示可感知的 catalog loading 状态
- **AND** catalog 成功后显示可键盘操作的目标卡和具名 operation button group
- **AND** 在目标与操作同时选定前显示 awaiting-selection 空态

#### Scenario: 计划预览

- **WHEN** 用户选择目标和 setup 或 update
- **THEN** 显示 plan loading，随后展示命令、步骤、notice 与 `side_effects: none` 只读提示
- **AND** 只提供复制命令按钮，不提供 setup/update 执行按钮或 mutation

#### Scenario: 空目录与恢复

- **WHEN** catalog 返回零目标
- **THEN** 显示明确 empty 状态与 retry 操作

#### Scenario: catalog 或 plan 错误

- **WHEN** 请求、HTTP 或 DTO decoder 失败
- **THEN** 显示局部错误与 retry 操作
- **AND** 不保留可能误导的陈旧计划

#### Scenario: 可访问的键盘交互

- **WHEN** 键盘用户依次聚焦目标、operation 与复制按钮并按 Enter 或 Space
- **THEN** 原生 button、可见 focus ring、`aria-pressed`、operation group、live status 和 copy success/error 均可用

#### Scenario: 响应式布局

- **WHEN** 视口从桌面收窄到移动宽度
- **THEN** 目标网格与计划区域按 900/769/768/390 的既定 breakpoint 变为 master-detail、两列后置 detail 或单列
- **AND** 长命令、长宿主名和错误文案不造成 body 横向溢出或不可达控件

#### Scenario: 用户首次进入 Host Plan

- **WHEN** 页面开始加载 catalog 与 detection
- **THEN** 标题说明“自动检测并预览，不在页面执行”
- **AND** ready 后突出推荐上下文、为何推荐以及用户是否需要在终端运行命令。

#### Scenario: 完整请求状态与陈旧响应抑制

- **WHEN** catalog/plan 处于 loading、empty、network/HTTP/decoder/mismatch error、retry 或 ready
- **THEN** 显示对应可感知状态与恢复操作
- **AND** 选择新 host 清除旧 operation/plan
- **AND** 慢的旧 Promise 不覆盖更新选择，unmount 后不提交状态

#### Scenario: copy-only 网络边界

- **WHEN** 用户选择 host、operation 并复制命令
- **THEN** 页面和 API trace 只包含 catalog/plan GET
- **AND** 不存在 setup/update 执行控件、POST、PATCH、DELETE 或其他 mutation

#### Scenario: Dashboard 视觉与响应式验收

- **WHEN** 在 1440、1024、768、769、390 视口，以 zh/en、light/dark 和 reduced-motion 打开 production Dashboard
- **THEN** Host Plan 与当前所有 rail view 共存、层级清晰、目标/计划单列切换正确
- **AND** 长命令、长宿主名和错误文案不造成 body 横向溢出或不可达控件
- **AND** `design-taste-frontend`、Web guideline 与可访问性复审均为 C0/H0/M0

### Requirement: 向后兼容与许可边界

能力 SHALL additive 地保留当前 `setup`、`update`、host flags、host selector、managed runtime/事务、Dashboard、本机 API 与已合并 capability 行为。实现 SHALL 不新增外部运行时依赖，不复制受限上游源码、测试、文案或文件结构，包括 Comet 或受 AGPL-3.0 约束的 Trellis 内容。源码、测试、CLI/server bundle、Dashboard hashed assets、OpenSpec 与用户文档必须来自同一最终源码并原子提交。

#### Scenario: 既有命令兼容

- **WHEN** 运行现有 setup/update、host selector、managed runtime、事务/WAL、Dashboard handoff 与 CLI bundle 门禁
- **THEN** 既有显式单宿主行为和已合并 capability 保持通过
- **AND** Host Plan 只增加只读预览，不改变真实执行路径

#### Scenario: 普通主线集成

- **WHEN** 把最新 `origin/main` 普通合并到 PR 分支
- **THEN** 4 个已知内容冲突按调用链解决，所有已合并能力与治理证据保留
- **AND** 生成物从最终源码重建而非手工拼接

#### Scenario: 全量兼容与依赖现实

- **WHEN** 运行当前主线全仓、前端、分发、oracle、OpenSpec、hygiene、依赖与真实浏览器门禁
- **THEN** 所有适用门禁通过且无未解决 C/H/M finding
- **AND** 依赖 manifest/lock 未被本 PR 意外改变；任何现存 audit finding 诚实记录并由独立 release Change 修复或阻断发布

#### Scenario: clean-room 审查

- **WHEN** 审查源码、测试、文案、依赖与历史研究
- **THEN** 只保留带固定 URL/SHA 的可核验上游引用与独立设计结论
- **AND** 不引入任何外部参考项目的源码、测试、文案、文件结构或受限许可证依赖，包括 Comet/Trellis 代码或 AGPL 依赖
