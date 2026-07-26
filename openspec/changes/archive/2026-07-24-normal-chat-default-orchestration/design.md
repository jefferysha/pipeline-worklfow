# 设计：对话入口的可执行编排

## 入口契约

开发型用户消息通过 Codex `UserPromptSubmit` 进入 router。router 必须区分 discussion / L5 快速修复（不触发）和 routable 开发意图（触发）。后者输出结构化的 `pipeline-dispatch` 指令，明确要求宿主调用主 `pipeline` skill；不能再把“直接执行相关 skill”作为同级绕过路径。

当项目尚未有 `openspec/changes` 时，router 以可信项目根（git root 或 cwd）作为 bootstrap root，仍能给出 default dispatch。主 skill 负责确认或恢复 change，并在 open 阶段建立 OpenSpec。

## 风险分级路由与 simple Track

正常开发对话先区分“任务风险”，再区分 PM/frontend/backend 领域。`simple` 不是“少走几步的
default preset”，而是一个独立的内建 Track，绑定只读打包的 `simple` workflow：

```text
change --change-complete--> verify --verify-pass--> done
   |                          |
   +--scope-expanded------> escalated
                              ^
                  verify-fail-+-- back to change
```

simple 只在出现明确局部信号时可选，例如错别字、文案、注释、单行/单文件值调整、移除未使用 import。
路由数据同时携带否决正则；出现以下任一信号时 simple 得分必须归零，再由完整 Track 竞争：

- 跨模块/多文件/新功能/重构/架构；
- API 或公共契约、schema/migration、数据库；
- 登录/认证/鉴权/权限/安全、并发/事务、依赖升级；
- 生产数据、部署、发布或其他外部副作用；
- 请求没有指出可界定的局部目标。

simple 的高优先级只用于覆盖诸如“.tsx 中改一个 typo”这类同时命中 frontend 的真正局部任务；
否决条件永远比优先级更强。没有 simple 正向信号的通用“实现/修复/修改”进入完整工程轨，不允许因为
缺少领域关键词而静默不触发。

内置 simple workflow 不声明 `openspec_contract: required`，因此不生成 proposal/design/spec/ADR，
但仍创建 canonical Change、绑定 host session，并把真实阶段显示为轻量 Todo。`change` 调用打包的
`simple-task` skill 做边界复核与最小修改；`verify` 调用 `verification-before-completion` 做聚焦验证。
两步都无 review gate。执行中若文件数、风险或契约面超出边界，`scope-expanded` 把轻量 Change 终止为
`escalated`，入口随后创建新的 default Change 并从 open 开始，保留两者关联审计。

## 跨会话恢复隔离

`.pipeline-active` 的存储粒度是项目根，不是 Codex thread/session；因此它只能是恢复**候选**，绝不能是
任意新消息的隐式绑定。恢复决策统一由 UserPromptSubmit 的原始用户 prompt 决定：

```text
SessionStart
  └─ 仅列出活跃 change 候选，不注入 REAL_AGENT_TASK.md

UserPromptSubmit
  ├─ 明确“继续/恢复”或点名候选 → intent: resume（指定 change、真实 phase、该 tasks.md）
  ├─ 多个候选 + 泛化“继续”       → intent: select（入口 skill 要求点名，绝不按 mtime 猜）
  └─ 任意独立新目标               → intent: new（phase: open，不输出旧 change/task）

pipeline root skill
  ├─ new    → 新建独立 default change；活跃旧项只可作为非阻断提示
  ├─ resume → 只恢复 dispatch 指定的 change
  └─ select → 只列候选并等待用户选择
```

`breadcrumb.sh` 与 `router.sh` 必须使用同一份 prompt-intent 判定，防止 router 已经派发新任务、但
breadcrumb 又把旧 `REAL_AGENT_TASK.md` 注入模型的双重污染。若 helper 缺失则 fail-closed：不注入旧上下文。
SessionStart 不读取 `.pipeline-active` 作为当前任务。该约束优先于“最近 mtime”启发式，后者只能用于展示，
不能决定会话归属。

## Skill 分发与安装

`skills/` 是本仓分发源；Codex 安装器在 target 项目的 `.agents/skills/` 中以可审计、幂等的方式暴露 pipeline 与 OpenSpec skills。不得覆盖用户同名的非 pipeline skill；冲突必须 fail-loud。安装后以实际 `SKILL.md` 路径验证每个 required phase skill 可发现。

default 阶段的可执行 skill 真相仍由 manifest 的 phase×profile 表派生，避免把不同 track 的数组重复写入 `default.yaml`。workflow/Dashboard 读取同一 effective resolver 的派生结果；phase dispatch 记录具体被选中的 skill alternative。

`simple` workflow 是插件版本内的内建只读定义，由 kernel 加载，不依赖每个项目预先生成
`.pipeline/workflows/simple.yaml`。同一份定义供 init/check/transition/internal-skill-gate/server/Dashboard
读取；项目文件不能用同名覆盖。`pipeline setup --codex` 随插件一起安装 `simple-task`，
自动更新时与 CLI/server/skills 原子切换。

## OpenSpec 与 Todo

创建 default change 时，OpenSpec 目录结构和最小 proposal/design/tasks 骨架必须可用。主 phase skill 再调用 `openspec-propose` 完成有语义的内容；CLI 不伪造模型产物。

Todo 以 phase graph 为一级结构，并以 `tasks.md` checkbox 为二级结构。原始 `REAL_AGENT_TASK.md` 只作为需求输入，不能单独生成自由文本 Todo。投影缺失时显示明确空态，而不是编造任务。

## 端口

默认 Global Dashboard 监听 loopback `18765`。`PIPELINE_DASHBOARD_PORT=8765` 仍是受支持的显式旧端口覆盖，用于隔离/兼容启动；前端不得硬编码或持久订阅其他端口。文档和测试同时验证默认与覆盖路径。

setup/update 不直接对 marketplace checkout 执行浏览器启动。它们在 runtime 原子激活后，以
`releases/<digest>/payload` 的 server bundle 作为 detached child 启动来源；server 自己负责同端口的
版本复用/抢占。父进程只接受 `GET /api/health` 返回的 `{ok:true, scope:"global"}` 作为成功证据，再打开
浏览器。这样失败不会伪装成成功，也不会让更新回退到可变 cache。用户触发的 setup/手动 update 可以打开页面；
SessionStart 自动更新只刷新服务而不打断用户。

## PM 的 Spec 后 AFK 交接

`automation_eligible` 表示用户显式执行 AFK enqueue 的能力，不能同时解释成“系统可在 Spec 后劫持
Build”。Track policy 额外提供可选的 `auto_enqueue_on_spec_complete`；缺席等价于关闭。内建 PM 显式开启，
frontend/backend 不开启，自定义 Track 可通过 Dashboard 持久化该值。

CLI 与 Dashboard server 都在 canonical transition 已成功提交 `spec -> build` 后调用同一后置用例：它重新
获取 change lock、确认 phase 仍为 Build、复核 Track policy 和全局 automation opt-in，才将 `automation` 从
`off` 原子置为 `queued` 并写入时间。后置失败只报告告警，绝不回滚已成功的流程转换；它也不启动 runner、Docker
或任何外部副作用，后续仍经过 AFK admission 与 L1→L3 治理门。

全局 opt-in 是项目 `.pipeline/automation.json` 的两层显式开关：`enabled=true` 且
`default_opt_in=true`。二者任一缺失或为 false 都不自动挂队；仅构造 SDK、命中 PM policy 或
change 仍为 `automation=off` 都不能伪造授权。Dashboard 的 AFK 设置卡直接读写该总开关。

## 实施边界与风险控制

```text
normal developer message
        |
        v
router.sh -- structured pipeline-dispatch --> pipeline root skill
                                                  |
                         +------------------------+-----------------------+
                         |                                                |
                         v                                                v
              default change/OpenSpec skeleton                  phase-specific skill bundle
                         |                                                |
                         +-------------------+----------------------------+
                                             v
                                tasks.md -> phase Todo projection -> API/UI
```

Router 是触发和上下文载体，不假装自己可以调用宿主的 Skill 工具；结构化 dispatch、项目可发现的
`.agents/skills`，以及根 `pipeline` skill 的阶段转发共同构成可执行闭环。这样可避免仅靠提示词时的
“看起来要求走 skill、实际没有入口”的断裂。

## 文档证据链：从提示约定升级为可执行契约

default workflow 不再只把 OpenSpec、Superpowers 和 ADR 写在 phase skill 的自然语言步骤中。每个
change 维护一个独立的 `.pipeline-documents.json` 账本；它不扩展 `.pipeline.yaml` 的公共字段集，避免
破坏已有 CLI/API/旧 change 的兼容性。账本中的每条记录包含：文档 kind、项目根相对路径、内容 SHA-256、
产出 skill、登记时间，以及各后续 phase 对该精确 hash 的回读证明。

```text
OpenSpec / Superpowers / ADR 文件
             │ record（校验普通文件、非空、项目内、产出 skill）
             ▼
  .pipeline-documents.json（path + hash + producer + read receipts）
             │                              │
             │ transition/check             │ dashboard snapshot
             ▼                              ▼
  phase 出口强制校验                  产物链与缺失/过期回读可见
```

default 的最低文档契约如下；任一 required 文档缺失、被改写后未重新登记、或后续 phase 未读取当前 hash，
`pipeline check` 与 `pipeline transition` 都会明确失败，而不会把它当作“已经按说明执行”。

| 出口 phase | 必须已登记的产物 | 必须已回读的上下文 |
| --- | --- | --- |
| open | `proposal`、OpenSpec `design`、`tasks` | 无 |
| explore | `superpower-design`、`adr` | proposal / design / tasks |
| spec | `delta-spec`、`superpower-plan`、plan | 上述全部设计上下文 |
| build | 无新文档 | proposal / design / tasks / delta spec / design RFC / ADR / plan |
| verify | `verification-report` | build 所用的完整文档集 |
| ship | `applied-spec`（同步后的主 spec） | 完整文档集 + verification report |

`record` 和 `read` 都由 `pipeline document` 子命令在同一 change 锁内完成。`record` 会验证路径、哈希和
producer；`read` 会重新哈希并写回 receipt。故文档一旦变动，旧 receipt 自动失效，后续 phase 必须重新读。
它不能把宿主的 Skill API 变成可由 CLI 直接调用的能力，但会通过安装的 PostToolUse 记录校验调用证据；缺
证据时会 fail-loud 并给出需要调用/安装的具体 skill，而不是静默相信任意 `--producer` 字符串。

对未来自定义 workflow，增加显式 `openspec_contract: required` 选项。启用它的 workflow 必须保留标准
七阶段和可达的标准阶段边，因而复用同一份账本与出口规则；任意阶段重排、删改或自行定义的 workflow
不能伪装成 OpenSpec 合规，Dashboard 会如实标记为 custom / 未受 OpenSpec 文档契约治理。工作台创建的
“OpenSpec workflow”模板默认启用该选项。

## Codex Superpowers 可发现性

Claude plugin cache 中“已安装 superpowers 插件”不等于 Codex 可以调用其中某个 skill。Codex adapter
安装器会把所需 Superpowers skill 以冲突安全的项目级链接暴露到 `.agents/skills`，并将逻辑名
`superpowers:<name>` 映射到宿主可发现的 `<name>`。Doctor 报告会把“仅 Claude cache 可见”和“当前 Codex
target 可发现”区分开，不能再仅凭插件目录名报绿。

项目根只接受显式 `PIPELINE_PROJECT_ROOT`、当前目录的项目标记，或 Git worktree root。不得向任意父目录
寻找 `openspec/changes`，否则在 `/tmp/child` 等路径会错误接管父项目的 change 和 review marker。

```coverage
touches:
L1_api:      filled -> packages/server/src/snapshot.ts 和 packages/server/src/types.ts
L2_data:     waived -> 不引入持久化数据模型，Todo 从现有 tasks.md 只读投影
L3_rules:    filled -> router dispatch、artifact producer 和 manifest effective-skill 规则
L4_state:    filled -> default init 的 OpenSpec 骨架、simple 内建 workflow、可信项目根和 phase Todo 生命周期
L5_errors:   filled -> simple 否决/升级、安装冲突 fail-loud、无效端口回退到 18765、受管服务健康检查失败明确报错、投影缺失明确空态
L6_security: filled -> root boundary 防止跨项目 marker/change 读取；端口固定 loopback
L7_perf:     waived -> 只增加小型 tasks.md 读取，并纳入现有 snapshot fingerprint
L8_deps:     waived -> 无新增第三方依赖
L10_terms:   filled -> 本设计中的 dispatch、effective skill、Todo projection 术语
```

## 已执行验证

- `npx vitest run packages/server/src/port.test.ts packages/cli/src/workflow-skill-orchestration.integration.test.ts`：8 项通过。
- `tools/test-hooks.sh`：273 项通过；`tools/test-adapters.sh`：245 项通过。
- kernel/server/CLI 定向回归 48 项通过；Dashboard `TaskDetail` 39 项通过；web typecheck、server/web/CLI bundle 均通过。
- 实际启动验证：默认 `127.0.0.1:18765/api/health` 可用；以 `PIPELINE_DASHBOARD_PORT=8765` 启动时，同一端口同时返回 Dashboard HTML 与 API health；Vite 以 `PIPELINE_DASHBOARD_DEV_PORT=5174` 启动时正确代理至 18765。

## 验收

1. 无 `openspec/changes` 的开发消息得到 default pipeline dispatch，普通讨论不触发。
2. Codex target 可发现全部 pipeline/OpenSpec skill，且安装幂等、冲突安全。
3. default 初始化后具备 OpenSpec 骨架；OpenSpec skill 分派和每个 phase 的有效 skill 可观测。
4. Todo 投影显示七阶段和 `tasks.md` 子项，而非 `REAL_AGENT_TASK.md` 的通用计划。
5. 18765 默认与 8765 override 都能通过 server/client 端口契约测试；setup/update 只能在受管服务健康检查成功后报告可用或打开页面。
6. 旧 `spec` change 存在时，另一 Codex 会话输入“调研一个新的工具项目”必须派发 `intent: new` / `phase: open`，不得注入旧 change、旧 tasks 或 `REAL_AGENT_TASK.md`；明确“继续 <change>”仍恢复同一 change。
