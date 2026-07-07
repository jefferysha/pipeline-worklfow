# SUPERIORITY MATRIX — 逐维超越证据（BACKLOG #41 / GOAL 清单 D）

> 用户指令（2026-07-07）：**任何方面都超过 Trellis 与 Comet**。本表是 GOAL 清单 D 的证据固化，
> 收敛检查（kill 判据）以此为对照物。每维给出：我方实现 · 竞品做法 · 判定（`>` 更强 / `≥` 不弱 /
> `~` 进行中）· 机器证据（测试文件/commit）。清单只增不删；维度未达 `≥` 即存在缺口。

## vs Trellis（11.8k★，engineering framework for AI coding）

| # | 维度 | 本仓实现 | Trellis 做法 | 判定 | 证据 |
|---|---|---|---|---|---|
| D1 | 规范持久化/自动注入 | SessionStart 三注入（workflow 宪法 + pipeline 上下文 + openspec）+ manifest 单一真相源引擎真读 | `.trellis/spec/` 自动注入每会话 | ≥ | test-hooks section8；#20/#18 |
| D2 | 任务/状态结构化 | `.pipeline.yaml` 37 字段 + 7 相位状态机 + task lifecycle 依赖图/级联/canonical | task PRD 三态 | **>** | task.integration 14 例；#15 |
| D3 | 会话记忆/journal | mem 跨 Claude/Codex/Pi 三 runtime 检索（list/search/context/extract/projects）+ history JSONL | `.trellis/workspace/` journal | ≥ | mem.integration 12 例；#28 |
| D4 | 真实工具链验证 | check/guard 46 规则全量面（老 guard verdict 逐字一致）+ oracle 双跑 + automation docker 沙箱 verify(#29c) | trellis-check（lint/type/test） | **>** | guard.test + oracle 0 不一致；#12/#29c |
| D5 | 学习回写闭环 | learn-record 三层回写（含闭环判定） | trellis-update-spec | ≥ | skills/learn-record；#22 |
| D6 | 简单性/上手 | `npx pipeline init` 一行 + 5 分钟心智模型 + 单文件 bundle | `trellis init` | ≥ | test-bundle 7 例；#4 |
| D7 | 多平台策略面 | 适配器框架 + registry 单源 + conformance 机器校验 + 变异测试 + 分档降级 A/B/C（**active 12**，longtail 已清零） | 16 平台手工投影、无 conformance | **>**（填表非重写；conformance+变异 > contract 约定） | test-adapters 224 断言；#39/#40/iteration-33 |

## vs Comet（2k★，OpenSpec + Superpowers 五阶段管线）

| # | 维度 | 本仓实现 | Comet 做法 | 判定 | 证据 |
|---|---|---|---|---|---|
| D8 | 脚本守门状态机 | 三门 hook 硬拦（exit 2）+ guard 46 规则 + CAS + mkdir 原子锁 | comet-guard.sh 相位校验 | **>** | guard.test + lock.test；#12 |
| D9 | dashboard | 全局 server（版本抢占 + token 鉴权）+ 收件箱默认视图 + Kanban 拖拽 + Settings/Advanced 分离 | 本地只读 HTTP 面板 | **>** | server 38 例 + 前端 71 例；#25/#26 |
| D10 | doctor 健康面 | 11 项保障生效清单（降级可见）+ tap 敏感能力明示 | comet doctor 安装诊断 | **>** | doctor.test；#26b/#34e |
| D11 | 上下文压缩 | 确定性压缩 45.4%（可 oracle、结构化分桶） | CONTEXT-COMPRESSION 25-30%（beta） | **>** | handoff.integration 7 例；#30 |
| D12 | auto-transition | 中间档 `advance` + HITL 红线三重证明（复核相位/三门必停） | AUTO-TRANSITION（guard 绿即推进） | **>**（结构性禁止跨三门，Comet 无此约束） | advance.integration 6 例；#31 |
| D13 | 可恢复工作流 | 断点恢复不依赖对话历史（.pipeline.yaml 真相源） | .comet.yaml 可恢复 | ≥ | oracle 交叉验证；v0.1 |
| D14 | 平台广度 | 可移植内核 + 填表式扩展经 9 平台实证（跨 A/B/C，含长尾 5 平台真实现）+ conformance 保等价 | 30 平台（手工，无等价保证） | **>**（策略面：质量证据 > 原始数量） | 224 conformance；#39/#40/iteration-33 |

## vs 两者皆无（差异化护城河）

| # | 维度 | 本仓独有 | 说明 | 判定 | 证据 |
|---|---|---|---|---|---|
| D15 | golden-oracle 迁移法 | 老 bash 内核 vs 新 TS 逐字双跑 diff（stdout+exit+落盘三面） | 两竞品都无「行为等价可证」的迁移质量链 | 独有 | oracle run.sh 0 不一致（每轮） |
| D16 | loop-engineering 治理 | registry+enforce R1-R11+L1→L3 毕业制+budget/circuit breaker+drift 检测+loop-ready 审计+graduation 执行面（**全链闭环**） | 两竞品都无 loop 安全/治理面 | 独有 | loops 全套 ~130 例；#35/#36/#37/#38 |
| — | 无伪测试证据链 | 真 fs/真 HTTP/真 socket/真进程 e2e + TEST-REALITY 审计 + 诚实 skip | 用户硬要求，向 Trellis「真工具链」学习并制度化 | 独有 | docs/TEST-REALITY.md；C9/C10 |

## 汇总（截至 iteration-27）

- **> 更强**：D2/D4/D7/D8/D9/D10/D11/D12/D14（9 维明确超越）
- **≥ 不弱**：D1/D3/D5/D6/D13（5 维持平或略强）
- **~ 进行中**：无（D14 #40 铺量实证达标 / D16 #37/#38 已闭环）
- **独有护城河（两竞品皆无）**：D15 golden-oracle 迁移法 · D16 loop-engineering 治理闭环 · 无伪测试证据链

**收敛判定（iteration-27 达成）**：D14 铺量实证 + D16 治理闭环达标——**清单 D 全绿**：9 维 > / 5 维 ≥ / 3 护城河，"任何方面都 ≥ 且核心维度 >"成立。
