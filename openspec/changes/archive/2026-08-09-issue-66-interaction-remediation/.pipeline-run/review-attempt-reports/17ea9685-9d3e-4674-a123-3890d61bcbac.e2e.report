# Issue #66 interaction remediation · Verify attempt 1

## 结论

**PASS（C0 / H0 / M0 / L0）**。Change `issue-66-interaction-remediation` 的第 1/2 次正式 Review 已在同一冻结产品候选上完成，三条必需 lane 均通过；无需也不会启动第 2 次 Review。

- worktree：`/Users/a1234/.codex/worktrees/ccc2/pipeline-worklfow`
- branch：`codex/issue-66-interaction-remediation`
- base / 治理起点：`5f93fd84f6f984c16d55df2eac65caa4f5159958`
- HEAD / `build_sha`：`7b8c023acfc3ce8fd4c52904b42baae7b89fd307`
- tree：`79a487f8d9b7d033a3dc0074af6bc84217f5b78e`
- Review candidate：`workspace:sha256:3ebe723e4ff177ca2fa38b5b140954ddcf10be3c0745fa1d5733c982e9a88dfd`
- attempt id：`17ea9685-9d3e-4674-a123-3890d61bcbac`
- attempt sequence / budget：`1 / 2`，仅消费一次

当前 runtime 的 default Verify input 把裸 Git SHA 交给只接受 candidate-shaped 值的解析器，因此 attempt 按既有 fallback 冻结为 workspace fingerprint。上面的 fingerprint 与同一时点的 `build_sha`、tree 和 67-file candidate diff 一并登记，未借此改变候选或重开 Review。

按用户的强制职责边界，唯一 `agent_type=luna_worker` 只实施并停写，未自审、未再委派；根代理独占 diff、风险、三条 Review lane、验收、PR 与 CI。没有启动 reviewer agent 或外部 Codex CLI；`codex_review_result` 仅作为 default workflow 的兼容字段写入根代理 Review 结论，不冒充独立代理证据。

## 阻断修复验收

| 缺口 | 验收结果 |
| --- | --- |
| replay terminal ordering | terminal 后仅允许同 effect state/visit 的 fully-known 幂等 success resume；其余 known core successor 与 unknown extension 均生成 deterministic global/journey `malformed-order`，并保持 `isVerifiedInteractionJourney=false`、governed completion rate 为 0。 |
| authorization sidecar | 16 KiB bounded、regular-file-only、`O_NOFOLLOW` handle reader；读取前后 identity/size/path stability、严格 UTF-8 与 canonical JSON bytes 均 fail closed；missing、symlink、oversize、malformed、ambiguous、replacement/growth/disappearance races 均有负向测试。 |
| compatibility contract | Build 实现前已通过官方 `requirements-changed` 回到 Spec，把 #46 的 legacy compatibility 承诺修订为 legacy sidecar 缺失时 fail-closed、fresh exact request 恢复；proposal/design/delta/plan 已重新登记。没有在 Build 偷改语义或伪造迁移。 |

append-only identity、canonical binding、stale rejection、same-state suppression、resume metrics 与 scorecard 均由既有测试和本次矩阵保持。旧 Change `issue-46-interaction-events-metrics`、Review 2/2 报告与 attempt `1b9862f4-f32b-4f88-9a95-ceba7e4128d7` 在 candidate diff 中为零变更，未重置、覆盖或启动第三次。

## Review lanes

| lane | 结果 | 根代理证据 |
| --- | --- | --- |
| standards | PASS | 逐文件复核 `5f93fd84..7b8c023a`；检查 terminal fence 的 known/unknown 顺序、completion invalidation、sidecar trust boundary、bounded FD reader、canonical byte equality、调用方恢复路径、dist freshness 与 secret/dependency diff。未确认 correctness/security/maintainability finding。 |
| spec | PASS | `openspec show issue-66-interaction-remediation --json --deltas-only` 返回 9 项 delta；`openspec validate issue-66-interaction-remediation --strict` 通过。隔离 clone 的官方 archive rehearsal 成功，随后两个 main spec 严格校验通过；真实 workspace 的 main spec 未在 Verify 改写。 |
| e2e | PASS | Node `v22.23.2` 隔离 clone 对 exact build SHA 依次完成 build、dist freshness、全仓测试、architecture、comments、default workflow freshness、OpenSpec、bundle smoke、oracle 与最终洁净性检查。无 UI/API 产品改动，browser QA 不适用。 |

## 稳定候选完整门

唯一一次有效完整门在 `/private/tmp/tenon-issue66-gate.siRunb/repo` 的 exact `7b8c023a` 上执行，使用 CI 对齐的 Node `v22.23.2`：

1. `npm run build`：PASS（TypeScript、Dashboard、server、CLI）。
2. `git diff --exit-code -- packages/cli/dist/tenon.mjs packages/server/dist/dashboard.mjs packages/dashboard-app/dist`：PASS。
3. `npm test -- --minWorkers=4 --maxWorkers=4`：389 files PASS；6761 passed、27 skipped、0 failed（6788 total）。
4. `npm run check:architecture`：PASS；864 production files，runtime SCC 0。
5. `npm run check:comments`：PASS。
6. `npm run check:default-workflow-freshness`：PASS。
7. `npm run check:openspec`：44 items PASS、0 failed。
8. `bash tools/test-bundle.sh`：33 PASS、0 failed。
9. `npm run oracle`：5 fixtures，STDOUT/EXIT/YAML 双跑 0 处不一致；两项输出为已登记产品演进。
10. `git diff --exit-code` 与 `git status --porcelain`：PASS，隔离候选无 tracked/untracked 漂移。

首次隔离 preflight 误把 `npm test` 放在 clean clone 的 build 之前：3318 个已能加载的断言通过，但 178 个 suite 因 workspace package dist 尚未生成而统一无法解析 `@tenon/kernel` / `@tenon/automation`。该命令是明确的 **FAIL**，不计有效完整门；同一 clone 随后切到 CI Node 22，并按 build → test 顺序重新开始上面的唯一有效完整门。没有把失败前置运行包装成通过。

27 个条件 skip 均为仓库既有环境门：本机 Docker daemon 不可用，以及 `TENON_REQUIRE_REAL_CODEX!=1`。Docker/full Claude-Code sandbox 与 real-Codex acceptance 留给 canonical CI；本地未伪绿。

## 定向与生成物证据

- worker RED：replay 21 tests / 2 failures，证明 terminal successor 与 terminal 后 unknown extension 被静默跳过；sidecar 初始 4 tests / 1 failure，证明 reordered non-canonical JSON 被接受。
- worker GREEN：五个受影响测试文件 87/87；`npx tsc -b packages/kernel packages/cli --pretty false`；`npm run bundle`；`npm run build:server`；bundle smoke 33/33；`git diff --check`，均通过。
- 根代理在返回 worker 加强时间/sequence/scorecard 断言后重跑同五文件：87/87，通过；产品候选随后冻结且只运行一次有效完整门。
- 当前生成物 SHA-256：CLI `4fde1118d5f6f6a88bd488ce696d13c865a4011b67c036115875f5f9c29ad491`；server `4da99f85c56ea3b4200559747eef27244ec6456dbcbd9abe89fecee5b00d4e8d`。

## OpenSpec 隔离证据

- 真实 workspace Verify 前主规格 `interaction-and-skill-provenance` SHA-256：`85599755d2374f12ec4232b234b16c5717fe5b216afb631ba3d3114f32a128c6`；`interaction-observability` 尚不存在，符合 Ship 前状态。
- `/private/tmp/tenon-issue66-archive.TXzcgb/repo` 的 exact candidate 上执行官方 archive rehearsal：9 additions，成功；两个受影响 main specs 均 strict validate 通过。
- rehearsal 后隔离 main spec SHA-256：provenance `83bcd481089137cdec07bb1a2a38f291c2f9c8859e009a504e3b4ffec608ff90`；observability `fcf73e8ce8c76acb678ddc4f92a4a0a0bb590a39ead51b6198561d55426cef6a`。
- rehearsal 未修改真实 workspace；正式 apply/archive 只在 Ship/Archive 通过官方流程执行。

## 67-file candidate → capability 映射

下列分组覆盖 `git diff --name-only 5f93fd84..7b8c023a` 的全部 67 个路径：

| 路径 | capability / 作用 |
| --- | --- |
| `packages/kernel/src/interaction/replay.ts`、`replay.test.ts` | `interaction-observability`：terminal fence、malformed ordering、completion/scorecard 回归。 |
| `packages/kernel/src/state/review-gate-binding.ts`、`review-gate-binding.test.ts`、`packages/cli/src/commands/review.integration.test.ts` | `interaction-and-skill-provenance`：authorization sidecar bounded/stable/canonical fail-closed 与 CLI recovery。 |
| `packages/cli/dist/tenon.mjs`、`packages/server/dist/dashboard.mjs` | 两个 capability 的受控 bundle/server 生成物；freshness 已验证。 |
| `docs/CONTRACT.md`、`docs/TEST-REALITY.md` | canonical compatibility 与实际测试现实同步。 |
| `docs/adr/issue-66-interaction-remediation.md`、`docs/superpowers/plans/issue-66-interaction-remediation.md`、`docs/superpowers/specs/issue-66-interaction-remediation-design.md` | 两个 capability 的风险决策、实现边界和验收计划。 |
| `openspec/changes/issue-66-interaction-remediation/{proposal.md,design.md,tasks.md}`、`specs/interaction-and-skill-provenance/spec.md`、`specs/interaction-observability/spec.md` | 官方 Change 的修订需求、设计、任务与 delta specs。 |
| `openspec/changes/issue-66-interaction-remediation/.pipeline-{document-locale.json,documents.json,history.jsonl,skill-confirmations.jsonl,skill-invocations.jsonl,workflow-governance.json,workflow-plan.json,yaml}` | 两个 capability 的 canonical workflow、document/Skill receipt 与历史证据。 |
| `openspec/changes/issue-66-interaction-remediation/.pipeline-run/current.json`、`pre-verify-review/000000..000017-*.json`、`revisions/000000..000017-*.json`、`.pipeline-transitions/000001..000005-*.json` | Open → Explore → Spec → requirements-changed → Build 的官方 revision、pre-Verify 与 transition 证据；均由 CLI 生成。 |

Verify 阶段新增的 attempt budget、revision、transition、lane 与本报告属于冻结候选之后的治理证据，不改变 `build_sha` 产品树。

## 剩余风险与边界

1. 本机无 Docker，Docker/full sandbox 与 real-Codex acceptance 依赖 exact-head remote CI；PR 创建后必须等待并核验，不把本地 skip 记为绿。
2. 当前 review-attempt candidate parser 对 default workflow 的裸 `build_sha` 使用 workspace fingerprint fallback；本报告已做双向映射。该既有治理接口不影响本次产品字节，但后续可独立修订，不能在本 remediation 中扩大范围。
3. Windows native-host 条件测试只能由对应 CI runner 覆盖。
4. 本 Change 无 Dashboard UI 与 server API 行为变更，因此没有浏览器可验收面。

综上，正式 attempt 1 可登记为 `standards=pass / spec=pass / e2e=pass`，aggregate 为 PASS；Review 预算最终为 `1/2`，不需要第二次 attempt。
