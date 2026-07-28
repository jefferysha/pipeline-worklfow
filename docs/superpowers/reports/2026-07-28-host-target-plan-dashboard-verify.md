# Host Target Plan Center 验证报告

## 最终 Verify 结论

冻结提交 `6769b6929c6d5a99fa6794c4843f397fab1f0e52` 的完整 reviewer、隔离 E2E、
真实 Dashboard 浏览器/视觉均通过；隔离 Codex CLI 轨完成全量静态回读，但在有界窗口内未输出
终态文本，按 Tenon 降级规则由其余完整轨承担结论。聚合结果为 **PASS**。

- CRITICAL：0
- HIGH：0
- MEDIUM：0
- LOW：0
- base / merge-base：`15fe619b2885b928dd27be9668cca6b0ee903c57`
- frozen tree：`cecf4b5b4a921d85b2a40a58c1c1bf6a553868d3`
- `origin/main` 是冻结提交祖先；`git merge-tree --write-tree origin/main HEAD` exit 0。

### repo-zero 与 Codex 轨事件

冻结后第一次在真实 worktree 启动的 Codex review 试图把它看到的合法 Verify ledger 恢复为
HEAD，并删除本次 transition/revision 文件。该进程已立即终止；它没有触碰产品源码、配置或生成物。
恢复只通过合法的 `tenon transition host-target-plan-dashboard build-complete` 完成，未手改
canonical state、未 backfill、未删除 marker，重新冻结的 `build_sha` 仍是同一提交。

随后在独立 detached clone
`/tmp/host-target-plan-codex-review-6769b69.7bw90n/repo` 以 read-only sandbox 重跑 Codex
review。该轨逐项回读 CLI/server/Dashboard、测试、文档、生成物与 OpenSpec，执行
`git diff --check`，隔离 clone 前后 clean；但因 clone 未安装 `node_modules`，其测试尝试
不可用，且约 7 分钟有界窗口内未输出最终 PASS/FAIL 文本，因此如实按 Codex 轨异常降级，不把
静态过程冒充完成结论。原始日志：
`/tmp/host-target-plan-codex-review-6769b69.7bw90n/codex-review.log`，SHA-256
`ec321fb982a020179a25aec28ea543c8da2051424661349708944f5ad9cf300b`。

Reviewer、E2E 与浏览器轨均观察并记录了上述治理窗口。恢复后的完整 status fingerprint
连续稳定；真实 worktree 的产品源码、配置、生成物 diff 与 staged digest 始终为空。四轨
截图、trace、构建和测试产物全部位于仓库外。

### 四轨聚合

1. Reviewer：PASS，`C0/H0/M0/L0`。覆盖 222/222 个冻结路径：
   OpenSpec/治理 173、docs 11、CLI 8、server 6、Dashboard 20、tools 4；166 个 JSON、
   1 个 JSONL / 209 rows、9/9 ledger hashes、69 revision/pre-review 和 23 transition
   记录一致。Codex setup/update 7/5、Claude 6/4、十个 adapter 5/3、严格 decoder、
   zero-side-effect、copy-only UI、生成物与 clean-room 边界全部通过。
2. Codex CLI：降级。隔离、read-only 的完整静态回读未报告 actionable finding，但有界窗口内
   未形成终态文本；测试由下方独立 E2E 轨完整执行。
3. 隔离 E2E：PASS，`C0/H0/M0/L0`。隔离 clone
   `/tmp/tenon-host-plan-final5-verify.LPLd9k/repo`：
   - `npm ci`、`npm run build`、`npm run typecheck:web` 全部 exit 0；
   - CLI/server focused 5 files / 200 tests，Dashboard focused 5 files / 108 tests；
   - `npm run test:web` 52 files / 999 tests；
   - `npm test` 318 files / 5539 passed / 5 honest skips；
   - bundle 31/31、npx 39/39、docs 10/10、hygiene 6/6、architecture 627 files、
     comments、diff 与 OpenSpec strict 全部通过；
   - built CLI catalog 为 12 个目标，24/24 plans 均 `side_effects=none`；Codex 7/5
     且含 auth step/notice，Claude 6/4，adapter 5/3；五类非法输入全部 exit 1；
   - 真实 server 拒绝五类非法 query 和两类混合 stdout；失败重试、success cache、
     20 路同 key 与 25 canonical keys 并发均通过，最大 child 并发为 1；XDG 零写。
4. 真实 Dashboard 浏览器/视觉：PASS，`C0/H0/M0/L0`。独立 clone
   `/tmp/tenon-host-plan-final-6769-gs0iHb/repo`，真实 URL
   `http://127.0.0.1:52429/?view=hostPlan` 已关闭。页面身份、12 targets、desktop
   `1440×900`、mobile `390×844`、键盘与 2px focus、copy 成功/失败、loading/empty/
   error/retry/ready、zh/en、长命令内部滚动均通过；Codex 7/5 可见 auth status/guidance，
   Claude 6/4 与 Cursor 5/3 无 auth 泄漏；API trace 只有 GET，无执行按钮、console/page
   errors 为 0。
   - `browser-evidence.json` SHA-256：
     `789f3708c23601394e0d73caa497c728b0792270f8f7ff96887314efb2e6f8be`
   - `host-plan-variants-trace.zip` SHA-256：
     `088fb6ae3bf85d5d82636f728c72259e7b767d647de44476285eefb029ac5c2a`

### 逐文件 Spec 回读与 OpenSpec 演练

`origin/main...build_sha` 的 222 个路径已全部枚举并映射到 `host-target-plan` delta spec；
路径清单 `/tmp/host-target-plan-paths-6769b69.txt` 的 SHA-256 为
`cb236f29a93ec23eedc7f86c8565a0a75dff0326e99f7d5cf88ded43664ddbc7`。逐组结论：

| 冻结文件集合 | 数量 | 命中的 requirement | 结论 |
| --- | ---: | --- | --- |
| CLI source/tests/bundle | 8 | catalog、单目标计划、兼容与许可 | 通过 |
| server source/tests/bundle | 6 | 严格只读 API、安全、缓存与并发 | 通过 |
| Dashboard source/tests/dist | 20 | 状态、复制、无执行、i18n、a11y、响应式 | 通过 |
| docs | 11 | 用户契约、研究与 clean-room 许可边界 | 通过 |
| OpenSpec/治理 | 173 | 五个新增 requirements 与 phase 证据 | 通过 |
| tools | 4 | docs/hygiene 与上游证据 allowlist | 通过 |

OpenSpec `show` 与 strict validate 均 exit 0。隔离 archive/apply 演练 exit 0，按当前阶段如实提示
22/28 tasks 已完成、6 个 Ship/Archive 未来任务未完成；成功应用 5 个 requirements，归档后的
main spec strict valid，SHA-256
`c7d9fcdda9242080383eaa75ec36a932168a61c202ae2e3d6d69e696d560551d`。
真实 `openspec/specs/` 未在 Verify 写入。

### 非阻断环境告警

- `npm audit`：5 moderate、1 high、1 critical；本 Change 未新增依赖。
- web suite 有 46 条既有 React `act(...)` 与 3 条 GSAP warning。
- Vite 有既有大 chunk advisory。
- 5 个 honest skip 来自 real-Codex 环境门和缺 Claude credential；未执行真实 setup/update。

---

## 第六轮 Verify 结论

冻结提交 `b1a21eecfd66283139e9388c5da33b2004e25808` 的产品、运行时、浏览器与完整代码
审查均通过，先前 native update 与混合 stdout 两项 finding 已关闭。验证期间
`origin/main` 从本 Change 的起始基线 `2d103e330f847e003ff5909097d892f5722cca04`
前进到 `15fe619b2885b928dd27be9668cca6b0ee903c57`；隔离 E2E 证明当前分支与新 main
存在真实 merge conflict。因此聚合结论仍为 **FAIL**，必须通过确切 `verify-fail`
返回 Build，合并最新 main、保留双方语义并重新冻结验证。

- CRITICAL：0
- HIGH：0
- MEDIUM：1（分支集成冲突）
- LOW：0

### 冻结与 repo-zero

- base / merge-base：`2d103e330f847e003ff5909097d892f5722cca04`
- `build_sha`：`b1a21eecfd66283139e9388c5da33b2004e25808`
- frozen tree：`305ade998107095c757a20485ba19fae3f2c3aff`
- frozen patch SHA-256：
  `a0924a5c58d4a46f9d27ea94afb185c342db8ac274781e5815c9178d73ecdea8`
- 真实 worktree 前后 HEAD 均为 `b1a21eec...`；status、unstaged、staged 指纹分别保持
  `4153d5b4...`、`e341b207...`、`e3b0c442...`。
- 真实 `openspec/specs/**/spec.md` digest 前后保持
  `44328f9c948d747c455e279f141d5eeb4d0f9db8571afdbb2de3bcc40aa299eb`。

### 四轨聚合

1. Reviewer：PASS，`C0/H0/M0/L0`。逐项审查 200/200 个冻结路径；144 个 JSON、
   1 个 178 行 JSONL、9 条 document ledger、60 组 revision/pre-review 与 19 个 transition
   identity/link chain 均一致。CLI/server/UI、真实 setup/update 编排、并发缓存、clean-room、
   i18n/a11y 与 tracked bundles 未发现 finding。
2. Codex CLI：PASS，无 actionable correctness regression。read-only sandbox 中写入型 Vitest
   以 exit 130 终止；静态 docs/hygiene、built CLI smoke 和完整源码审查成功。原始输出：
   `/tmp/tenon-host-plan-codex-b1a21.s3yWAN/codex-review.txt`，SHA-256
   `9c4f4b1be955fee7f95a355d2c4428696eb22805de326ad672574c3589d57073`。
3. 隔离 E2E：产品与运行时 PASS，交付 FAIL，`M1`。隔离目录
   `/tmp/tenon-host-plan-final4-verify.rnAhv7/repo-local`：
   - build、typecheck、52 files / 999 web tests、317 files /
     5489 passed + 5 honest skips、bundle 31/31、npx 35/35、docs 10/10、
     hygiene 6/6、architecture/comments/OpenSpec/diff 全部通过；
   - CLI/server focused 187/187，Dashboard focused 108/108；
   - 12 hosts × 2 共 24 份 DTO 全部 `side_effects=none`；native update 精确四步，
     adapter setup 五步/update 三步；custom/repeated options 均拒绝；
   - 真实 server 对非法 query、前置杂讯 JSON、失败重试、20 路同键、25 个 canonical key、
     跨键并发 1 与 cache hit 的断言全部通过，29921/29922/29923 均已关闭；
   - `git merge-tree --write-tree origin/main HEAD` exit 1，在
     `packages/cli/src/commands/setup.test.ts` 与 `packages/cli/dist/tenon.mjs` 发生冲突。
4. 真实 Dashboard 浏览器/视觉：PASS，`C0/H0/M0/L0`。独立 clone
   `/tmp/tenon-host-plan-final-b1a21-oVIR4P/repo`，真实 URL
   `http://127.0.0.1:57394/?view=hostPlan` 已关闭。页面身份、12 targets、
   desktop `1440×900`、mobile `390×844`、键盘/2px focus、zh/en、
   loading/empty/error/retry/ready、copy success/failure、长命令内部滚动均通过；
   Codex/Claude update 均为四步且无 setup-only 步骤，setup 均为六步；只有只读 GET，
   console/page errors 为 0。
   - `browser-evidence.json` SHA-256：
     `1bba89512234ee009b411d2f12ec8b7c35faf4ae1bd16c3db8d1135668b5e296`
   - `native-update-setup-trace.zip` SHA-256：
     `204f3a387192984c11511a28f7e995459bed91c5e141908b10ac383e124d0a14`

### 逐文件 Spec 回读与 OpenSpec 演练

`origin/main@起始基线...build_sha` 共 200 个冻结路径已全部映射到
`host-target-plan` delta spec：CLI 8、server 6、Dashboard 20、docs 11、
OpenSpec/治理 151、tools 4；路径列表 SHA-256 为
`a51268e5359493583a05c99ede1af80eae14330ba91f7cc49de935e9dc30c1a5`。
Reviewer 对 200/200 路径逐项回读，未发现未映射文件。

OpenSpec `1.6.0` 的 show 与 strict validate 通过；隔离 clone
`/tmp/tenon-host-plan-openspec-b1a21.TJYKPb/repo` 中 archive/apply 成功，应用 5 个
新增 requirement，归档名为 `2026-07-28-host-target-plan-dashboard`，生成后的
`host-target-plan` main spec strict valid。真实主规格未修改。

### 下一轮要求

1. 通过确切 `verify-fail` review receipt 返回 Build。
2. 合并当前 `origin/main`，在 `setup.test.ts` 中同时保留上游 Codex 认证安装测试与本 Change
   的真实 host-plan 编排测试，重新生成 CLI bundle。
3. 运行冲突相关 focused、完整 build/typecheck/test 门禁，重新提交并冻结。
4. 对新冻结 SHA 重做完整 reviewer、隔离 E2E、Codex 与真实浏览器聚合，不复用本轮 PASS。

---

## 第五轮 Verify 历史报告

### 当时结论

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
