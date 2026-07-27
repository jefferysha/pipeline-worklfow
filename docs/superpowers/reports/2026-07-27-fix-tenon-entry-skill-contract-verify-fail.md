# `fix-tenon-entry-skill-contract` Verify 失败报告

## 结论

- 冻结构建基线：`workspace:sha256:3a82d62bc925f221575b7a88d23804f8317cb4ca67d9be4dfd77fa82c6fbdd7b`
- Track：`backend`
- 结论：**FAIL**
- 决策：通过精确 `verify-fail` 返回 Build，修复独立 reviewer 发现的 High 与相关必要回归。
- 说明：E2E、全量构建和此前门禁为绿色，但不能覆盖本轮独立审查发现的治理与恢复漏洞。

## 独立 reviewer 轨

独立 reviewer 重新计算冻结靶并确认与上述 `build_sha` 精确一致。审查为只读，未修改仓库或
Tenon canonical state。

### High

1. `packages/cli/src/commands/session.ts:133`、
   `packages/cli/src/continuousAuthority.ts:66`

   持续授权只绑定 Change 与 repo-global `.pipeline-active`，authority 不含 `host_session`，
   delegated acknowledge 也未校验当前宿主会话。另一会话可在 Change 仍 active 时复用授权，
   不满足 `normal-chat-routing` 的 Change + host session 边界。

2. `hooks/prompt-intent.sh:81`

   批准短语使用裸子串匹配。实测“我没有说所有操作我都批准”“不是所有操作我都批准”均返回
   `authorize`，router 随即传播 `continuous_execution=true`。否定或引用语境必须优先拒绝，
   未知复合句必须 fail closed。

3. `packages/cli/src/runtime/managed-host-reconciliation.ts:52`

   已标记 `completed` 的宿主步骤恢复时只检查 WAL 中旧 `observedAfter`，未重新读取当前权威
   inventory。checkpoint 后若宿主漂移到第三状态，事务仍会继续；completed recovery 也必须执行
   fresh observe，不满足持久化 desired 时返回 indeterminate。

### Medium

1. `packages/cli/src/commands/dashboard.ts:331`、
   `packages/cli/src/commands/dashboard-health.ts:47`

   真实 `inspect()` 未传 transaction id，而 health probe 在 expected id 缺失时只接受普通服务。
   需要不授予 ownership 的任意 identity observation，再由 coordinator 对
   transaction/release/scope/port/pid 做精确判定。

2. `packages/cli/src/commands/managed-host-observation.ts:75`、`:111`

   marketplace/plugin inventory 遇到多个 Tenon identity 时取第一个，未拒绝歧义；plugin
   observation 也未把 enabled 状态纳入权威规范化。

3. `packages/kernel/src/workflow/document-contract.ts:239`

   ADR 的 Spec 写权限仅检查 `openspec-v1 + step=spec`，未证明当前 visit 来自
   `requirements-changed`。允许条件必须绑定当前 Build/Verify→Spec 的精确 transition visit。

## E2E 轨

独立 E2E 轨为只读，结果 **PASS**：

- 窄场景：
  `npx vitest run packages/cli/src/commands/release-coordinator.test.ts packages/cli/src/commands/dashboard-health.test.ts packages/server/src/preempt.test.ts packages/kernel/src/workflow/transition-application.test.ts packages/cli/src/commands/review.integration.test.ts -t 'candidate journal commit|host command 已达到 desired|第三状态|旧 pending WAL|pending WAL 当前 observation|Dashboard ready journal|普通 Dashboard|其他 transaction Dashboard|accepts only the exact managed transaction identity|managed transaction 不得抢占|pidfile transaction id|review receipt 绑定 exact event|delegated acknowledge requires'`
  → 5 files，13 passed，70 skipped（测试名过滤），0 failed。
- 边界回归：
  `npx vitest run packages/cli/src/commands/managed-host-observation.test.ts packages/cli/src/commands/release-coordinator.test.ts packages/cli/src/commands/setup.test.ts packages/cli/src/commands/update.test.ts packages/cli/src/commands/dashboard-health.test.ts packages/cli/src/commands/dashboard.test.ts packages/server/src/server.test.ts packages/server/src/preempt.test.ts packages/kernel/src/workflow/transition-application.test.ts packages/cli/src/commands/review.integration.test.ts`
  → 10 files，446/446 passed。
- `bash tools/test-hooks.sh` → 460 个 `ok`，0 failure。
- `git diff --check` → exit 0。

这些绿测反证了当前覆盖缺口：跨宿主 session 授权、否定复合语义、completed checkpoint 后再次漂移、
真实 starter 任意 transaction identity observation 尚未被现有测试捕获。

## Codex 轨

已启动独立只读 Codex CLI 审查：

```text
codex exec --sandbox read-only "<冻结工作区审查 brief>"
```

Codex 进程读取了当前冻结工作区并进入审查，但长时间未返回最终 PASS/FAIL；输出包含本机 Codex
日志数据库损坏和 model cache schema 警告。该轨按 Skill 的“异常可降级”处理，不能覆盖 reviewer
轨的 FAIL，也不登记为通过。

## OpenSpec Verify

- `openspec --version` → `1.6.0`
- `openspec show fix-tenon-entry-skill-contract --json --deltas-only` → 13 条 delta。
- `openspec validate fix-tenon-entry-skill-contract --strict` → valid。
- 真实主规格 Verify 前 digest：
  `bb634a3ea274f81ad54f16e341fd1981889f7292713de6f6fbd0d48261272562`
- 原始隔离 archive 首次失败：既有 `plugin-runtime` 主规格缺少 `## Purpose`；OpenSpec 明确报告
  `No files were changed`。这是用户已排除出当前 Change 的基线债务。
- 仅在隔离副本
  `/private/tmp/tenon-verify-openspec.lULLzG/repo`
  临时补 Purpose 测试夹具后：
  - `openspec archive fix-tenon-entry-skill-contract --yes --json` → 13 added；
  - `tenon-product-identity`、`dashboard-project-selection`、`normal-chat-routing`、
    `plugin-runtime`、`plugin-distribution` 逐项 `--strict` → valid；
  - 真实主规格 Verify 后 digest 仍为
    `bb634a3ea274f81ad54f16e341fd1981889f7292713de6f6fbd0d48261272562`。

临时 Purpose 不进入当前 Change、真实主规格或 Git；基线债务留到归档后的独立新会话。

## 独立候选浏览器

- 候选入口：`http://127.0.0.1:18771/`
- 页面标题：`Tenon Dashboard`
- 无 `root` 打开后规范化为 `/?view=projects`，保持项目总览。
- 无选择状态只请求 `/api/snapshot`，未请求 per-root API。
- 显式点击项目后 URL 写入精确编码 root 并进入 progress；浏览器 Back 返回无 root 项目总览。
- 上述路径 console error、page error、HTTP 4xx/5xx 均为 0。
- terminal/automation 浏览器夹具尝试因隔离 Playwright 的 SSE 长连接未在本轮稳定收束；该项必须在
  修复后 Verify 重跑，不能在本报告声称通过。
- transaction ownership 的进程级行为已由 E2E 覆盖，修复后还需在候选浏览器/health 实例复验。

## 修复后必须新增的失败优先回归

1. authority 绑定精确 host session；另一 session 不得 delegated acknowledge。
2. 否定、引用、修改意图优先于批准子串。
3. completed checkpoint 恢复必须 fresh observe；desired、before、第三状态各有明确语义。
4. real Dashboard inspect 可观察 ordinary/current/other transaction，但 observation 不授予 ownership。
5. 重复或 disabled host inventory 返回 indeterminate。
6. ADR 仅在精确 `requirements-changed` visit 允许当前 `tenon-spec` 重新登记。

## 未验证项与风险

- 本报告是失败报告，不满足 `verify-pass`。
- 未执行真实 Codex/Claude marketplace mutation；发布后的宿主 schema 漂移仍需真实 runtime smoke。
- 未执行最终 18765、npm、GitHub Release、Pages 与 doctor；这些属于修复后 Ship。

## 第二次 Verify 复核（冻结基线 `9dd5d148`）

首次失败项修复后，Build 以
`workspace:sha256:9dd5d1487e691047a4f1c055fa4be6533c8e7141f5d0377428d06cd85e000540`
重新冻结。独立 E2E、OpenSpec 和真实浏览器轨均通过，但独立 reviewer 仍发现 1 个 High 与
2 个 Medium，因此第二次 Verify 继续判定 **FAIL**，必须经精确 `verify-fail` 返回 Build。

### 第二次 reviewer 发现

1. **High — 否定或引用语义仍可误生成持续授权。**
   `hooks/prompt-intent.sh` 只枚举少数完整否定句，后续仍裸匹配 `全部允许/全部批准`。
   实测“我没有说全部允许”“不是全部允许”“我不认为应该全部批准”
   和“我只是引用‘全部批准’这句话”均错误返回 `authorize`。
2. **Medium — managed-host desired proof 未完整约束 source/root。**
   marketplace source 使用子串判断，local refresh 只验证 `sourceType=local`，plugin desired
   忽略已采集的 marketplace/plugin root；不同 source/root 的第三状态仍可能被误判为 desired。
3. **Medium — ADR requirements-changed 限制只覆盖旧策略兼容分支。**
   当前冻结策略已经原生声明 Spec ADR，因此兼容判定不生效；新策略和无 policy 调用仍可在首次
   Explore→Spec visit 重登记 ADR。

reviewer 只读复核前后指纹一致；其定向 Vitest 为 11 files、400 tests 全绿，hook 为
464 passed、0 failed，`git diff --check` 通过。绿测说明现有测试尚未覆盖上述绕过路径。

### 第二次独立 E2E

- 窄测试：12 files，24 passed，0 failed（423 个按名称过滤）。
- 相关边界套件：15 files，548/548 passed。
- `bash tools/test-hooks.sh`：464 passed，0 failed。
- `git diff --check`：通过。
- 前后冻结指纹均精确等于 `workspace:sha256:9dd5d148...e000540`，全程只读。

### 第二次 OpenSpec 与浏览器

- `openspec 1.6.0` 严格校验当前 Change 通过，共 13 条 delta。
- 原始隔离 archive 仍只因已排除的 `plugin-runtime` 主规格缺少 `## Purpose` 而失败且未写文件；
  仅在 `/private/tmp/tenon-verify-openspec.y6s6p6/repo` 添加临时 Verify 夹具后，13 条 delta
  全部应用，五个受影响 capability 逐项严格校验通过。
- 真实主规格前后 digest 均为
  `bb634a3ea274f81ad54f16e341fd1981889f7292713de6f6fbd0d48261272562`。
- 当前候选 PID 14886 在 `http://127.0.0.1:18771/` 返回 version `1.0.1`；
  标题为 `Tenon Dashboard`，无 root 时规范化为 `/?view=projects`，只请求全局
  `/api/snapshot` 与 `/api/stream`。
- 项目按钮唯一计数为 1；显式选择后 URL 写入精确编码 root，项目导航返回无 root 总览。
- 390px viewport 下 `scrollWidth = clientWidth = bodyScrollWidth = 390`。
- 重载捕获 5 个成功响应，console exception、network failure、HTTP 4xx/5xx 均为 0。

### 第二次 Codex 轨

只读 `codex exec` 进入独立会话并读取冻结工作区，但再次因本机日志数据库损坏与 model cache
schema 警告持续输出而未形成最终结论；在 157,702 tokens 后主动终止。该轨按 Skill 降级，
不能覆盖 reviewer 的 FAIL。

### 第二次回退后的必测项

1. 对任意否定、质疑、引用或元语言包裹的批准短语 fail closed，并以失败优先测试覆盖。
2. desired observation 精确约束 marketplace source、marketplace root、plugin root 与 local
   refresh source path；不同来源/root 一律第三状态。
3. 不论冻结 policy 是否原生包含 Spec ADR，也不论调用方是否传 policy，首次 Spec visit 都不得
   重登记 ADR；只有精确 `requirements-changed` 当前 visit 可放行。

## 第三次 Verify 复核（冻结基线 `88a7b553`）

第二次返工后，Build 以
`workspace:sha256:88a7b5535c38963eba32d481ca49cace662c27a09247ddef49d74329dc5a20f8`
重新冻结。独立 E2E、OpenSpec 与真实浏览器轨通过，但独立 reviewer 继续发现 2 个 High 与
1 个 Medium，因此第三次 Verify 仍判定 **FAIL**，经精确 `verify-fail` 返回 Build。

### 第三次 reviewer 发现

1. **High — 授权分类仍依赖有限否定词表。** “我不想全部允许”“我不能全部批准”
   “我不会全部允许”“我从未说全部允许”“请不要全部批准”
   和“不要把全部允许理解成授权”均错误返回 `authorize`。实现必须改成保守的肯定识别：
   不能排除否定、引用、条件或元语义时一律 reject/unrelated。
2. **High — ADR visit 门信任兼容 history 投影。**
   `currentSpecVisitEnteredViaRequirementsChanged()` 扫描可追加的 `.pipeline-history.jsonl`；
   测试也通过直接追加无 transition record identity 的 JSON 获得授权。必须从 canonical run
   metadata 的 transition head 读取并验证 immutable `TransitionRecord` 的
   runId、sequence、id、event、from/to，不能信任 best-effort history。
3. **Medium — 空 marketplace inventory 的 register desired identity 不完整。**
   before 为空时 `root/sourceType` 被设为 `null` 并在后置检查中跳过；任意本地 root 与
   `sourceType=local` 只要伪装 canonical source 文本就会被当成 checkpoint。空库存注册必须钉
   官方远端 source type，并验证新 root 的 canonical Git remote/revision。

reviewer 只读前后指纹一致；定向 Vitest 为 11 files、404 tests 全绿，hook 为 468 passed、
0 failed，`git diff --check` 通过。对抗命令确定性复现上述三条。

### 第三次独立 E2E 与主轨

- 独立窄测试：3 files，8 passed；直接 marketplace 身份轴 4/4、已知 authority guard 8/8。
- 相关宽边界：7 files，173/173 passed；hook 468 passed，0 failed。
- Build 主轨：核心 313 files、5342 passed、5 个真实外部环境诚实跳过；Web 962/962。
- `npm run build` 与身份、交互契约、架构、仓库卫生、注释、文档、模板、npx、legacy bridge、
  migration CAS、default workflow freshness、adapters 272/272、Skill inventory、bundle 23/23、
  golden oracle 和 `git diff --check` 全部通过。

### 第三次 OpenSpec、浏览器与 Codex

- `openspec 1.6.0`：当前 Change strict valid，13 条 delta。
- 原始隔离 archive 仍只因已排除的 `plugin-runtime` 主规格缺 Purpose 失败且未写文件；
  仅在 `/private/tmp/tenon-verify-openspec.UTGC7W/repo` 添加 Verify-only Purpose 后，
  13 条 delta 全部应用，五个 capability 逐项 strict valid。
- 真实主规格 digest 前后均为
  `bb634a3ea274f81ad54f16e341fd1981889f7292713de6f6fbd0d48261272562`。
- 最新候选 PID 13687 在 `http://127.0.0.1:18771/` 返回 version `1.0.1`；
  标题、无 root 项目总览、唯一显式选择、浏览器 Back、390px 无横溢出均通过。
  重载只观察到页面、CSS、JS、`/api/snapshot`、`/api/stream` 五个 200 响应，
  console/network/HTTP error 为 0。
- Codex 只读轨第三次进入独立会话，但本机日志数据库与 model cache 异常再次导致持续递归读取，
  在 119,581 tokens 后终止，结论降级；不能覆盖 reviewer 的 FAIL。

### 第三次回退后的必测项

1. 以肯定短语白名单和剩余文本的保守语义检查实现授权；否定、引用、条件、疑问和元语言未知形态
   一律不生成 authority。
2. ADR 放行只消费 canonical current run 的 immutable transition head，并验证完整 identity 与
   `requirements-changed` edge；伪造 history 行不得影响结果。
3. 空 marketplace inventory 的 register 后置状态必须是官方远端 Git identity；本地 source type、
   非 canonical remote、不可证明 revision 或 lookalike root 均为第三状态。

## 第四次 Verify 复核（冻结基线 `e3c937e1`）

第三次返工后，Build 以
`workspace:sha256:e3c937e1f718751c66dc284d72ed75b80b9738410961c95522ba1f568c914b55`
重新冻结。Build 全量门禁、OpenSpec 隔离应用演练均通过，但独立 reviewer 发现 2 个 High 与
1 个 Medium，因此第四次 Verify 仍判定 **FAIL**。E2E 与浏览器轨在 reviewer 给出失败结论后
立即停止，不能登记为通过。

### 第四次 reviewer 发现

1. **High — 持续授权仍可被未枚举的拒绝表达绕过。**
   `hooks/prompt-intent.sh` 删除 authority 短语后仍检查有限的剩余否定词。实测
   “禁止全部允许”“拒绝全部批准”“取消全部允许”“反对全部批准”、
   “do not 全部允许”和“never 全部批准”均返回 `authorize`。安全边界必须改成封闭的肯定句式；
   任何无法证明为允许的剩余文本默认不授权。
2. **High — marketplace register 未将 checkout HEAD 绑定官方 main revision。**
   当前只验证 remote type、origin URL 与 HEAD 非空；测试中本地 HEAD 为 `a…`、远端 main 为
   `b…` 仍被判定 desired。before inventory 为空时必须在 mutation 前冻结官方 main SHA，
   并要求登记后的权威 inventory root HEAD 与该 SHA 精确相等。
3. **Medium — ADR gate 误要求最新 canonical revision 本身就是 transition。**
   当前 phase 的 transition head/sequence 仍绑定精确不可变 `requirements-changed` record 时，
   进入 Spec 后的合法 canonical `set` revision 不应使本次 visit 失效。应验证 current
   metadata head 与 immutable record，不要求 `current.mutation.kind === 'transition'`，并补
   transition 后再发布非 transition revision 的回归。

reviewer 只读复核前后指纹一致；定向 Vitest 为 7 files、366 tests 全绿，`git diff --check`
通过。上述 authority 六个输入和 marketplace revision mismatch 均由独立对抗命令确定性复现。

### 第四次 Build 与 OpenSpec 证据

- 聚焦修复回归：2 files、31/31 passed；hook 全套通过。
- `npm run build`、核心全量测试、Web 962/962、identity、architecture、repository hygiene、
  comments、docs、document templates、npx、legacy bridge、migration CAS、default workflow
  freshness、adapters 272/272、verify-skills、bundle 23/23、golden oracle 与
  `git diff --check` 全部通过。
- `openspec 1.6.0`：当前 Change strict valid，13 条 delta。
- 原始隔离 archive 在
  `/private/tmp/tenon-verify-openspec.8BSkim/repo`
  仍只因用户已排除的 `plugin-runtime` 主规格缺少 `## Purpose` 失败且明确未写文件；
  仅在该隔离副本加入 Verify-only Purpose 后，13 条 delta 全部应用，五个受影响 capability
  逐项 strict valid。
- 真实主规格 digest 前后均为
  `bb634a3ea274f81ad54f16e341fd1981889f7292713de6f6fbd0d48261272562`。

### 第四次运行轨说明

- 最新候选已从冻结 bundle 重启在 `http://127.0.0.1:18771/`，PID 28499，health 返回
  version `1.0.1`；真实浏览器步骤因 reviewer 已失败而停止，未声称通过。
- E2E 子轨在 reviewer FAIL 后被中断，未声称通过。
- Codex 只读轨再次受本机损坏的 logs DB 与 model cache schema 异常影响，在 108,877 tokens
  后主动终止；按 Skill 降级，不能覆盖 reviewer 的 FAIL。

### 第四次回退后的必测项

1. authority 采用封闭肯定语法，任何额外未知自然语言或英文否定均不生成授权；覆盖禁止、拒绝、
   取消、反对、`do not`、`never`。
2. marketplace register 的 desired postcondition 冻结官方 main SHA，并要求 observed HEAD、
   official source type、origin 与该 SHA 全部一致。
3. ADR requirements-changed visit 允许 transition 后的合法 canonical set revision，但仍拒绝
   伪造 history、错误 run/head/sequence/event/from/to 与损坏 record。

## 第五次 Verify 复核（冻结基线 `28a707a7`）

第四次返工及一次 Build→Spec 契约修订后，Build 以
`workspace:sha256:28a707a75fca015c97ac2766a9a6918064912ebdad6b3d84c4dc2f63bb32ee28`
重新冻结。Build pre-Verify 全量收敛 reviewer 已无 Critical/High/Medium；Verify 再次对同一完整
frozen diff 执行独立 reviewer、E2E、Codex、OpenSpec、浏览器和视觉轨。最终 reviewer 发现
2 个 Medium，视觉轨未形成完整 frozen 结论，因此本轮聚合结论仍为 **FAIL**，必须经精确
`verify-fail` 返回 Build。

### 第五次 reviewer 发现

1. **Medium — companion 缺失契约自相矛盾。**
   `docs/CONTRACT.md:21-26` 声称声明 anchor 的 companion 缺失时 fail-loud，但同文件
   `:49-54`、`packages/kernel/src/state/pre-verify-review-store.ts:100-110` 与
   `packages/kernel/src/state/run-revision-store.test.ts:92-102` 都明确把缺失降为 `pending`。
   当前实现是安全失败关闭，但单一契约错误描述了 canonical history/corruption 边界。
2. **Medium — desired-state 已证明后仍受历史非零命令结果控制。**
   `packages/cli/src/runtime/managed-host-reconciliation.ts:52-68,106-126` 在权威 observation
   已证明 desired 且 checkpoint completed 后仍返回持久化原始 result；
   `packages/cli/src/commands/managed-host-command.ts:69-73` 继续解码历史非零 code，
   setup/update 因而可永久失败。verified desired 应是控制流成功事实，原 result 只应保留为
   WAL 诊断。

reviewer 在开始、静态审查、定向测试和结束时均确认冻结指纹精确不变；14 files、285/285
定向测试通过，`git diff --check` 通过，未修改文件。

### 第五次 E2E、全量构建与发行门禁

- 核心 Vitest：1379 suites，5362 passed，5 个外部环境测试诚实 skip，0 failed。
- Dashboard Vitest：50 files，962/962 passed。
- `npm run build` 通过；Vite 仅保留既有大 chunk warning。
- identity、interaction contract、architecture（610 个生产文件）、repository hygiene、
  comments、docs（9/9；39 个 canonical Markdown）、hooks 482/482、adapters 272/272、
  Skill inventory 与 `git diff --check` 均通过。
- 真实 `v1.0.0` N-1 bundle：28/28；ownership/API 7 files、346/346；Dashboard root/source
  6 files、139/139。
- 最终 E2E barrier 前后指纹均精确等于冻结值；普通临时 server `62112` 与 managed
  server `62113` 的 health/snapshot、transaction ownership、显式 root 与项目 A/B 来源隔离
  全部通过，临时服务与目录已清理。

验证过程暴露一项基础设施问题：in-place Verify 的 build/bundle、浏览器截图、快照和日志可能写入
fingerprint scope，造成瞬时靶漂移。最终 E2E 已改为 repo-zero-output 并恢复稳定，但全局
Verify 契约必须明确：所有可能写 tracked 发行物的命令在 Build 冻结前完成，Verify 只在隔离副本
运行它们；浏览器/QA 输出强制写仓库外。

### 第五次 OpenSpec、浏览器、视觉与 Codex

- `openspec show ... --json --deltas-only` 返回 5 个受影响 capability；Change strict valid。
- 原始隔离 archive 仍只因用户明确排除的既有 `plugin-runtime` 主规格缺少 `## Purpose` 失败，
  且明确 `No files were changed`。仅在
  `/private/tmp/tenon-verify-openspec.pdifKv`
  加入 Verify-only Purpose 后，五个 capability 全部严格校验通过。
- 真实主规格 digest 前后均为
  `bb634a3ea274f81ad54f16e341fd1981889f7292713de6f6fbd0d48261272562`。
- 主轨真实浏览器确认候选 `18771` 的标题为 `Tenon Dashboard`；无 root 规范化到
  `/?view=projects`，显式选择写入精确 root，Back 返回项目总览，390px
  `documentScrollWidth = clientWidth = 390`，console warning/error 为 0。
- 独立视觉轨只确认候选 health 与静态资产，未在冻结靶上完成关键页面和状态截图，结论
  `INCONCLUSIVE`，不能登记为 PASS。
- Codex CLI 只读轨读取完整 frozen diff，但本机损坏的 logs DB 与 model cache schema 异常导致
  持续递归读取；在 270,206 tokens 后终止，按 Skill 记为降级，不能覆盖 reviewer 的 FAIL。

### 第五次逐文件规范回读

按 `git status --short` 对冻结工作区逐项回读，并把全部 155 个 tracked/untracked 改动归入以下
互斥责任组：

- `tenon-product-identity`：产品版本、入口 Skill、生成契约、doctor、发行身份与卫生门禁。
- `plugin-distribution`：setup/update、宿主 inventory/reconciliation、managed runtime、
  release coordinator、bundle、adapter 与安装态验证。
- `plugin-runtime`：Build→Verify convergence、canonical state/revision/transition、
  N-1 wire/companion、默认与自定义 workflow 生命周期及文档证据。
- `dashboard-project-selection`：server snapshot/API、Dashboard project selection、
  source isolation、transaction identity/ownership 与 390px 项目总览。
- `normal-chat-routing`：持续授权 classifier、Change + host-session 绑定、exact-event review
  acknowledgement、hooks/router 与全部治理 Skill 交互契约。

每个文件均由其最窄 capability 主规格与本 Change delta 共同核对；上述两个 Medium 分别落在
`plugin-runtime` 的 canonical 完整性/宿主恢复控制流，未发现未映射文件。

### 第五次回退后的必测项

1. 统一 anchored companion 缺失语义：按既定 N-1 兼容设计降为 `pending` 失败关闭，并修正顶层契约。
2. first-run 与 completed recovery 在权威 observation 已证明 desired 时均返回控制流成功；
   原非零命令 result 只保留诊断，并补两条失败优先测试。
3. 把 repo-zero-output 写进全局 Build/Verify Skill 与 reviewer/E2E brief：冻结前完成所有会写
   tracked 产物的门禁，冻结后只能在隔离副本运行；QA 输出固定到仓库外。

## 第六次 Verify 复核（冻结基线 `86f1cb07`）

Build 在完整 156 文件、5 capability 的 pre-Verify 审查中达到
Critical/High/Medium/Low 全零，并冻结为
`workspace:sha256:86f1cb0774e9a33b7d8d557bda1ddbe7d2dc101fa66d1c5731a57ae14818e880`。
Verify 按 repo-zero-output 契约并行完成独立 reviewer、E2E 与视觉轨；Codex CLI 沿用已确认的
本机 logs DB/model cache schema 故障降级。全部轨结束后一次性聚合为 **FAIL**：0 Critical、
0 High、2 Medium、0 Low，必须经精确 `verify-fail` 返回 Build。

### 第六次聚合 findings

1. **Medium — Dashboard 首次 snapshot 失败会永久停留在加载态。**
   视觉轨让初始 `/api/snapshot` 返回 500 后等待 3.5 秒，页面仍只显示“加载中…”，没有错误说明、
   重试或恢复入口，console 出现对应 500。正常项目总览、显式 root、Verify progress、详情关闭、
   Browser Back、1440px/390px 无页面横向溢出、loading/empty 及正常 console 均通过。
2. **Medium — 自定义 `document-v1` workflow 的初始 Spec ADR 被误判为 living update。**
   `packages/kernel/src/state/document-record-policy.ts:51-52` 的
   `requiresRequirementsChangedForSpecAdr()` 忽略 frozen document policy；
   `packages/kernel/src/state/document-ledger.ts:332-337` 又在 owner 权限校验前执行该门禁。
   当自定义 `document-v1` 明确声明 ADR 的 `ownerStep=spec` 时，首次合法登记也被要求
   `requirements-changed`。该限制只应作用于 `openspec-v1` 的 Spec ADR living-update 兼容路径。

### 第六次验证证据

- E2E：17 个 Vitest 文件 566/566，加 N-1 bundle 31/31，合计 597/597。
  managed-host desired proof 110/110；Dashboard transaction ownership/API 317/317；
  A/B root/source 139/139。
- 真实二进制：ordinary `51200` 与 managed `51201` 均 health 200；普通实例
  transaction 为 `null`，managed 为 `frozen-transaction-a`；snapshot 为
  `tenon-snapshot/v2`，项目 A/B 来源隔离，显式 root 200、缺 root 400、未注册 root 404。
- OpenSpec：隔离副本第一次 archive 仅因用户明确排除的历史 `plugin-runtime` 主规格缺少
  `Purpose` 失败且未写文件；只在副本补临时 Purpose 后，14 个新增 requirement 应用成功，
  五个主规格全部 strict valid。真实主规格 digest 前后均为
  `6d06e77aba4edc047b61e4c72dfcc056a6a9f72dc31ac1eb48d67eb429d40f2c`。
- Reviewer 覆盖 156 个 tracked changed 与 208 个 untracked 文件，五个 capability 全部回读；
  canonical revision 147、state digest、companion `pass` 与 sequence 48 `build-complete`
  自校验一致。
- 三轨开始与结束的 workspace fingerprint 均精确等于冻结值；各轨原始截图、日志和临时服务
  均在仓库外，唯一仓库内写入是全部轨聚合后的本 canonical report。

### 第六次回退后的必测项

1. Dashboard snapshot 首次 500 时从 loading 进入明确 error 状态，展示可操作重试入口；
   重试成功后恢复项目/进度内容，并覆盖 390px 与可访问性。
2. `document-v1` 自定义 workflow 在 ADR slot `ownerStep=spec` 时允许首次 Spec 登记；
   `openspec-v1` 的已存在 ADR Spec 更新仍必须经 `requirements-changed`，错误 owner/phase
   继续拒绝。
3. 修复后重新执行完整 Build convergence、冻结 reviewer、E2E、视觉与隔离 OpenSpec 演练，
   不得只复查这两项。
