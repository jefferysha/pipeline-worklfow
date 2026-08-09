---
change: issue-66-interaction-remediation
design-doc: docs/superpowers/specs/issue-66-interaction-remediation-design.md
locale: zh-CN
---

# 实施计划

## 目标与冻结

在不改写 #46 Review 2/2、冻结候选 `6cf44730294aa51e06fa4c5ac509e198214c4568` 或治理提交 `5f93fd84f6f984c16d55df2eac65caa4f5159958` 的前提下，由且仅由一个 `agent_type=luna_worker` 修复 #66 三项阻断。根代理拥有需求拆解、风险、code review、验收、`build_sha`、PR 与 CI；worker 只实施本计划并在定向验证后停写。

不新增依赖、不改 Dashboard/server API/本机插件、不启动 #46 第三次 Review。产品候选稳定后只跑一次完整门；若正式 Review 发现产品缺陷，回 Build 修复并最多再 Review 一次。

## Phase 0：根代理完成 canonical requirements reconciliation

- [x] 在任何应用代码写入或 worker 派发前，让本 Change 的 compatibility 语义通过官方 Spec review；进入 Build 后以 `requirements-changed` 记录相对 #46 “canonical 行为完全兼容”的真实变化，回 Spec 重登记 proposal/design/delta/plan。
- [x] 冻结最终 worker ownership、允许文件、非目标、正常/负向/race 测试矩阵与完成定义。

状态（2026-08-10）：真实 `requirements-changed` 已完成；最终 Spec review 通过后才能再次进入 Build。此时实现文件仍等于起点，尚未创建 worker。

验收：`tenon status issue-66-interaction-remediation --json` 显示最终 `phase=build`，文档 status/check 通过，history 有真实 `requirements-changed` 回退与随后 `spec-complete`，实现文件仍等于起点。

## Phase 1：Tracer bullet——从 replay/sidecar 到 CLI 恢复闭环

### 1.1 RED：先固化三个最小反例

- [ ] 在 `packages/kernel/src/interaction/replay.test.ts` 增加一个 stale-terminal 后 success chain 的断言：全局和 journey-local 都有 `malformed-order`，`validResume=false`，`isVerifiedInteractionJourney=false`。
- [ ] 新建 `packages/kernel/src/state/review-gate-binding.test.ts`：canonical writer round-trip 成功；静态 symlink 与 oversize sidecar 在解析前拒绝。
- [ ] 扩展 `packages/cli/src/commands/review.integration.test.ts`：legacy approved receipt 缺 binding 时 acknowledge/transition 拒绝，fresh exact request 原子重建后可以重新 acknowledge/transition。

验证：

```bash
npx vitest run packages/kernel/src/interaction/replay.test.ts packages/kernel/src/state/review-gate-binding.test.ts packages/cli/src/commands/review.integration.test.ts --minWorkers=4 --maxWorkers=4
```

预期：新增断言在实现前失败，且失败只对应 #66 三项缺口。

### 1.2 GREEN：最小端到端实现

- [ ] 在 `packages/kernel/src/interaction/replay.ts` 将 terminal fence 放在 unknown extension 成功语义跳过之前；只允许 codes 完整已知的幂等 `resume.validated(success)`，其他 terminal-after-core 同时记录两级 `malformed-order` 并停止该事件语义。
- [ ] 在 `packages/kernel/src/state/review-gate-binding.ts` 复用 `readOptionalBoundedRegularTextFile` / `BoundedFileHandleReader`，新增 16 KiB 常量、严格 bounded physical read 与 canonical-byte comparison；保持 missing 返回 `undefined`、writer/digest/matcher行为不变。
- [ ] 仅在测试需要时增加向后兼容的可选 reader seam；不得复制 `document-path` 的 fd/path fence或扩展其他公共 API。

验证：重跑 1.1 命令，预期全部通过；再运行：

```bash
npx tsc -b packages/kernel packages/cli --pretty false
```

预期：类型构建通过，生产层级仍是 interaction domain -> state adapter -> CLI orchestration。

**子阶段边界：此处建议 /clear。**

## Phase 2：穷尽 terminal、物理竞态与 compatibility 负向矩阵

### 2.1 Replay 全矩阵

- [ ] 参数化覆盖 rejected acknowledgement、failed effect、`operation.failed`、valid resume 四类 terminal，后接 request、prompt-suppressed、acknowledgement、effect、resume、operation failure 六类 core event。
- [ ] 增加 unknown namespaced extension 包装的 terminal-after-core，证明既进入 `unclassified_codes` 又产生 `malformed-order`。
- [ ] 保留并强化幂等 valid resume 正向测试：第一次 `validResumeAt`、completion、scorecard 数值不变。

### 2.2 Sidecar normal/negative/race

- [ ] 覆盖 missing、普通 canonical file、directory/non-regular、static symlink、oversize、invalid UTF-8、malformed JSON、未知/缺失字段、duplicate key、字段重排、额外 whitespace/trailing bytes。
- [ ] 通过 bounded reader seam 在 read window 内确定性制造 same-inode same-size mutation、growth、path replacement、symlink replacement 与 disappearance；断言全部 fail closed 且错误不含文件内容。
- [ ] CLI 层至少覆盖 corrupt/oversize/symlink sidecar 的 acknowledge/transition 拒绝与 fresh request recovery；interaction projection missing/corrupt 仍不参与 canonical auth。

验证：

```bash
npx vitest run packages/kernel/src/interaction/replay.test.ts packages/kernel/src/interaction/scorecard.test.ts packages/kernel/src/state/review-gate-binding.test.ts packages/cli/src/commands/review.integration.test.ts packages/cli/src/commands/transition.test.ts --minWorkers=4 --maxWorkers=4
```

预期：全部通过；旧 positive/stale/repeated/failure/resume scorecard 与 append-only identity 断言不变。

**子阶段边界：此处建议 /clear。**

## Phase 3：契约、受控 dist 与 worker 交接

- [ ] 同步 `docs/CONTRACT.md`：sidecar version/canonical bytes/16 KiB/physical proof、legacy fail-closed/fresh-request recovery，以及 projection 不参与授权。
- [ ] 同步 `docs/TEST-REALITY.md`：只记录本轮真实定向/最终门结果与环境 skip，不沿用 #46 旧候选数值冒充新证据。
- [ ] 使用 `npm run bundle` / `npm run build:server` 等现有生成脚本同步受影响 tracked dist；不得手改 `packages/cli/dist/tenon.mjs` 或 `packages/server/dist/dashboard.mjs`，也不得提前执行根代理保留的一次完整门。
- [ ] Worker 提交交接清单：修改文件、关键不变量、实际命令/通过数、未运行项；停止写入，不做 self-review、不冻结 `build_sha`、不提交/推送/开 PR。

Worker 定向交接门：

```bash
npx tsc -b packages/kernel packages/cli --pretty false
npx vitest run packages/kernel/src/interaction/replay.test.ts packages/kernel/src/interaction/scorecard.test.ts packages/kernel/src/state/review-gate-binding.test.ts packages/cli/src/commands/review.integration.test.ts packages/cli/src/commands/transition.test.ts --minWorkers=4 --maxWorkers=4
npm run bundle
npm run build:server
bash tools/test-bundle.sh
```

预期：全部通过；`git diff --check` 除已登记旧文档已知 EOF warning 外无新增 whitespace；dist 只包含源码构建的对应变化。

## Phase 4：根代理 Build-readiness、正式 Review 与一次完整门

- [ ] 根代理逐文件检查 worker diff、调用方、测试覆盖、生产文件长度、spec/docs/dist freshness；不以 worker 自述代替 review。
- [ ] 所有 Build-readiness 缺口在正式 Review 前收敛，冻结新的 exact `build_sha` / tree / candidate fingerprint。
- [ ] 对同一候选执行正式 Review attempt 1（hard cap 2）。发现 C/H/M 产品 finding 才回 Build 交由同一 worker 修复并生成新候选；纯测试/docs 修订不重跑已通过的全仓门。attempt 2 仍失败则保留证据并 blocked。
- [ ] 稳定产品候选只执行一次完整门：

```bash
npm test -- --minWorkers=4 --maxWorkers=4
npm run build
npm run check:architecture
npm run check:comments
npm run check:default-workflow-freshness
bash tools/test-bundle.sh
npm run oracle
```

- [ ] 完成 OpenSpec/check/verification report；无 UI/server route 变化，browser QA 明确不适用。Docker/real-Codex 只按既有环境 gate 诚实报告 skip。

## Phase 5：Ship / Archive / PR / exact-head CI

- [ ] 应用并登记 `interaction-observability` 与 `interaction-and-skill-provenance` 两个 capability，完成 Ship/Archive 官方证据。
- [ ] 仅提交 in-scope 文件，push `codex/issue-66-interaction-remediation`，创建非 draft PR；正文包含用户价值、兼容/恢复、实际测试、Review/Change、风险/回滚、`Closes #66` 与 `Closes #46`。
- [ ] 等待 PR exact HEAD 的 required CI，核验 mergeability 与 review threads；不 merge、不发布、不更新本机插件。

## 验证

完成定义：

- terminal 后每个非法 core event 都产生 `malformed-order`，绝不误计 completion；唯一幂等 resume 保留原 metric。
- sidecar bounded、ordinary-file-only、proof/read 物理稳定；replacement/symlink/oversize/malformed/ambiguous/race 全部 fail closed。
- legacy receipt compatibility 已在 proposal/design/delta/ADR/contract 中显式改为 fail-closed + fresh request recovery，并有真实 `requirements-changed` 治理证据。
- append-only identity、canonical binding、stale rejection、resume metrics、scorecard 与隐私边界保持。
- 新 Change 的 Review 不超过 2 次，PR/CI 绑定 exact HEAD，旧 #46 Review/attempt 未修改。

## 回滚

- 实现/测试回滚：恢复到本 Change 起点 `5f93fd84f6f984c16d55df2eac65caa4f5159958`，保留 Change/Review/失败证据，不用 destructive reset。
- 行为回滚风险：旧 reader 会重新暴露 TOCTOU/无界读取，旧 replay 会重新静默忽略 terminal-after-core；因此只有等价安全替代存在时才能回滚产品代码。
- 数据恢复：本 Change 不批量迁移 sidecar；不可信 legacy receipt 的恢复操作始终是重新 request/acknowledge，不修改历史 receipt 或 interaction log。
