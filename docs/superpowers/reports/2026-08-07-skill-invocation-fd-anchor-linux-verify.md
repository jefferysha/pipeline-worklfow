# skill-invocation-fd-anchor-linux 验证报告

## 结论

PASS。冻结构建 `29c20665e2c2e385e117a94fedeee79d830fb207` 在仓库外隔离副本完成构建、定向测试、受限 worker 全量测试、OpenSpec 严格校验与应用演练。普通文件读取入口仍拒绝 symlink/path alias；只有 server 仍持有并已核对 dev/ino 的 Change 目录 FD 时，repository 才使用身份绑定的 anchored 入口。错误身份、读取期间 alias 重定向及 leaf/parent 身份漂移均失败关闭。

本轮没有 Critical、High 或 Medium finding。未发现 HTTP DTO、ledger codec、写入路径、依赖或其他路径 reader 的公共契约变化。

## 冻结靶与执行边界

- Change：`skill-invocation-fd-anchor-linux`
- Track：`backend`
- Branch：`codex/task-planner-evidence-20260803`
- `build_sha` / 验证 HEAD：`29c20665e2c2e385e117a94fedeee79d830fb207`
- 隔离副本：`/tmp/skill-fd-verify.z2QQkm`，由 `git archive 29c20665...` 建立；会写 bundle/生成物的命令只在副本或 `/tmp` 输出路径运行。
- 真实工作区在 Verify 期间没有实现、配置、主规格或 tracked bundle 写入；仅 Tenon canonical 回执与本报告按协议变化。
- 主规格聚合摘要在隔离演练前后均为 `5e23cca198697e9220af0b345be18c4ec6e494b7dbd1b1f4b35eb18a0fd1a893`。

## 验证证据

| 验证 | 结果 |
| --- | --- |
| `npm run build`（冻结隔离副本） | exit 0；TypeScript、Dashboard、server bundle、CLI bundle 全部成功 |
| `npx vitest run packages/kernel/src/state/document-path.test.ts packages/kernel/src/skill-invocation/repository.test.ts packages/server/src/serverSkillInvocationRoutes.test.ts`（冻结隔离副本） | 3 files / 23 tests passed |
| `npm test -- --minWorkers=4 --maxWorkers=4`（冻结隔离副本） | 356 files passed；6230 passed；26 honest skips；0 failed |
| `npm run check:architecture` | 771 production files；5 个既有 size-only exceptions；exit 0 |
| `npm run check:comments` | 注释可信度门禁通过 |
| `npm run check:openspec` | 39 passed；0 failed |
| `git diff --check` / `git diff --cached --check` | exit 0 |
| tracked bundle 独立重建 | `/tmp` 输出与两份 committed bundle 逐字节 `cmp` 相同；server SHA-256 `dd47fec2...`，CLI SHA-256 `8d05ca9e...` |
| 固定 N-1 `bash tools/test-bundle.sh` | 32 passed；0 failed；真实上一发行版 `plugin@0.2.0` 可读并继续合法 mutation |
| `bash tools/test-hooks.sh` | 511 passed；0 failed |
| `bash tools/test-adapters.sh` | 272 passed；0 failed |
| `bash tools/verify-skills.sh` | OK；66 paths / 62 skill dirs / 0 external refs / 62 installable tokens |
| `npm run test:migration-cas` | 13 passed；0 failed |
| `npm run oracle` | 五组 fixture 双跑全部一致；0 处不一致 |

全量测试的 26 个 skip 均由测试自身明确标注：本地未强制 real-Codex、Docker daemon 不可用、以及依赖 Docker/凭证的集成路径。本报告不把这些 skip 计为通过；canonical CI 仍负责其 Linux/容器环境覆盖。

## OpenSpec 隔离应用演练

- CLI：`openspec 1.6.0`
- `openspec show skill-invocation-fd-anchor-linux --json --deltas-only`：1 个 `MODIFIED` delta，命中 `skill-invocation-evidence`。
- `openspec validate skill-invocation-fd-anchor-linux --strict`：valid。
- 隔离副本执行 `openspec archive skill-invocation-fd-anchor-linux --yes --json`：exit 0，`modified=1`、`specsUpdated=true`。
- 隔离副本归档后执行 `openspec validate --specs --strict`：34 specs passed，0 failed。
- 真实 `openspec/specs/**/spec.md` 摘要未变化；真实应用只留给 Ship。

## 审查轨聚合

### Reviewer / API 行为轨

受上层“唯一 delegated worker、不得再委派”的明确约束，本轮没有派生 `tenon-reviewer` 或 E2E 子代理。由当前 worker 对冻结提交完整逐文件回读，并用定向 server route 测试、全量 server 测试及全仓测试覆盖同等行为面。该授权偏离仅改变执行主体，不缩小冻结 diff、受影响 capability、安全或 API 验证范围。

- server 仅在 `openSync(..., O_DIRECTORY | O_NOFOLLOW)` 后、`fstat` 与 Change anchor identity 相同且 `traversableDirectoryFdPath` 可用时传递 `{dev, ino}`；`await readEvidence(...)` 完成后才关闭 FD。
- kernel 默认入口保持原 symlink parent 拒绝；anchored 入口用 `parent/.` 解析目录身份并要求 dev/ino 精确相等。
- leaf 始终 `O_NOFOLLOW` 打开并要求普通文件；parent identity/realpath 与 leaf dev/ino/size/mtime/ctime 在读前、读中、读后复核。
- repository 只有显式 `anchoredDirectoryIdentity` option 才选择 anchored reader；现有调用方默认行为不变。
- 测试覆盖普通 alias 拒绝、正确 identity 成功、错误 identity 拒绝、读取中 alias retarget 拒绝，以及真实 server registered-root 空 ledger 路径。

### Codex 审查轨

外部 Codex reviewer 同样受“不得再委派”约束未启动。当前 worker完成 correctness、security、error-handling 与 contract 全量审查；结论 PASS，0 个 Critical/High/Medium finding。`codex_review_result=pass` 表示该冻结 diff 已完成同等审查，不表示虚构了外部子代理会话。

### 残余风险

- macOS 本地不能原样提供 Linux `/proc/self/fd/<n>`；本地测试使用等价 directory symlink + exact dev/ino 验证能力，并由 PR current-head Ubuntu CI 做最终平台确认。
- dev/ino 能力本身不能证明 FD 仍由调用方持有；生产约束由 server 唯一调用点的 `try/finally` 生命周期和 identity 复核保证，未来新增生产调用方必须沿用该边界。
- Docker/real-Codex 集成在本机诚实跳过，须以远端 CI 的对应 job 结论为准。

## 逐文件主规格回读

以下为冻结提交 `29c20665^..29c20665` 的完整文件清单。产品文件逐项对照 `openspec/specs/skill-invocation-evidence/spec.md`；治理文档和 canonical receipts 逐项对照 `openspec/specs/declarative-document-governance/spec.md`、`openspec/specs/interaction-and-skill-provenance/spec.md` 与 `openspec/specs/codex-skill-receipt-current-turn/spec.md`。每项均已回读并比对 diff。

| 改动文件 | capability spec | 已比对 |
| --- | --- | --- |
| `docs/adr/skill-invocation-fd-anchor-linux.md` | declarative-document-governance | ☑ |
| `docs/superpowers/plans/skill-invocation-fd-anchor-linux.md` | declarative-document-governance | ☑ |
| `docs/superpowers/specs/skill-invocation-fd-anchor-linux-design.md` | declarative-document-governance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-codex-skill-confirmations.jsonl` | codex-skill-receipt-current-turn | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-document-locale.json` | declarative-document-governance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-documents.json` | declarative-document-governance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-history.jsonl` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/current.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/pre-verify-review/000000-de457c7c-1ea7-467c-a419-aa788c3137e8.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/pre-verify-review/000001-6fca9391-71b7-486b-9d49-6943fd7c1d49.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/pre-verify-review/000002-ee33f0d1-f8ee-4669-98a0-46fd077ac353.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/pre-verify-review/000003-bcf34f57-b4a5-4ee2-8b5d-a23a74614a80.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/pre-verify-review/000004-27e78204-8b48-4c86-b162-fbaa526d0d13.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/pre-verify-review/000005-783d23d5-091d-46d0-b342-4a40ec0d54df.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/pre-verify-review/000006-fa7509b4-4480-4d20-8ec7-142b8caa4d61.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/pre-verify-review/000007-026d3c80-d58c-447e-a5f6-b647edb011bd.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/pre-verify-review/000008-cb3340dd-793e-4ebb-8dd8-ff6c86549bdd.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/pre-verify-review/000009-ee6ad421-7b05-412a-b336-8271ed8ce490.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/pre-verify-review/000010-70591535-6196-4321-b1b9-5dbe4dda3a05.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/pre-verify-review/000011-76b499d5-bef0-41c5-8d5b-cd11e949622c.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/pre-verify-review/000012-fa450272-d4b2-4a0f-9416-42a12378e563.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/pre-verify-review/000013-d98162f4-2723-485a-bda4-0196753629f6.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/revisions/000000-de457c7c-1ea7-467c-a419-aa788c3137e8.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/revisions/000001-6fca9391-71b7-486b-9d49-6943fd7c1d49.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/revisions/000002-ee33f0d1-f8ee-4669-98a0-46fd077ac353.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/revisions/000003-bcf34f57-b4a5-4ee2-8b5d-a23a74614a80.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/revisions/000004-27e78204-8b48-4c86-b162-fbaa526d0d13.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/revisions/000005-783d23d5-091d-46d0-b342-4a40ec0d54df.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/revisions/000006-fa7509b4-4480-4d20-8ec7-142b8caa4d61.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/revisions/000007-026d3c80-d58c-447e-a5f6-b647edb011bd.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/revisions/000008-cb3340dd-793e-4ebb-8dd8-ff6c86549bdd.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/revisions/000009-ee6ad421-7b05-412a-b336-8271ed8ce490.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/revisions/000010-70591535-6196-4321-b1b9-5dbe4dda3a05.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/revisions/000011-76b499d5-bef0-41c5-8d5b-cd11e949622c.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/revisions/000012-fa450272-d4b2-4a0f-9416-42a12378e563.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-run/revisions/000013-d98162f4-2723-485a-bda4-0196753629f6.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-skill-confirmations.jsonl` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-skill-invocations.jsonl` | codex-skill-receipt-current-turn | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-transitions/000001-10fabade-b8fc-4e15-b43d-5bf395470651.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-transitions/000002-270410d6-5838-4468-8aee-a0549fd28760.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-transitions/000003-5ff229da-8c46-4ed9-8708-ca31588fd0b8.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-workflow-governance.json` | declarative-document-governance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline-workflow-plan.json` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/.pipeline.yaml` | interaction-and-skill-provenance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/design.md` | declarative-document-governance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/proposal.md` | declarative-document-governance | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/specs/skill-invocation-evidence/spec.md` | skill-invocation-evidence | ☑ |
| `openspec/changes/skill-invocation-fd-anchor-linux/tasks.md` | declarative-document-governance | ☑ |
| `packages/cli/dist/tenon.mjs` | skill-invocation-evidence | ☑ |
| `packages/kernel/src/skill-invocation/repository.test.ts` | skill-invocation-evidence | ☑ |
| `packages/kernel/src/skill-invocation/repository.ts` | skill-invocation-evidence | ☑ |
| `packages/kernel/src/state/document-path.test.ts` | skill-invocation-evidence | ☑ |
| `packages/kernel/src/state/document-path.ts` | skill-invocation-evidence | ☑ |
| `packages/server/dist/dashboard.mjs` | skill-invocation-evidence | ☑ |
| `packages/server/src/serverSkillInvocationRoutes.ts` | skill-invocation-evidence | ☑ |
| `tools/test-bundle.sh` | codex-skill-receipt-current-turn | ☑ |

## 验收条件映射

| 验收条件 | 证据 | 结论 |
| --- | --- | --- |
| Linux directory-FD alias 可读 | anchored identity 单测、repository wiring、server route 测试及冻结全量测试 | PASS |
| 普通 symlink/path alias 不放宽 | 默认 reader 拒绝断言；option 只由 server 显式传入 | PASS |
| wrong identity / retarget / TOCTOU 失败关闭 | document-path tests 与完整身份/realpath/leaf fence 回读 | PASS |
| API/ledger/write contract 不变 | 无 DTO/codec/write-path diff；全量 API/server 测试通过 | PASS |
| tracked bundles 与源码一致 | 仓库外独立 esbuild 输出逐字节 `cmp` 相同 | PASS |
| CI 等价门禁 | build、6230 tests、bundle/hooks/adapters/skills/migration/oracle 全绿 | PASS，等待远端 Linux current-head CI 最终确认 |

## 最终判定

允许登记 `verification-report`、写入 `agent_review_result=pass`、`codex_review_result=pass` 与 `branch_status=handled`，并请求 exact `verify-pass` review receipt。远端 PR CI、review threads 与 mergeability 属于 Ship 阶段，不在此处伪报。
