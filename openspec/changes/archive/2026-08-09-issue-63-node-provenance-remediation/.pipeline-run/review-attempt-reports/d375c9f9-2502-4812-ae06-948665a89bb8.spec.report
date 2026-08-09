# Issue #63 frozen Node provenance remediation：Verify 报告

## 结论

- Change：issue-63-node-provenance-remediation
- 分支：codex/issue-63-node-provenance-remediation
- 起点治理提交：9106c285c0e9c15ff811a1ccc38aca0f148c8958
- 冻结实现候选父提交：c38694185a35a376b096c1d3c131e389dc981094
- frozen Build SHA：workspace:sha256:fa5a1f6b63a962ca94d7d8a1e368c3759e18ff10750ca804fb69a4da6fb31872
- Review attempt：d375c9f9-2502-4812-ae06-948665a89bb8，sequence 1，预算使用 1/2
- 结论：PASS；standards/spec/e2e 三条 required lane 全部通过
- Findings：Critical 0、High 0、Medium 0、Low 0

本轮只审查 #63 冻结的 Node physical binding immediate pre-spawn replay。Issue #44 的
Review 2/2 与失败报告保持原样，没有重置、覆盖或创建第 3 次 Review。

## 审查责任与范围

实现由唯一一个 luna_worker 完成。根代理亲自读取完整冻结 diff、全部 changed/untracked
交付文件、调用链、测试与规格，并独占 standards/spec/e2e 结论；没有创建第二个实现或
review agent。兼容字段 agent_review_result 与 codex_review_result 在本报告中均表示根
Codex 协调代理对同一 frozen candidate 的审查结果。

受影响的生产路径全部收敛到以下不变量：

1. provenance Bash spawn 的同步顺序为 bash-proof → node-proof → verifier-spawn；
2. 传给 verify-skills.sh 的 --node 与刚复验的 frozen Node executable 完全相同；
3. Node/Bash 漂移在 runner、child、host mutation、selection/launcher、activation、
   Dashboard 与 ready evidence 前失败关闭；
4. production 使用 TrustedExecutable 物理绑定；pathname-only legacy seam 不被提升为信任；
5. 不改变 v1.0.1/v1.0.2 registry、selection、launcher、audit 或 release manifest schema。

## Standards 与 security lane

### 生产实现

- native-host-command-binding.ts 新增复合 provenance binding，冻结 Bash 与 Node，按同步顺序
  重放两份 proof，并把实际 spawn 保持为下一项副作用。
- packaged-assets.ts 与 update-candidate-verification.ts 使用同一 binding，不再各自只传
  trusted Node pathname。
- setup.ts 将首个 native mutation 前冻结的 lifecycleEnv 贯穿完整 setup；setupSkills.ts
  通过 frozen Bash 运行完整 tools/verify-skills.sh，并识别 bound lifecycle marker。
- release-store.ts 只对 provenance Bash 重放 Bash+Node；普通 Bash 只验 Bash，直接 Node
  只验 Node，保持已有调用语义。
- doctor-probes.ts 从 main.ts 提取 production probe；Doctor provenance spawn 同步复验
  Bash+Node，公共 DoctorProbes/CLI 输出不变；main.ts 为 236 行。
- packages/cli/dist/tenon.mjs 已由相同源码重建；隔离副本 build 后 release freshness 与
  tracked-clean 均为零 diff。

### 安全审查

- 信任边界仍位于 CLI/native execution adapter 与既有 TrustedExecutable；未新增第二套
  inode/owner/path-chain 算法。
- 没有新依赖、secret、网络信任、数据库、迁移、公共 registry 或 schema。
- proof 回调抛错或返回 false 都在 runner 进入前失败；负测同时断言零 child、零 selection/
  launcher 写入与零 plan/install mutation。
- install.sh、clean-codex-install-acceptance.mjs 与
  prepare-trusted-codex-acceptance.sh 没有候选 diff。

结论：standards lane PASS，security 专项 PASS，无 severity finding。

## Spec lane：逐文件回读

已重新回读 openspec/specs/plugin-distribution/spec.md 中“可执行工具冻结 SHALL 绑定文件身份
与可信路径链”以及本 Change delta 的复合 provenance 场景。

| 改动文件 | 命中的 capability/spec | 已回读并比对 |
| --- | --- | --- |
| packages/cli/src/commands/native-host-command-binding.ts | plugin-distribution / 复合 Bash+Node binding | 是 |
| packages/cli/src/commands/packaged-assets.ts | plugin-distribution / package verifier spawn | 是 |
| packages/cli/src/commands/update-candidate-verification.ts | plugin-distribution / update verifier spawn | 是 |
| packages/cli/src/commands/setup.ts | plugin-distribution / full setup lifecycle binding | 是 |
| packages/cli/src/commands/setupSkills.ts | plugin-distribution / standalone/full setup verifier | 是 |
| packages/cli/src/runtime/release-store.ts | plugin-distribution / candidate/stored payload verifier | 是 |
| packages/cli/src/commands/doctor-probes.ts | plugin-distribution / Doctor verifier spawn | 是 |
| packages/cli/src/main.ts | plugin-distribution / Doctor production wiring | 是 |
| native-host-command-binding.test.ts | plugin-distribution / proof order 与 drift | 是 |
| setup.test.ts | plugin-distribution / package、standalone/full setup 与零 mutation | 是 |
| update.test.ts | plugin-distribution / update proof、argv 与零 write | 是 |
| release-store.integration.test.ts | plugin-distribution / selection、launcher、rollback | 是 |
| doctor-probes.test.ts | plugin-distribution / Doctor proof order 与零 spawn | 是 |
| packages/cli/dist/tenon.mjs | plugin-distribution / 随包 CLI 生成资产 | 是 |
| proposal/design/tasks、delta spec、ADR、Superpowers design/plan | 本 Change 文档契约 | 是 |
| .pipeline-*、.pipeline-run/**、.pipeline-transitions/** | default workflow canonical evidence | 是 |

OpenSpec 隔离演练：

- openspec show issue-63-node-provenance-remediation --json --deltas-only：PASS
- openspec validate issue-63-node-provenance-remediation --strict：PASS
- 隔离 clone 中 openspec archive ... --yes --json：PASS
- 演练后 openspec validate plugin-distribution --type spec --strict：PASS
- 真实工作区主规格聚合 digest 前后均为
  a376b1b5da452e40b55cadfac9aa4ab20bb8ea0d0f1d12345609f040244aa1c1

结论：spec lane PASS。

## E2E 与完整最终门

### Build readiness 定向矩阵

- 受影响 7 文件合并矩阵：214 passed、1 skipped、0 failed。
- release-store.integration.test.ts 全文件：87 passed；最后仅增加 launcher snapshot 断言后，
  对应 focused Node drift 用例再次通过。
- setup：97/97；update：41/41；Doctor：57/57；release payload：4/4；
  native binding：10/10（1 honest skip）。
- npx tsc -b packages/cli、npm run bundle、git diff --check、
  check:architecture、check:release-workflows、check:openspec、
  check:default-workflow-freshness、verify-skills 均通过。
- npm run build 前后 CLI/server/dashboard 聚合 digest 相同：
  c74b46c1ada67e0b0fe8a5e4914ab30dbb4cae8f6ea0293082b5e1f6e4654627。

### 唯一完整最终门

最终门在权限/软链保真的独立 clone
/private/tmp/tenon-issue63-final.PDbasv/repo 中运行，使用 Node v22.23.2；完整日志位于
/private/tmp/tenon-issue63-final.PDbasv/final-gate.log。通过项：

- npm ci、check:dependencies、check:release-workflows、check:openspec、
  check:comments、check:architecture、check:identity、check:repository-hygiene；
- check:npx-package：66/66；
- check:legacy-bridge、check:default-workflow-freshness、npm run build、
  release freshness；
- clean-install：PASS，releaseId
  sha256-8fb6afc99088bc70c482fc882e12c4a587e61e63c82af3bf76ed96025ddab0e2；
- docs、document templates、docs sync/check/build/smoke、bundle；
- npm test：386 files passed；6745 passed、27 skipped；
- dashboard tests：98 files passed；1741 passed；
- hooks、adapters、verify-skills、migration CAS 13/13；
- N-1 v1.0.1 固定产物准备与 bundle smoke：32/32；
- golden oracle：0 处不一致；
- 最终隔离副本 tracked diff：clean。

clean-install 首次只在该步骤因验收工具链布置停止：

- 临时 Node 位于 /private/tmp；macOS stat -f %Lp 对 sticky /private/tmp 输出 777，
  使安装器在任何 mutation 前拒绝该临时物理链；
- 失败代码路径来自未修改的 install.sh preflight，不进入本 Change 的 provenance 实现；
- 临时 Node 与修正后用户拥有工具根中的 Node SHA-256 完全相同：
  18e387c90ab8a8400183e8bdd396376e1e875b91b4c874b894dcade7b35bf572；
- 只把相同 Node 22 与固定 codex-cli 0.144.1 放到 mode 0700 的用户拥有临时根，并只重跑
  失败的 clean-install 一次；该段随即通过。此前已通过的静态门、npx、build/freshness
  均未重跑，Review/完整门预算没有增加。

本地 honest skip：

- Docker daemon 不可用，因此 sandcastle:local 与 Docker-backed 强执行留给远端 CI；
- pull_request 不接收 OPENAI_API_KEY，real-Codex H14 按 CI policy honest-skip；
- 本机非 Windows，Windows native trust lane 留给 windows-latest。

这些平台证据不被声明为本地通过；Ship 后必须等待 PR exact-head CI 全部完成。

结论：e2e lane PASS；本地可执行矩阵全部通过，平台残余由 exact-head CI 覆盖。

## 冻结与审计完整性

- Verify 前后 frozen Build SHA 均为
  workspace:sha256:fa5a1f6b63a962ca94d7d8a1e368c3759e18ff10750ca804fb69a4da6fb31872。
- 完整最终门只写隔离副本；真实工作区仅新增本报告与官方治理证据。
- git diff --check：PASS。
- 旧 openspec/changes/issue-44-skill-provenance 与
  2026-08-10-issue-44-skill-provenance-verify-attempt-2.md：零 diff。
- 未修改本机插件，未 merge，未 release。

## Review verdict

Attempt 1/2：PASS。standards/spec/e2e 三条 lane 都绑定同一 frozen candidate，无需使用
Review 2/2。进入 verify-pass review receipt 前，本报告与 tasks 当前 digest 必须由官方
Tenon document ledger 登记并完整回读。
