# Verify 报告：update-wal-desired-identity-20260803

## 结论

第三次冻结候选 `67e3ad96691edf797848ac3b7eb3a84b71a1322c` 验证通过。

严重度聚合：Critical 0 / High 0 / Medium 0 / Low 0。

## 冻结范围

- 基线：`origin/main` `dc53843e61f812938f13c684a41ffe1d935e48bf`
- 候选：`67e3ad96691edf797848ac3b7eb3a84b71a1322c`
- capability：`plugin-runtime`
- `origin/main...BUILD_SHA` 共 99 个文件；直接实现/测试/发布物 10 个，Change 治理与证据 89 个，未映射 0 个。
- 完整冻结 diff、native desired producer、command injection、generic runner、真实 journal writer/reader、production coordinator、tracked bundle 与完整 MODIFIED requirement 均已回读。

## 三轨结果

### Reviewer / 安全轨

PASS，Critical/High/Medium/Low 为 0/0/0/0。独立隔离审查确认：

- pending/started 与 completed 恢复均走相同的受限 domain comparator；generic desired 仍为 byte-exact。
- 只忽略已通过 canonical decoder 的 nested marketplace observation HEAD；真正目标 HEAD、root/source/sourceType、pluginRoot/pluginVersion 继续严格匹配。
- nested HEAD 仅接受 `null` 或 40 位小写 Git OID；非法 JSON、未知键、错误类型、目标漂移与第三状态均 fail closed。
- 跨进程锁、journal 原子写、mutation 前后 commit 次序及 runtime activation 边界未改变。
- 前后冻结实现指纹一致，真实工作树只有本轮 Verify 的 canonical 治理证据追加。

### 规格 / E2E 轨

PASS，Critical/High/Medium/Low 为 0/0/0/0。

- 原主规格两个场景逐段精确保留；delta 为 1 个 requirement、6 个场景。
- 隔离 `openspec show`、strict change validate、archive 均 exit 0；archive 为 0 added / 1 modified / 0 removed / 0 renamed，归档后主规格 32/32 strict。
- started 与 completed 两条真实跨进程测试均通过：第一 Node 进程分别在 mutation 后和 completed checkpoint 后以 91/92 退出；第二 Node 进程经 `publishManagedRelease`、`REAL_RUNTIME_INSTALLER`、真实 `release-transaction.json`、`runManagedHostCommand` 与 production native observation 恢复。
- 两条路径的 mutation `executions` 均保持 1，恢复后 journal 均清除；定向测试 2/2，native command/observation 18/18。
- 冻结 CLI `--help` smoke exit 0；真实主规格 digest 前后均为 `513bae7ec8b18dc850f358bac40ce6668b9d53cc3a2aaa6cc3a8f60029b89e25`。

### 隔离全量 / 发布物轨

PASS。所有会写生成物的命令均在 `/tmp` 隔离副本运行：

- `npm ci --ignore-scripts`：exit 0，486 packages，0 vulnerabilities。
- `npm run build`：exit 0；TypeScript project refs、Dashboard typecheck/Vite build、server bundle、CLI bundle 全通过。
- related focused：4 files / 54 tests 全通过。
- 后端/CLI 全量：332 files / 5961 passed / 26 conditional skipped。
- Dashboard 全量：87 files / 1633 passed。
- bundle 二次重建前后 SHA256 均为 `a4d3eb14ae66be1d5db20acfa81fd96d5edebb9fca5ba69c8d1dea3f5c11a31a`。
- `git diff --check` 与隔离 clone 构建前后 patch 对比均 exit 0。

本轨运行期间主流程合法追加了 Verify phase/document canonical 治理文件，使真实工作树的全局 status/diff fingerprint 变化；HEAD 始终为冻结 SHA，变化仅限 OpenSpec 治理文件，产品、测试、配置和发布物未漂移。本轨自身未写真实工作树。

## 逐文件规范映射

冻结范围 99 个文件全部映射到 `openspec/specs/plugin-runtime/spec.md`：10 个直接实现/测试/发布物文件承载 managed host desired identity 与恢复行为；其余 89 个为同一 capability 的 proposal、design、ADR、plan、tasks、报告和 canonical pipeline evidence。未映射文件为 0。

## 条件性剩余风险

26 条 skip 来自本机 Docker daemon 不可用和 `TENON_REQUIRE_REAL_CODEX!=1`，对应 Docker 容器及 canonical real-Codex 场景；其余 7594 个 backend + Dashboard 测试全绿。GitHub CI 继续执行具备对应环境的 canonical gate。

## 决策

上一轮 Medium 已通过真实 started/completed journal 跨进程 writer/codec/store/coordinator 回归关闭。三轨均 PASS 且 Critical/High/Medium 清零，允许推进 `verify-pass`。
