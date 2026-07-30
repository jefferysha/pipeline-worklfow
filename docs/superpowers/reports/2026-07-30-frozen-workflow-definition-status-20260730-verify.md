# Chorus-inspired Orchestration Graph 验证报告

> Change：`frozen-workflow-definition-status-20260730`
> 冻结构建：`4ac76511be2fbfb55fc822109ac7c48a188657ce`
> 对比基线：`ef728bf63f6902251e87fb9495a3dfafe10e42b7`
> 结论：PASS — Critical 0 / High 0 / Medium 0 / Low 2

## 结论

本轮在同一冻结 SHA 上完成发布、E2E/安全、UI/浏览器三轨终审。实现把 Chorus 的
graph 与编排核心映射到 Tenon 的真实治理模型：workflow、change、phase、task、document、
review、session 七类节点，及 governs、contains、transitions、produces、reviews、executes
六类有向关系；后端投影、共享契约、Dashboard 交互、中英文、加载/错误/不可用/真实空/过滤空、
键盘与等价无障碍列表形成闭环。

冻结提交之后没有实现源码漂移。Verify 期间只新增本报告、任务完成标记和 Tenon CLI 生成的
canonical evidence/state。

## 多轨审查

- 发布/规格轨：PASS，C0/H0/M0/L0。完整审查 `origin/main...4ac76511` 的 167 个文件；
  两个 capability、生成物、上游证据、回滚边界、secret 扫描和发布卫生均通过。
- E2E/安全轨：PASS，C0/H0/M0/L2。覆盖 registered-root 锚定、目录链与 leaf
  `O_NOFOLLOW`、fd 绑定有界读取、inode/size/target/parent 读取前后复核、稳定
  403/413/500 错误语义，以及 Server/Client 资源预算对称。
- UI/浏览器轨：PASS，C0/H0/M0/L0。真实 production Dashboard 在 1024/1440/1920px、
  中英文、五类状态、Retry、过滤/搜索/选择/详情和 End/Enter/Escape 路径均通过。
- Codex CLI 补充轨：未执行到审查阶段。首次把完整 binary diff 放入 stdin 超过
  1,048,576 字符；改为让 CLI 在仓库内直接读取 diff 后，CLI 在审查前因账户 usage limit
  退出。没有把该外部失败伪报为绿色；同一冻结 SHA 已由上述三条完整独立轨覆盖。

## 关键能力与 Chorus 映射

| Chorus 能力 | 本轮 Tenon 落点 | 状态 |
| --- | --- | --- |
| graph 中的 agent/task/plan/session 关系 | workflow/change/phase/task/document/review/session 节点与六类边 | 已实现 |
| 后端共享图契约 | `GET /api/orchestration-graph`，`tenon-orchestration-graph/v1` | 已实现 |
| Dashboard 图探索 | 核心/全部、kind/status 筛选、搜索、选择、关系详情 | 已实现 |
| 可访问的等价交互路径 | 与当前可见图同步的语义列表，节点 metadata 与入/出边完整 | 已实现 |
| 编排生命周期 | frozen workflow 的七阶段、transition event、review 与 document evidence | 已实现 |
| 资源与信任边界 | exact-change 只读、fd-bound CAS 式复核、节点/边/id/label 上限 | 已实现 |
| durable agent identity、历史 session/turn、acceptance criteria、task dependency | 需要新的真实 Tenon 持久化来源 | 明确 deferred |
| 写编排、live refresh | 本轮保持只读安全边界 | 明确 deferred |

## 后端、契约与持久化

- Graph 上限：512 nodes、1024 edges、node id 2048、edge id 4096、label 1024；
  C0/C1 控制字符由 Server 与 Dashboard 同一谓词拒绝，超限为
  `413 ORCHESTRATION_GRAPH_LIMIT_EXCEEDED`。
- workflow definition 256 KiB、document ledger 1 MiB/256 records、单文档 2 MiB。
  三条路径均使用 fd 绑定的 `max + 1` 读取并在读取前后复核 identity、size、目标与目录锚。
- Change 或 definition 的路径信任违规分别返回有界 403；内容损坏或普通 I/O 保持 500，
  不把 trust violation 与数据损坏混淆。
- 本轮没有新增数据库或可变 API；Graph 是现有 canonical state、workflow definition、
  tasks、document ledger、review/session evidence 的确定性只读投影。

## 自动化验证

- 受控完整根测试：`npx vitest run --maxWorkers=4 --minWorkers=4`，
  331 files / 5840 pass / 14 honest skips。
- 此前默认 worker 的两次完整运行各出现一个与本改动无关的时序波动：transition effects
  5 秒 timeout、release-store 20ms lock ordering；对应隔离重跑分别 19/19、1/1 通过。
- 冻结终审定向集：backend/kernel 8 files / 429 pass / 9 honest skips；
  Graph Web 3 files / 44 pass。
- `npm run typecheck:web`、`npm run test:web`、`npm run build:web`、root
  `npm run build`：通过。
- hooks 512、adapters 272、skills 66/62：通过。
- comments、architecture、repository hygiene、docs、document templates、identity、
  interaction contract、workflow freshness、bundle（31）均通过。
- oracle：5 fixtures / 0 differences。
- `git diff --check`：通过；变更文件 secret 扫描无命中。
- 缺少 `CLAUDE_CODE_OAUTH_TOKEN` 的 Docker agent case 诚实跳过，和代码失败分开记录。

## OpenSpec 与归档预演

- `openspec show frozen-workflow-definition-status-20260730 --json --deltas-only`：exit 0。
- `openspec validate frozen-workflow-definition-status-20260730 --strict`：exit 0。
- 在冻结 SHA 的隔离副本 `/tmp/tenon-orchestration-verify.D2y29Q` 中运行 archive：
  exit 0，7 个新增 requirement 全部应用。
- 隔离副本的 `orchestration-graph` 与 `frozen-workflow-definition-status`：
  strict validate 均通过。
- 预演没有修改真实 `openspec/specs/**`；真实应用只在进入 Ship 后由官方流程执行。

## 真实浏览器验收

目标为当前 worktree 的 production `Tenon Dashboard`，端口 19187，加载资源
`index-nqkekP5U.js`：

- 默认图 9 nodes / 16 edges；All 图随治理状态读取为 53 nodes / 60 edges。
- 1024、1440、1920px 下页面 `scrollWidth === clientWidth`，无页面横向溢出。
- 中文、英文、loading、error、true empty、filtered empty 均逐态验收；错误态 Retry
  可从注入 500 恢复真实数据。
- 键盘从默认焦点按 End 到 Archive，Enter 选中并展示入/出关系、`aria-pressed=true`，
  Escape 清除选择且保留焦点。
- 截图只写入仓库外的临时目录，没有进入提交。
- 控制台的 context-bundle preview 501 是仓库既有 macOS safe dir-fd 限制；注入场景的
  graph 500 是预期验收流量，均不属于本功能缺陷。

## 文件/能力矩阵

| 路径组 | 能力 |
| --- | --- |
| `packages/kernel/src/state/sync-reader.ts` | fd-bound 有界同步读取与读取前后 identity 复核 |
| `packages/server/src/dashboard/**` | Graph builder、exact-change reader、API、错误与资源预算 |
| `packages/dashboard-app/src/shared/orchestrationGraph.ts` | strict v1 decoder 与对称限制 |
| `packages/dashboard-app/src/shared/OrchestrationGraph*.tsx` | 图、边、可访问列表、状态与键盘交互 |
| `packages/dashboard-app/src/i18n/**` | 中英文闭集文案 |
| `packages/*/dist/**` | 当前 Server/CLI/Dashboard production 生成物 |
| `openspec/changes/frozen-workflow-definition-status-20260730/**` | proposal/design/tasks/delta/ledger/review evidence |
| `docs/research/**`、`docs/adr/**`、`docs/superpowers/**` | 上游固定点、差异映射、设计、计划与验证证据 |

## 剩余风险与回滚

- 同一 OS principal 若可同时控制父目录，仍存在理论上的目录 swap 边界；本轮已通过注册根锚、
  fd leaf 与读取前后 target/parent identity 把风险压到当前本地信任模型内。
- 最坏情况下最多 256 个 2 MiB 文档顺序 digest；有单文件和记录数硬上限，但仍可能增加单次
  graph 请求延迟。
- durable agent identity、历史 session/turn、acceptance criteria、task dependencies、
  写编排与 live refresh 不伪造来源，继续 deferred。
- 回滚为撤销本 PR；API 为新增只读路由，未引入数据库迁移或写操作。旧 Dashboard/Server
  组合通过 404 unavailable 与 strict decoder 失败态安全降级。

最终聚合：**PASS — Critical 0 / High 0 / Medium 0 / Low 2**。两项 Low 已在“剩余风险”
如实记录，不构成 Verify 或发布阻断。
