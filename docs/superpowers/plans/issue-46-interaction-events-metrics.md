---
change: issue-46-interaction-events-metrics
design-doc: docs/superpowers/specs/2026-08-10-interaction-observability-design.md
locale: zh-CN
issue: 46
---

# Interaction Observability 实施计划

## 目标与验收锚

实现 GitHub issue #46 的全部 Acceptance 与 Measurement：版本化隐私安全 envelope、existing exact-review 四段 trace、本地 JSON scorecard、五类 measurement fixtures、loss/ordering negative controls，以及完整 cross-mode matrix。实现由单一 `luna_worker` 在当前已隔离 worktree 串行完成；根代理保留范围、review 与最终 PASS 权限。

## 已定决策

- 使用 kernel interaction domain + state fs adapter，不复用 history/channel/TransitionRecord。
- 不新增依赖，不实现 Dashboard UI/server API，不更新本机插件。
- 不做 throwaway prototype：现有 canonical revision/review/session seam 与 fixture replay 足以快速验证未知点；原型不会降低持久化与公共契约风险。
- 同状态重复 request 投影为 suppressed attempt，不再次计入 human interruption。
- review 总预算固定为本 issue 最多 2 次，不能换 Skill/agent 重置。

## Build 子阶段 1：Tracer bullet 打通真实 review journey

目标是在第一个上下文窗口内纵向打通 `kernel contract → fs projection → review request/ack → transition effect → session resume → CLI integration assertion`，先使用最小 code registry 和一个成功 fixture，尽早暴露 canonical anchor、锁与 bundle 装配问题。

1. 在 `packages/kernel/src/interaction/` 新增纯领域 v1 contract、wire codec、event id/journey id 构造与最小 ordering validator。
   - 定义字段闭集、核心 enums、extension-code grammar、matrix constants 和 stable diagnostics。
   - 测试：`npx vitest run packages/kernel/src/interaction/contract.test.ts packages/kernel/src/interaction/codec.test.ts`。
2. 在 `packages/kernel/src/state/interaction-event-store.ts` 新增普通文件/非 symlink/有界读取与 `appendUnderLock`。
   - 复用 canonical `readCurrentRunRevision` anchor；sequence 从 1 递增并绑定上一行 hash。
   - 覆盖 missing/corrupt/partial write、重复 sequence、跨进程 change-lock 串行。
   - 测试：`npx vitest run packages/kernel/src/state/interaction-event-store.test.ts packages/kernel/src/state/interaction-event-store.crossprocess.integration.test.ts`。
3. 通过可选 typed port 装配 CLI/kernel emitter。
   - `review.ts`：首次 request、same-state suppressed request、successful/delegated acknowledgement。
   - `transition-application.ts` / `transition.ts`：approved exact-event canonical commit 后 effect。
   - `session.ts`：exact Change binding 后 valid resume。
   - `deps.ts`、`main.ts`、`integration-harness.ts`：生产和真实 harness 使用同一 writer/clock，既有 unit mocks 因 optional port 保持兼容。
4. 新增 `packages/cli/src/interaction-events.integration.test.ts`，跑一个 default/backend/interactive/CLI exact-review journey，断言四事件顺序、journey id、workflow/step/state hashes、actor/surface/duration 和隐私字段缺失。

验证：

```bash
npx vitest run \
  packages/kernel/src/interaction/contract.test.ts \
  packages/kernel/src/interaction/codec.test.ts \
  packages/kernel/src/state/interaction-event-store.test.ts \
  packages/cli/src/interaction-events.integration.test.ts
```

回滚边界：删除 optional writer 装配即可恢复旧运行行为；canonical fields/schema 不变，无数据迁移。

**子阶段边界：此处建议 `/clear`，重新读取 Change plan/spec 与 tracer 测试结果。**

## Build 子阶段 2：Replay、metrics 与完整 fixtures

1. 实现 `packages/kernel/src/interaction/replay.ts`。
   - 校验 sequence/hash chain、journey order、state continuity、accepted stale、same-state repeat、invalid resume 与 incomplete success。
   - error diagnostic 阻止 completion；未知 extension code 只进入 unclassified。
2. 实现 `packages/kernel/src/interaction/scorecard.ts` 与 fixture codec。
   - 固定 GCR、interruptions/completion、median resume、event completeness 与 guardrail 公式。
   - 分母为 0 输出 `null`；measurement/negative-control 分离；结果按 fixture id 稳定排序。
3. 创建 `tools/fixtures/interaction-events/v1/manifest.json` 和七个 fixture：
   - `positive.json`
   - `stale-decision.json`
   - `repeated-prompt.json`
   - `failure.json`
   - `resume.json`
   - `projection-loss.json`
   - `malformed-order.json`
4. 添加 replay/scorecard tests，逐项断言 issue 的五类 replay、loss/ordering detection、accepted stale=0、same-state repeat=0 和至少 99% event completeness（有效 measurement fixtures 应为 100%）。

验证：

```bash
npx vitest run \
  packages/kernel/src/interaction/replay.test.ts \
  packages/kernel/src/interaction/scorecard.test.ts
```

回滚边界：fixtures 与纯函数可独立删除，不影响真实 emitter 或 canonical state。

**子阶段边界：此处建议 `/clear`，重新读取 scorecard 输出与 negative-control diagnostics。**

## Build 子阶段 3：CLI、兼容与隐私/并发负向面

1. 新增 `packages/cli/src/commands/interaction.ts`，装配 `tenon interaction scorecard <fixture-dir> --json`。
   - 路径必须显式；普通文件、非 symlink、byte/event cap；错误输出稳定且不回显敏感 payload。
   - 更新 `program.ts` 和 help/command tests。
2. 新增 `packages/cli/src/interaction-scorecard.integration.test.ts`，通过真实 commander/kernel/fs 加载 tracked fixtures，断言机器 JSON 精确 shape 与确定性重复输出。
3. 扩展 review/session/transition tests：
   - same-state request 只产生 suppressed event。
   - stale/wrong-event 不能产生 successful ack/effect。
   - writer I/O failure 只产生 warning，canonical state 保持已提交结果。
   - 并发 event sequence 不逆序、不重复。
   - extra prompt/token/artifact fields 被 codec 拒绝且输出不泄露值。
4. 更新 `tools/check-architecture.mjs` 把 `packages/kernel/src/interaction/` 纳入纯 domain；新增/修改生产文件保持各自长度上限。

验证：

```bash
npx vitest run \
  packages/cli/src/interaction-events.integration.test.ts \
  packages/cli/src/interaction-scorecard.integration.test.ts \
  packages/cli/src/commands/review.integration.test.ts \
  packages/cli/src/commands/session.test.ts \
  packages/cli/src/transition-concurrency.integration.test.ts
npm run check:architecture
```

回滚边界：CLI 命令为加法；删除注册不会改变既有 argv。缺 projection 的旧 Change 继续正常运行。

**子阶段边界：此处建议 `/clear`，根代理开始检查完整 diff，不再扩大实现范围。**

## Build 子阶段 4：契约、分发与定向收敛

1. 更新 `docs/CONTRACT.md`：projection source-of-truth、path、wire schema、event sequence、failure/warning、CLI scorecard JSON 与兼容语义。
2. 更新 `docs/TEST-REALITY.md` 和中英文 CLI reference（若仓库 checker 要求双语对称），只记录真实覆盖/skip。
3. 从 kernel/state public barrels 导出新增契约与 ports；运行 TypeScript build，修复任何跨包公开出口问题。
4. 仅通过 `npm run bundle` 更新 tracked `packages/cli/dist/tenon.mjs`，禁止手改。
5. 运行本计划全部定向测试；worker 回传 diff 范围、命令、结果与已知风险，停止并等待根代理 review，不自行宣告 PASS。

验证：

```bash
npm run build
bash tools/test-bundle.sh
```

回滚边界：新增 projection/fixture/command 均为兼容加法；旧 Change 无迁移。若 contract 必须破坏性修改，立即停止并以 `requirements-changed` 回退 Spec。

## Verify 计划（根代理所有）

1. Review 尝试 1：检查完整 diff、领域/adapter 边界、issue Acceptance/Measurement、隐私、并发、投影失败和公开兼容；只记录 actionable findings。
2. 若存在 finding，回派同一 `luna_worker` 只修确认问题并跑定向测试。
3. Review 尝试 2（仅在第一次有 finding 时使用）：复核修复与回归。仍失败则保存证据并报告 blocked，禁止第三次。
4. 实现稳定后只运行一次最终完整门：

```bash
npm test
npm run build
npm run check:architecture
npm run check:comments
npm run check:default-workflow-freshness
npm run check:release-workflows
npm run check:repository-hygiene
npm run check:docs
bash tools/test-bundle.sh
```

无 Dashboard 源码/API 变更，不启动浏览器；Docker 当前不可用，且真实 AFK emitter 属 #54，明确 skip。

## Ship / Archive

- 同步 applied spec、最终 tasks、verification report 与 dist freshness。
- commit/push `codex/issue-46-interaction-metrics`。
- 创建 PR，正文含 `Closes #46`、Change、验证证据、兼容/残余风险；不 merge、不 release。
- Archive 后等待 exact-head CI，分别报告 CI、review 次数、mergeability 与阻塞项。

