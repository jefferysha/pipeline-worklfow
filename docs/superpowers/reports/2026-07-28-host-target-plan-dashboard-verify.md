# Host Target Plan Center 验证报告

## 结论

第五轮 Verify 审查冻结提交
`db167a9f112d7a14773e819d40bb8c33b2b12e3e` 的完整
`origin/main...build_sha` 交付面。Reviewer 与真实 Dashboard 浏览器/视觉轨通过，隔离 E2E
的全部自动化门禁也通过；Codex CLI 与 E2E 独立复现 2 个可修复 MEDIUM / P2：

1. native `update` 计划无条件附加仅完整 setup 才执行的 `bundled-skills` 与
   `runtime-readiness`；
2. server 复用的 `parsePipelineCliJson` 会接受“前置杂讯 + 最后一行合法 JSON”，不满足
   Host Plan API 对单一完整 JSON 文档的严格失败关闭要求。

因此聚合结论为 **FAIL**。持续自主模式选择修复，不接受偏差；必须经确切
`verify-fail` review receipt 返回 Build，再修订规格、增加 RED 契约测试并最小修复。

- CRITICAL：0
- HIGH：0
- MEDIUM / P2：2
- LOW：2（既有、非阻断的已登记文档瑕疵）

## 冻结与 repo-zero

- base：`origin/main` / `2d103e330f847e003ff5909097d892f5722cca04`
- `build_sha`：`db167a9f112d7a14773e819d40bb8c33b2b12e3e`
- base tree：`bacc0ab566e02fc41c214a6b93b148609acfeed0`
- frozen tree：`055a4269b3cae0799dfeaf583220b582f15470c9`
- frozen patch SHA-256：
  `ae5fd43d385193f97d597521e755ee0df129a86254fe5a19ce3e7c34f9324b59`
- E2E 轨真实 worktree 前后 HEAD、status、unstaged、staged 指纹分别保持：
  `db167a9f...`、`814bee50...`、`e2365290...`、`e3b0c442...`。
- 浏览器轨真实 worktree 前后指纹均为
  `45c48e86d675fd2e632f0e989c009a18a21c5a0fb393afa54836dabca3f2d563`。
- 隔离测试、构建、截图、trace 和服务日志均写入 `/tmp`；本报告是四轨聚合后唯一写入真实
  worktree 的治理产物。

## 四轨聚合

### Reviewer Agent

结论：PASS，`C0 / H0 / M0 / L2`。

- 全量审查 170 个冻结路径：27 个源码、23 个文档/OpenSpec、109 个 append-only 治理记录、
  7 个 tracked bundles、4 个工具文件。
- 114 个 JSON 与 1 个 JSONL 均可解析；document ledger 的 9 条记录与冻结文件 SHA-256
  一致。
- adapter setup 五步、update 三步正确；CLI 白名单/零副作用、server 查询与 DTO 严格校验、
  同键共享、跨键并发 1、25-key 成功缓存、失败重试、Dashboard 状态/a11y/i18n 均未发现回退。
- `index.html` 引用的 `index-BY2_aTHg.js` 与 `index-Cgs1CiNQ.css` 均已跟踪并存在。

两个 LOW：

- ADR 决策列表有两个连续 `5.`；
- 早期实施计划仍写合并式 `api/hostTargetPlan.ts`，实际已拆成 Client/Decoders/Types。

两项属于已在 Spec phase 登记的非语义历史文案，不影响本轮两个产品 finding 的失败结论。

### Codex CLI

结论：FAIL，MEDIUM / P2 2 项。

1. `nativeSteps` 对 setup/update 都追加全部 `PRODUCT_STEPS`。真实 native `cmdUpdate` 走
   marketplace refresh/install/inventory 与 managed release，不调用 `cmdSetupSkills` 或
   `cmdSetupRuntime`；预览因此多报 `bundled-skills` 和 `runtime-readiness`。
2. `serverGetHostTargetPlanRoutes.ts` 把 stdout 交给 `parsePipelineCliJson`。该通用 parser
   会从后往前接受最后一行可解析 JSON，使带人类前置输出或多个文档的 CLI 响应仍返回 200；
   Host Plan v1 应对完整 trimmed stdout 只做一次 `JSON.parse` 并失败关闭。

Codex 使用 read-only sandbox；其临时目录写入型测试因 `EPERM` 无法运行，但上述两项经源码
控制流回读和 E2E 独立复现确认。Codex 未修改仓库。

### 隔离 E2E

结论：FAIL，自动化门禁全绿，但复现同一组 2 个产品 P2。隔离 clone：
`/tmp/tenon-host-plan-final3-e2e.yUPP0V/repo`。

通过项：

- `npm ci`：exit 0；401 packages / 411 audited；既有审计为 5 moderate、1 high、1 critical。
- `npm run build`：exit 0；Dashboard 2011 modules，JS 772.68 kB / gzip 246.17 kB；
  只有既有 >500 kB chunk warning。
- CLI/server focused：4 files / 166 tests。
- Dashboard focused：5 files / 108 tests。
- `npm run typecheck:web`：exit 0。
- `npm run test:web`：52 files / 999 tests；既有 React `act(...)` 46 条、GSAP 3 条警告。
- 精确 `npm test`：317 files，5485 passed / 5 skipped / 5490 total，exit 0。
- `bash tools/test-bundle.sh`：31/31。
- `npm run check:npx-package`：35/35。
- `npm run check:docs`：10/10，39 canonical Markdown。
- `npm run check:repository-hygiene`：6/6。
- `npm run check:architecture`：623 production files，5 个 size-only exception。
- `npm run check:comments`、`git diff --check`：exit 0。
- 12 hosts × setup/update 共 24 份 DTO 均可解析且 `side_effects=none`；10 个 adapter
  setup 全为五步、update 全为三步，重复 option 与 custom `.foo` 均 exit 1。
- 真实 server：4 类非法 query 全为 400；未缓存 key 在 CLI bundle 缺失时 502，恢复后可重试；
  20 路同 key 只启动 1 个 child；25 canonical keys 全部 200、child 峰值并发 1，填满后
  25/25 cache hit；29911/29912/29913 最终均无监听。

失败复现：

- `codex update` DTO 为
  `marketplace-refresh → plugin-update → plugin-inventory → managed-runtime → bundled-skills → runtime-readiness`，
  后两项与真实 update 控制流不符。
- `parsePipelineCliJson('leading-noise\n{"schema_version":"host-target-plan/v1"}')` 成功返回对象，
  证明 API parser 未按完整单文档失败关闭。

5 个 skip 均为既有环境边界：1 个 `TENON_REQUIRE_REAL_CODEX!=1`，其余真实 agent/container
场景缺 `CLAUDE_CODE_OAUTH_TOKEN`。未执行真实 setup/update 写操作。

### 真实 Dashboard 浏览器与视觉

结论：PASS，`C0 / H0 / M0 / L0`。

- exact isolated clone：`/tmp/tenon-host-plan-final-db167-qukRib/repo`；
  URL `http://127.0.0.1:59336/?view=hostPlan`。
- 页面身份：title `Tenon Dashboard`、导航/标题“宿主目标计划”、health
  `ok=true / scope=global / version=1.0.1`、12 targets。
- Cursor Update 在 UI/API 都严格为三步且没有 setup-only token；Cursor Setup 严格五步。
- desktop `1440×900`、mobile `390×844`、Enter/Space、可见 2px focus ring、中英文、
  catalog/plan loading、empty、decoder error、retry、ready、复制成功/失败、长命令内部滚动和
  页面无横向溢出均通过。
- 无 Run/Execute 控件；请求 trace 仅有两个只读 GET；console/page errors 为空。
- 证据：
  `/tmp/tenon-host-plan-final-db167-qukRib/browser-evidence.json`
  （SHA-256 `c497bb7d8ad457bdc030ca88d5938e93cdb1389122a5fec56d4de090133de432`）
  与 `cursor-update-setup-trace.zip`
  （SHA-256 `645ddcd7da520ed228a1c32161c2fb265739ed64602af06c04b47ca1b6021d20`）。
- 59336 已关闭，浏览器与服务均已停止。

该轨准确验证了 adapter 的第五轮修复；native update 与 server stdout 严格性不属于所选
浏览器场景，故不抵消 Codex/E2E 的失败。

## 逐文件 Spec 回读

`git diff --name-only origin/main...db167a9` 的 170 个冻结路径已逐项枚举，逐文件映射记录为
`/tmp/tenon-host-plan-spec-mapping-db167a9.md`（170 data rows，SHA-256
`cacb28837831853237154669c597c615f59a8b4a7ced33d4864d097b184ee077`），并回读
`openspec/changes/host-target-plan-dashboard/specs/host-target-plan/spec.md`：

| 冻结文件集合 | 命中的 requirement | 比对结论 |
| --- | --- | --- |
| CLI source/tests/bundle | 目录、单目标计划、兼容与许可 | adapter 通过；native update 尾步失败 |
| server source/tests/bundle | 严格只读 API、安全与兼容 | 查询/DTO/runtime 通过；完整 stdout 严格性失败 |
| Dashboard api/hostPlan | DTO、状态、复制、无执行入口 | 通过 |
| Dashboard App/shell/i18n/dist | 路由、双语、a11y、响应式与交付 | 通过 |
| docs/OpenSpec/治理记录 | 全部新增 requirements、研究/设计/治理证据 | strict valid；需明确 native update 与单文档 stdout |
| tools checks/tests | clean-room、文档与许可门禁 | 通过 |

## OpenSpec 隔离应用演练

- OpenSpec CLI：`1.6.0`
- `openspec show host-target-plan-dashboard --json --deltas-only`：成功。
- `openspec validate host-target-plan-dashboard --strict`：成功。
- 主线隔离 clone：`/tmp/tenon-host-plan-openspec-db167a9.Rdp7Sd/repo`。
- 隔离 `openspec archive host-target-plan-dashboard --yes --json`：成功，应用 5 个新增
  requirement 并生成 `2026-07-28-host-target-plan-dashboard` archive。
- 隔离 main spec `openspec validate host-target-plan --type spec --strict`：成功。
- 真实 `openspec/specs/**/spec.md` 聚合 digest 前后均为
  `44328f9c948d747c455e279f141d5eeb4d0f9db8571afdbb2de3bcc40aa299eb`；
  Ship 仍是唯一真实 apply 边界。

## 下一轮修复要求

1. 经确切 `verify-fail` review receipt 返回 Build，再以 `requirements-changed` 返回 Spec。
2. 规格明确 setup-only 尾步同样不得出现在 native update；native setup 保留产品步骤，
   native update 仅保留真实 update plan 与 managed runtime。
3. server 对 Host Plan stdout 使用局部、完整、单 JSON 文档 parser，不改变其他既有 mutation
   路由所需的通用解析兼容性。
4. 先增加真实 native update 与“前置杂讯 + 合法末行 JSON”失败用例并确认 RED，再做最小实现。
5. 重新完成 Build 全量门禁与四轨 Verify，不复用本轮 PASS 作为新冻结证据。
