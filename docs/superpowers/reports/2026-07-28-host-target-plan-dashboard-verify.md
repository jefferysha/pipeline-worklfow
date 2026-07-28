# Host Target Plan Center 验证报告

## 结论

第四轮 Verify 审查冻结提交
`1176d52a4f00110c2367697d33cb00e3f01de1f4` 的完整
`origin/main...build_sha` 交付面。Reviewer 与真实浏览器/视觉轨通过；Codex CLI 与隔离 E2E
独立确认同一项可修复 P2：adapter `update` 计划错误包含仅完整 `setup` 才会继续执行的
`bundled-skills` 与 `runtime-readiness`。聚合结论为 **FAIL**，必须经确切 `verify-fail`
返回 Build，并修正规格、CLI 真相、server/Dashboard decoder、fixtures 与真实 update 编排契约测试。

- CRITICAL：0
- HIGH：0
- MEDIUM / P2：1
- LOW：0
- 上轮 adapter setup 顺序、空 CLI catalog、重复 option、有界 server runtime、strict decoder、
  clean-room、i18n、可访问性和 tracked Dashboard asset 均已回归，无新增 finding。

## 冻结与零输出

- `build_sha`：`1176d52a4f00110c2367697d33cb00e3f01de1f4`
- 比较基线：`origin/main` / `2d103e330f847e003ff5909097d892f5722cca04`
- baseline tree：`bacc0ab566e02fc41c214a6b93b148609acfeed0`
- frozen tree：`65acadd0bff6a6681bad99c02a19d56f941d622f`
- 完整冻结 patch SHA-256：
  `a21ecb8d7a98ef2b014a7b68b2e463e931ca64114948d80d2bb7e08229e04441`
- delivery patch SHA-256：
  `79ae4c6c7c03285613063b7bc8359ee588e5e5605724b26eeaf52f8c822dc7e7`
- 真实主规格 digest 前后均为
  `44328f9c948d747c455e279f141d5eeb4d0f9db8571afdbb2de3bcc40aa299eb`。
- E2E 轨真实 worktree 前后均为 HEAD `1176d52...`、status
  `2785ba4a...b78`、unstaged `96f43860...91a`、staged 空 digest；浏览器轨前后 byte
  fingerprint 均为 `e2c59de4...c3ab`。全部测试、构建、server、截图和日志写入 `/tmp`
  隔离副本；本报告是聚合后唯一允许写入仓库的治理产物。

## 四轨聚合

### Reviewer Agent

结论：PASS，CRITICAL/HIGH/MEDIUM/LOW 均为 0。

- 全量回读 144 个冻结路径：生产源码、测试、generated bundles/assets、双语文档、ADR、
  OpenSpec 与冻结治理记录。
- 确认 adapter setup 当前为
  `package-assets → managed-runtime → adapter-deploy → bundled-skills → runtime-readiness`，
  server 拒绝空 CLI catalog，重复 option、25-key cache、同键合并、跨键并发 1 与失败重试未回退。
- 确认 `index-BStVpnm7.js` 已被跟踪，`dist/index.html` 引用的 JS/CSS 均存在。
- 未发现 marker 删除、backfill、canonical state 手改、许可污染或依赖变化。

该轨的静态 fixture 对照没有区分 adapter setup/update 的真实尾部差异；这一缺口由 Codex 与
E2E 的真实命令链比对发现。

### Codex CLI

结论：FAIL，P2 1 项。

`createHostTargetPlan('cursor', 'update')` 复用完整 `adapterSteps`，因此在 `adapter-deploy`
之后继续声明 `bundled-skills` 与 `runtime-readiness`。真实 `cmdUpdate` 对 adapter 直接返回
`cmdSetupHost(...)`；后者完成资产校验、managed runtime 与 adapter deploy 后返回，不会进入仅由
完整 `cmdSetup` 追加的 `cmdSetupSkills` / `cmdSetupRuntime`。计划因此多报两步，与复制命令的
实际行为不一致。

Codex 独立重跑：

- server resolver：66 passed / 6 assembly skipped。
- Dashboard focused：5 files / 106 tests。
- docs/hygiene node tests：16/16。
- `npm run typecheck:web`、`git diff --check`：通过。
- `npm run build:web`：通过，重新生成的 hash 与冻结提交相同；只有既有 >500 kB chunk warning。

### 隔离 E2E

结论：FAIL；同一产品缺陷 + 全量门禁未形成稳定绿灯。隔离克隆：
`/tmp/tenon-host-plan-final2-e2e.KXi6gk/repo`。

产品缺陷复现：

- tracked CLI 的 12 hosts × setup/update 共 24 份计划均可解析并声明 `side_effects=none`。
- 10 个 adapter update 计划全部多含两个 setup-only 步骤：
  `defective_adapter_update_plans=10`、`setup_only_step_occurrences=20`。
- CLI、server 和 Dashboard fixtures 当前共同锁定错误序列，因此 focused 绿灯未暴露语义漂移。

通过项：

- `npm ci`、`npm run build`：通过；2011 modules，Dashboard 772.66 kB、server 823.4 kB、
  CLI 1.9 MB。
- CLI/setup/server focused：4 files / 165 tests。
- Dashboard focused：5 files / 106 tests。
- `npm run typecheck:web`：通过。
- `npm run test:web`：首轮 996/997 的 drawer focus 时序 flake；无并行负载原样复跑
  52 files / 997 tests 通过。
- `bash tools/test-bundle.sh`：31/31。
- `npm run check:npx-package`：35/35。
- `npm run check:docs`：10/10，39 canonical Markdown files。
- `npm run check:repository-hygiene`：6/6。
- `npm run check:architecture`：623 files，5 个 size-only exception。
- `npm run check:comments`、`git diff --check`：通过。
- 重复 `--host`、重复 `--operation`、custom `.foo` 均 exit 1；未调用真实 setup/update。
- 真实 tracked server：失败后重试、成功缓存、20 路同键只产生 1 个 CLI child、25 个 canonical
  key 峰值 CLI 并发 1、填满后 25/25 cache hit 均通过；三个 server 均已停止。

`npm test` 诚实记录：

- 首轮 exit 1：314 files passed / 3 failed，5480 passed / 4 failed / 5 skipped。两项
  `afk-run` 是本地 `sandcastle:local` attestation 落后；隔离重建镜像后定向 4 passed / 1 skipped。
  skill-gate timeout 与 release lock 竞态定向复跑通过。
- 重建镜像后第二次全量仍 exit 1：314 files passed / 3 failed，5481 passed / 3 failed /
  5 skipped。三个失败分别为 skill-gate 5 秒 timeout、init 临时目录 `ENOTEMPTY`、tap daemon
  SIGINT code 暂为 null；三者定向复跑均通过。
- 5 个 skip：1 个 `TENON_REQUIRE_REAL_CODEX!=1`，4 个缺
  `CLAUDE_CODE_OAUTH_TOKEN` 的真实 agent/container 场景。
- 因两次精确全量命令均 exit 1，本门禁不标 PASS。隔离 `npm ci` 另报告既有 7 vulnerabilities、
  1 deprecated package、4 个未批准 install scripts；均非本 Change 新依赖。

### 真实 Dashboard 浏览器与视觉

结论：PASS，CRITICAL/HIGH/MEDIUM/LOW 均为 0。

- exact git archive：
  `/tmp/tenon-host-plan-final-1176-tMlkFI/repo`；真实地址
  `http://127.0.0.1:54212/?view=hostPlan`，现已停止并确认端口关闭。
- 页面身份：title `Tenon Dashboard`、H1 `宿主目标计划`、health
  `ok=true / scope=global / version=1.0.1`、`host-target-plan/v1`、12 targets。
- desktop `1440×900`、mobile `390×844`、键盘 Enter/Space、2px 可见焦点环、中英文、
  loading/empty/error/retry/ready、复制成功/失败、长命令 overflow 均通过。
- 页面没有 Run/Execute；网络仅有 `/api/host-targets` 与
  `/api/host-target-plan?host=cursor&operation=update` 两个只读 GET。
- 主验收场景 console/page errors 均为空，移动端 body 保持 390px 无页面横向溢出。
- 视觉层次、间距、选中/错误/恢复状态与既有设计系统一致，无 visual finding。

证据：
`/tmp/tenon-host-plan-final-1176-tMlkFI/browser-evidence.json`
（SHA-256 `ad3c5a2e76e20bb420167c39c3320459d70bd45a5e5dc5b5927254c5a69fb600`）
及同目录截图/hash manifest。

浏览器准确显示了当前 DTO 顺序，但该轨只验证 UI/API 一致性；真实 update 命令链比对后确认其中
最后两步属于错误的共享 fixture。

## 逐文件 Spec 回读

`git diff --name-only origin/main...1176d52` 的 144 个冻结路径已逐项枚举，并回读
`openspec/changes/host-target-plan-dashboard/specs/host-target-plan/spec.md`。

| 冻结文件集合 | 命中的 requirement | 结论 |
| --- | --- | --- |
| `packages/cli/src/**`、CLI bundle | catalog、单目标计划、兼容与许可 | catalog/只读通过；adapter update 步骤失败 |
| `packages/server/src/**`、server bundle | 严格只读 API、安全与兼容 | query/runtime/decoder 通过；fixture 继承错误 update 语义 |
| Dashboard `src/api/**`、`hostPlan/**` | DTO、状态、复制、无执行入口 | 状态/UI 通过；decoder fixture 继承错误 update 语义 |
| Dashboard `App*`、`shell/**`、`i18n/**`、dist | 路由、双语、a11y、响应式 | 通过 |
| `docs/**`、OpenSpec Change | clean-room、设计、五项 requirement | delta strict valid；需明确 setup/update 尾部差异 |
| `tools/check-docs*`、`check-repository-hygiene*` | 文档与许可门禁 | 通过 |

## OpenSpec 隔离应用演练

- OpenSpec CLI：`1.6.0`
- `openspec show host-target-plan-dashboard --json --deltas-only`：成功。
- `openspec validate host-target-plan-dashboard --strict`：成功。
- 隔离 clone：
  `/tmp/tenon-host-plan-openspec-final.IUCz6L/repo`
- 隔离 `openspec archive host-target-plan-dashboard --yes --json`：成功，应用 5 个新增
  requirement，生成 archive `2026-07-28-host-target-plan-dashboard`。
- 隔离 `openspec validate host-target-plan --type spec --strict`：成功。
- 真实主规格 digest 未变；Ship 仍是唯一真实 apply 边界。

## 失败处理

持续自主模式采用保守默认：修复，不接受偏差。下一轮必须：

1. 经确切 `verify-fail` review receipt 返回 Build，再以 `requirements-changed` 进入 Spec。
2. 在 delta spec/design 中明确 adapter setup 包含 skills/readiness，而 adapter update 在 deploy
   后结束。
3. 以真实 `cmdUpdate(cursor)` 契约测试先制造 RED，再同步 CLI、server、Dashboard decoder/fixtures。
4. 重新完成 Build 门禁、冻结提交和四轨全量 Verify；不得复用本轮 PASS 轨作为新冻结证据。
