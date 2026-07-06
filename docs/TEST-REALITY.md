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
| transition | ✅ 改相位+marker+history | ✅ 非法 exit 1 | ✅ build_sha 冻结 / 七相位全程 |
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
- ⚠️ G4：M2+ 移植的 skills/agents 是 markdown 定义——真实性由 verify-skills 零悬空 + 未来 e2e「真跑一次 workflow」覆盖，登记待 M2 收尾补「skill 真调用」e2e

**真实发现（真测试的产出，mock 从未暴露）**：① doctor 需 `deps.doctor` 探针束装配——集成层漏装即 exit 1（realDeps 已补真探针）；② init 对可选字段落盘字面 `null` 而非空串（忠实老内核 heredoc，oracle 双跑据此过）；③ import `--strip` 后再 import 返回 exit 0「无历史区」而非幂等哨兵 exit 1（两条路径语义不同，已各自钉死）。

> 缺口在对应里程碑收编时清零；新缺口发现即追加，绝不删除未解决项。
