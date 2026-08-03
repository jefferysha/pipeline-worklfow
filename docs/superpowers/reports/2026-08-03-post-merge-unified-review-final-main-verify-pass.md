# 最终主干统一审查 Verify 通过报告（2026-08-03）

## 冻结身份与结论

- Git HEAD / Tenon `build_sha`：`3798efabfefa8cff60958d14f891d1c22e7c909f`
- 基线：`main@7c1ed69516e042205155e134b25f59f9ed927644`
- 聚合结论：**PASS — C0 / H0 / M0 / L0**
- 冻结范围：52 files / `+680 -31`；产品变更仅 CLI source/test/dist，其余为
  真实 Verify fail/retry 与 canonical governance evidence。

## 三轨验证

### 独立 reviewer

独立只读 reviewer 返回 **PASS — C0/H0/M0/L0**。exact 路径在 freshness
过滤前按 session/turn/call id 拒绝 invocation identity 复用，并在输出扫描期间继续
拒绝后置 duplicate invocation、duplicate completion、ABI mismatch 和 malformed JSON；
fallback 在最新真实 turn 内先执行同一唯一性门，再应用 freshness。十二个永久回归覆盖
exact/fallback × custom/function × stale/missing/invalid timestamp。完整范围 diff hash 为
`9d1c0be614248d4d534b71319b9727736531fc182a3df20155dcf84fcceae848`，
冻结树保持 clean。

### Codex 安全轨

`git diff 7c1ed695..3798efab -- packages/cli/src/codexTranscriptEvidence.ts
packages/cli/src/codexSkillReceipt.test.ts | codex exec ...` 返回 **PASS**，无 actionable
finding。它重新核对 duplicate tracking 位于 freshness 之前，session/turn scope、证据
新鲜度以及 stale/missing/invalid 的四路径矩阵均保持 fail closed。原始输出：
`/tmp/3798efab-codex-review.txt`。

### 隔离 E2E / 构建轨

在 detached worktree `/tmp/tenon-final-verify2.uiIvju` 的精确 SHA 上：

- `npm ci`：通过，0 vulnerabilities。
- `npm run build`：CLI、Server、Dashboard production build 通过；tracked diff 为零。
- receipt：150/150 通过。
- `npm test -- --minWorkers=4 --maxWorkers=4`：330 files、5913 passed、26 个
  已声明环境 skip。
- comments、architecture（723 production files / 5 size-only exceptions）、dependencies、
  OpenSpec 38/38、release 24/24、repository hygiene、workflow freshness 与 interaction
  contract 全部通过。

真实验证 worktree 在各轨写入最终治理产物前的组合指纹前后均为
`894a3b2ad5a430ba12444386d3e6f01991772e4640ea3380f1db76e1c26627da`。
此前一次目录错误已按 repo-zero 规则单独记录为 FAIL 并官方回退，未被本轮复用。

## OpenSpec 隔离应用演练

在 detached 副本执行 `openspec show --json --deltas-only`、`openspec validate
--strict`、`openspec archive --yes --json` 与 `openspec validate --all --strict` 全部
成功；归档后 37/37 remaining items 通过。真实主规格未写入，前后组合 digest 为
`d9031573e290b51940067d81ae6a7a8597fd5bd7c9b41e541df8d65107ddb385`。

## 逐文件 capability 回读

| 改动面 | capability / contract | 结论 |
| --- | --- | --- |
| `packages/cli/src/codexTranscriptEvidence.ts` | `codex-skill-receipt-current-turn`、`skill-content-resolution` | 已回读并符合 |
| `packages/cli/src/codexSkillReceipt.test.ts` | exact current turn、fail-closed evidence requirements | 150/150，已覆盖 |
| `packages/cli/dist/tenon.mjs` | `plugin-distribution`、tracked bundle | 与源码顺序一致，隔离重建零 diff |
| Change reports / ledger / transitions | `declarative-document-governance`、`verification-evidence-composer` | JSON/JSONL 可解析，失败与重试证据均保留 |

## Dashboard 验收复用边界

`packages/dashboard-app` 在 base 与冻结 target 的 Git tree 都是
`b0bdd72444ac4faf03066870fecaaccbf1dd23cd`，因此没有 UI 漂移。复用最终 main 的生产
浏览器证据是精确树复用：24 个场景、101/101 断言、17 张截图，覆盖四种桌面宽度、
zh/en、light/dark、loading/empty/error/success、键盘、焦点和 overflow；意外
console/page/request/HTTP 错误均为零。证据：`/tmp/pr20-main-browser-qa-Z0y9nS/REPORT.md`。

## 剩余边界

- Docker daemon 不可用导致 26 个既有容器相关测试按项目规则诚实 skip；精确 PR head
  将继续由 GitHub CI 执行完整受支持矩阵。
- Ship 才是真实 spec apply 与 PR/CI/merge 边界；本轮 Verify 未写真实主规格。
