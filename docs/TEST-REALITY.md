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
| tap 流量代理 | ✅ packages/tap 49 例（13 真 socket：真 fake upstream + 真 proxy + 真 CONNECT + trace_store 真落盘；源码级扫描断言零 outbound）+ doctor tap 灯真跑 | ✅ 默认 OFF 真不监听 / 8766 生命线隔离 | — |
| automation AFK | ✅ packages/automation 72 例（57 纯逻辑真状态机 + 14 真 kernel fs/git 集成）；docker IT 2 honest-skip（无 docker 不伪绿）| ✅ L1→paused/L3→merged/conflict 保留 | ✅ enqueue→scan→run |
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

**真实发现（真测试的产出，mock 从未暴露）**：① doctor 需 `deps.doctor` 探针束装配——集成层漏装即 exit 1（realDeps 已补真探针）；② init 对可选字段落盘字面 `null` 而非空串（忠实老内核 heredoc，oracle 双跑据此过）；③ import `--strip` 后再 import 返回 exit 0「无历史区」而非幂等哨兵 exit 1（两条路径语义不同，已各自钉死）。

> 缺口在对应里程碑收编时清零；新缺口发现即追加，绝不删除未解决项。
