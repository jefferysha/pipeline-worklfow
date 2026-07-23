# CONTRACT — 数据格式 / CLI 面 / 并行开发规则

> 本文件 + `packages/kernel/src/types.ts` 是并行开发的单一契约。改契约 = human gate（见 LOOP.md）。

## 1. Canonical state 与 `.pipeline.yaml` adapter

- **唯一真相/唯一提交点**：`openspec/changes/<name>/.pipeline-run/current.json`。它是当前完整
  `PipelineState`、hook 热路径五字段快照、mutation reason/effects 与 state digest 的自包含 revision；
  同字节 immutable twin 位于 `.pipeline-run/revisions/<revision>-<revisionId>.json`。
- **发布顺序**：所有公开 `StateStore.write()` 自行取得同一把 change 锁；transition 先独占发布
  `TransitionRecord`，普通 mutation 直接构造下一 revision；随后先发布 immutable revision，再以
  `current.json` 的 tmp+rename 作为唯一 commit。最后才 best-effort 刷新 `.pipeline.yaml`。record/revision
  已落而 current 未换只是孤儿；current 已换而 YAML 写失败是已提交状态，返回 projection pending，
  不得回滚或伪装失败。
- **完整性**：current 必须通过 closed schema、SHA-256、immutable twin 字节一致、直接 previous 身份与
  effects 真实 diff 校验。transition mutation 还必须绑定 `transitionRecordId` 与该 record 精确字节的
  `transitionRecordDigest`；history 冷路径遍历全部 immutable revisions，任一祖先 revision/record
  缺失或摘要不符均 fail-loud，不用 JSONL/YAML 补洞。
- **兼容断代**：只有 `current.json` 目录项完全不存在时才读取 legacy `.pipeline.yaml`。current 一旦出现，
  即使损坏、不可读、是 symlink 或读取中消失，也绝不授权 YAML fallback。首次官方写把 legacy YAML
  固化为 migration revision 0，再提交目标 mutation。
- **YAML adapter**：`.pipeline.yaml` 继续按下方窄格式输出，服务旧工具；每份投影带 revision/id/digest
  元数据。缺失、已知 stale、legacy-compatible 可幂等前滚；未知 drift 不自动覆盖。运维入口：
  `pipeline state status <change>`、`repair-projection`（未知 drift 需显式 `--force-canonical`）和
  `import-legacy`（用户明确选择把 YAML 作为一条新 canonical mutation 导入）。server 项目扫描只自动
  修复可证明的前滚态，并把损坏/未知 drift 暴露为项目错误。
- **Hooks**：纯 Bash hooks 共用 `hooks/canonical-state.sh` 读取 compact current 的 `hookState`；canonical
  无效时 fail-open 跳过该 change，但不反向读 YAML。只有从未迁移的 change 才走 legacy grep。

### 1.1 `.pipeline.yaml` 格式契约（与老内核字节级兼容）

- 位置：`openspec/changes/<name>/.pipeline.yaml`（相对项目根）。
- **字段序固定**：见 `types.ts::FIELD_ORDER`（40 字段；2026-07-11 v5 T4 决策 G **末尾追加**
  `automation_current_phase`——沙箱内当前阶段，automation runner 检出 [TRANSITION] 行运行期回写、
  run 结算清空；老文件缺该行读作空串，容忍不变。新字段必须末尾追加：老版本窄解析器把首个未知
  key 起整段当 opaqueTail，插中段会让老读者回写时重复 key 腐蚀文件，见 types.ts 注释。
  2026-07-13 F-b **末尾追加** `automation_cause`——失败成因结构化 tag，automation 写入端按 error
  `_tag` 干净判定落盘（`cancelled`/`conflict`/`timeout`/`verify-fail`/`agent-exit`/`no-op` 开放集，
  空串=未知，读取端 fallback regex 分类 `automation_last_error` 文本），与 `automation_last_error`
  **同写同清**；老文件缺该行读作空串，容忍不变，末尾追加理由同上）。
  写回时严格按此序全量输出，缺省字段写空串。
- **标量引号契约（单层去引号）**：读取时若值首尾为同一对 `"` 或 `'` 则剥一层，不递归；写入时
  值含 `: `、` #`、换行或首字符为引号 → 拒写（fail-loud，对齐老内核 yaml_set 四闸）。
- **列表字段**（`scope` / `related_files` / `spec_scope` / `depends_on`）：块序列格式
  （`key:` 换行 + 两空格 `- item`），空列表写 `key: []`。
- **历史区容忍**：文件尾部可能出现老内核的 `tools_history:` / `prompts_history:` /
  `transitions_history:` base64 区块。lite **读时跳过、写回时原样逐字保留**（当不透明块处理）。
  lite 自己的历史写 `openspec/changes/<name>/.pipeline-history.jsonl`
  （每行 `{"ts":ISO8601,"kind":"transition|set|init|tool|prompt|import","field"?,"from"?,"to"?,"by"?,"raw"?,"transitionRecordId"?}`；
  tool/prompt/import 三种 kind 与 raw 字段是 `pipeline import` 老仓历史迁移的加法扩展，
  iteration-8，不影响 .pipeline.yaml 兼容；`transitionRecordId`（W1 第二增量，见下方"不可变
  TransitionRecord"条目）存在时表示这一行只是某条 canonical TransitionRecord 的兼容投影，
  不是 legacy 真相源）。
- **解析器**：kernel 手写窄解析器（仅支持上述子集），**禁止引入 yaml npm 包**——
  通用解析器的引号/锚点语义会悄悄偏离老内核三读取器契约。
- **内部提交元数据**（W1 第二增量：WorkflowRun 持久化提交接缝，2026-07-16）：`FIELD_ORDER`
  字段与 opaqueTail 之间可能出现固定三行、要么全有要么全无的保留键——**不进 `FIELD_ORDER`，
  不可被 `pipeline set` 改写**：
  ```
  pipeline_run_id: <uuid>
  pipeline_transition_sequence: <非负整数>
  pipeline_transition_head: <recordId 或字面量 "null">
  ```
  解析规则同"末尾追加"先例：老版本窄解析器遇到首个未知 key（`pipeline_run_id`）起整段当
  opaqueTail 逐字保留，混版本读写无损。老 change 缺这三行 → `runMetadata` 为 `undefined`；
  显式调 `establishRun()` 会立即生成新身份并落盘（幂等，已有 `runMetadata` 则原样返回，不重新
  生成）；单靠 `transact()` 访问（不落到 `commit()`）不会持久化——本次 callback 内生成的临时
  身份只存在于这次调用的内存里，callback 若不提交就直接返回，下次再 `transact()` 会重新生成
  一个不同的临时 id，**不能**把"调用过一次 transact()"等同于"身份已落盘"。新 change 由
  `WorkflowRunRepository.initChange()` 负责：canonical revision 0 的独占创建里同时嵌入
  `runMetadata` 与（若提供）custom workflow 首态（`InitOptions.initialWorkflow`）——不是
  "先建 default/open、后补身份/改首态"两步，写入内容在同目录随机命名的临时文件里以 `wx`
  完整落盘之后，才用 `link()` 原子发布到目标路径（不用裸 `wx` 直接开在目标路径上——那只保证
  "创建时不覆盖已有文件"，不保证目标内容整体原子可见，写入过程中并发 reader 可能读到空/半截
  文件，2026-07-17 codex 架构评估 P1），身份、custom 首态与其余字段从目标文件出现的第一时刻起
  就已经是完整、一致的，不存在任何中间态，`init()` 失败也不会返回一个身份/首态缺失的"半成功"
  结果；随后再生成 YAML adapter。详见
  `packages/kernel/src/state/{run-metadata,run-revision-store,store,workflow-run-repository}.ts`。
- **不可变 TransitionRecord**（同上）：`openspec/changes/<name>/.pipeline-transitions/
  <sequence 零填充 6 位>-<recordId>.json`，每条记录一个文件，写入用「临时文件 + `link()` +
  `unlink()` 临时文件」而非 rename——`link()` 目标已存在时原子失败（`EEXIST`），存储层强制
  不可变，同 sequence+id 不能被覆盖。记录写入本身不是提交点：先写记录（此时是未被引用的
  孤儿）、再发布绑定其 id+digest 的完整 revision，最后一次 `current.json` rename 同时提交新 fields
  与推进的 run 元数据（sequence/head），那次 rename 才是唯一提交点。`GET /api/change/:name/history` 从 `transitionHead`
  沿 `previousRecordId` 回溯这条链，是 transition 审计的真相源。`.pipeline-history.jsonl`
  继续承载 `set`/`init`/`tool`/`prompt`/`import`，以及所有没有 `transitionRecordId` 标记的
  transition 行（legacy/import/非 canonical writer 产生，链建立前后都原样保留）——**合并边界
  是逐条来源标记，不是时间戳**：每次真实 canonical commit 收尾写 JSONL 时都带上
  `transitionRecordId = record.id`（`HistoryEntry.transitionRecordId`，见 `types.ts`，唯一
  构造点是 `packages/kernel/src/state/history.ts` 的 `transitionRecordToHistoryEntry()`），
  `readChangeHistory()` 读取时只保留"无此标记"的 JSONL transition 行 + canonical 链上的记录——
  **这一步纳入/排除判定不比较任何 `ts` 字符串**（此前用链首记录时间戳做切分的版本已废弃——
  同秒冲突、时钟回拨、head 文件缺失导致链空、晚于链建立才执行的 `pipeline import` 都会让时间戳
  边界出错，2026-07-17 codex 架构评估否决）。最终展示顺序仍然要排序，但不是简单拼接后整体按
  `ts` 排序：canonical 链本身的顺序真相是 `sequence`（`readChain()` 回溯出的因果顺序，权威、
  不受时钟影响），只有 JSONL 遗留条目之间、以及遗留条目与 canonical 记录的交叉排位才用 `ts`——
  两指针合并（`mergeCanonicalAndLegacy()`）保证 canonical 记录之间永远不会互相比较，即使某条
  canonical 记录的 `observedAt` 因时钟回拨而"看起来"早于它前一条，展示顺序仍然保持 sequence
  顺序不被打乱（2026-07-17 codex 架构评估同一轮点名）。详见
  `packages/kernel/src/state/transition-record-store.ts` 与 `packages/server/src/transition.ts`
  的 `readChangeHistory()` / `mergeCanonicalAndLegacy()`。

## 2. 相位与转换

- 相位：`open → explore → spec → build ⇄ verify → ship → archive`。
- 合法转换与 `review_phases` 由 `templates/manifest.yaml` 派生（**引擎侧真读该字段**——
  这是对老内核 state-transition.sh 硬编码欠账的构造性修复）。
- 门 marker 文件（项目根）：`.pipeline-pending-confirm` / `-review` / `-interaction`，
  存在且 age ≤ 分级 TTL 视为新鲜 → hook 拦截；陈旧 marker 由 gate.sh 顺手清除。
  TTL 分级（BACKLOG #13，对齐老内核 pipeline-gate.sh；TS 侧单一数值真相源
  `types.ts GATE_TTL_MS`，bash 侧 gate.sh/statusline.sh/session-start.sh 镜像）：
  **confirm 300s**（漏确认安全网，爆炸半径 5min）；**review / interaction 1800s**（跨整个
  决策 phase，缩短会中途误清 → 绕过强制复核）。边界同老内核：age > TTL 才陈旧。

## 3. CLI 面（`pipeline <cmd>`）与输出契约

| cmd | 参数 | stdout 契约 | exit |
|---|---|---|---|
| init | `<name> --track --preset [--user]` | 无（`[INIT] 路径` 走 stderr） | 0/1 |
| get | `<name> <field>` | 裸值一行；字段缺失/未知 → 空行 | 0；change 缺失/名非法=1 |
| set | `<name> <field> <value>` | 无输出 | 0；四闸/枚举/未知字段拒写=1 |
| set-many | `<name> k=v...` | 无输出 | 同上 |
| cas | `<name> <field> <expect> <new>` | 无输出 | 0；不匹配=3；错误=1 |
| transition | `<name> <event>` | 无（`[TRANSITION] name: old -> new` 走 stderr） | 0；非法/未知事件=1 |
| check | `<name>` | guard 报告（人读） | 0 过 / 2 不过 / 1 错误 |
| status | `[name] [--json]` | 单 change 摘要 | 0 |
| list | `[--json]` | 活跃 change 表 | 0 |

get/set/transition 的 stdout 与 exit code 以 **golden-oracle 双跑逐字一致**为准
（oracle=老内核 `skills/pipeline/scripts/pipeline-state.sh`，diff 白名单仅时间戳字段值）。
> 2026-07-06 oracle 实测回写（iteration-1，plan 风险条款授权）：init/get/transition 三行已按老内核
> 实测行为修订（原表为文档口径，实测 init stdout 为空、get 缺失字段=空行+0、transition 走 stderr
> 且非法=1）。**有意差异白名单**（oracle 比对时豁免并在报告标注）：① `check <name>` 单参签名
> （老内核 `check <name> <phase>`，lite 委托 guardCheck 查当前相位）；② transition stderr 无 ANSI 颜色。
> （已消除的旧白名单：门 marker TTL —— iteration-13 #13 恢复分级 confirm 300s / review·interaction
> 1800s，与老内核一致，不再是差异；build⇄verify 自动副作用 —— iteration-10/13 #14 已逐字实现老仓
> 事件体副作用，不再靠出口补偿。）

> 2026-07-13（workflow-customization-engine）：`check <name>` 现同时支持 default 相位与自定义 workflow
> ——读 `.pipeline.yaml` 的 `workflow` 字段分流（同 `transition` 的双轨分岔）：`default`（含历史遗留
> 空串）走相位出口全量规则表（`guardCheck`）；非 `default` 则加载 `.pipeline/workflows/<workflow>.yaml`、
> 按当前 step 声明的 step-guard（`evaluateStepGuards`）评估。exit 语义对两轨一致：guard 不过同样
> `2`、通过 `0`；workflow/step 配置错（文件缺失·非法、当前 step 不在图）`1`。两条路径都是纯预览，
> 绝不写盘。

## 4. 目录所有权（并行 agent 只写自己的格子）

| 目录 | 所有者 | 内容 |
|---|---|---|
| `packages/kernel/src/state/` + 同目录 tests | agent:kernel-state | 解析/写回/锁/CAS/init |
| `packages/kernel/src/flow/` + `templates/manifest.yaml` + tests | agent:kernel-flow | manifest/转换/guard |
| `packages/cli/src/` + tests | agent:cli | commander 装配、渲染 |
| `hooks/` + `.claude-plugin/` | agent:hooks | bash shims、插件清单 |
| `tools/oracle/` | agent:oracle | 双跑 harness、fixtures |
| 根配置 / `packages/kernel/src/types.ts` / docs | 主会话 & integrate | 契约与接缝 |

共享文件（package.json、types.ts）只有 integrate 阶段可改。

## 5. 硬规则

1. TDD：先写红测试再实现；vitest；测试与源码同 package。
2. kernel 零第三方运行时依赖；cli 仅允许 `commander`。
3. TypeScript strict、ESM、NodeNext；node ≥22。
4. hook 热路径（PreToolUse/UserPromptSubmit shim）纯 bash：只做文件存在性/读缓存，**禁 spawn node**。
   breadcrumb 缓存由 CLI 在 transition 时写 `openspec/changes/<name>/.breadcrumb`，shim 只 cat。
   **唯一披露的窄例外**（2026-07-07，GOAL 清单 E6，`workflow-customization-engine` 计划
   Task 9）：`hooks/gate.sh` 在"当前 change 存在 + 声明的 `workflow` 字段非 `default`/未设 +
   本次调用是 `Skill` 工具"三条同时成立时，委托 `node .../pipeline.mjs internal-skill-gate`
   做真实 skill DAG 解锁判定（自定义 workflow 的依赖图判定不值得在 bash 里重新实现一遍）；
   `workflow==='default'` 这条最高频路径（以及无活跃 change / 非 Skill 工具调用）零改动、
   零 spawn，本条硬规则对它的承诺不变。`tools/test-hooks.sh` 把 `gate.sh` 从"零 node"红线
   自证清单里单独摘出、改断言"仅这一处合法引用"，零 spawn 的行为证据见
   `packages/cli/src/internal-skill-gate-hook.integration.test.ts`。
5. 老仓（`/Users/a1234/Documents/code-manager/projects/workflow-plugin`）只读，作 oracle 与语义参考。
6. 时间戳统一 ISO8601 UTC；测试中注入 clock，不直接 `new Date()` 散落业务码。
7. **插件资产零悬空引用（安装期验证，2026-07-06 用户硬要求）**：`plugin.json` / `hooks.json` /
   manifest / 任何 skill 清单引用的每个路径与 skill 名，必须被 `tools/verify-skills.sh`
   在安装/CI 时证实存在（路径存在 + 脚本可执行 + skill 目录含 SKILL.md），缺失即**硬失败并
   逐条列出**。外部 skill 依赖（如 superpowers 系）必须显式清单化声明 + 安装校验，
   **不允许运行时才发现「skill 找不到」**。老内核靠 manifest 选装外部 skills 曾出现此坑，本仓封死。
