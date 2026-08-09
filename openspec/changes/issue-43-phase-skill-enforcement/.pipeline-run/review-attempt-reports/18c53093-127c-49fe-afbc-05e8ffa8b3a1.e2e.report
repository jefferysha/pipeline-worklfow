# Issue #43 Verify 报告

- Change：`issue-43-phase-skill-enforcement`
- Issue：`#43 Reconcile free/default phase Skill enforcement end to end`
- Track / Workflow / Phase：`backend / default / verify`
- 冻结 `build_sha` / HEAD：`d7b3d4a5f57636540393f9e67aa56c7f98bda373`
- Review attempt：`18c53093-127c-49fe-afbc-05e8ffa8b3a1`，sequence `1`，预算 `1/2`
- attempt candidate：`workspace:sha256:c3cb8a7e2244b7d02004bf17da55b16b584c8f37cfaf0b59c847335ce6c4d17d`
- 基线：`origin/main=d58df7a0ecbb155d54d81e782150bf68567cb617`，已证明为 HEAD 祖先
- 结论：**PASS；正式 Review 1/2 无 finding。**

## 冻结候选与复用边界

`build_sha` 精确绑定最终 candidate HEAD。Tenon 1.0.2 的 review-attempt candidate 解析只接受带类型的
baseline；裸 40 位 `build_sha` 预检被拒且未消费次数，因此正式 attempt 使用内容寻址的 workspace
fingerprint。它排除 `docs/`、`openspec/` 与 pipeline 控制状态，适合在 Verify 写报告而不移动实现靶。

唯一完整核心门在 `d72920ac` 上得到 `381/381` test files、`6699 passed`。最终 HEAD 相对该提交
只有 `packages/dashboard-app/src/api/serverIntegration.test.tsx` 两行测试 fixture 变化；生产、配置、
生成物与 bundle 字节均未变化。按编排明确约束不运行第 4 套全仓/clean-install，而在最终 HEAD 上补跑
完整 Dashboard、Dashboard typecheck、build/dist freshness、OpenSpec 演练与 fingerprint 证明。

## Acceptance / Measurement

| 验收项 | 证据 | 结论 |
| --- | --- | --- |
| resolver 区分 phase requirement 与 Track overlay | required = phase + matrix mandatory；available = phase + matrix mandatory/recommended；explicit = phase + named profile；稳定 phase-first 去重 | ✅ |
| free/default 缺当前 phase Skill 时 Hook、transition、AFK 均拒绝 | 真实 Hook 负例；CLI exit 2；HTTP 409 且无 canonical 写；AFK 缺 phase 内容为 `skill-bundle-skill-not-found`、无 snapshot/sandbox | ✅ |
| custom Workflow 语义不变 | custom 仍只消费冻结 StepIR/step-declared skills；非 starter wiring 按 execution model 闭集分派 | ✅ |
| PM/frontend/backend matrix-enabled 不回归 | phase-first 后保留原 mandatory/recommended 顺序；完整核心套件与多相位 orchestration 通过 | ✅ |
| 负向测试证明 free/default 不可绕过 | free optional Skill 先调用被 Hook 拒绝；CLI/HTTP 缺 receipt 均 fail-closed | ✅ |
| manifest/runtime/doctor/Skills/docs 一致 | source workflow、generated runtime、doctor `skills:workflow-phase`、manifest 注释、Skill 与 en/zh 文档统一 | ✅ |
| 无有效当前 phase receipt 却通过 mandatory exit | 新增负例均拒绝，观察值为 0 | ✅ |
| source/generated/documented policy 漂移使 CI 失败 | `check:docs` 含 source→generated→dispatch→en/zh 锚点及两条 drift 负测；default freshness 通过 | ✅ |

## Standards lane

- 根代理逐项复核 132 个冻结候选文件；无 correctness、regression、security、concurrency 或 maintainability finding。
- `npm run test -- --minWorkers=4 --maxWorkers=4`：`381/381` files，`6699 passed`，`27 skipped`。
  原始日志：`/tmp/tenon-issue43-final.oZEjId/full-vitest.log`。
- `npm run build`：kernel/channel/tap/automation/CLI/server TypeScript、Dashboard Vite、server/CLI bundle 全通过。
  最终 fixture 后日志：`/tmp/tenon-issue43-final.oZEjId/post-dashboard-build.log`。
- `npm run check:architecture`：851 个 production files，runtime SCC 0，通过。
- `npm run check:docs`：14 个 checker tests + 39 个 canonical Markdown，通过；`check:comments` 通过。
- dependency audit、identity、release workflows、repository hygiene、document templates、OpenSpec、docs
  sync/check/build/smoke、npx package 与本地 clean-install 均通过。
- 受控生成/发行资产相对 HEAD 无差异：
  - generated runtime SHA-256 `4201ff9da5bb7b4c012d717f9fdf8b7622842c8c7b464bcdb3d594e5f170e3a9`
  - CLI bundle SHA-256 `896c08ddf518a7731f3cb82dd4d9f5e2ee8d8e611a973783a2a058ed5dfb25e9`
  - server bundle SHA-256 `c6b1c47fde37e8234b78b601d73b3b56ceb9c0594c038861731f81f94d26fce2`
- `git diff --check` 通过；无 Vitest/npm/tsc/Vite/esbuild writer。

## Spec lane

- `openspec show issue-43-phase-skill-enforcement --json --deltas-only`：5 个 ADDED requirements。
- `openspec validate issue-43-phase-skill-enforcement --strict --json`：1/1 通过。
- 使用 `git archive` 将精确 `d7b3d4a5…` 复制到隔离目录，在副本执行官方
  `openspec archive ... --yes --json` 成功应用 5 个 requirements；随后
  `openspec validate --all --strict --json` 为 43/43 通过。
- 真实 `openspec/specs/**/spec.md` 前后 SHA-256 清单完全相同；工作区 fingerprint 前后均为
  `workspace:sha256:c3cb8a7e…d17d`。
- 原始证据：`/tmp/tenon-issue43-verify-attempt1.FOQ8j6/openspec-*.json` 与
  `main-specs-{before,after}.sha256`。

## E2E lane

- 最终 HEAD 完整 Dashboard：`98/98` files，`1741/1741` tests，通过；`npm run typecheck:web` 通过。
  原始日志：`/tmp/tenon-issue43-verify-attempt1.FOQ8j6/dashboard-current.log`。
- 核心 381/381、6699 passed 结果来自产品字节相同的 `d72920ac`；到最终 HEAD 的唯一差异是上述
  Dashboard 测试 fixture，差异清单见 `core-to-final-diff.txt`。
- Docker daemon 不可用：冻结 skill bundle 容器、AFK run、runner/container 真实 Docker E2E
  诚实跳过；完整套件日志明确输出 `HONEST SKIP`。非 Docker 的 resolver、preparation、零 sandbox/
  snapshot 与 lifecycle 断言均通过。
- 未运行浏览器视觉验收：本 Change 没有 Dashboard 产品/UI 字节变化，最后修订仅为 server 集成测试 receipt fixture。
- 未修改本机已安装插件，未发布版本、未 merge。

## 兼容、并发与残余风险

- 历史 pre-issue #43 frozen snapshot 保持原字节与空 phase declaration，不用当前模板偷偷重建；
  新 snapshot 才冻结七个 phase Skills。这是 snapshot 兼容边界。
- Hook reconciliation 保持在 change lock 内；transition 继续使用 canonical transaction；AFK coordinate
  在 change lock 中捕获并把 manifest/registry/capability 纳入 digest，准备后复核 TOCTOU。
- 唯一未在本机执行的行为面是真 Docker 容器 E2E；由 exact-head CI 再核。review-attempt 裸 SHA
  格式兼容 seam 属 Tenon 1.0.2 控制面限制，不改变 `build_sha=HEAD` 的冻结事实。

## Step 1.5 逐文件 spec 回读

每个冻结候选文件均已对照本 Change 的 `workflow-skill-enforcement` delta spec 回读。机器生成的
pipeline revision/receipt 文件按同一 Change 状态机与后续 `tenon check` 校验，未手工编辑。

| 改动文件 | 命中的 capability spec | 已回读规范并比对 diff |
| --- | --- | --- |
| `docs/adr/issue-43-phase-skill-enforcement.md` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 需求、ADR、设计与执行计划一致 |
| `docs/superpowers/plans/issue-43-phase-skill-enforcement.md` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 需求、ADR、设计与执行计划一致 |
| `docs/superpowers/specs/issue-43-phase-skill-enforcement-design.md` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 需求、ADR、设计与执行计划一致 |
| `docs/usage/default-workflow.md` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ source/generated/Skill/双语文档漂移合同一致 |
| `docs/usage/routing-and-workflows.md` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ source/generated/Skill/双语文档漂移合同一致 |
| `docs/usage/zh-CN/default-workflow.md` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ source/generated/Skill/双语文档漂移合同一致 |
| `docs/usage/zh-CN/routing-and-workflows.md` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ source/generated/Skill/双语文档漂移合同一致 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-document-locale.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-documents.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-history.jsonl` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/current.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000000-6c958cbf-16db-4ffc-abe7-1f59039a8231.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000001-86907297-7dd4-4d07-a622-95ecd14b3389.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000002-6c87a35c-95ba-4499-ae78-6a8a2306c23a.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000003-8795848d-b621-4f2c-b34a-55192bb41820.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000004-1332e4c8-0daa-46c5-afac-26524a9e5b11.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000005-e7c81772-f900-462d-9855-83987c4ec887.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000006-53ea13c7-9d54-4547-a29c-9c82ffcd2724.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000007-e1d60561-b5f0-4ead-8a30-31a5a5e7dcb7.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000008-31ce0595-0a36-4a69-ad12-4fa63adde8f5.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000009-1eb31adf-62be-40aa-9535-2ea2b83d4a41.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000010-603e9156-6bca-4e86-9ee4-04ae2f811fda.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000011-f6e56ea0-8bf7-4235-9a35-5e920b58b696.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000012-9f6c541b-7056-47da-ba95-2d0c798cf1ec.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000013-f52c47fa-7a06-4d06-811d-80d8acfbe0a5.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000014-c2a12047-62fe-4774-8320-a06b1a0da3a2.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000015-6bebeade-381c-46a6-a855-c81687f713b9.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000016-59344053-d6f3-4de5-ade3-25a91e92f246.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000017-90c50d43-dc0c-4b75-8350-9cdce94fa1aa.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000018-cd01c523-d763-4123-8dbf-c1b015d4c112.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000019-00a189af-6fb6-4680-8c39-55bac4ddd6b2.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000020-6d289239-ec78-40bb-89da-30d53cd0d5ff.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000021-471ba3bb-2dcc-4088-b2ef-767fd8e6cb21.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000022-71905233-8b80-49b9-910c-cd7ccf67e95b.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000023-3e978061-b451-4762-b8c4-26d70ff5466a.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000024-bf1a7f6b-a039-4709-bfd1-a53583d30068.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000025-8899af07-6f86-4e48-a23f-fc84c0352a7f.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/pre-verify-review/000026-864c86bd-95c2-4258-8039-b8801d412fd5.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000000-6c958cbf-16db-4ffc-abe7-1f59039a8231.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000001-86907297-7dd4-4d07-a622-95ecd14b3389.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000002-6c87a35c-95ba-4499-ae78-6a8a2306c23a.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000003-8795848d-b621-4f2c-b34a-55192bb41820.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000004-1332e4c8-0daa-46c5-afac-26524a9e5b11.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000005-e7c81772-f900-462d-9855-83987c4ec887.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000006-53ea13c7-9d54-4547-a29c-9c82ffcd2724.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000007-e1d60561-b5f0-4ead-8a30-31a5a5e7dcb7.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000008-31ce0595-0a36-4a69-ad12-4fa63adde8f5.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000009-1eb31adf-62be-40aa-9535-2ea2b83d4a41.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000010-603e9156-6bca-4e86-9ee4-04ae2f811fda.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000011-f6e56ea0-8bf7-4235-9a35-5e920b58b696.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000012-9f6c541b-7056-47da-ba95-2d0c798cf1ec.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000013-f52c47fa-7a06-4d06-811d-80d8acfbe0a5.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000014-c2a12047-62fe-4774-8320-a06b1a0da3a2.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000015-6bebeade-381c-46a6-a855-c81687f713b9.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000016-59344053-d6f3-4de5-ade3-25a91e92f246.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000017-90c50d43-dc0c-4b75-8350-9cdce94fa1aa.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000018-cd01c523-d763-4123-8dbf-c1b015d4c112.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000019-00a189af-6fb6-4680-8c39-55bac4ddd6b2.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000020-6d289239-ec78-40bb-89da-30d53cd0d5ff.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000021-471ba3bb-2dcc-4088-b2ef-767fd8e6cb21.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000022-71905233-8b80-49b9-910c-cd7ccf67e95b.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000023-3e978061-b451-4762-b8c4-26d70ff5466a.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000024-bf1a7f6b-a039-4709-bfd1-a53583d30068.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000025-8899af07-6f86-4e48-a23f-fc84c0352a7f.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-run/revisions/000026-864c86bd-95c2-4258-8039-b8801d412fd5.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-skill-confirmations.jsonl` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-skill-invocations.jsonl` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-transitions/000001-bebac8cf-2af3-4eaf-8de9-adfc611e0792.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-transitions/000002-8feb0522-9445-48ab-8945-73b976eed76c.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-transitions/000003-3796aed2-f6f2-4e9d-bf67-d9a834893899.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-transitions/000004-bc4b83f7-eaa9-4cf4-a851-546dbcce7ec4.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-transitions/000005-1a5ad0b5-9ddc-49aa-a6c1-a95fbc63eda4.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-transitions/000006-7d12b6db-121c-45f7-9fb9-c3317e3f2410.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-transitions/000007-3858c3b6-78e4-4c69-86a7-f2f4564daa39.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-transitions/000008-e443b603-a889-482f-8ff9-2c5eece08752.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-transitions/000009-67ac2b2f-b281-4df2-81d4-456cac7b21b3.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-workflow-governance.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline-workflow-plan.json` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/.pipeline.yaml` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 官方 Tenon 状态、receipt 或 revision；以 CLI 状态机/一致性门核验 |
| `openspec/changes/issue-43-phase-skill-enforcement/design.md` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Change 文档及 delta requirement/scenario 一致 |
| `openspec/changes/issue-43-phase-skill-enforcement/proposal.md` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Change 文档及 delta requirement/scenario 一致 |
| `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Change 文档及 delta requirement/scenario 一致 |
| `openspec/changes/issue-43-phase-skill-enforcement/tasks.md` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Change 文档及 delta requirement/scenario 一致 |
| `packages/automation/src/admission/execution-context.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ AFK frozen capability、wiring、TOCTOU 与 fail-closed 语义一致 |
| `packages/automation/src/admission/execution-preparation.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ AFK frozen capability、wiring、TOCTOU 与 fail-closed 语义一致 |
| `packages/automation/src/admission/loop-admission.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ AFK frozen capability、wiring、TOCTOU 与 fail-closed 语义一致 |
| `packages/automation/src/runner/runner.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ AFK frozen capability、wiring、TOCTOU 与 fail-closed 语义一致 |
| `packages/automation/src/sdk/sdk.integration.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ AFK frozen capability、wiring、TOCTOU 与 fail-closed 语义一致 |
| `packages/automation/src/skills/wiring.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ AFK frozen capability、wiring、TOCTOU 与 fail-closed 语义一致 |
| `packages/automation/src/starters/execution-guard.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ AFK frozen capability、wiring、TOCTOU 与 fail-closed 语义一致 |
| `packages/automation/src/starters/wiring.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ AFK frozen capability、wiring、TOCTOU 与 fail-closed 语义一致 |
| `packages/cli/dist/tenon.mjs` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 受控 bundle；build 后与 HEAD 无漂移 |
| `packages/cli/src/afk-run.integration.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/commands/afk-executor.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/commands/afk.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/commands/artifact.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/commands/artifact.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/commands/doctor-skills.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/commands/doctor.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/commands/doctor.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/commands/internalSkillGate.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/commands/loop-admission-view.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/commands/loop-starter-wiring.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/commands/transition.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/executionCoordinatePort.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/init-workflow.integration.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/integration-harness.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/integration-phase-skill-test-support.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/internal-skill-gate-hook.integration.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/skill-bundle-lifecycle.integration.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/skillBundleAssembly.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/transition-concurrency.integration.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/cli/src/workflow-skill-orchestration.integration.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ Hook/transition/artifact/doctor/AFK 接线或真实 receipt fixture 一致 |
| `packages/dashboard-app/src/api/serverIntegration.test.tsx` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 仅历史成功路径 fixture，真实 tracker receipt；无产品代码变化 |
| `packages/kernel/src/index.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ phase/overlay/explicit 三投影、snapshot 与兼容语义一致 |
| `packages/kernel/src/workflow/default-workflow.generated.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ phase/overlay/explicit 三投影、snapshot 与兼容语义一致 |
| `packages/kernel/src/workflow/effective-plan.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ phase/overlay/explicit 三投影、snapshot 与兼容语义一致 |
| `packages/kernel/src/workflow/effective-skill-resolver.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ phase/overlay/explicit 三投影、snapshot 与兼容语义一致 |
| `packages/kernel/src/workflow/effective-skill-resolver.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ phase/overlay/explicit 三投影、snapshot 与兼容语义一致 |
| `packages/kernel/src/workflow/policy-snapshot.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ phase/overlay/explicit 三投影、snapshot 与兼容语义一致 |
| `packages/kernel/src/workflow/skill-bundle-resolver.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ phase/overlay/explicit 三投影、snapshot 与兼容语义一致 |
| `packages/kernel/src/workflow/skill-bundle-resolver.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ phase/overlay/explicit 三投影、snapshot 与兼容语义一致 |
| `packages/server/dist/dashboard.mjs` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ 受控 bundle；build 后与 HEAD 无漂移 |
| `packages/server/src/server.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ HTTP transition 与 CLI 共用 required projection，fixture 保留负例 |
| `packages/server/src/snapshot.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ HTTP transition 与 CLI 共用 required projection，fixture 保留负例 |
| `packages/server/src/test-support.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ HTTP transition 与 CLI 共用 required projection，fixture 保留负例 |
| `packages/server/src/transition-concurrency.test.ts` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ HTTP transition 与 CLI 共用 required projection，fixture 保留负例 |
| `skills/tenon/SKILL.md` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ source/generated/Skill/双语文档漂移合同一致 |
| `templates/manifest.yaml` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ source/generated/Skill/双语文档漂移合同一致 |
| `templates/workflows/default.yaml` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ phase/overlay/explicit 三投影、snapshot 与兼容语义一致 |
| `tools/check-docs.mjs` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ source/generated/Skill/双语文档漂移合同一致 |
| `tools/check-docs.node-test.mjs` | `openspec/changes/issue-43-phase-skill-enforcement/specs/workflow-skill-enforcement/spec.md` | ✅ source/generated/Skill/双语文档漂移合同一致 |
