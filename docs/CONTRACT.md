# CONTRACT — 数据格式 / CLI 面 / 并行开发规则

> 本文件 + `packages/kernel/src/types.ts` 是并行开发的单一契约。改契约 = human gate（见 LOOP.md）。

## 1. `.pipeline.yaml` 格式契约（与老内核字节级兼容）

- 位置：`openspec/changes/<name>/.pipeline.yaml`（相对项目根）。
- **字段序固定**：见 `types.ts::FIELD_ORDER`（37 字段）。写回时严格按此序全量输出，缺省字段写空串。
- **标量引号契约（单层去引号）**：读取时若值首尾为同一对 `"` 或 `'` 则剥一层，不递归；写入时
  值含 `: `、` #`、换行或首字符为引号 → 拒写（fail-loud，对齐老内核 yaml_set 四闸）。
- **列表字段**（`scope` / `related_files` / `spec_scope` / `depends_on`）：块序列格式
  （`key:` 换行 + 两空格 `- item`），空列表写 `key: []`。
- **历史区容忍**：文件尾部可能出现老内核的 `tools_history:` / `prompts_history:` /
  `transitions_history:` base64 区块。lite **读时跳过、写回时原样逐字保留**（当不透明块处理）。
  lite 自己的历史写 `openspec/changes/<name>/.pipeline-history.jsonl`
  （每行 `{"ts":ISO8601,"kind":"transition|set|init","field"?,"from"?,"to"?,"by"?}`）。
- **解析器**：kernel 手写窄解析器（仅支持上述子集），**禁止引入 yaml npm 包**——
  通用解析器的引号/锚点语义会悄悄偏离老内核三读取器契约。

## 2. 相位与转换

- 相位：`open → explore → spec → build ⇄ verify → ship → archive`。
- 合法转换与 `review_phases` 由 `templates/manifest.yaml` 派生（**引擎侧真读该字段**——
  这是对老内核 state-transition.sh 硬编码欠账的构造性修复）。
- 门 marker 文件（项目根）：`.pipeline-pending-confirm` / `-review` / `-interaction`，
  存在且 mtime < 15min 视为新鲜 → hook 拦截。语义与老内核一致。

## 3. CLI 面（`pipeline <cmd>`）与输出契约

| cmd | 参数 | stdout 契约 | exit |
|---|---|---|---|
| init | `<name> --track --preset [--user]` | 创建路径一行 | 0/1 |
| get | `<name> <field>` | 裸值（去引号后），无尾空格 | 0；字段不存在=1 |
| set | `<name> <field> <value>` | 无输出 | 0；四闸拒写=1 |
| set-many | `<name> k=v...` | 无输出 | 同上 |
| cas | `<name> <field> <expect> <new>` | 无输出 | 0；不匹配=3 |
| transition | `<name> <event>` | `old -> new` 一行 | 0；非法=2 |
| check | `<name>` | guard 报告（人读） | 0 过 / 2 不过 |
| status | `[name] [--json]` | 单 change 摘要 | 0 |
| list | `[--json]` | 活跃 change 表 | 0 |

get/set/transition 的 stdout 与 exit code 以 **golden-oracle 双跑逐字一致**为准
（oracle=老内核 `skills/pipeline/scripts/pipeline-state.sh`，diff 白名单仅时间戳字段值）。

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
5. 老仓（`/Users/a1234/Documents/code-manager/projects/workflow-plugin`）只读，作 oracle 与语义参考。
6. 时间戳统一 ISO8601 UTC；测试中注入 clock，不直接 `new Date()` 散落业务码。
