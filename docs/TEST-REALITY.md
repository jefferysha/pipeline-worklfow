# TEST-REALITY — 测试真实性审计（GOAL C9/C10）

> 向 Trellis 学习：`trellis-check` 跑真实工具链而非自评。本仓每条功能的收编门以**真实证据**为准。
> 本文件登记每层测试「真 or mock」与覆盖缺口，缺口显式登记、不静默留白（2026-07-07 起维护）。

## 真实证据链（三道，收编门必过）

| 层 | 文件 | 真实性 | 驱动什么 |
|---|---|---|---|
| **真 fs 集成** | `packages/cli/src/integration.test.ts` | 🟢 真 | `buildProgram` + 真 `createStateStore/createFlowEngine/loadManifest/createHistoryWriter` + 真临时目录，断言真实落盘的 .pipeline.yaml/JSONL/marker 字节；真子进程跑 dist bundle --help |
| **golden-oracle 双跑** | `tools/oracle/run.sh` | 🟢 真 | 真跑老内核 `pipeline-state.sh`(bash) vs 新 CLI(node)，stdout+exit+落盘三面逐字 diff |
| **bundle 冒烟** | `tools/test-bundle.sh` | 🟢 真 | 真起子进程跑编译产物 init→get→transition→history 全程 |
| **hook 脚本** | `tools/test-hooks.sh` | 🟢 真 | 真 bash 跑 gate/breadcrumb/session-start/statusline，真 marker 文件三态 |
| **kernel 单元** | `kernel/src/state/*.test.ts`、`flow/*.test.ts` | 🟢 真 | 真解析/真 mkdir 锁/真 base64/真 fixture 往返——本就无 mock |

## mock 层（快速回归，**不单独构成收编证据**）

| 文件 | 性质 | 为何保留 | 真实对位 |
|---|---|---|---|
| `cli/src/commands/*.test.ts` | 🟡 mock（mockStore/mockFlow） | 毫秒级定位命令层逻辑分支、错误路径穷举 | 每条命令在 integration.test.ts 有真 fs 对位用例 |
| `cli/src/program.test.ts` | 🟡 mock | commander 装配与 exit 映射的快速回归 | integration 走同一 buildProgram 真路径 |
| `cli/src/test-support.ts` | mock 工厂 | 上述 mock 层的基座 | — |

**规则（GOAL C9）**：新增命令/子系统 → 必须同时进 integration.test.ts 真 fs 面；只有 mock 单测 = 未收编。

## 真 fs 集成覆盖矩阵（GOAL C10 全量要求）

| 命令 | happy path | 关键错误路径 | 跨命令串联 |
|---|---|---|---|
| init | ✅ 落盘字段序 + `--workflow <name>` 真加载校验后种 phase=steps[0].id（init-workflow.integration.test.ts 6 例，2026-07-08 whole-branch review 补：此前无支持命令能把 change 摆到自定义 workflow 首个 step 上） | ✅ workflow 未找到/非法（校验失败）均 exit 1 且不落盘半成品 change | ✅ 全程起点；`--workflow` 落地的 change 可直接被 internal-skill-gate/transition 消费，链式验证见同文件 |
| get | ✅ 读回 init 值 + 未设字段忠实 null + 未知字段空行 | ✅ grep-miss | ✅ |
| set | ✅ 写+history | ✅ 四闸拒写字节不变 | ✅ |
| set-many | ✅ 真原子写+字段序 | — | — |
| cas | ✅ 匹配写入 | ✅ 不匹配 exit 3 | ✅ |
| transition | ✅ 改相位+marker+history+全副作用（#14，见 transition-effects.integration.test.ts 17 例） | ✅ 非法 exit 1 + 12 条前置校验路径 | ✅ 喂足真实前置的七相位全程 |
| workflow 自定义引擎（GOAL 清单 E） | ✅ 解析/校验/DAG/guard 各自单测（parse.test.ts/validate.test.ts/skillDag.test.ts/stepGuard.test.ts）+ loadWorkflow 真 fs 5 例（含 E5 校验 fail-loud 2 例）+ 真实 step 间转换（transition-custom-workflow.integration.test.ts 3 例）+ gate.sh 委托真 bash 子进程（internal-skill-gate-hook.integration.test.ts 6 例）+ migrate-workflow（migrateWorkflow.test.ts）+ init --workflow 首个 step 落点全链路（init-workflow.integration.test.ts 6 例） | ✅ 循环依赖/悬空引用/死路 step 保存时拒绝（E5）+ 非法 event/guard 不满足运行时拒绝 | ✅ init --workflow → internal-skill-gate → transition 全程走真实支持命令，无需手改状态文件（2026-07-08 whole-branch review 补，见 G13 及 init 行） |
| inbox TTL 分级 | ✅ inbox-ttl.integration.test.ts 7 例（真 mtime + 分级 300/1800s） | ✅ 边界 age>TTL | — |
| task lifecycle | ✅ task.integration.test.ts 14 例（真依赖图/级联/canonical，含物理归档节点反查）+ 走 buildProgram 1 例 | ✅ | ✅ add-dep→children→remove |
| manifest 全派生 | ✅ manifest-derive.test.ts 18 例（真读 templates/manifest.yaml → 真派生，改 yaml 即变） | ✅ 未知 track fail-loud | — |
| living-spec | ✅ spec.integration.test.ts 14 例（真枚举 openspec/specs + 真落 spec_scope 标量 + 真 inject-jsonl cat/目录展开）+ 走 buildProgram 1 例 | ✅ | — |
| session | ✅ session.integration.test.ts 9 例（真落 .pipeline-active + monorepo 真路由）+ 走 buildProgram 1 例 | ✅ 缺 change exit1 / degraded 不炸 | — |
| router hook | ✅ test-hooks.sh section9 32 断言（真跑 router.sh：三 Track 选对 + breadcrumb 注入 + 缓存单源实证 + 命中缓存零 node spawn shadow 证明） | ✅ patterns 缺 exit0 不阻断 | — |
| sync / uninstall | ✅ sync-uninstall.integration.test.ts 16 例（真装文件/真写 .pipeline-owned.json/真删自己装的/真保留 user-modified/真 scrub 写回）+ 走 buildProgram 2 例 | ✅ dry-run 不动盘 | — |
| PostToolUse 四 hook | ✅ test-hooks.sh section10 64 断言（真跑：confirm-clear 真清 marker + decision/skill 真 append JSONL + 转义硬测 + interactive-gate 真注入姿态+硬门） | ✅ 无 change 不写/归档跳过/fail-open | — |
| mem 跨 runtime | ✅ mem.integration.test.ts 12 例（真建 Claude/Codex/Pi fixture session → nodeMemFs 真读真解析 → 真检索评分排序/cwd 作用域/聚合） | ✅ OpenCode 降级 no-op（诚实待补） | — |
| dashboard server | ✅ packages/server 38 例（17 真 node:http 请求 + 真 crypto token + 真 SIGTERM 版本抢占 + 2 bin 级真进程 smoke） | ✅ POST 无 token 真 401 / Host 守卫 403 | — |
| channel worker 总线 | ✅ channel.integration.test.ts 12 例（真 append events.jsonl + 真重建 registry/forum + seq 无空洞 + **barrier 隔离红线**：跑完 cwd 零 openspec/门 marker mtime 不变） | ✅ send 三态 | ✅ create→send→messages |
| 前端 dashboard-app | ✅ 71 真 render 测试（jsdom 真 render DOM + 真拖拽 fireEvent + SSE 真 EventSource stub emit→组件更新）+ 3 真 server HTTP 集成 | ✅ transition 失败呈现/非法 no-op | ✅ 收件箱默认→看板→设置 |
| server 服务 SPA | ✅ server.test.ts +1（真起 server webRoot → GET / 真返 SPA index.html+token 注入 + /assets/* 真供给 + 路径穿越防护） | ✅ 穿越 !=200 | — |
| loops 治理 | ✅ loops.integration.test.ts 15 例（真建 loops.yaml/progress.md → 真裁决 R1-R11 verdict + L1 report-only/L3 unattended + schema 拒非法 exit3） | ✅ budget 超限 kill | ✅ list→enforce→status |
| tap 流量代理 | ✅ packages/tap 116+ 例（13 真 socket + bedrock CRC32 交叉校验 + **真 crypto 本地 CA 真自签真 X509 验签 + 真 TLS MITM 终结解密**(node v24 真跑 0 skip) + 13 runtime clients；源码级扫描断言 certs 零 outbound + CA 私钥 0600）+ doctor tap 灯真跑 + **#34-wire（iteration-30）**：daemon.ts 真接 CertificateAuthority.fromDir→serveForward({ca})（2 真 TLS MITM 例，走 daemon 装配非直调）+ launch.ts 真装配 detectTarget/reverseEnvMap/forwardEnvMap（7 例，含真绑端口+真转发）+ forward-proxy 响应体真接 decodeBedrockEventstreamEvents（1 例，非流式装配 converse body）+ **全新 ws-proxy.ts**：WsFrameAccumulator 增量帧合并 + wss:// 真中继（CONNECT→TLS MITM→upgrade→真握手透传→reconstructWsRequestBody/ResponseBody 首次接活，7 例，含 prompt-bearing 门控/capture OFF 门控）+ security.ts InterceptEntry.tls 供 doctor「正在解密」披露（2 例） | ✅ 默认 OFF 真不监听 / capture OFF 不解密 / 8766 隔离 / forward 缺 ca 拒绝而非盲隧道误导 | ✅ `pipeline tap start` CLI（见下）|
| automation AFK | ✅ packages/automation 113+ 例（纯逻辑真状态机/race idle·grace·abort/boundedTail 64KiB/git 双挂载/merge-back 冲突判定 + 真 kernel fs 集成 + **真 git 集成**：worktree add/remove、merge-back 干净交付+冲突留现场、barrier 派生+drift）+ **#29-wire（iteration-30）**：createDockerRunChange 真接 createLifecyclePorts+runChangeInSandbox，dockerRunChange.integration.test.ts 3 例真跑 sandcastle:test 镜像（L3 真容器+真 worktree+真 merge-back+真 barrier build_sha；L1 report-only 真验证不 merge）；docker.integration.test.ts/container.integration.test.ts 原 4 处 honest-skip 中 2 处（非 token 门控）已真跑通过 + **RunChangeConfig.extraEnv（iteration-31）**：真流到 docker run -e argv（dockerRunChange.test.ts 2 例 fake exec 断言 + lifecycle.test.ts 1 例），此前无任何通道能把凭证/代理地址传进沙箱是真实遗漏，本轮真 token 验证时发现并补齐 | ✅ L1→paused/L3→merged/conflict 留现场（真 SyncError→worktree 不清+preserved_path） | ✅ enqueue→scan→run（真容器）+ **真 token 全链路（iteration-31）**：容器内自起 tap reverse proxy（放弃 host.docker.internal 方案，该方案在本环境对宿主监听端口真实静默丢包，已用真 http server+真 docker run 探测证实）→ claude CLI 走代理连真 api.anthropic.com，tap trace_store 真记录 4 条完整请求（含真实 User-Agent/系统提示词/Bearer 头）——证明代理路由约束成立；该次提供的 token 被 Anthropic 真服务端拒绝（401 Invalid bearer token，未耗真实 API 额度），故 agent 编码成功这一步本身仍未验证，待有效凭证 |
| 上下文压缩 | ✅ handoff.integration.test.ts 7 例（真建长文档 → 真压缩 → 断言压缩率≥25% + 决策/约束保留 + 样板去除）；确定性零 LLM 可 oracle | ✅ 无文档/缺 change | ✅ 达 build 相位 handoff |
| auto-transition advance | ✅ advance.integration.test.ts 6 例（真推进到复核相位即停 + guard 不过不推进 + dry-run 不改盘）；**HITL 红线**：verify/ship guard 预备仍停 verify、硬门 --through-gates 也不跨 | ✅ guard-fail exit2 | ✅ 多步推进 |
| 适配器 conformance | ✅ tools/test-adapters.sh 58 断言（真跑各适配器归一 canonical 决策 + 反例哨兵 + **真适配器变异测试**：改坏 codex veto 立即抓红、还原回绿）；claude/codex(A)/cursor(B) active | ✅ 判别力自证 | — |
| loop 预算/熔断 | ✅ loops-budget.integration.test.ts 16 例（真建 run-log → 真熔断 ok/warn/tripped + 成本估算 within/over）+ 真 bundle e2e | ✅ 超阈值 tripped exit2 | ✅ budget→cost |
| loop 漂移/审计 | ✅ loops-drift.integration.test.ts 20 例（7 维漂移各一 + loop-ready 评分 ready/not-ready + --json/--loop）| ✅ 漂移 warn exit1 | ✅ list→drift→audit |
| Trellis scaffold | ✅ scaffold.integration.test.ts 14 例（真铺分层空文档集 + 三态 skip/overwrite/append 真删真补真保留 + resolve-workflow 真读源 + removeHash 真改 .pipeline-owned.json）| ✅ spec-dir 冲突 exit2 | ✅ scaffold web/cli/lib |
| transition 单源 | ✅ transition-table.test.ts 40 例（kernel 单源事件表/前置/副作用全量）+ cli/server 接线断言（引用同一对象）；**oracle 双跑 0 不一致=行为逐字保持铁证** | ✅ | ✅ cli+server 共消费 |
| loop 毕业制 | ✅ loops-graduation.integration.test.ts 16 例（真建不同就绪/漂移/熔断态 → 真升降档裁决 + 跨级拒 + --confirm 真改 autonomy_level）| ✅ 跨级 exit2 | ✅ graduate→level set |
| channel 进程层 | ✅ channel-process.integration.test.ts 11 例（真 fork cat 桥接 + 真 spawn 预算 + 真 SIGTERM kill + 真 OS-liveness 判活判死 + 真 prune）+ process.test.ts 4 真 fork node；**架构红线**：跑完零 openspec/门 marker 不变 | ✅ | ✅ spawn→run→kill→prune |
| server afk/traffic 数据端 | ✅ server 14 真 HTTP（afk 泳道+调度器灯 / traces sessions/records）+ 前端 13 真 render（AfkPanel/TrafficPanel/AdvancedPanel capabilities 驱动）| ✅ 缺 session 400 / 未装占位 | — |
| afk CLI 命令 | ✅ afk.integration.test.ts 6 例（真 automation SDK：enqueue 真落 automation=queued + queued_at / PM 轨真拒 exit3 / scan 真判就绪 / run 空队列诚实报告）+ **afk-run.integration.test.ts 4 例（iteration-30，#29-wire）**：真 git 仓 + 真 docker 镜像（自足构建，不依赖跨文件执行序）→ `pipeline afk run --level L3 --image` 真跑 automation.runRound(createDockerRunChange)，L3 真 merge 落 host / L1 report-only 落 paused 不 merge / 无 docker 诚实降级 | ✅ PM 拒 / 未知子命令 exit1 / 无 docker 明示 | ✅ enqueue→status→scan→run（真容器） |
| tap CLI 命令 | ✅ tap.integration.test.ts 7 例（iteration-30，#34-wire：tap 包此前零 CLI 可达性）：真子进程跑 dist bundle（`--` 透传场景，规避 commander 一个真 bug——见下）→ reverse client 真绑端口+真 env 注入被子进程看到+真转发到上游；daemon 模式真打印 export 行+真收 SIGINT 干净退出；forward 缺 --ca 真拒绝；未知 client/子命令 exit1 | ✅ 未知 client/子命令 exit1 / forward 缺 ca 拒绝 | ✅ start（reverse/forward/daemon/passthrough 四模式）|
| transition 单源守卫（dashboard） | ✅ transition-mirror.test.ts 2 例（node 侧真 import kernel TRANSITION_EVENTS + dashboard 镜像，逐边/逐事件字节相等——跨 node/浏览器边界的单源守卫，镜像漂移即抓红）| ✅ | — |
| check | ✅ guard 全量面真跑：不满足 exit 2 / 建 design doc 后 exit 0 | ✅ | ✅ |
| inbox | ✅ --json 复核相位 | — | ✅ |
| status/list | ✅ 真枚举 | — | ✅ |
| doctor | ✅ --json 真探针 | — | — |
| import | ✅ 真迁移+strip | ✅ 幂等哨兵 exit 1 | ✅ 老仓 fixture |
| 并发锁 | ✅ 两 set 竞争不丢写 | — | — |

## 登记的覆盖缺口（不静默——逐条待补）

- ✅ G1 已闭（iteration-12）：`get` 未设字段忠实 null + 未知字段空行，真 fs 用例
- ✅ G2 已闭（iteration-12）：`set-many` 真原子写 + 落盘字段序
- ✅ G3 已闭（iteration-12）：`check` 真跑 guard 全量面（不满足 exit 2 / 建 design doc 后 exit 0）
- ✅ G4 已闭（iteration-33）：新增 `packages/cli/src/workflow-skill-orchestration.integration.test.ts`
  （4 例，零 mock）——真跑一个项目走完整 7 相位（open→explore→spec→build→verify→ship→archive），
  每相位内驱动真 `hooks/*.sh` 子进程（`gate.sh` 硬拦 → 真 `AskUserQuestion` 解锁流程 → `skill-tracker.sh`
  +`interactive-skill-gate.sh` 真记账），mandatory_skills 从 `templates/manifest.yaml` 真读而非手选；
  单一 `.pipeline-history.jsonl` 里 kernel 写入（transition/set）与 hook 写入（tool/prompt）**按因果顺序**
  逐条核验（非仅计数）；另覆盖 TTL 自愈 + 与 `verify-skills.sh` 的零悬空联动。真跑当场用变异测试自证
  非空转绿（强制 gate 恒放行 → 抓出真实specific 失败 → 复原回绿）。
- ✅ G5 已闭（iteration-33）：`packages/kernel/src/mem/adapters/opencode.ts` 改真 `node:sqlite`
  内建模块读取（零第三方依赖，替换 no-op 桩）——schema 非凭源码猜测，真跑 `opencode-ai@1.17.14`
  建库+真会话+`sqlite3 .schema` 逐字核对；19 例真 fixture（真建 SQLite 文件）。**node:sqlite 在
  node 22.5–22.12 需 `--experimental-sqlite` 标志**（本仓 `engines.node` 仅要求 >=22），故用
  `try/catch` 每次调用探测而非缓存"不可用"，探测失败诚实降级空结果（不抛不假绿）；`opencodeSqliteAvailable()`
  导出供 CLI 降级提示按需警告（原无条件警告已改按真检测结果）。已知诚实缺口：compaction 边界摘要暂未
  折叠（OpenCode 摘要落在独立 message 而非可复用同条 part，无真实压缩会话可核对前不猜规则）。
- ✅ G6 已闭（iteration-32）：full Claude-Code-in-sandbox「agent 真编码成功」用有效
  `CLAUDE_CODE_OAUTH_TOKEN` 真跑验证通过——一次性诊断脚本（未保留在仓库里）seed 一个带真实
  `design_doc` 的 change → `createAutomation`+`createDockerRunChange`（L1，extraEnv 注入 token）
  → agent 真读设计文档、真建 `HELLO.md`（内容逐字比对）、真 git commit `edf75df`，`git show` 独立
  核验（不只信 agent 自报）；tap 记录 8 条真请求，`upstream_base_url: https://api.anthropic.com`
  + 真 `claude-cli/2.1.202` UA + 真 `anthropic-beta: oauth-2025-04-20` + `response.status: 200`
  逐字确认走代理不直连。**真跑过程中抓出 2 个此前从未被有效凭证触发过的沙箱环境真缺口**（均已修复，
  见下）。
  - **缺口 A**：alpine 镜像默认无 `bash`、`SHELL` 未设——Claude Code 的 Bash 工具报
    `No suitable shell found`，agent 完全无法执行任何命令（诚实报告卡住，未伪造结果）。修复：
    `tools/sandcastle/Dockerfile` agent 层追加 `apk add --no-cache bash` + `ENV SHELL=/bin/bash`
    （置于 npm install 层之后，新增层不影响其 docker 缓存）。
  - **缺口 B**：容器 `--user host-uid:host-gid`（对齐 host worktree 属主，DESIGN §7-item5）在
    alpine `/etc/passwd` 里查不到条目时，`HOME` 默认解析成 `/`（**非空、非未设**——原
    `export HOME="${HOME:-/tmp}"` 兜底判断的是"未设或空"，捕不到这种"设了但设错"的情况，真跑
    实测才发现）；agent 建 `~/.claude` 时因此 `EACCES: mkdir '/.claude'`。修复：
    `pipeline-afk-run.sh` 改为无条件 `export HOME=/tmp` + 按当前 uid 自助注册一条 `/etc/passwd`
    条目（幂等，root 等已有条目则跳过；Dockerfile 配合 `chmod o+w /etc/passwd /etc/group` 放行
    非 root uid 写入）。
  - **凭证处理**：用户先给的字符串其实是 OAuth 登录流程的 authorization code（`code#state`
    格式），非最终 token，直接当 bearer 用必然 401——用最简化对照实验（host 直跑、`env -i` 清空
    环境、绕开 docker/tap/repo 代码）逐层排除后才定位到这是弄混了 OAuth 流程的两个产物而非本仓
    代码/环境问题；真正的 `sk-ant-oat01-...` token 全程只作临时环境变量传递，未写入任何文件/
    commit/memory，一次性诊断脚本与所有临时 host 仓库（含 tap 捕获的凭证痕迹）验证后已清理。

**iteration-33 新增收编（非缺口登记，操作性记录）**：
- **5 个长尾适配器全部实现**（aider/continue/cline/amp/zed）——非照抄 registry.yaml 已登记的目标档位：
  逐个查证主要来源后，continue（真实 CLI `cn`，非旧 IDE 插件 config.yaml）与 cline 的 hook 协议均
  比原假设更强，**由目标档 B 升级为档 A**（continue：`extensions/cli/src/hooks/types.ts` 头注自陈
  "沿用 Claude Code 同款 schema"；cline：`.clinerules/hooks/` + `hooks.proto` 证实真 `PreToolUse`
  硬拦，非审批流）；amp 经真下载 `@ampcode/cli` 二进制 `strings` 分析验证机制不同构但能力等价，
  仍判档 A；zed 经其真实 GitHub issue 确认无 hook 原语，档 C 不变。`tools/test-adapters.sh` 断言
  125→224；变异测试覆盖 cline/amp/aider 三项（"至少一项"高标完成）；顺带修复 `tools/test-adapters.sh`
  一个真实预置 bug（`drive_track()` 里 `local id=... w="...$id..."` 单语句内变量展开顺序错误，仅因
  过去调用点都在同变量名 for 循环里才恰好"能用"，新增的非循环调用点当场暴露）。
- **Dashboard 配置写端点已实现**：`GET /api/config` + `POST /api/config/mandatory-skills`（`packages/server/src/config.ts`），
  精确复用既有 B5 token 鉴权（同一 `handlePost` 派发链，零新鉴权代码）；写入对 `templates/manifest.yaml`
  的 `mandatory_skills:` 块做行级手术式替换（其余行含注释逐字保留），写临时文件后**真过一遍 kernel
  `loadManifest` 回读校验**才 `rename()` 覆盖，失败不落地；phase/track/skill token 全部白名单校验
  （拒绝会打破单行 flow-list 语法的字符）。`SettingsView.tsx` 按 `capabilities.config` 决定是否启用
  编辑（旧 server/无此能力时优雅降级回原只读预览）。server 89/89、dashboard-app 86/86。
- **CI 已补齐**：`.github/workflows/ci.yml`（ubuntu-latest 自带 docker，八门验证全部真跑，非仅子集）。
- **sandcastle 镜像发布现状诚实登记**：`tools/sandcastle/build.sh` + `tools/sandcastle/README.md` 新增，
  文档手动构建步骤 + 发布到某 registry 的示例命令；**未代为选择 registry 或实际推送**（需仓库所有者
  账号/凭证决定），镜像仍只在本机 docker 缓存。

**真实发现（真测试的产出，mock 从未暴露）**：① doctor 需 `deps.doctor` 探针束装配——集成层漏装即 exit 1（realDeps 已补真探针）；② init 对可选字段落盘字面 `null` 而非空串（忠实老内核 heredoc，oracle 双跑据此过）；③ import `--strip` 后再 import 返回 exit 0「无历史区」而非幂等哨兵 exit 1（两条路径语义不同，已各自钉死）；④（iteration-30，#34-wire）commander（^12.1.0）variadic `[args...]` 捕获里的裸 `--`：若前一个 token 是普通位置参数（不以 `-` 开头）会被静默吞掉，若前一个 token 是 `--foo` 形态的选项样 token 则保留——穷举受控 argv 数组验证过，是 commander 内部状态机的真实缺陷。真子进程 e2e（tap.integration.test.ts 最初用 in-process harness 跑）当场抓出：`pipeline tap start claude -- <command>`（无前置 flag）时 `--` 消失，wrapped command 的 argv 被误吞进 client 列表。修复：main.ts 在调用 commander 前从原始 `process.argv` 手工切出 `--` 之后的段（`passthroughArgv`），commander 自始至终看不到裸 `--`，绕开该缺陷；mock 测试（不走真 argv/真 commander）绝不会暴露这类第三方库边界情况。⑤（iteration-33，CI 首次真跑抓出）`hooks/` 全仓 **8 处**（gate.sh/skill-tracker.sh/router.sh/breadcrumb.sh/statusline.sh×2/session-start.sh/decision-recorder.sh）同一处 mtime 读取写法 `stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo ...` 在 Linux 上全部失效：GNU `stat -f` 是「文件系统状态」模式（非文件 mtime），传真实文件路径会**成功**吐一段文件系统信息文本而非报错，`||` 兜底判断的是退出码、永不触发；本机 macOS（BSD stat）一直"恰好能用"所以从未暴露，本仓在此之前也从无 CI/无 Linux 真跑过。真机 ubuntu-latest CI 首次运行时，`gate.sh` 处理刚创建的新鲜 review marker 时 `$((now - mt))` 对着一整段文本做算术，报 `arithmetic syntax error` 崩溃退出 1（非预期的 0/2），被新增的 G4 e2e（workflow-skill-orchestration.integration.test.ts）当场抓红。修复：8 处统一改为「先试 GNU 语法（`-c`，BSD stat 不识别该 flag 会真报错退出）+ 输出数字校验兜底，而非只信退出码」；用真 Ubuntu 容器直接复现老写法崩溃 + 验证新写法在 GNU coreutils 下正确产出纯数字 epoch，且真跑 `gate.sh` 新鲜/陈旧 marker 两条路径均正确（阻断/放行+自清）后才提交。**此前全部 180 个 test-hooks.sh 断言、全部 hooks 相关 vitest 均只在 macOS 本机跑过，从未在 Linux 上验证过——这正是"没有 CI"这一操作性空白本身掩盖的真实缺口，补 CI 当轮即抓出。**

**2026-07-08 集成收尾登记（GOAL v2.0：workflow 自定义引擎 + dashboard 工作台，四份计划合并后
的总盘点，证据源见四个 worktree 的 `.superpowers/sdd/progress.md` + `docs/loops/progress.md`
iteration-35）**：

- **G7**：`tasks-at-least` guard 类型恒定失败（`workflow-customization-engine.md` Task 7
  明确 TODO）——需要复用 `packages/kernel/src/flow/guard.ts` 现有的任务计数逻辑，本轮未做，
  非设计缺陷，是待排期的小任务。
- **G8**：自定义 workflow 下 `pipeline transition` 不写 review marker/breadcrumb（Task 8
  明确的范围收缩）——只影响自定义 workflow；`default` workflow 的 review marker/breadcrumb
  机制完全不受影响。
- **✅ G9 已闭**：登记时（2026-07-08 集成收尾）E8（workflow 编辑器节点连线画布 UI）完全
  不在当时四份计划范围内——`workflow-customization-engine.md` 收尾说明明确写"画布 UI 不在
  本计划内……等这条主线落地、真有一个可读写的 workflow 文件格式之后再设计画布怎么读写
  它"，是故意的范围切分，非遗漏。**已于同日由第五份独立计划补上**：
  `docs/superpowers/plans/2026-07-08-workflow-editor-canvas.md`（9 个任务）落地真画布
  （`@xyflow/react`，两层：顶层 step 拓扑 + 钻入 skill DAG），GOAL.md E8 已勾选。该实现
  自身的已知简化点不是本条的延续缺口，另行登记见下方 G14。
- **G10**：Task 8 一个非阻塞边缘情况——不存在的 change 名 + 未知 event 名同时出现时，
  `pipeline transition` 会泄漏一条原始 `ENOENT` 报错而不是干净的"未知 event"错误；
  exit code/stdout/文件写入均无变化（CONTRACT §3 oracle 承诺覆盖的维度不受影响），没有测试
  覆盖这个组合输入，判定为非阻塞。
- **G11**：`automation_attempts` 归零操作和前面的 CAS 不是同一个原子操作（afk-workbench
  Task 5），窄竞态窗口（`store.cas()` 与随后的 `store.set('automation_attempts','0')`
  之间），reviewer 判定为计划文本本身写的顺序、影响面窄（仅瞬时计数偏差，下次自增自愈，
  不影响 CAS 保护的 `automation` 字段本身）且自愈，非阻塞。
- **G12**：若干 Minor 级别发现（测试覆盖不够全、命名不完全一致、文档措辞小瑕疵等）——完整
  列表在四个 worktree 当时的 `.superpowers/sdd/progress.md` 里（已随 worktree 清理，摘要
  见 `docs/loops/progress.md` iteration-35），不在此处逐条复述。
- **G13**（本轮集成时新发现，非四份计划任务列表里的已知项）：GOAL.md E3 字面要求
  workflow step 的 `inputs`/`outputs` 契约"驱动现有相位 handoff 压缩机制
  （`packages/kernel/src/compress/handoff.ts`）"，但 `handoff.ts` 的 `PHASE_DOCS` 仍是
  按 7 个固定相位名写死的映射表，未读取 step 级 `inputs`/`outputs` 声明；11 个任务的
  brief 与设计文档（`docs/superpowers/specs/2026-07-07-*-design.md`）通篇都未提
  `handoff.ts`，是设计阶段本身遗漏的一处衔接，非实现偷工。**影响面**：`default` workflow
  的 handoff 压缩（B13 护城河功能）完全不受影响；自定义 workflow 下 `phase` 字段是任意
  step id，与 `PHASE_DOCS` 键值不匹配，`phaseHandoffDocs()` 静默返回空列表——即自定义
  workflow 目前拿不到 handoff 压缩优化，非崩溃、非误报（fail-open 静默降级，与本仓其余
  未接线能力的处置风格一致）。已在 GOAL.md E3 脚注同步登记，见 GOAL.md。
- **G14**：workflow 编辑器画布（E8，2026-07-08，`docs/superpowers/plans/2026-07-08-
  workflow-editor-canvas.md` 9 个任务，G9 已闭见上）已知简化点——均已对照实际落地代码逐条
  核实，非照抄计划草稿：
  - 多项目场景下画布固定编辑 `snapshot.projects[0]` 这个 project 的 workflow（`App.tsx`
    的 `currentRoot`，Task 9）——App 层没有"当前选中 project"概念，`snapshot` 本身聚合
    全部已注册 project；真实多项目场景下选哪个 root 编辑 workflow 是留给后续的更大问题，
    未做显式切换 UI，单项目场景下可正常跑通。
  - guard 只支持移除、不支持新增（`StepDetailPanel.tsx`，Task 8 范围收窄）——i18n 已预留
    `detail_guard_add` key，当前未被任何 JSX 使用。**对计划草稿的修正**：新增不是简单照抄
    既有 `renderFieldList`（inputs/outputs 的名字+固定 string 类型列表）套一个 `<select>`
    就能补齐——guard 需要"选类型 + 按类型条件渲染参数"（如 `tasks-at-least` 还需要额外的
    `n` 数值输入，`nonempty-output` 则不需要任何参数），复杂度比 inputs/outputs 的新增表单
    高一档；列表+移除按钮+新增表单这个整体模式仍是通用的，只是新增表单本身要另起一份，
    未在本轮做。
  - 不支持撤销/重做/多选/复制粘贴/minimap；workflow 改名 / 节点（step、skill）改名需删除
    重建（不做级联更新其它地方对旧名字/旧 id 的引用）——以上均是设计文档
    `docs/superpowers/specs/2026-07-08-workflow-editor-canvas-design.md` §3 明确列出的
    范围外项（"范围外（本轮不做，留作后续小任务）"），不是本轮遗漏。
- **G15**（E8 whole-feature review 时发现，**系统性缺口、非 E8 引入**）：
  `packages/dashboard-app` 自己的 `build` 脚本是 `tsc --noEmit && vite build`，真含类型
  检查；但根 `npm run build`（八门验证第①门、CI "Build" 步骤实际跑的命令）字面是
  `tsc -b packages/kernel packages/tap packages/automation packages/cli packages/server
  && npm run bundle`——**不含 `dashboard-app`**；`.github/workflows/ci.yml` 其余步骤
  （`npm run test:web` 只是 `vitest run`，不做类型检查）同样未单独跑它。即
  `dashboard-app` 的 TypeScript 从这个仓库有 CI 以来大概率从未被真正类型检查门禁过——
  实据：`src/loops/LoopsPanel.tsx:117`（F4 范围代码，与 E8 无关）现存一个真实
  `tsc --noEmit` 类型错误（`NEXT_LEVEL[row.autonomy_level]` 类型是 `string | null`，
  用在要求 `string | number` 的位置），此错误活生生地未被任何现有门拦截，是这个缺口
  确实存在的直接证据。**对 E8 本身的影响是中性的**：whole-feature review 时单独真跑
  `cd packages/dashboard-app && npx tsc --noEmit`，除上述那一条已存在的 `LoopsPanel.tsx`
  错误外，E8 新增的四个组件（`WorkflowCanvas.tsx`/`WorkflowEditorView.tsx`/
  `StepDetailPanel.tsx`/`layout.ts`）本身类型干净，未新增任何类型错误。**本轮不处理**：
  修复 `LoopsPanel.tsx` 那一行、或者把 `dashboard-app` 接入 build 门禁/CI，都超出了
  E8"workflow 编辑器画布"这一个功能本身的范围（前者是 F4 相关代码，后者是项目级
  CI/build 配置决策），留给后续单独处理，不在本轮顺手做。
- **G16**（E8 whole-feature review 的 fix 轮次里，实现方自查披露，非隐瞒）：
  kernel `validateWorkflow`（`packages/kernel/src/workflow/validate.ts`）对 workflow
  的 transition `event` 名 / field-ref `field` 名没有字符集规则（跟 step/skill id 用的
  `^[a-zA-Z0-9_-]+$` 不同）——而 `parse.ts` 读这两处只认 `\S+`（不含空白）。whole-feature
  review 发现"用户通过画布 UI 输入含空格的名字会导致往返损坏（保存成功但下次打不开）"
  已在 dashboard-app 客户端（`WorkflowCanvas.tsx` `confirmConnect` + `StepDetailPanel.tsx`
  `confirmAddField`）堵住，且经复审独立验证为真实、完整的修复（唯二的两处构造点均已
  加同款字符集校验，全仓搜索确认没有第三处遗漏）。**残留的、本轮未处理的窄口子**：
  任何绕开浏览器直接调用已鉴权 `POST /api/workflows/:name` 的调用方（curl/脚本/未来
  客户端）仍可写入一个之后会让 `loadWorkflow` 解析失败的 workflow——因为服务端
  `validateWorkflow` 本身没有这条规则做纵深防御后盾，只挡住了"通过正常 UI"这一条路径
  （原始审核发现的复现场景本身就限定在这条路径，服务端加固在审核建议里明确标注为
  "可选"，不属于本轮须做的修复范围）。**建议后续单独一个小任务**：给
  `validateWorkflow` 补一条 event/field 名的字符集规则，作为服务端纵深防御层；因为
  这条路径已被证实"今天就可通过一次已鉴权的直接 HTTP 调用触发"（不是纯假设性的
  未来风险），建议排进较近期的后续处理，而非无限期搁置。

**2026-07-09 全功能真机验证登记（用户追加任务：UI 重构收尾 + Playwright 真实点击驱动
正常 pipeline/AFK 两条全流程 + 自定义 workflow 创建与切换 + loop 面板联动，见
`docs/loops/progress.md` 对应轮次）**：

- **G17（本轮最大发现，真机验证过程中确认，非猜测）**：**自定义 workflow 的 change 一旦
  使用非标准 step 名，在看板（BoardView）和收件箱（InboxView）里完全不可见，也就无法
  通过 dashboard 推进它的任何相位转换**——这不是"某个按钮点不动"这种局部小毛病，而是
  E1-E8（workflow 自定义引擎）交付时，dashboard 两个最核心的操作视图从未被同步更新到
  能感知自定义 workflow 的地步，两者都还是 v1.0 时代"phase 只可能是 7 个固定值之一"的
  假设。
  - **复现（真实操作，非代码走读）**：用 workflow 编辑器（真实点击）建了一个不叫
    `default`、step 名真正自定义（`draft`→`review`→`ship`，不是给 7 相位换皮）的
    workflow `release-train`；`pipeline init release-demo --track backend --preset
    full --workflow release-train` 建一个用它的 change（`phase=draft`）。真开浏览器：
    `GET /api/snapshot` 确认 server 端聚合完全正确（`release-demo(phase=draft)` 真的
    在返回体里）；但 Inbox 和 Board 的 UI 上都找不到这张卡——`BoardView` 的看板 7 列
    一张都不显示它，`board-card-release-demo` 这个 testid 在 DOM 里根本不存在。
  - **根因**（读代码 + 真机双重确认）：`packages/dashboard-app/src/types.ts` 的
    `PHASES`/`TRANSITIONS`/`EVENT_BY_EDGE`/`REVIEW_PHASES` 四个常量都是**只镜像
    default.yaml 七相位的静态表**，`BoardView.tsx` 的 `byPhase`
    （`m.get(fc.change.phase as Phase)`，命中不了就是 `undefined`，`if (bucket)`
    直接跳过不 push）与 `InboxView.tsx` 消费的 `isAwaitingDecision`
    （`REVIEW_PHASES.includes(c.phase)`）都基于这四个常量；`events.ts` 的
    `plannedTransition` 也一样，`isPhase(fromPhase)` 对任何自定义 step 名恒 false，
    直接 `return null`——即便侥幸能在看板上看到卡片，拖拽也算不出合法转换事件。
  - **影响面**：只影响**使用非默认、且 step 命名不复用标准 7 相位名字**的自定义
    workflow；`default` workflow 的 change（本仓绝大多数真实用法）完全不受影响；如果
    自定义 workflow 的 step 恰好也叫 `open`/`explore`/…（用标准骨架、只是内部
    guards/skills/gate 不同），看板能显示、能拖，只是转换边表仍然用的是 default 的
    固定边表，若自定义 workflow 的转换图和 default 不完全一致（比如多了一条 default
    没有的边、或者事件名不同），拖拽算出来的 event 依然会是错的。
  - **为什么本轮不修**：真做对需要 BoardView 按每个 change 实际使用的 workflow
    （`change.fields.workflow`）动态取它自己的 step 列表 + 转换图（`GET
    /api/workflows/:name` 这个端点数据已经现成，E8 已经在消费），而不是复用一套写死
    的 7 列/7 条边——但一块看板上可能同时有用 `default` 和多个不同自定义 workflow 的
    change，"不同 change 该显示成不同的列集合"这件事本身是一个需要先想清楚交互设计
    的产品问题（每个 workflow 一块独立迷你看板？取所有活跃 workflow 的 step 并集做
    列？换个完全不是"列"的呈现方式？），不是照抄 inputs/outputs 现成模式就能补的
    表单级小活，贸然改动核心看板逻辑还有把 `default` workflow 这条最主要使用路径
    改出回归的风险。判定为需要先设计再实现的独立后续任务，本轮如实记录，不假装
    绕过去。
  - **本轮如何完成验证目标**：`release-demo` 后续的相位推进改用 `pipeline transition`
    CLI 真跑（kernel 状态机本身对自定义 workflow 的处理——`internal-skill-gate`
    动态 DAG 判定、guard 校验等——不受这个 dashboard 层缺口影响，真跑验证通过，
    见 progress.md）；AFK 工作台（不依赖 `phase` 值，只看 `automation` 字段）与
    Loop 设置面板（loops registry 有自己独立的 `phases` 声明，不复用 dashboard 的
    固定 `PHASES` 常量）经真机验证不受此缺口影响，可以正常通过 dashboard 点击驱动。
- **G18**：项目要出现在 dashboard 里，目前没有任何 CLI 命令或界面入口可以把一个
  项目根目录注册进 `~/.claude/pipeline-projects.json`（机器级注册表，
  `packages/server/src/registry.ts` 只有 `readRegistry`，全仓找不到任何写入它的代码
  路径）——唯一方法是手改这个 JSON 文件。已在 README.md「Dashboard 工作台」一节如实
  写明操作步骤，不算阻断性 bug（本机单用户场景下手改一次 JSON 成本很低），但确实是
  当前唯一入口，值得后续补一个 `pipeline project register [--root]` 之类的命令或者
  dashboard 设置页里的一个小表单。

### 2026-07-09 · iteration-38 dashboard 全量重构 —— 改判追记

- **G14 已闭（部分）**：① 多项目「当前选中 project」概念已落地——App `currentRoot` 状态化 +
  Nav 项目切换器（localStorage 记忆，`App.tsx`/`shell/Nav.tsx`），收件箱/看板/AFK/workflow
  编辑器统一 currentRoot 语境；② guard「只有移除没有新增」已补齐——`StepDetailPanel.tsx`
  新增内嵌表单（类型下拉 + tasks-at-least 条件参数 n + 行内校验），`detail_guard_add`
  预留 key 接线。撤销重做/多选/minimap/改名等其余 E8 已知简化维持原状（本轮范围外）。
- **G17 已闭（前端 + server 双侧）**：前端——新模块 `dashboard-app/src/model/workflowModel.ts`
  混合相位模型（default 走 types.ts 常量镜像零网络、单源守卫测试零改动；自定义按
  `fields.workflow` 走既有 `GET /api/workflows/:name` + 缓存），BoardView 分组看板（每个
  workflow 独立分组/列集/转换图，rules 拉取失败组只读降级——任何情况下卡不消失）、
  InboxView 判据泛化为 `gateByStep[phase]==='review'`、events.ts 按 WorkflowRules 泛化。
  server——**本轮验收真机新发现 G17 其实有个 iteration-37 未触达的 server 侧半边**：
  `server/src/transition.ts::performTransition` 锁死 kernel 固定事件表，dashboard 发出的
  自定义 event 一律 400；已镜像 `cli/commands/transition.ts` 双轨分岔修复（default 原链路
  一行不改，响应形状两轨一致）。验收证据：`.playwright-tmp/acceptance-redesign.mjs`
  真机四连证（独立分组可见/组内拖拽推进/收件箱现卡/快捷转换清徽章），ACCEPTANCE_ALL_PASS。
- **G18 已闭**：`POST /api/projects`（注册，豁免第四层信任锚的唯一写端点，补偿校验=路径
  存在+目录+两侧规范化判重 409）/ `DELETE /api/projects`（注销）/ `POST /api/changes`
  （init 的 HTTP 化）三端点 + Nav 注册入口 + `NewChangeDialog` + 教学式空状态
  （注册表单 + CLI 等价命令双路径）。验收证据：空注册表起步 → onboarding 注册 →
  新建 change → 推进 → 归档全闭环真机通过。
- **G19（本轮新增已知简化，如实登记）**：① `POST /api/changes` 不写 history 记账
  （CLI 侧 best-effort 职责，server 端点不注入 history deps）；② Loops 面板不设降档按钮
  （server 无降档端点，YAGNI——demo 里的降档钮是视觉示意未实现）；③ 看板/收件箱从
  「全项目聚合」改为「currentRoot 单项目」语境（D5 拍板的语义变更，与 AFK/编辑器对齐）；
  ④ default 组 archive 列渲染折叠计数不逐卡列出（有意简化）；⑤ 收件箱「决定类型文案行」
  （awaiting.*）退役——紧凑工票行里徽章+相位胶囊承担语义，i18n key 保留；⑥ 相位显示一律
  原始 step id（mono），default 的中文相位名退役出看板/收件箱（settings 相位轴仍用）。

### 2026-07-09 · G15 收编追记（iteration-38 后续会话）

- **G15 已闭**：根 `npm run build` 接入 `typecheck:web`（`tsc --noEmit -p packages/dashboard-app`），
  排在 `tsc -b` 之后（dashboard 类型依赖 kernel/server 的 `dist/*.d.ts`，全新 clone 的 CI 里
  顺序不可反）、`npm run bundle` 之前；CI "Build" 步骤跑的就是 `npm run build`，自动继承，
  八门数目不变。**红绿实证**：故意类型错误探针（`__g15-red-probe.ts`）——旧门 `npm run build`
  全放行（缺口复证）→ 接线后同一探针被 TS2322 拦截 → 删探针回绿 + `npm test`（1931 pass）
  `npm run test:web`（217 pass）三连全绿。G15 登记时引用的实证错误 `LoopsPanel.tsx:117`
  已在 iteration-38 工票化重写中消亡（接线前基线 `tsc --noEmit` 即全绿，无需修码）。
  **已知残留**：`vite build`（build:web 的后半）仍不在 CI 内——类型之外的纯打包破坏
  （如资源 import 路径错误）CI 依旧不拦，是否补一步由后续拍板。→ **同日拍板补入**：
  CI 新增第九步 `dashboard-app build (vite)`（`npm run build:web`），本地真跑绿后接线，残留清零。

### 2026-07-09 · G16 收编追记（同日后续会话）

- **G16 已闭（范围较登记扩大）**：`validateWorkflow` 新增统一字符集后盾 `^[a-zA-Z0-9_-]+$`——
  不止登记的 event/field 两处，**wf.name / step.id / skill.id 一并锁死**：parse.ts 对这五类
  标识符全部 `(\S+)` 读取，同属「serialize 写得出、parse 读不回」破坏类；且 POST body 的
  `name` 不被强制等于路由 name（serialize 第一行原样写它），是登记时未列出的同类活口。
  `to` 由既有「必须指向真实 step id」规则间接覆盖。**红绿实证**：server.test.ts 新增直调
  已鉴权 HTTP 含空格 event 用例——修复前真实 200 + 落盘（漏洞活体复证），修复后 400 +
  errors + 不落盘；kernel 五例先红后绿。存量扫描（templates/default.yaml + .playwright-tmp
  两测试环境）全部合规，规则零误杀。writeWorkflowForApi/loadWorkflow 都以 validateWorkflow
  为闸，一处加规则双向（写入/读取）闭合。

> 缺口在对应里程碑收编时清零；新缺口发现即追加，绝不删除未解决项。
