# lite-v01-kernel-port · 实施计划

> change: lite-v01-kernel-port
> goal: GOAL.md · loop: LOOP.md `loop-lite` · 契约: docs/CONTRACT.md

把老内核（workflow-plugin）7-phase 状态机的日常子命令面以 TS 单语言重建为轻量 CC 插件，
golden-oracle 双跑保行为等价，数据格式字节级兼容。track=backend，v0.1 预算 ≤5 天，
kernel 零新运行时依赖。T2–T6 无相互依赖，**并行执行**；T7 为集成屏障。

## 任务

### T1 · 契约与骨架（iteration-0，主会话完成）

GOAL/LOOP/BACKLOG/CONTRACT + npm workspaces + `types.ts`（FIELD_ORDER 37 字段、Phase、
kernel API 签名）。**验收**：`npm i` 零错；本 plan 与契约互指一致。

### T2 · kernel/state：`.pipeline.yaml` 读写层（TDD 先红）

`packages/kernel/src/state/`：窄解析器（CONTRACT §1 子集）、`readState/writeState`
（字段序 + 单层去引号 + 列表块 + 历史区不透明保留）、`withLock`（mkdir 原子锁 + 陈锁回收）、
`cas`、`initChange`（heredoc 语义：安全占位后经四闸写真值）。

**验收**：① 用老仓真实 change 的 `.pipeline.yaml` 作 fixture，read→write 往返**逐字节等价**；
② 四闸注入用例（`: `/` #`/换行/首引号）全拒写；③ 并发 20 写锁下零丢失；④ vitest 绿。

### T3 · kernel/flow：manifest + 转换合法性（TDD 先红）

`packages/kernel/src/flow/`：`templates/manifest.yaml`（从老仓 manifest.yaml 蒸馏 phases/
transitions/review_phases 最小面）、`loadManifest`、`legalTransitions(phase)`、
`transition(state, event)`（合法性 + `phase_status` 语义 + build⇄verify 双向）、
`guardCheck(state)`（lite 子集：相位出口必填字段表）。

**验收**：① 转换合法性矩阵用例覆盖 7 相位全边 + 非法边拒绝（exit 语义留给 cli）；
② `review_phases` 改 manifest 后行为随之变（钉死单一真相源——老内核欠账的回归锚）；③ vitest 绿。

### T4 · cli：commander 装配（TDD 先红）

`packages/cli/src/`：CONTRACT §3 全表命令，kernel 以 types.ts 接口 mock 注入测试；
`status/list` 人读渲染 + `--json`；exit code 逐格对齐契约表。

**验收**：① 每命令 stdout/exit 契约用例；② `--json` 输出 schema 稳定；③ vitest 绿（mock kernel）。

### T5 · hooks：bash 薄 shim + 插件打包

`hooks/`：`gate.sh`（PreToolUse：marker 新鲜 → exit 2 + stderr 指引；无 jq 依赖，参数从
stdin JSON 用纯 bash 提取所需两键）、`breadcrumb.sh`（UserPromptSubmit：cat 缓存文件）、
`session-start.sh`；`hooks.json` + `.claude-plugin/plugin.json`。

**验收**：① `tools/test-hooks.sh`：marker 新鲜/陈旧/缺失三态 exit 断言；② shim 内
`grep -c node` 为 0（红线自证）；③ 插件清单可被 CC marketplace 语法校验通过（结构对齐老仓）；
④ **`tools/verify-skills.sh`（CONTRACT §5.7）**：对 plugin.json/hooks.json 的全部路径与 skill
引用做存在性 + 可执行 + SKILL.md 校验，测试中人为埋一个悬空引用必须被抓红；外部 skill
依赖显式清单化，安装文档写明校验命令。

### T6 · oracle：golden 双跑 harness

`tools/oracle/`：`run.sh`——同一 fixture 项目上对 init/get/set/transition/check 分别跑
老 `pipeline-state.sh` 与新 `pipeline` CLI，stdout+exit+落盘 `.pipeline.yaml` 三面逐字 diff
（白名单：时间戳字段值）；`fixtures/` 覆盖三 Track × 含/不含历史区。

**验收**：① harness 可独立运行出 diff 报告；② 老脚本不可独立运行时降级「契约测试模式」
并显式打印降级（LOOP.md kill criteria 第 3 条）；③ 至少 1 个 fixture 全绿跑通。

### T7 · 集成回归门（屏障：T2–T6 全完成后）

接缝修复（cli↔kernel 真接线替换 mock 的编译错）、`npm run build` + `npm test` 全量绿、
oracle 双跑报告零红（或白名单内）、`docs/loops/progress.md` 记 iteration-1、git commit。

**验收**：回归门四项全绿；commit message 记录 oracle diff 计数。

## 回归门

`npm run build && npm test` 全绿；oracle `run.sh` 零红；老仓 fixture 往返字节等价用例零改动照过。

## 风险提示

- 老内核 stdout 细节（空格/大小写）可能与文档口径有出入——以 oracle 双跑实测为准，契约表随实测回写（属 T6 发现、T7 收编，不算契约变更 gate）。
- `pipeline-state.sh` 惰性 source 的 lib 在脱离老仓根时可能路径失败——oracle 需在老仓目录内跑、fixture 用临时项目目录注入。
- npm workspaces 下 vitest 跨包解析偶有缓存坑——统一根 `vitest.config.ts` projects 模式。
