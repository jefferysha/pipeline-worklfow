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
| init | ✅ 落盘字段序 | — | ✅ 全程起点 |
| get | ✅ 读回 init 值 + 未设字段忠实 null + 未知字段空行 | ✅ grep-miss | ✅ |
| set | ✅ 写+history | ✅ 四闸拒写字节不变 | ✅ |
| set-many | ✅ 真原子写+字段序 | — | — |
| cas | ✅ 匹配写入 | ✅ 不匹配 exit 3 | ✅ |
| transition | ✅ 改相位+marker+history+全副作用（#14，见 transition-effects.integration.test.ts 17 例） | ✅ 非法 exit 1 + 12 条前置校验路径 | ✅ 喂足真实前置的七相位全程 |
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
- ⚠️ G4：M2 移植的 skills/agents 是 markdown 定义——真实性由 verify-skills 零悬空 + PostToolUse
  skill-tracker/interactive-gate 真跑（section10）间接覆盖 skill 触发链；「真跑一次完整 workflow skill
  编排」的 e2e 待 M3 dashboard/M5 automation 有编排驱动面后补（登记不清零）
- ⚠️ G5：mem OpenCode runtime（SQLite）降级 no-op——与老仓一致，待原生依赖问题解决（诚实登记）
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

**真实发现（真测试的产出，mock 从未暴露）**：① doctor 需 `deps.doctor` 探针束装配——集成层漏装即 exit 1（realDeps 已补真探针）；② init 对可选字段落盘字面 `null` 而非空串（忠实老内核 heredoc，oracle 双跑据此过）；③ import `--strip` 后再 import 返回 exit 0「无历史区」而非幂等哨兵 exit 1（两条路径语义不同，已各自钉死）；④（iteration-30，#34-wire）commander（^12.1.0）variadic `[args...]` 捕获里的裸 `--`：若前一个 token 是普通位置参数（不以 `-` 开头）会被静默吞掉，若前一个 token 是 `--foo` 形态的选项样 token 则保留——穷举受控 argv 数组验证过，是 commander 内部状态机的真实缺陷。真子进程 e2e（tap.integration.test.ts 最初用 in-process harness 跑）当场抓出：`pipeline tap start claude -- <command>`（无前置 flag）时 `--` 消失，wrapped command 的 argv 被误吞进 client 列表。修复：main.ts 在调用 commander 前从原始 `process.argv` 手工切出 `--` 之后的段（`passthroughArgv`），commander 自始至终看不到裸 `--`，绕开该缺陷；mock 测试（不走真 argv/真 commander）绝不会暴露这类第三方库边界情况。

> 缺口在对应里程碑收编时清零；新缺口发现即追加，绝不删除未解决项。
