# validate-clean-install-and-plugin-runtime-purpose Verify 报告（第 1 轮）

## 结论

FAIL。冻结基线
`workspace:sha256:c8ccbe97d19f723628e9520eb77f4bdbfa7a86f9d1513e34469f9910a8ae4754`
在三轨聚合前后保持不变，但独立 Reviewer 发现 2 项 High、2 项 Medium，必须返回 Build
修复；不得接受偏差或继续 Ship。

## 各轨结果

### Reviewer：FAIL

1. **High** — same-release 重跑将 Dashboard 记为 `preexisting` 后，如果 ready evidence
   提交失败，当前补偿仍会 `revertActivation()`。真实 release store 可能把 active 回退到旧
   `previousRelease` 或 `null`，但既有 Dashboard 仍运行当前 release，造成 selection、launcher
   与 Dashboard 身份分裂。现有 mock 仅断言调用 `revert`，未验证真实持久化结果。
2. **High** — app-server RPC 超时只发 `SIGTERM`，未 reject pending RPC，也未在
   `close/error` 结清请求。无响应或畸形响应可能永久 pending、无界挂起，或因 unresolved
   Promise 不维持事件循环而让验收提前以 0 退出，形成强门假绿。
3. **Medium** — `dashboardPort` 未写入 managed release WAL。若在
   `starting-dashboard` 窗口崩溃且重试环境端口变化，恢复会转而检查或启动新端口，不能精确
   收口旧端口上的本事务 listener。
4. **Medium** — 通用子进程超时只发 `SIGTERM` 后立即 reject，不等待退出也不升级终止；
   `finally` 可能在进程仍运行时清理 fixture，造成竞态或遗留进程。

这些问题分别违反 delta 对重复安装同 release/同 listener、失败关闭、精确所有权清理的要求，
也违反设计中 request-scoped port 贯穿 inspect/start/recovery 的约束。

### E2E：PASS，但不能覆盖 Reviewer 失败

- `codex --version`：`codex-cli 0.144.1`
- Node 定向测试：5/5
- Vitest 定向测试：95/95
- `npm run check:npx-package`：6/6
- 两个独立 fixture 中的 `npm run test:clean-install` 均通过；每个 fixture 内重复安装两次，
  release、transaction、state scope、PID 保持一致。
- 新 Codex app-server 发现 `tenon@tenon`、`tenon:tenon` 和四类 hooks；hooks 仍为
  `untrusted`，符合人工授权边界。
- runtime、doctor、Dashboard health/HTML 身份通过；两个 listener 均退出、端口均关闭。
- 本轨未执行公网 `--mode public`，公网入口仍由后续重新 Verify 和 Release 门禁证明。

### Codex CLI：降级

独立只读 Codex CLI 已完整读取冻结 diff、Change 文档和相关规格，但宿主侧反复出现模型缓存字段、
analytics 和 MCP 502 警告，且未在 Reviewer 已确认 High 后形成可靠终态；主线中止该进程。
本轨不能计为 PASS，也不影响 Reviewer FAIL 的回退结论。

## OpenSpec 与 Purpose-only 证据

- `openspec validate validate-clean-install-and-plugin-runtime-purpose --strict`：PASS。
- `openspec validate plugin-runtime --strict`：PASS。
- `openspec validate plugin-distribution --strict`：PASS。
- `plugin-runtime` 从 `## Requirements` 到 EOF 的修改前后 SHA-256 均为
  `6334e35ef63c7c58a7dd70f4e9c01be44650c622beaab0a23e8620413bff1e5c`；
  本 Change 只补准确 Purpose，没有改变其 requirements。
- OpenSpec `1.6.0` 隔离归档演练成功：
  `openspec archive validate-clean-install-and-plugin-runtime-purpose --yes --json`
  在保留权限和 symlink 的副本中生成
  `2026-07-27-validate-clean-install-and-plugin-runtime-purpose`，`specsUpdated=true`，
  `added=1, modified=0, removed=0, renamed=0`；副本中的相关主规格 strict validate 通过，
  真实主规格 digest 前后不变。

## 逐文件 capability 回读

- managed release coordinator、setup/update、相关测试与 `packages/cli/dist/tenon.mjs`
  → `openspec/specs/plugin-runtime/spec.md`、`openspec/specs/plugin-distribution/spec.md`。
- clean-install 工具、package scripts、CI/Release workflow、中英文安装文档
  → `openspec/specs/plugin-distribution/spec.md`。
- `openspec/specs/plugin-runtime/spec.md`
  → plugin-runtime 文档元数据；requirements-tail digest 保持不变。
- Change proposal/design/tasks/delta、ADR、计划
  → `plugin-distribution` delta 与本 Change 治理边界。

## Build 返工要求

下一轮必须一次性完成并重新全量审查：

1. 对 same-release/preexisting Dashboard 设计真实 activation compensation 语义并用真实 store
   集成测试证明 selection、launcher、Dashboard 保持一致。
2. app-server RPC 对 timeout、close、error、畸形响应全部 fail closed，所有 pending 请求必须
   确定性结清。
3. 把 request-scoped Dashboard port 持久化进 WAL，并覆盖崩溃恢复时环境端口变化的场景。
4. 所有外部子进程超时必须等待退出；必要时升级终止，只有确认退出后才允许清理 fixture。
5. 补齐 RPC framing/异常响应、端口占用、身份漂移和清理拒绝覆盖等测试，再运行全量回归、
   两遍真实 local clean-install、strict validate 和隔离归档演练。
