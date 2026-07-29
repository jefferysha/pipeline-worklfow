# Related Session Memory：Tenon 现状、排重与架构审计

## 审计快照

- 读取日期：2026-07-28。
- `origin/main`：`2d103e330f847e003ff5909097d892f5722cca04`，与本 Change 起点一致。
- GitHub 当前仅有一个开放 PR：[#5 Overhaul Dashboard UI/UX system](https://github.com/jefferysha/tenon/pull/5)，head `8050656ca8a5846c63a547bc464129345087218f`。
- 本地另有四个功能 worktree 在途：`verification-evidence-composer`（Build）、`host-target-plan-dashboard`（Verify）、`context-bundle-budget-preview`（Build）、`prompt-routing-bypass`（Build）；另有一个未提交的 `dashboard-ui-ux-overhaul-automation`（Build）切片。
- 本审计以源码、测试、分支 diff 和 canonical `tenon list --json` 为证据；未把分支名当成功能事实。

## 当前已有能力

### Kernel `packages/kernel/src/mem`

- 已支持 Claude、Codex、OpenCode、Pi 四类宿主持久会话的 list/search/context/extract/projects。
- `searchMemSessions` 已提供项目 `cwd` 过滤、多 token AND、用户命中三倍权重、相关度与最近时间排序、最多三段摘要。
- `sameProject` 将精确 cwd 和其后代目录视为同一项目；`MemFs` 是只读注入面，不写宿主会话历史。
- `MemSession` 同时含 `filePath`、cwd、完整 session id 等内部字段；这些不能原样穿透到 Dashboard。

### Server `/api/mem/session-link(s)`

- `GET /api/mem/session-link` 已把一个 Change 映射到 `automation_worktree`（空时回落注册 root）下最新会话。
- 选择时优先取最新 Claude/Codex 会话，避免较新的 OpenCode/Pi 占掉恢复能力；只有非可恢复平台时才返回 `resumeCmd: null`。
- `GET /api/mem/session-links` 是最多 50 个 `root/name` pair 的批量版本，单项 fail-soft。
- 两个端点都执行非法 Change 名、注册 root、canonical/legacy Change 存在性和 Host 守卫；恢复命令使用 shell quoting。
- 当前契约是一对一“最近会话恢复”，不是关键词相关会话检索。

### Dashboard `TaskDetail` / `SessionResumeRow`

- `TaskDetail` 仅在 automation 为 running/failed/conflict 时挂载 `TaskConnectionCard`。
- `SessionResumeRow` 自行请求单条 session-link，覆盖静默 loading、found false、可恢复命令、不可恢复平台四条展示路径，并复用中英文 i18n 与复制动作。
- 因挂载条件限制，普通人工 Change 看不到该入口；组件也没有关键词、结果列表、错误重试或多会话选择。
- 前端已有严格 `SessionLink` decoder；批量 client 还按 50 条和 6000 URL 字符分块。

## 真实缺口

1. “最近同 cwd 会话”不等于“与当前任务相关”：没有关键词检索、相关度、历史多结果或显式范围说明。
2. `searchMemSessions` 的 `limit` 只限制最终显示；内部仍以 `WIDE_LIMIT=1_000_000` 枚举候选并全文搜索。Codex 枚举还会通过现有 `readText` 为每个 JSONL 读取整文件以解析首事件。
3. `MemFs.readText` 和 JSONL parser 是整文件同步读取；直接从 HTTP handler 调用现有 search 会让请求缺少候选数、单文件字节、总读取字节和可取消边界。
4. 现有 GET 只返回元数据；若把用户查询和命中原文放进 URL/无 token GET，会扩大浏览器历史、日志、CSRF 式资源消耗和本机会话内容暴露面。
5. `GOAL.md` 仍写着 Dashboard “从未真正接入” mem，但当前 session-link 源码和端到端测试已经接入，属于文档漂移，不能据此判断功能不存在。

## 推荐的最小纵向接缝

### 1. 保留旧端点，新增有界用例

不要改变 `/api/mem/session-link(s)` 的一对一恢复语义。Kernel 新增独立的有界 related-search 用例，复用现有 adapter、`sameProject`、token matching 和 score，但显式接受资源预算：

- 查询 2–128 字符、最多 8 个 token；
- 最近候选最多 100 条，结果最多 8 条；
- 单会话与总读取字节均有硬上限，达到上限返回 `truncated/warnings`，不伪装完整；
- V1 每条只返回一段、最多约 320 字符的用户命中摘要；assistant 原文留作后续显式选择；
- 内部 `filePath` 永不进入协议。

这需要给 `MemFs` 增加真正的 bounded read/size 能力；仅在 server 包一层 `Promise.race` 不能中断同步全文扫描，不是性能门禁。

### 2. 使用受保护的只读 POST 搜索

建议新增 `POST /api/mem/related-sessions/search`，请求 `{ root, name, query, platform? }`。它逻辑只读，但复用现有 POST 的 Host、token、content-type、body budget 与注册 root 守卫，避免敏感 query 进入 URL，并降低任意网页盲触发昂贵扫描的风险。

响应只含安全 DTO：`platform`、完整 session id、可选 title/updated、score、受限 user excerpt、`resumeCmd|null`、`truncated`。恢复命令生成应抽取现有 `resolveSessionLink` 的纯 helper，继续只为 Claude/Codex 生成；不得复制拼接逻辑或为 OpenCode/Pi 猜命令。不存在、预算耗尽、适配器不可用和真正 I/O 错误使用可区分的稳定 code。

### 3. 新建自包含 Dashboard 区块

新增 `RelatedSessionsSection`，在 `TaskDetail` 中对所有 Change 独立挂载；不要塞进只在 automation running/failed 时出现的 `TaskConnectionCard`，也不要把 `SessionResumeRow` 从“一条恢复事实”改成搜索控制器。

区块初始只显示输入与提交按钮，不自动搜索。覆盖 idle、loading、empty、results、typed error、retry；原生 form 支持 Enter，结果恢复/复制按钮有可见 focus 与 accessible name。可复用 `SessionResumeRow` 的展示 token/复制语义，但 API 状态、decoder 和列表逻辑放在新组件及 `src/api`，不反向污染 shared 展示层。所有新文案中英文同步。

## 安全与性能边界

- root 必须来自机器注册表；name 必须是 safe id 且 Change 真实存在；查询 cwd 固定为注册 root，不接受客户端任意 cwd/file path。
- 不返回会话文件路径、完整对话、工具调用、thinking、注入标签或未经截断的 assistant 内容；错误不得回显宿主 home/原始 I/O。
- 只读宿主会话文件，不写索引、不迁移、不缓存到 Change，不把搜索结果登记为治理证据。
- 硬限制候选、结果、query、excerpt、单文件和总字节；超限需可见 `truncated`，不能静默漏报为完整结果。
- 搜索由用户显式提交；切换 Change/查询时忽略旧响应。若继续使用同步 kernel I/O，应避免并发启动多个扫描，并在 Server 层做单请求占用保护。

## 与在途功能逐项排重

| 在途功能 | 已有真实范围 | 为什么不重复 | 机械重叠与处理 |
| --- | --- | --- | --- |
| `verification-evidence-composer` (`fe2067f0`) | Verify 阶段结构化证据草稿、stateless formatter/POST、复制 Markdown | 它编排用户输入的验证草稿，不读取宿主会话 | 同改 `TaskDetail.tsx`、i18n/client；related search 用独立组件和独立 API，rebase 后只保留一个窄挂载点 |
| `host-target-plan-dashboard` (`db167a9f`) | 机器级宿主 setup/update 只读计划与独立导航视图 | 它规划安装目标，不检索项目历史或 TaskDetail | 仅 server 路由装配/i18n 可能同文件；端点、包与 UI 域不同 |
| `context-bundle-budget-preview`（本地 ahead 1） | 对 governed document ledger 做 materialization/budget metadata 预览 | 它处理 Change 文档上下文且故意不返回正文；本功能读取外部宿主会话的受限摘要 | 都需资源预算，但 source of truth、DTO、UI 位置不同；不要复用 compress/document-ledger 类型 |
| `prompt-routing-bypass`（本地 ahead 2） | 持久化 Hook keyword，单轮抑制 router/breadcrumb | 它改变 prompt routing 输出，不读取会话或生成恢复入口 | 仅 server/i18n/client barrel 机械重叠，无语义共享 |
| Dashboard UI overhaul PR #5 (`8050656c`) | 全局视觉、响应式、导航和 shared TaskDetail 展示整理 | 纯前端体系升级，不新增 mem API 或相关会话功能 | 真实冲突点是 `TaskDetail.tsx`；以 semantic tokens + 自包含 section 实现，并在 #5 后 rebase |
| `dashboard-ui-ux-overhaul-automation`（未提交） | 无冲突高频 AppHeader/动效首切片 | 只改项目上下文交互，无后端闭环 | 不依赖其 AppHeader；不创建新全局 token 或导航入口 |

## 结论

`related-session-memory` 是独特且有用户价值的纵向切片：它把已存在但仅 CLI 可用的跨 runtime 内容检索，安全地接到任意 Change 的 TaskDetail。最小安全方案不是扩展现有 session-link 返回多条，而是保留恢复契约，新增受 token 保护、资源有界的 related-search 用例与自包含 Dashboard 区块。

## 开放问题

1. V1 是否接受“只展示用户命中摘要”，把 assistant 摘要作为后续隐私选项？
2. 候选 100、结果 8、单条摘要 320 字符及总读取预算的最终数值应由何种真实会话规模 fixture 定标？
3. 达到预算时是返回部分结果 `200 + truncated`，还是 typed `206/422`；前端需要唯一契约。
4. 完整 session id 是否随结果返回以支持恢复，还是仅由一次性 server-generated `resumeCmd` 暴露？
5. 合并顺序是否固定为先吸收 PR #5，再落 `TaskDetail` 的单行挂载，以减少冲突？
