---
change: validate-clean-install-and-plugin-runtime-purpose
design-doc: docs/superpowers/specs/2026-07-27-clean-codex-install-and-plugin-runtime-purpose-design.md
---

# 干净 Codex 首装与 Plugin Runtime Purpose 实施计划

## 验收基线

- 当前 `plugin-runtime` requirements-tail SHA-256：
  `6334e35ef63c7c58a7dd70f4e9c01be44650c622beaab0a23e8620413bff1e5c`。
- 候选必须通过真实 Codex CLI，而不是仅通过 fake-host fixture。
- 所有首装写入必须位于本轮临时 `HOME`、`CODEX_HOME`、`TENON_RUNTIME_HOME`。
- 当前真实 18765、用户凭据、宿主 trust 与插件配置不属于测试写入域。

## Build 子阶段 1：纵向曳光弹——真实 Marketplace 到健康 Dashboard

1. 在 `packages/cli/src/commands/release-coordinator.ts`、
   `packages/cli/src/commands/release-dashboard-coordinator.ts`、
   `packages/cli/src/commands/setup-managed-runtime.ts` 与 `update.ts` 建立
   `dashboardPort` 的显式传递。
2. 先在 `release-coordinator.test.ts` 和 setup/update 定向测试写失败用例：
   `TENON_DASHBOARD_PORT` 必须让 inspect/start 使用同一个非默认端口，未设置仍为 18765。
3. 新建 `tools/clean-codex-install-acceptance.mjs` 的最小 local 模式：
   创建精确临时根、登记当前 checkout Marketplace、真实安装、运行 packaged setup、
   验证 stable launcher 和 Dashboard health。
4. 运行：
   `npx vitest run packages/cli/src/commands/release-coordinator.test.ts packages/cli/src/commands/setup.test.ts packages/cli/src/commands/update.test.ts`
   以及 `node tools/clean-codex-install-acceptance.mjs --mode local`。

此处建议 /clear。

## Build 子阶段 2：重复安装与 preexisting ownership

1. 在 `release-dashboard-coordinator.ts` 实现同 release 健康 listener 的
   `preexisting` 成功路径；activation 前把完整 listener identity 或空端口事实冻结进 WAL。
2. changed release 只精确 adopt/stop 冻结的 current active previous listener；未冻结、空端口
   后新出现、不同作用域/端口或 identity 漂移继续 indeterminate。
3. 恢复 `dashboard-ready` journal 时分别验证 transaction-owned 和 preexisting：
   transaction owner 必须 adopt，preexisting 必须重新 inspect 并逐字段匹配。
4. 在 `release-coordinator.test.ts` 与 real release-store integration 覆盖：
   - 相同 release 重跑成功且不调用 stop/start；
   - 不同 transaction 的不同 release 被拒绝；
   - preexisting journal 恢复时 listener 漂移失败；
   - 后续 evidence 失败时不停止 preexisting listener。
   - changed-release evidence fail → restore previous → fresh retry 精确替换并成功；
   - spawn 私有 child identity mismatch 时由 spawn 层清理；
   - coordinator/restore 收到 mismatch session 时保留 WAL 且拒绝 signal；
   - 已 activation 但缺 pre-activation identity/port 的旧 WAL fail closed。
5. 扩展 local 验收器重复执行同一安装，断言 release id、listener pid 与端口保持一致。

此处建议 /clear。

## Build 子阶段 3：durable 补偿恢复与归属边界

1. 在 `installer.ts` 与 `managed-release-journal.ts` 增加
   `stopping-candidate → reverting-activation → restoring-previous → previous-restored`
   phases，并让 journal codec 校验每阶段必需字段与 cross-field identity。
2. 在 release store transaction 增加 activation checkpoint 的只读证明；恢复时只在 candidate
   activation 仍精确有效时 revert，已等于 checkpoint 时幂等续跑，其他状态失败关闭。
3. 重写 coordinator 补偿为 WAL 驱动恢复：每项副作用前写 phase，previous 精确恢复证明后才
   clear；所有 mismatch adapter session 禁止 `stop()`。
4. 在 `released-dashboard-starter.ts` 让私有 child 在返回 ready 前完成完整 identity 验证，
   对账 child/health PID，mismatch 由私有 handle 自清理；previous restore 使用唯一 identity。
5. 先增加逐 phase crash/restart、revert 已完成、restore 已完成、mismatch zero-signal、旧 WAL
   缺冻结事实的失败测试，再实现并运行 coordinator、journal、release-store 定向集成测试。

此处建议 /clear。

## Build 子阶段 4：真实新进程发现与精确清理

1. 验收器启动无模型调用的 `codex app-server --stdio`，完成 initialize 后调用
   `plugin/installed`、`skills/list`、`hooks/list`。
2. 断言 `tenon@tenon` 已安装启用、`tenon:tenon` 可发现、四类 hooks 完整；
   `untrusted` 只作为人工 trust 边界报告。
3. 对 doctor JSON、runtime status、`/api/health`、HTML title/content 做结构化断言；
   不以 HTTP 200 代替产品身份。
4. 清理前重新读取 health，只有 pid/release/state scope/transaction 与本轮记录完全一致才终止；
   临时目录删除只接受验收器创建并验证过的精确根。
5. 为 RPC framing、异常响应、端口占用、身份漂移和清理拒绝增加 Node tests。

此处建议 /clear。

## Build 子阶段 5：CI、Release、严格解析、文档与 Purpose-only

1. 在 `package.json` 增加明确的 local/public acceptance scripts。
2. `.github/workflows/ci.yml` 安装固定的受支持 Codex CLI 并强制运行 local 轨，不允许静默 skip。
3. 验收器接受显式 public ref/commit 并生成对应 raw URL；`.github/workflows/release.yml`
   在创建 GitHub release 前传入当前 checkout 的精确 commit，禁止隐式回退 `main`。
4. 在 kernel lock 测试先加入 `99999999junk` 等失败值，改为完整十进制安全正整数解析；
   在 Dashboard health 测试先加入 503 text body，确保 HTTP status 不被 JSON parse 覆盖。
5. 更新中英文安装文档和 release 说明，区分：
   - fixture bootstrap 单测；
   - real local-candidate CI；
   - real public exact-checkout-ref release acceptance；
   - `/hooks` 人工 trust。
6. 只在 `openspec/specs/plugin-runtime/spec.md` 的标题与 `## Requirements` 之间插入准确
   `## Purpose`。随后计算 requirements-tail SHA-256，必须与基线完全一致。

此处建议 /clear。

## Build 子阶段 6：一次性全量收敛

1. 运行定向 tests、`npm run check:npx-package`、真实 local clean install。
2. 运行 `npm run build`、`npm test`、`npm run test:web`、hooks、adapters、skills、bundle、
   docs、identity、architecture、repository hygiene、oracle 与 migration CAS。
3. 运行 `npx openspec validate plugin-runtime --strict`、
   `npx openspec validate plugin-distribution --strict` 和本 Change strict validate。
4. 在隔离仓库副本执行 OpenSpec archive rehearsal，验证：
   - plugin-distribution delta 正确应用；
   - plugin-runtime Purpose 保留；
   - requirements-tail digest 不变；
   - 真实工作区 fingerprint 零输出。
5. 对完整 diff、两项 capability、失败路径、CI/release 行为和所有测试结果执行一次
   pre-Verify convergence review；Critical/High/Medium 全部清零后才冻结候选。

## Verify 与回滚

- Verify 在同一冻结 build SHA 上重新运行 Reviewer、全量测试、绑定同一 checkout commit 的
  真实 public clean install、
  strict validate 和 archive rehearsal；各轨全部结束后一次性聚合。
- 若真实 Codex 或 GitHub 外部依赖失败，报告具体外部阻塞，不以 local/fake 结果替代 public PASS。
- 回滚代码时可移除 acceptance 接线并恢复 coordinator；Purpose 回滚只删除 Purpose 区段，
  requirements-tail digest 仍必须保持基线。
- 验收失败清理只处理临时作用域与精确 owned listener，不能通过删除真实配置或停止未知进程恢复。
