# task-plan-contract Verify 报告（第 1 轮）

## 结论

FAIL。冻结基线 `3e8e9911a52a2c701a6519884b42a83fb15aeccb` 发现 1 个确认的 MEDIUM hostile-input 缺陷，必须回到 Build 修复；未接受偏差。

## 冻结与三轨

- Reviewer 轨：PASS。完整复审 `origin/main...3e8e9911` 的 63 个文件，无 CRITICAL/HIGH/MEDIUM；记录 2 个 LOW：非法 UTF-8 replacement decode、缺少 dirfd/openat writer 时的极窄 parent swap-back 竞态。
- E2E 轨：PASS。隔离副本真实 HTTP 1/1、核心回归 493 passed/9 existing skipped、129+ transcript 精确 reconcile 1 passed；canonical/legacy/pending/drift/corrupt/root/change trust 均通过。目标工作区实现 fingerprint 前后保持 `c34e365ac6326a260247bdb34fbb772503bf9641f330dbca5581ab6ad04ab20f`。
- Codex CLI 轨：运行 `git diff origin/main...3e8e9911 | codex exec --sandbox read-only ...`。进程受本机 malformed logs DB/models cache 警告影响，内部双轴审查 9 分钟未终止，主线中止为 exit 130；在中止前已产出下述可复现 finding。

## 确认 finding

### MEDIUM — 数组 accessor 可在 closed codec 中执行

`packages/kernel/src/task-plan/codec.ts` 的普通对象分支检查 property descriptor 并拒绝 accessor，但数组分支只检查 key 数量后执行 `[...value]`。带 getter 的数组元素会在 spread 时执行，且当前 decoder 可返回 `ok:true`。

复现结果：

```text
{"hits":1,"ok":true,"errors":[]}
```

修复要求：数组必须像 record 一样逐项读取 own enumerable data descriptor，拒绝 accessor、稀疏数组、额外属性和非标准 own key；增加 getter 未执行且 decoder fail-closed 的回归。

## OpenSpec 硬门演练

- 真实工作区：`openspec show task-plan-contract --json --deltas-only` 与 `openspec validate task-plan-contract --strict` 通过。
- 隔离副本：`openspec archive task-plan-contract --yes --json` 成功，8 个 requirements applied；随后 `openspec validate --all --strict` 为 37 passed / 0 failed。
- 真实 `openspec/specs/**/spec.md` 前后 digest 一致，HEAD 始终为冻结 SHA。

## Spec 覆盖回读

以下冻结文件组均已逐文件枚举并对照 `openspec/changes/task-plan-contract/specs/task-plan-contract/spec.md`：

| 文件组 | 对应要求 | 结果 |
| --- | --- | --- |
| `packages/kernel/src/task-plan/*.ts` | v1 identity、coverage、dependency、resource、output、validator、legacy/read DTO | 已回读；数组 accessor finding 阻断 |
| `packages/kernel/src/state/task-plan-store*.ts`、state exports | immutable/current、CAS、projection pending/drift | 符合 |
| `packages/server/src/serverTaskPlanRoutes*.ts`、`serverGetRoutes.ts` | 稳定只读 API 与 root/change trust | 符合 |
| `packages/cli/src/codexTranscriptDiscovery.ts`、receipt tests、正式 bundle | 129+ transcript receipt discovery | 符合 |
| proposal/design/spec/tasks、ADR、research、plan 与 canonical governance records | Change 证据与冻结契约 | 符合 |

## 已运行证据

- `npm test -- --minWorkers=4 --maxWorkers=4`: 334 files passed；5954 passed，26 honest skipped。
- `npx tsc -b packages/kernel packages/cli packages/server`: exit 0。
- `npm run bundle`: exit 0。
- 定向 TaskPlan/API/receipt：191 passed。
- E2E 隔离日志：`/tmp/tenon-pr1-e2e-http.log`，sha256 `84d04f6c30b68f6db77df1720c35d45462577e58347afefaee2c7200381ebd67`。

## 下一步

按 `verify-fail` 回 Build，以 TDD 修复数组 descriptor 边界，重新生成正式 bundle、提交新 SHA，并重新执行全部三轨而非只复查本 finding。

---

# 第 2 轮 Verify（冻结基线 `23a1d46cea6ca77a66d645f63545aae84c6a8501`）

## 结论

FAIL。第 1 轮数组 accessor 缺陷及 receipt bridge 的合法 `max_output_tokens` ABI 漂移均已修复，但独立 Reviewer 与 Codex CLI 完整回读共确认 4 个 MEDIUM 阻断项；未接受偏差。

## 三轨结果

- Reviewer 轨：FAIL，C=0 / H=0 / M=2 / L=2；完整覆盖 `origin/main...23a1d46` 的 82/82 个文件和全部 canonical/ledger/revision/transition evidence。
- E2E 轨：PASS。冻结 SHA、tree 与实现 fingerprint 前后一致；隔离重建的 CLI/server bundle 与 tracked 生成物逐字节相同；真实 generated server HTTP 覆盖 canonical、legacy、pending、drift、corrupt、root/change trust；核心回归 518 passed、9 个既有 skip；architecture 通过。
- Codex CLI 轨：FAIL，额外确认 2 个 P2/MEDIUM；运行 `codex exec --sandbox read-only --ephemeral review --base origin/main`，exit 0 并写出 `/tmp/task-plan-contract-codex-review.txt`。本机仍报告 malformed logs DB 与 models cache 警告，但没有阻止最终 review 产出。

## 确认 findings

### MEDIUM — 同一 lineage 可复用 revision_id

store 只比较 current CAS、`plan_id` 与递增 `revision_number`，未拒绝新 revision 复用当前或历史 lineage 的 `revision_id`。独立动态复现连续发布 revision 1 与 2，二者 `revision_id` 均为 `same-revision-id`，第二次仍被接受并成为 current。这会使 evidence/scheduler 对 revision identity 的精确绑定产生歧义。

修复要求：拒绝当前及任一历史 lineage 已使用的 revision ID，并以 store 回归覆盖当前 ID、非当前历史 ID、不同 plan/orphan 与合法新 ID 边界。

### MEDIUM — receipt 行为变更未登记到既有 capability

proposal 仍声明 `Modified Capabilities: 无`，但本 Change 修改了既有 `codex-skill-receipt-current-turn` capability 的 transcript discovery 及 `max_output_tokens` tool-program 接受边界。当前 task-plan delta 没有冻结“仅接受正安全整数、pragma 拒绝、截断后非精确输出拒绝”的行为；若按当前状态 archive，canonical receipt spec 会保持过时。

修复要求：按 `requirements-changed` 正式回退 Spec，把既有 receipt capability 登记为 Modified Capability，新增对应 MODIFIED delta/scenarios，重新登记、读取和复核修订证据；不得只在 Verify 报告中描述。

### MEDIUM — read model 冻结了调用方持有的输入

`toTaskPlanReadModelV1` 直接复用 revision 的 catalogs/groups 以及 WorkItem 内部数组，随后对 DTO `deepFreeze`；公开 helper 因此会连带冻结调用方仍持有的 mutable revision。动态检查已显示原始 `requirements/groups/depends_on` 被冻结，后续 draft 编辑会抛 `TypeError`。

修复要求：在冻结 DTO 前完整复制所有 revision-owned 结构，不得改变输入对象的 descriptor/frozen 状态，并补无副作用回归。

### MEDIUM — validation 排序依赖宿主 locale

validation 的 coverage、resource、dependency edge 与 issue 排序使用无显式 locale 的 `localeCompare`。混合大小写或非 ASCII 标识在不同默认 ICU locale 下顺序可能不同，与跨机器确定性契约冲突。

修复要求：统一使用 locale-independent ordinal comparator，并以混合 ASCII/Unicode 数据覆盖所有排序出口。

## 已通过的修复与回归

- Array accessor 聚焦：1 passed；accessor fail closed 且 getter `hits=0`。
- Receipt 聚焦：5 passed；129+ reconcile、custom/function ABI 完整输出通过且截断拒绝。
- Session-link extraction：23/23 passed。
- 核心 TaskPlan/server/receipt：7 files，518 passed，9 个既有 skip。
- 隔离 archive rehearsal：8 requirements applied；`openspec validate --all --strict` 为 37 passed / 0 failed；真实 specs digest 与冻结实现未变化。
- 正式 full test、TypeScript、comments、architecture、OpenSpec strict 与 bundle freshness 在 Build 收敛后均曾通过；本轮 findings 是 identity invariant 与 specification completeness 缺口，不被这些结构门禁覆盖。

## 保留的 LOW

- bounded text reader 使用 UTF-8 replacement decode，非法 UTF-8 不会单独失败关闭。
- 缺少 dirfd/openat writer 时仍存在极窄 parent-directory swap-back TOCTOU 窗口。

## 下一步

先按 `verify-fail` 回 Build，再以 `requirements-changed` 回 Spec 修订 receipt capability；完成显式复核后重新 Build，以 TDD 修复 lineage revision ID 唯一性、read-model 输入副作用和 locale-sensitive 排序，重建生成物、提交新冻结 SHA，并执行完整第三轮 Verify。

---

# 第 3 轮 Verify（冻结基线 `49d04e9e5aba886b99109bac9e7ef314d790b9d5`）

## 结论

FAIL。第 2 轮的 4 个 MEDIUM 及 receipt bridge 两处缺陷均已修复，但原生 Codex CLI 审查确认 2 个新的 P2/MEDIUM 契约边界缺陷；必须回到 Build 修复，不接受偏差。

## 冻结与三轨结果

- Reviewer 轨：PASS，C=0 / H=0 / M=0 / L=2。完整覆盖 `origin/main...49d04e9e` 的 123 个文件；冻结 HEAD/tree、packages 与 build SHA 一致，implementation fingerprint 前后均为 `a8247f69fcde01d156b2b9eaac92241004f6bda01bb715c7bc5b4cc931b4d937`。独立 7-file 246/246、三包 TypeScript、OpenSpec strict、diff-check、fsck、CLI/server 临时重建与逐字节比较均通过。
- E2E 轨：PASS。隔离 `git archive` 副本运行 generated CLI/server、TypeScript、TaskPlan store/route、receipt、真实 hook 登记和真实 HTTP；TaskPlan 55/55、route 5/5、receipt 15 项、hook 1/1 均通过。HTTP canonical 为 200，非法 change 为 400，未注册 root 与缺失计划均为 404。真实 worktree 起止 HEAD 均为冻结 SHA，内容指纹均为 `8f3a87914b625e8668f52ec9091a357d6785c97d`。
- Codex CLI 轨：FAIL，P2/MEDIUM=2。运行 `codex exec --ephemeral --sandbox read-only review --base origin/main`，exit 0。启动期 malformed logs DB/models cache 警告未阻止最终 review；其 70/70 聚焦测试通过，但边界动态回读确认下述两个问题。

## 确认 findings

### MEDIUM — 持久化 revision 上限与 decoder 上限错位

store 的公开持久化上限是 1,048,577 bytes，编码 JSON 后追加一个换行；decoder 的字符串输入上限仍是 1,048,576 bytes。于是编码 JSON 恰好 1,048,576 bytes 时，publish 会成功写入 1,048,577-byte immutable/current，随后 reader 立即把它判为 malformed，后续 lineage 扫描也失败。

独立动态复现：

```text
json_bytes=1048576
stored_bytes=1048577
json_decode=true
stored_decode=false
publish=revision-boundary
read=TaskPlanStateCorruptError: TaskPlan current is malformed
```

修复要求：明确区分 canonical JSON 与 newline-terminated 持久化输入，保证所有公开允许的 persisted bytes 都可被 decoder/store 对称读取；以精确上下界和 publish→read→next-publish 回归钉住，不能只缩小未登记的公开上限。

### MEDIUM — 规格要求的非 ASCII ID 无法经过 codec

Spec 的跨 locale 场景明确要求含“非 ASCII 的 ID、path 与 resource key”的 revision 仍产生逐字节稳定结果，但 `identifier()` 使用 ASCII-only regex。`wi-ä` 在 group ownership 与 work item ID 两处均返回 `identifier_invalid`；现有排序测试直接构造 typed revision，绕过了真实 codec/persistence 路径。

独立动态复现：

```text
unicode_decode=false
$.groups[0].work_item_ids[0]=identifier_invalid
$.work_items[0].id=identifier_invalid
```

修复要求：按已冻结规格允许 NFC、无危险控制字符且满足稳定闭集约束的 Unicode opaque ID，并以 codec round-trip、publish/read 和跨 locale ordinal 排序回归覆盖；仍须拒绝 NFD、空白边界、路径分隔语义和危险字符。

## 保留的 LOW

- bounded text reader 对非法 UTF-8 使用 replacement decode；影响限于已损坏的本地 canonical 文件。
- path-based atomic publication 缺少 dirfd/openat，同用户恶意并发替换父目录时仍有极窄 TOCTOU 窗口；本 PR 没有新增公开写 API。

## 本轮未完成的通过门

由于原生 Codex 轨已经形成两个确认的 MEDIUM，未把 Verify tasks 标完成，也未登记通过报告、未设置 branch handled、未请求 `verify-pass`。隔离 archive rehearsal 的既有第 1/2 轮结果不能替代修复后对新冻结 SHA 的重跑；第 4 轮必须重新执行完整三轨、逐文件 capability mapping、隔离 archive rehearsal 和全部正式门禁。

## 下一步

请求确切 `verify-fail` 复核事件并按授权 delegated acknowledge，退回 Build；用 TDD 修复 persisted-byte 对称性和 Unicode opaque ID，重建 CLI/server 生成物、提交新的 build SHA，再从零执行第 4 轮 Verify。

---

# 第 4 轮 Verify（冻结基线 `5e25a41af13b7d88106984a5966e5472bcbe59c8`）

## 结论

FAIL。第 3 轮的 persisted-byte 对称性和 NFC Unicode opaque ID 缺陷均已修复，receipt bridge 也已通过真实官方门禁重试；但原生 Codex CLI 完整审查发现 2 个新的 P2/MEDIUM store/projection 一致性缺陷，均已在隔离构建上独立复现。未接受偏差，必须回到 Build 修复。

## 冻结身份与零输出 barrier

- exact base：`dc53843e61f812938f13c684a41ffe1d935e48bf`。
- frozen SHA/tree：`5e25a41af13b7d88106984a5966e5472bcbe59c8` / `1713195ae8baecf0af2eb81ace35bb16a5754186`。
- exact binary diff：139 files，`+6880/-1392`，SHA-256 `7ac2eb63c4517a3f4552bef5d1f2a4cc0e0e96b2aba4cd26fad88d0f4c440a3f`。
- Reviewer 轨复核真实工作区 4 modified + 5 untracked 治理基线的内容、mode、size、inode 前后完全一致；E2E 全树指纹在起始、archive 后、测试后、最终四次均为 `19f56ade2606675fad6f4f9ffb4d7e118e8e76c7`。所有可能写入的命令均在仓库外隔离副本执行。

## 三轨结果

- Reviewer：PASS，C0/H0/M0/L3。完整覆盖 139-file frozen diff 与全部受影响 capability；隔离 build、核心 255/255、合并兼容 164/164、全仓 6033 passed / 26 honest skipped、三包 TypeScript、OpenSpec 37/37、architecture/comments/docs/hygiene、bundle smoke 27/27 全通过。
- E2E：PASS。TaskPlan canonical/legacy/store 64/64、route 5/5、receipt/current wrapper/129+ 17 项、stable hook→document registration 1/1、最大 newline revision 与 NFC Unicode 3/3；真实 HTTP canonical/legacy 与 400/403/404/409 边界符合预期。日志：`/tmp/tenon-pr1-verify2.1i22AQ/`。
- Codex CLI：FAIL，P2/MEDIUM=2。在 detached clone `/tmp/tenon-pr1-codex.2Y96lL/repo` 运行 `codex exec review --ephemeral --base dc53843e61f812938f13c684a41ffe1d935e48bf`，exit 0。启动期 malformed logs DB/models cache 警告未阻止最终输出。其自发的一次 Vitest 因 clone 缺 native optional binding 而 exit 1，诚实记为环境失败，不替代前两轨已通过的隔离测试。

## 确认 findings

### MEDIUM — committed history 未验证 frozen/freezable 语义

历史扫描仅做 decoder 与 identity/continuity 检查。codec-valid、但 `freezable=false` 的旧 immutable revision（例如未覆盖 requirement、dependency cycle 或 draft）仍被当作健康 committed lineage，后续合法 revision 可以越过它发布并成为 current。

隔离复现：旧 revision `invalidFreezable=false`；发布 revision 2 后返回 `revision_id=revision-2`、`projection=current`，即 `publishAdvanced=true`。

修复要求：对 current 与 committed lineage 的每个已提交 revision 执行与 proposed revision 同等的 frozen/freezable 验证；既有语义无效历史必须 typed corrupt、零写入失败关闭，并补 draft、coverage、cycle 与 valid history 回归。

### MEDIUM — 合法投影可超过自身 reader 上限

`publishProjection` 无界写入 rendered Markdown 并立即报告 `current`，而 reader 对 `tasks.md` 使用 256 KiB 上限。合法 canonical JSON 可在 1 MiB 内生成更大的 Markdown，导致发布后下一次读取立即 drift。

隔离复现：40 个接近单项 title 上限的合法 WorkItem 得到 `validFreezable=true`、`markdownBytes=325524`；publish 返回 `projection.state=current`，随后 read 返回 `projection.state=drift`，reason=`tasks.md projection is not a readable bounded regular file`。

修复要求：冻结 projection 公开字节预算并保证 producer/reader 对称；超出预算不得声称 current。保持 canonical current 已提交后的可恢复语义，并补 exact-boundary、over-boundary、publish→read 与重试恢复测试。

## Receipt bridge bug 闭环

- discovery 元数据预算已与既有 4096 entry 上限对齐，同时保留最新 32 个全文读取、512 MiB、session/turn/worktree、ABI 与 inode/version fences；129+ 完整 reconcile 回归通过。
- inline `max_output_tokens` 仅接受正安全整数字面量；pragma、动态/零/负/小数/超安全整数、截断 Skill、output-only 与重序列化 wrapper 继续失败关闭。
- 本回合先以不满足 literal same-result `text(result)` 的读取触发官方拒绝，再以精确 `const result = await tools.exec_command({...}); text(result)` 读取当前 phase Skills；官方 tasks 登记和 Build→Verify transition 随后成功。这证明修复消除 false negative，但没有放宽完成态证据。

## OpenSpec 隔离应用硬门

- 真实主规格前后 digest 均为 `513bae7ec8b18dc850f358bac40ce6668b9d53cc3a2aaa6cc3a8f60029b89e25`。
- 冻结 clone 中 `openspec show`、Change strict validate、`openspec archive --yes --json`、全量 strict validate 均 exit 0；applied 7 added + 2 modified requirements，37 passed / 0 failed。真实 `openspec/specs` 零写入。

## Step 1.5 逐文件 capability 回读

`git diff --name-only dc53843e61f812938f13c684a41ffe1d935e48bf..5e25a41af13b7d88106984a5966e5472bcbe59c8` 的 139/139 个路径均已逐行枚举；name-status manifest SHA-256 为 `3514d7c6e3840fe772d6d34124c8d2087698da83e75a690dc4be8012e78943af`。映射如下，组内每个文件均由 Reviewer 单独回读并对照 diff：

| frozen 文件集合 | capability spec | 结果 |
| --- | --- | --- |
| 111 个 `.pipeline-*`、43 revisions、43 pre-Verify receipts、13 transitions、proposal/design/tasks | 两项 delta + governance contract | 111/111 ✅ |
| 5 个 ADR/research/design/plan/Verify 文档 | 两项 delta + Change contract | 5/5 ✅ |
| `packages/cli/src/codex*` 与 `packages/cli/dist/tenon.mjs` | `codex-skill-receipt-current-turn` | 5/5 ✅ |
| `packages/kernel/src/task-plan/*`、state store/exports | `task-plan-contract` | 13/13 ✅ |
| TaskPlan server routes/tests/GET wiring 与 server bundle | `task-plan-contract` | 5/5 ✅ |

## 保留 LOW 与未运行项

- L1：bounded text reader 对非法 UTF-8 使用 replacement decode，未显式 fail closed。
- L2：path-based atomic tmp/link/rename 存在同用户父目录替换的极窄 TOCTOU 窗口，尚未使用 dirfd/openat。
- L3：transcript discovery 在 mtime/ctime 完全相同时用默认 locale 的 `localeCompare` 排路径；超过 32 个同时间候选时可能跨宿主 false-negative，但不会放宽证据接受。
- Docker daemon 与真实 Codex 凭证相关套件按既有条件诚实跳过；本 Change 无精确前端源码 diff，因此未运行浏览器视觉验收，生产 Web build已通过。

## 下一步

登记本报告并请求精确 `verify-fail` 复核事件；按持续授权 delegated acknowledge 后回 Build。以 TDD 修复 committed history 语义验证与 projection 预算对称性，重建正式生成物、提交新冻结 SHA，再从零执行第 5 轮完整三轨。

---

# 第 5 轮 Verify（冻结基线 `2d88a6a6728e43dd75ab33e33773b5e4c7f05ebd`）

## 结论

FAIL。第 4 轮的 committed history 语义验证与 canonical projection 预算对称性均已修复；Reviewer 与 E2E 轨通过，但原生 Codex CLI 发现公开 validator/read-model 可绕过 codec 对 duplicate ID 的拒绝并错误产生 `schedulable=true`。独立动态复现确认该 finding，必须回到 Build 失败关闭。

## 冻结身份与零输出 barrier

- exact base/latest `origin/main`：`dc53843e61f812938f13c684a41ffe1d935e48bf`。
- frozen SHA/tree：`2d88a6a6728e43dd75ab33e33773b5e4c7f05ebd` / `e49f4c949ad9c2f99052d3ddfe465c626b248c03`。
- exact diff：157 files，`+7170/-1392`；binary diff SHA-256 `7cd839d327f0e1308d6371f68676f63e9c7378f8f848527deeda1a2e6e15aee1`；name-status SHA-256 `ab5c848184a0ac2f09afb15324ae1e9ffb22a803f961a473a38f9292d369af5a`。
- Reviewer 轨确认真实 governance-dirty worktree 的 tracked patch、untracked 内容和 mode/size/mtime/ctime/inode 前后不变；E2E 全树指纹在起始、archive 后、完整测试后与最终均为 `e2c394ff788d581d89830c969f85fde9b16141c6`。所有会写入的验证均位于仓库外隔离副本。

## 三轨结果

- Reviewer：PASS，C0/H0/M0/L3。完整回读 157-file diff 与全部 capability；重点 259/259、全仓 6037 passed / 26 honest skipped、三包 TypeScript、OpenSpec、architecture/comments/docs/hygiene、bundle 27/27、生成物 freshness 和 merge-tree 均通过。
- E2E：PASS。TaskPlan canonical/legacy/store 68/68、关键边界 10/10、route 5/5、receipt/current wrapper/129+ 17 项、stable hook→current Skill registration 1/1；真实 HTTP 覆盖 NFC Unicode、325,809-byte canonical projection、legacy exact/+1 ceiling、400/403/404/409 trust/error 状态。无适用 E2E 跳过，无真实写入。
- Codex CLI：FAIL，P2/MEDIUM=1。在 detached clone `/tmp/tenon-pr1-codex-r5.2mu72j/repo` 运行 `codex exec review --ephemeral --base dc53843e61f812938f13c684a41ffe1d935e48bf`，exit 0。启动期 malformed logs DB/models cache 与 clone 无 `node_modules` 的生成物探测失败不影响最终静态 finding；不把该环境探测当测试通过证据。

## 确认 finding

### MEDIUM — 公开 validator/read-model 未拒绝 duplicate entity IDs

codec 会对 catalog/group/work-item/output/validator 的全局重复 ID 返回 `duplicate_id`，但公开 `validateTaskPlanRevisionV1` 直接把 ID 映射到 `Set`/`Map`，未产生对应 validation issue。`toTaskPlanReadModelV1` 又直接依赖该 validator，因此合法 TypeScript 形状或内部调用方无需 codec round-trip 即可把两个相同 `wi-a` 的 frozen revision 标记为 valid/freezable/schedulable。

真实冻结构建的独立动态复现：

```json
{"valid":true,"freezable":true,"issues":[],"schedulable":true,"itemCount":2}
```

修复要求：公开 validator 必须独立执行与 codec 对齐的全局 entity ID uniqueness 校验，稳定报告重复位置并使 `valid/freezable/schedulable=false`；覆盖 catalog、group、work item、output、validator 的同类与跨类碰撞，以及非重复 revision 的稳定结果。store 的 committed/proposed 语义验证必须继承该失败关闭，不得要求调用方先自行 codec round-trip。

## 第 4 轮 finding 与 receipt bridge 闭环复核

- committed current/lineage 对 frozen/freezable 语义失败关闭；无效 non-current committed history 的 read/publish 均 typed corrupt、current 字节不变且 target 不存在，future/different-plan draft orphan 未被误拒。
- legacy reader 保持 256 KiB ceiling，canonical producer/reader 对称使用 1,048,577 bytes；超过旧 ceiling 的合法 canonical projection 在 publish/read 间保持 `current`。
- receipt discovery 继续使用 4096 metadata、latest-32 full read、512 MiB 与 session/turn/worktree/ABI/inode fences；129+ reconcile 与 literal awaited same-result `text(result)` registration 通过。动态/零/负/小数/unsafe/truncated `max_output_tokens` 继续拒绝，未扩大证据接受面。

## OpenSpec 与 Step 1.5 capability 回读

- 隔离 archive applied 7 added + 2 modified，随后全量 strict validate `37/37`；真实主规格 digest 前后均为 `513bae7ec8b18dc850f358bac40ce6668b9d53cc3a2aaa6cc3a8f60029b89e25`。
- 157/157 path 均已回读：122 个 governance JSON/history/revision/receipt/transition 与 proposal/design/tasks 映射两项 delta + governance contract；5 个 supporting docs 映射 Change contract；CLI receipt source/bundle 映射 `codex-skill-receipt-current-turn`；kernel task-plan/store/export 与 server route/bundle 共 23 个生产/测试/生成路径映射 `task-plan-contract`。未发现 diff symlink 或 secret。

## 保留 LOW 与未完成通过门

- L1：bounded text reader 对非法 UTF-8 使用 replacement decode。
- L2：path-based atomic publication 在同用户父目录替换下仍有极窄 TOCTOU。
- L3：mtime/ctime 完全相同时 transcript path 用 `localeCompare`；超过 32 个同时间候选可跨宿主 false-negative，不能形成 false-positive receipt。
- 本 Change 无前端源码 diff，因此不运行浏览器视觉轨；生产 Web build 已由 Reviewer/全仓测试覆盖。Docker daemon 与真实 Codex 凭证相关套件保持 26 项 honest skip。
- 因确认的 MEDIUM，Verify tasks 未标完成，未设置 branch handled，未请求 `verify-pass`，也未复用第 5 轮任何通过轨作为修复后的放行证据。

## 下一步

登记本轮失败报告并请求精确 `verify-fail` 复核事件；按持续授权 delegated acknowledge 后回 Build。以 TDD 补公开 validator 的全局 duplicate ID 失败关闭，重建正式生成物并提交新 frozen SHA，再从零执行第 6 轮三轨 Verify。

---

# 第 6 轮 Verify（冻结基线 `25d18101d7f2f2b1d773a3eceb2d051a9df99bb8`）

## 结论

FAIL。第 5 轮的公开 validator/read-model duplicate ID 缺陷已对 catalog/group/work-item/output/validator 及其跨 kind 碰撞失败关闭，但共享枚举沿用旧 codec 的遗漏，未纳入顶层 `plan_id` 与 `revision_id`。Reviewer 与 E2E 轨通过，原生 Codex CLI 发现该 P2；冻结构建上的独立动态复现确认 decoder、validator 与 read model 会把三个同值顶层/嵌套 ID 接受为 schedulable，必须再次回 Build。

## 冻结身份与 repo-zero barrier

- exact base/latest `origin/main`：`dc53843e61f812938f13c684a41ffe1d935e48bf`。
- frozen SHA/tree：`25d18101d7f2f2b1d773a3eceb2d051a9df99bb8` / `ff03285e64de4561dd0b14f7957235a38beb6833`。
- exact frozen diff：177 files，`+7486/-1392`；Reviewer full-index binary diff SHA-256 `6a87bbb70247122c1c492399d006c98d0fac81bcc1f3bcbabb665879b67d1c5c`，name-status-z SHA-256 `c01f7fe7cf3afafcad49b426699f3d8c4067c8d41779a08b7479a969217a9335`。
- 三轨前真实 worktree 已有进入 Verify 后的 4 tracked + 3 untracked canonical governance 记录；起始 status SHA-256 `6f20a46a81c75957899f6fca1a8c9bb0685558bb8f9c35d542d8b91319391d8a`，聚合前仍完全一致。E2E 全树起始/中途/最终指纹均为 `8edce67fea8d50da225b5a8adb8a17602594b0f2`；Reviewer 对 index/status/untracked/patch/cached 的逐项 fingerprint 也前后一致。无轨道写真实实现、配置、生成物或治理状态。

## 三轨结果

- Reviewer：PASS，C0/H0/M0/L4。177/177 逐文件映射完成；focused 260/260、全仓 6038 passed / 26 honest skipped、build/tsc/static/OpenSpec 37/37、bundle freshness、merge-tree/fsck 与隔离 archive 全通过。
- E2E：PASS。TaskPlan 69/69、13 类 nested/cross-kind duplicate 矩阵 13/13、历史边界 13/13、route 5/5、receipt 17 项、official registration 1/1；真实 HTTP 覆盖 canonical/legacy/duplicate/malformed/oversized/trust boundaries，全部符合预期。
- Codex CLI：FAIL，P2/MEDIUM=1。在 detached clone `/tmp/tenon-pr1-codex-r6.R4nHtV/repo` 运行 `codex exec review --ephemeral --base dc53843e61f812938f13c684a41ffe1d935e48bf`，exit 0。其自发 Vitest 因 clone 无本地依赖而使用损坏的 npx optional native binding，exit 1；该环境失败不替代前两轨的隔离测试，也不影响静态 finding。

## 确认 finding

### MEDIUM — 顶层 plan/revision identity 未进入全局 duplicate 检查

`taskPlanEntityIdEntries` 从 requirements 开始枚举，未加入 `$.plan_id` 与 `$.revision_id`。因此 `plan_id === revision_id`，或二者与 requirement/group/work-item/output/validator 任一 ID 相等时，codec 和公开 validator 均无 duplicate issue；合法 frozen typed revision 可被 store 发布并由 read model 标为 `schedulable=true`。这违反“所有实体 ID”及 design 中 revision/entity identity 全局唯一的已冻结语义。

冻结构建独立动态复现：

```json
{"decodeOk":true,"valid":true,"freezable":true,"issues":[],"schedulable":true}
```

修复要求：共享枚举以 `plan_id`、`revision_id` 为首，随后保持既有 catalog/group/item/output/validator 原始顺序；codec 对第二次出现稳定返回 `duplicate_id`，public validator 返回 `entity-id-duplicate`，read model 不可调度。测试覆盖 `plan_id↔revision_id`、二者分别与每类嵌套实体的碰撞及无碰撞基线，确保路径、排序与现有 13 类矩阵不漂移。

## 已闭环 finding 与逐文件 capability mapping

- nested/cross-kind duplicate：13 类均产生精确 codec/validator path，`valid/freezable/schedulable=false`；malformed+duplicate 仍整体失败关闭。
- receipt bridge：129+、4096 metadata/latest-32/512 MiB、current custom/function ABI、exact same-result `text(result)`、safe-positive `max_output_tokens` 与所有 invalid/truncated 对照均保持预期。
- store/read model/API：最大 persisted bytes、NFC Unicode、revision ID lineage、committed semantics、target admission、projection budget、legacy ceiling、caller non-mutation、ordinal sorting 与 root/change trust/error contract 均通过。
- 177/177 文件映射：144 个 governance 文件映射两项 delta + governance contract；8 个 Change/docs 文件映射 Change contract；5 个 CLI source/bundle 映射 receipt capability；13 个 kernel/state 文件与 5 个 server/API 文件映射 TaskPlan capability；2 个 delta spec 各自映射对应 capability。142 个 changed JSON 全部解析，无 diff symlink 或确认 secret。
- 隔离 OpenSpec show/change strict/archive/all strict 均 exit 0，applied `+7/~2`，归档后 37/37；真实 main specs digest 始终为 `513bae7ec8b18dc850f358bac40ce6668b9d53cc3a2aaa6cc3a8f60029b89e25`。

## LOW、环境限制与未完成通过门

- L1：非法 UTF-8 文档 source 使用 replacement decode。
- L2：path-based atomic publication 在同用户 parent swap-back 下有极窄 TOCTOU。
- L3：transcript mtime/ctime 完全相同时用 `localeCompare`，极端 tied candidates 可跨宿主 false-negative，不会 false-positive。
- L4：malformed raw 数组的非法前项被 decoder 压缩后，后续 duplicate 错误 path 相对原始索引左移；输入仍整体拒绝，不生成 revision 或调度状态。
- hermetic 空 `TENON_MANAGED_HOME` bundle hard gate 27/27；本机 optional previous release 已会写 companion，read/write/current-resume 三项通过，但“缺 companion 应 pending”的环境假设得到 `pass`，脚本 30 pass / 1 fail。未把该可选断言伪报为通过，也未修改无关脚本。
- 无 UI diff，不运行 browser/视觉轨；Docker 与真实 Codex 凭证相关 26 项保持 honest skip。
- 因确认的 MEDIUM，Verify tasks 未标完成，未设置 branch handled，未请求 `verify-pass`，也不复用本轮任何通过轨作为修复后的放行证据。

## 下一步

登记本轮失败报告并请求精确 `verify-fail` 复核事件；按持续授权 delegated acknowledge 后回 Build。以 TDD 把 `plan_id`/`revision_id` 纳入共享全局 entity-ID 枚举，重建正式生成物并提交新 frozen SHA，再从零执行第 7 轮三轨 Verify。

---

# 第 7 轮 Verify（冻结基线 `d404e77ababa24b63b61c8234362dbb6a5da5029`）

## 结论

FAIL。第 6 轮的顶层 `plan_id` / `revision_id` 全局唯一性缺陷已修复，13 类顶层碰撞矩阵全部失败关闭；Reviewer 与 E2E 轨通过，但原生 Codex CLI 发现公共 validator/read-model 仍可绕过其余 codec 不变量。冻结构建上的独立动态复现确认非法 revision ID 与未规范化 path claim 会被标为 valid/freezable/schedulable，必须再次回 Build。

## 冻结身份与 repo-zero barrier

- exact base/merge-base：`dc53843e61f812938f13c684a41ffe1d935e48bf`。
- frozen SHA/tree：`d404e77ababa24b63b61c8234362dbb6a5da5029` / `f329fbb54f0d9333d77e429a31b495d27b3545c4`。
- Reviewer 枚举 195 个 committed paths，叠加进入 Verify 后 7 个 changed/untracked governance paths，共 198 个唯一路径；198/198 capability mapping 完成，digest `84207f7077213911c7fcc67d61d36924aa22bf04542b21fd593fa0372672780f`。
- E2E 真实仓全树指纹在 start/after-full/final 均为 `bc7c4a94ebc384b66285079d3b91a294def2ac29`；Reviewer 的 index/status/untracked/worktree/cached 与 committed diff 指纹也前后一致。所有会写命令均在 `/tmp` 隔离副本运行。

## 三轨结果

- Reviewer：PASS，C0/H0/M0/L4。fresh build、6 files 237/237、全仓 6038 passed / 26 honest skipped、全部 static/docs/OpenSpec、hermetic bundle 27/27、生成物 freshness、merge-tree/fsck 与隔离 archive 均通过。
- E2E：PASS。TaskPlan/legacy/store 69/69、route 5/5、receipt 17 项、official registration 1/1、指定边界 13/13、真实 HTTP 10/10；碰撞发布在 immutable/current/tasks 任何写入前拒绝。证据根：`/tmp/tenon-pr1-verify7.w8v6mV/`。
- Codex CLI：FAIL，P2/MEDIUM=1。在 detached read-only clone `/tmp/tenon-pr1-codex-r7.4DbOzF/repo` 运行 `codex exec review --ephemeral --base dc53843e61f812938f13c684a41ffe1d935e48bf`，exit 0。其自发 focused Vitest 因 clone 无 `node_modules`、npx 参数版本不匹配且网络代理被 sandbox 拒绝而 exit 1；该环境失败不替代 Reviewer/E2E 的 fresh 测试，也不影响静态 finding。

## 确认 finding

### MEDIUM — 公共 validator/read-model 未覆盖 codec lexical 与资源规范化不变量

`validateTaskPlanRevisionV1` 只检查关系、覆盖、冲突与重复 ID；`toTaskPlanReadModelV1` 直接以 `revision.status === 'frozen' && validation.valid` 决定 schedulable。合法 TypeScript 形状的内部调用方无需 codec round-trip 即可传入 `revision_id='../escape'` 或 `path` claim `key='../outside'`。validator 对非法资源还以 raw fallback key 继续分析，最终不产生 issue，read model 错误标记可调度。

冻结构建独立动态复现：

```json
{"valid":true,"freezable":true,"issues":[],"schedulable":true,"revisionId":"../escape","resource":{"conflicts":[],"serialized":[]}}
```

这与第 5/6 轮 duplicate ID 绕 codec 属同一公共 trust-boundary 类缺陷。修复要求：公共 validator/read-model 必须独立失败关闭所有 task-plan/v1 codec 不变量，至少覆盖非法/非 NFC ID、control/unknown/oversized 字段、未规范化 path/logical/external resource 与非法 output ref；不得只依赖持久 store 先 decode。测试同时断言 structured issue、`valid/freezable/schedulable=false` 与合法 typed baseline 不漂移，并确保 store/API 继承该行为。

## 已闭环 finding、receipt 与逐文件回读

- `plan_id↔revision_id` 及二者分别与 requirement/acceptance/group/work-item/output/validator 的 13 类矩阵全部得到精确 `duplicate_id` / `entity-id-duplicate` path，`valid/freezable/schedulable=false`；非碰撞 baseline 仍可调度。
- store 对顶层碰撞的发布在写前拒绝，current、immutable 列表与 tasks 投影逐字节不变；最大 persisted bytes、NFC、lineage/admission、projection budget 与 legacy ceiling 回归通过。
- receipt bridge 的 129+、safe-positive inline `max_output_tokens`、current custom/function ABI、完整 same-result `text(result)` 与 invalid/truncated/output-only/伪造对照均保持 fail-closed；official current Skill registration 通过。
- 163 个 changed governance JSON 全部解析；69 revisions 与 companions 一一配对，20 transitions 连续，10 个文档 digest 与 Verify 9/9 必需 read receipt 匹配。隔离 archive 应用 `+7/~2`，归档后 OpenSpec 37/37；真实 main specs digest始终为 `513bae7ec8b18dc850f358bac40ce6668b9d53cc3a2aaa6cc3a8f60029b89e25`。

## LOW、环境限制与未完成通过门

- L1：非法 UTF-8 文档 source 使用 replacement decode；结构 ID/状态仍会被 codec 拒绝，但损坏 title 可静默保留。
- L2：malformed catalog 前项被压缩后，后续 duplicate diagnostic path 相对 raw index 左移；输入仍整体拒绝。
- L3：transcript mtime/ctime 完全相同时用 `localeCompare` 排 path，33+ tied Unicode candidates 可跨宿主 false-negative，不会 false-positive。
- L4：TaskPlan path-based publication 在同用户 parent swap 下仍有极窄 TOCTOU。
- optional 本机 previous release 探测仍为 30 pass / 1 个环境假设失败；hermetic hard gate 27/27。无 UI 源码 diff，因此不运行 browser/视觉轨；Docker 与 real-Codex 条件项保持 honest skip。
- 因确认的 MEDIUM，Verify tasks 未标完成，未设置 branch handled，未请求 `verify-pass`，也不复用本轮任何通过轨作为修复后的放行证据。

## 下一步

登记本轮失败报告并请求精确 `verify-fail` 复核事件；按持续授权 delegated acknowledge 后回 Build。以 TDD 统一公共 validator/read-model 与 codec 的失败关闭边界，重建生成物、完成独立 pre-Verify review，再从零执行第 8 轮三轨。

---

# 第 8 轮 Verify（冻结基线 `ece2c1a373ef5c4dd6dda68491cb222a339199ba`）

## 结论

FAIL。第 7 轮的公共 validator/read-model codec 边界已经覆盖 future/unknown/lexical/closed-set/budget/resource/structural hostile input，但原生 Codex CLI 独立确认 1 个 HIGH 与 1 个 MEDIUM：未来同 plan immutable orphan 的 revision ID 仍可被较低 revision 复用；duplicate-only/shape-safe codec 失败又回退到 caller-owned object，导致 Proxy trap 执行与未知字段泄漏。Reviewer 和 E2E 轨通过不能覆盖真实阻断项，未接受偏差。

## 冻结身份与 repo-zero barrier

- exact base/merge-base：`dc53843e61f812938f13c684a41ffe1d935e48bf`。
- frozen SHA/tree：`ece2c1a373ef5c4dd6dda68491cb222a339199ba` / `985f0889a5c6e978f08fc3dbdd167454b5873663`。
- exact diff：213 files，`+8154/-1392`；Reviewer full-index binary diff SHA-256 `1660b7e159c279aec177f6111b50a71ee2b3572f66a8624beee218de34558d03`，name-status digest `6a1ac88e84800b74597d9d3e673c1758291876ae6e618ac779d32013245ce065`。
- Reviewer 对真实 worktree 的 HEAD/index/status/untracked/cached/worktree diff 前后 fingerprint 完全一致；E2E 真实 repo fingerprint 起止均为 `95f775e...`。所有会写入的验证均在 `/tmp` 隔离副本执行，进入 Verify 后既有 `.pipeline-documents.json` read receipt 修改保持不变。

## 三轨结果

- Reviewer：PASS，C0/H0/M0/L4。213/213 capability mapping；focused 253/253、全仓 337/337 files（6054 passed / 26 honest skipped）、build/static/OpenSpec/integrity、hermetic bundle 27/27、生成物 freshness、merge-tree/fsck 与隔离 archive 均通过。其本机 managed previous-runtime 可选探测为 30/31，失败来自缓存 runtime 已创建 companion、使“缺 companion 应 pending”的环境前提不成立；N-1 reader compatibility 本身通过，未把可选环境断言伪报为硬门通过。
- E2E：PASS。85 个 TaskPlan/store、5 个 route、163 个 receipt、3 个 stable-hook 用例通过；public matrix、store recovery/trust、真实 HTTP/store、OpenSpec show/strict/archive/all-strict 均通过。无 UI diff，browser N/A。
- Codex CLI：FAIL，HIGH=1 / MEDIUM=1 / LOW=2。在 detached read-only clone `/tmp/tenon-pr1-codex-r8.SS8cAM/repo` 完成完整 diff/spec/聚焦测试与 hostile-input 动态复现，exit 0。聚焦 253/253、architecture、OpenSpec 37/37、repository hygiene、JSON/JSONL 与 fsck 通过；全仓 Vitest 因 read-only sandbox 禁止 Vite 写 `node_modules/.vite-temp` 未运行，不替代前两轨的 fresh 全仓证据。

## 确认 findings

### HIGH — 任一同 plan immutable revision ID 未被全局保留

history admission 在枚举 immutable revision 后，先跳过 `revision_number > current.revision_number` 的同 plan orphan，再把 ID 加入 occupied set。于是 `000009-reserved-revision-id.json` 已存在时，revision 2 仍可使用相同 `revision_id` 并成为 current。现有测试甚至显式期待该错误成功路径。

这直接违反冻结 delta 的“新 revision ID 与同一 plan lineage 的 current 或任一历史 immutable revision 相同则拒绝发布”以及 design 的“current 与 immutable history 共同构成唯一性边界”。修复必须在任何写入前保留所有可信同 plan immutable ID，同时继续区分 committed lineage 连续性、不同 plan orphan、同名幂等 target 与 proposed number 冲突；补成功路径改 RED→GREEN、current/target 零写入与不同 plan 对照。

### MEDIUM — codec 失败回退执行 hostile Proxy 并泄漏未知字段

public validator 只在 non-duplicate codec error 时提前失败；duplicate-only 时继续遍历原始 caller revision。read-model 对所有 shape-safe codec error 也以原始 revision 作为 projection source，再用 array `map` 与 object spread 构造 DTO。

独立动态复现：

- descriptor-safe 但对 `map`/iterator 的 `get` trap 抛错的 Proxy 数组，在 duplicate-only 路径被 validator/read-model 再次访问，观察到 `gets=2`，原始 `Error: hostile-get` 泄漏而非受控拒绝；
- WorkItem 带 `private_payload: "leaked"` 时 codec 正确产生 `unknown_field`，但 read-model 仍返回 `schedulable=false` DTO，且 `items[0].private_payload === "leaked"`。

修复要求：validator 的 duplicate 精确诊断只能遍历 decoder 生成的安全 canonical candidate；read-model 只能投影完整成功解码的闭集 clone，任何 codec-invalid 输入必须受控失败关闭，不得读取 caller Proxy、传播原始异常或把未知字段复制进稳定 DTO。新增 Proxy getter-zero、duplicate-only、unknown-field leak 与合法输入不回归测试。

## Receipt bridge 问题的判定与闭环

PR1 首次官方登记对本回合精确 Skill 读取产生 false negative，确认是 bridge bug，而不是门禁应放宽的情况。已完成两处同源修复并由官方 fail-closed 重试证明：

- transcript metadata discovery 数量预算从错误的 128 hard cap 对齐既有 4096 entry 上限，仍只全文读取 latest 32、总量 512 MiB，并保留 exact session/turn/worktree、ABI、inode/mtime/ctime fences；129+ current bound transcript 回归通过；
- 当前 host inline wrapper 的 `max_output_tokens` 仅接受正安全整数字面量；dynamic/zero/negative/fraction/unsafe/pragma/truncated/output-only/重序列化 wrapper 继续拒绝。只有 literal awaited `tools.exec_command` 且同一 result 由 `text(result)` 完整转发时登记成功。

官方重试先以不满足同一 result 完整转发的 wrapper 得到正确拒绝，再以精确完成态 wrapper 读取当前 phase Skill，随后 document registration 与 phase transition 成功。这证明修复消除了合法证据 false negative，没有制造 false positive。

## LOW、环境限制与未完成通过门

- L1：非法 UTF-8 文档 source 使用 replacement decode。
- L2：malformed catalog 前项压缩后，后续 duplicate diagnostic path 相对 raw index 左移。
- L3：transcript mtime/ctime 完全相同时使用默认 locale 的 `localeCompare`，33+ tied Unicode candidates 可跨宿主 false-negative，不会 false-positive。
- L4：TaskPlan path-based publication 在同用户 parent swap 下仍有极窄 TOCTOU。
- L5：server TaskPlan route 的依赖/成功 body 类型仍为 `unknown`，测试允许不完整 DTO；生产 wiring 当前使用 kernel read model，故列 LOW，但后续应把 API boundary 收紧为稳定 read DTO。
- 因 HIGH/MEDIUM 未清零，Verify tasks 保持未完成，不设置 branch handled，不请求 `verify-pass`，也不复用第 8 轮任何通过轨作为修复后的放行证据。

## 下一步

登记本轮失败报告并请求精确 `verify-fail` 复核事件；按持续授权 delegated acknowledge 后回 Build。以 TDD 修复所有同 plan immutable ID 保留与 caller-owned fallback，再重建正式生成物、完成独立 pre-Verify review，并从零执行第 9 轮三轨。

---

# 第 9 轮 Verify（冻结基线 `00e30d66f8428b3ca072b949af1817bfdfc77fa3`）

## 结论

FAIL。第 8 轮的同 plan immutable ID 全历史保留与 caller-owned codec-invalid fallback 已闭环，receipt bridge 的合法完成态与 fail-closed 对照也全部通过；但原生 Codex CLI 发现、Reviewer 独立动态复现确认 1 个 P2/MEDIUM：TaskPlan GET 在 Change capture/read 前后没有重新断言持久 registered-root inode anchor，并发 root replacement 可使端点读取替换目录。未接受偏差，必须回到 Build 修复并从零重跑三轨。

## 冻结身份与 repo-zero barrier

- exact base/merge-base：`dc53843e61f812938f13c684a41ffe1d935e48bf`。
- frozen SHA/tree：`00e30d66f8428b3ca072b949af1817bfdfc77fa3` / `8bc15f2df5a17e6c6fd808f5798330100a8b2fb6`。
- E2E 轨真实工作树 start/after-suites/final 全内容指纹均为 `7425307c053fb1bedfaf22856742f13dc5d279a3`；HEAD/tree、NUL file list、status 与 mode/symlink 保持逐字节一致。Reviewer 与 Codex 的写命令均在仓外隔离 clone 执行。

## 三轨结果

- Reviewer：FAIL，C0/H0/M1。先完成 231 路径映射、fresh build、6 个相关套件 256/256 与全仓 337 files / 6057 passed / 26 honest skipped；收到独立线索后在隔离 fixture 复现：持久 anchor 捕获后 rename 旧 root 并在相同 pathname 放置 replacement，`assertWorkflowRootAnchor(anchor)` 正确拒绝，但现有 TaskPlan capture/read 链仍接受 replacement、读出其中内容，随后 `assertChangePathAnchor` 也通过。
- E2E：PASS。TaskPlan/legacy/store 88/88、route 5/5、receipt 163/163、stable-hook 3/3、目标 hostile input 20/20、store ID reservation 6/6、真实 HTTP 10/10；隔离 OpenSpec show/strict/archive/all-strict 全通过，归档后 37/37。无 UI diff，browser N/A。
- Codex CLI：FAIL，P2/MEDIUM=1。detached read-only clone `/tmp/tenon-pr1-codex-r9.HfrmvR/repo` 针对 exact frozen SHA/base 完成完整 diff/spec/read-path 审查，聚焦套件 256/256；最终指出 `serverGetRoutes.ts` 的 TaskPlan `readPlan` 只断言 Change anchor，未在 capture/read 周围复核 registered root。启动期 malformed logs DB/models cache 警告未阻止最终输出。

## 确认 finding

### MEDIUM — TaskPlan GET 可在并发 root replacement 后绕过持久 inode anchor

`workflowRootForRequest()` 返回前会验证已注册 root 的持久 anchor，但 TaskPlan `readPlan` 随后直接执行 `captureChangePathAnchor(anchor, change)`、`readTaskPlanForChange(changeAnchor.changeDir)` 与 `assertChangePathAnchor(changeAnchor)`。若同一进程权限下的并发方在首次验证后 rename 原 root、于相同 pathname 放置 replacement，Change capture 会从 replacement pathname 建立一套自洽的子目录 anchor；末尾只验证这些 replacement children，未重新验证原 registered-root fd/inode，因而可返回非注册 root 中的 plan。

修复要求：像其他 trusted readers 一样，在 Change capture 前、读取前后及返回前对同一个 `WorkflowRootAnchor` 执行 `assertWorkflowRootAnchor(anchor)`，同时保留 `assertChangePathAnchor`；以 TDD 增加 capture 前 root swap 与读取中 root swap 的受控拒绝、正常 canonical route 不回归，并确保异常不泄漏替换目录内容。

## 已闭环边界与 receipt bridge 结论

- 任一可信同 plan immutable 的 revision ID 均在写前保留；future orphan 复用被拒、different-plan namespace 保持允许、exact-current 遇重复历史失败关闭，current/projection/immutable target 零写入回归通过。
- validator 只从 decoder 的安全 candidate 生成 duplicate 诊断；read-model 仅投影完整成功解码的闭集 clone。Proxy `get` 次数为 0，nested unknown `private_payload` 不进入 DTO 或错误文本。
- PR1 首次官方登记确属 receipt bridge false-negative bug。metadata transcript 数量预算已从错误的 128 hard cap 对齐既有 4096 entry budget，仍只全文读取 latest 32、总量 512 MiB，并保持 exact session/turn/worktree/ABI/inode fences；inline `max_output_tokens` 仅接受正安全整数字面量。129+、真实当前宿主登记与 invalid/dynamic/zero/negative/fraction/unsafe/pragma/truncated/output-only/伪造对照全部通过。

## LOW、环境限制与未完成通过门

- L1：非法 UTF-8 文档 source 使用 replacement decode。
- L2：malformed catalog 前项压缩后，后续 duplicate diagnostic path 相对 raw index 左移。
- L3：transcript mtime/ctime 完全相同时使用默认 locale 的 `localeCompare`，33+ tied Unicode candidates 可能跨宿主 false-negative，不会 false-positive。
- L4：TaskPlan path-based publication 在同用户 parent swap 下仍有极窄 TOCTOU；本轮 MEDIUM 是公开 GET trust anchor 的确定可复现绕过，风险不同。
- 因确认的 MEDIUM，Verify tasks 保持未完成，不设置 branch handled，不请求 `verify-pass`，且不复用第 9 轮任何通过轨作为修复后的放行证据。

## 下一步

登记本轮失败报告并请求精确 `verify-fail` 复核事件；按持续授权 delegated acknowledge 后回 Build。以 TDD 在 TaskPlan route 的 capture/read 全生命周期复核持久 root anchor，重建/验证相关 bundle，完成独立 pre-Verify review，再从零执行第 10 轮三轨。

---

# 第 10 轮 Verify（冻结基线 `4fa2b1a5b8a8438051c97c50d21cf0bbfc8982bd`）

## 结论

FAIL。第 9 轮 registered-root inode anchor 缺陷已经修复，Reviewer 与 E2E 均通过；但原生 Codex CLI 发现并由主轨使用冻结正式 bundle 独立动态复现 1 个 P2/MEDIUM：immutable revision 文件名没有 `plan_id` namespace，不同 plan 的合法 orphan 可错误占用当前 plan 的 target pathname。未接受偏差，必须回到 Build 修复并从零重跑三轨。

## 冻结身份与 repo-zero barrier

- exact base/merge-base：`dc53843e61f812938f13c684a41ffe1d935e48bf`。
- frozen SHA/tree：`4fa2b1a5b8a8438051c97c50d21cf0bbfc8982bd` / `2f35919562fd3d2581b4a8ada01a667a159e5e37`。
- Reviewer binary diff SHA-256：`dedcd4a242f3ec016849e52858cf35a2e4d8a685a0026edc2286345dd4106d60`；name-status SHA-256：`27455dbd56a6900396d56391e9131ad9e5856953f5ddb02ce6440ceed0559054`。
- Reviewer 与 E2E 对真实 worktree 的 status、tracked/untracked 内容、mode/symlink、HEAD/tree 起止检查均逐字节一致；E2E 全树 fingerprint 始终为 `32ff93e1e1969e43f4b64d4b3951924b2ac4045f`。所有会写入的验证、root replacement、HTTP 与 archive rehearsal 均在仓外隔离副本执行。

## 三轨结果

- Reviewer：PASS，C0/H0/M0/L4。完整映射 249/249 paths；聚焦与独立 root-anchor 矩阵 267/267、全仓 337 files / 6062 passed / 26 honest skipped、Dashboard 87 files / 1633 passed、hermetic bundle 27/27、build/static/generated freshness、OpenSpec strict/archive 后 37/37 与 governance continuity 全部通过。
- E2E：PASS。TaskPlan/store 88/88、route 10/10、receipt 163/163、stable-hook 3/3；root replacement 窄专项 5/5、真实 route runtime 四类替换、真实 HTTP 4/4、OpenSpec archive `+7/~2` 与归档后 37/37 均通过。无 UI diff，browser N/A。
- Codex CLI：FAIL，P2/MEDIUM=1。在 detached read-only clone `/tmp/tenon-pr1-codex-r10.H3ldkY/repo` 对 exact frozen SHA/base 完成完整 249-path diff/spec/store/route/receipt 审查，exit 0；启动期 malformed logs DB/models cache 警告未阻止最终输出。

## 确认 finding

### MEDIUM — immutable revision pathname 未按 plan namespace 隔离

`revisionFileName()` 仅使用 `revision_number` 与 `revision_id`。history admission 在看到与 proposed 同 pathname 的 entry 时，先逐字节比较 raw，再检查 `historical.plan_id`；因此不同 plan 的合法 orphan 若与 proposed revision 同号同 ID，会被误判为“target revision already exists with different content”，阻断当前 lineage 的有效发布。

主轨使用冻结 `packages/kernel/dist` 独立复现：先发布 `plan-a/revision-1`，再放入 `plan-b/revision-2/shared-revision` orphan，随后发布 `plan-a/revision-2/shared-revision`。结果为：

```json
{"accepted":false,"name":"TaskPlanStateCorruptError","message":"TaskPlan target revision already exists with different content"}
```

这违反已经冻结并通过既有测试证明的 plan-scoped identity 语义：different-plan immutable 不应占用当前 plan 的 revision ID/number/target。修复必须把 immutable storage addressing 纳入 `plan_id` namespace，或以等价方式确保 foreign-plan target 不碰撞；同时保持同 plan exact target 幂等、same-plan future orphan ID/number 拒绝、完整 history budgets、legacy/current compatibility与零写入失败关闭。必须先补 different-plan same-number/same-ID RED 回归，再完成迁移兼容与 GREEN。

## Root anchor 与 receipt bridge 已闭环

- TaskPlan GET 在 Change capture 前、capture 后、read 前后与返回前复核同一个 registered-root anchor；capture 400 也先重验 root，cross-module status-shaped 400 不依赖 `instanceof`。读取 replacement content 或抛 replacement secret 均以 403 trust failure 优先且不泄漏；可信 missing 保持 404。
- PR1 首次官方登记确属 receipt bridge false-negative bug。metadata discovery 的错误 128 transcript hard cap 已对齐既有 4096 entry budget，仍只全文读取 latest 32、总量 512 MiB，并保持 exact session/turn/worktree/ABI/inode fences；inline `max_output_tokens` 仅接受正安全整数字面量。129+、真实当前 host 完成态、截断/伪造/ABI 错配与动态/零/负/小数/unsafe/pragma 对照均通过。

## LOW、环境限制与未完成通过门

- L1：非法 UTF-8 canonical 文本使用 replacement decode。
- L2：malformed catalog 前项压缩后，duplicate diagnostic path 相对 raw index 左移。
- L3：transcript mtimeNs/ctimeNs 完全相同时仍以默认 locale 的 `localeCompare` 排 path，33+ tied Unicode candidates 可能跨宿主 false-negative，不会 false-positive。
- L4：TaskPlan path-based publication 在同用户 parent swap 下仍有极窄 TOCTOU。
- fresh Reviewer clone 首轮跨包测试因 workspace dist 尚未生成而无法收集，执行正式 build 后 267/267 与全仓 6062 全绿；这是诚实记录的隔离准备，不是产品失败。
- 因确认的 MEDIUM，Verify tasks 保持未完成，不设置 branch handled，不请求 `verify-pass`，且不复用第 10 轮任何通过轨作为修复后的放行证据。

## 下一步

登记本轮失败报告并请求精确 `verify-fail` 复核事件；按持续授权 delegated acknowledge 后回 Build。以 TDD 修复 immutable storage 的 plan namespace 与兼容读取，重建正式生成物、完成独立 pre-Verify review，再从零执行第 11 轮三轨。

---

# 第 11 轮 Verify（冻结基线 `6be63609e18ccdf5f4471a31351d0a04e2dbf1ce`）

## 结论

FAIL。第 10 轮的 cross-plan immutable pathname collision 已以与 legacy filename language 不相交的 `<number>--<plan-hash>--<revision-id>.json` 形式闭环，Reviewer 与 E2E 均通过；但原生 Codex CLI 完整审查发现并由主轨在冻结隔离构建上动态复现 2 个新的 P2/MEDIUM：canonical history 的非法 UTF-8 会被 replacement decode 后按字符串接受，以及公开 object decoder 的未知字段名未计入 hostile-input budget、可生成无界诊断路径。未接受偏差，必须回到 Build 修复并从零重跑三轨。

## 冻结身份与 repo-zero barrier

- exact base/merge-base：`dc53843e61f812938f13c684a41ffe1d935e48bf`。
- frozen SHA/tree：`6be63609e18ccdf5f4471a31351d0a04e2dbf1ce` / `dd7412ae80d5fb44ec6f584f1277c20f935fd094`。
- Reviewer 映射 281 paths、`+9249/-1392`；106 个 pre-Verify receipts、106 个 revisions、29 个 transitions、12 个 Change docs/state、5 个 design docs、5 个 CLI、13 个 kernel、5 个 server 路径全部逐项回读。
- Reviewer 与 E2E 对真实 worktree 的 HEAD/tree、tracked/untracked NUL manifest、mode/symlink、status 与内容指纹前后检查均一致。E2E 真实 worktree full fingerprint 始终为 `c8edebdaa9bf064bfed55286c200cbe67f5ad3e9`；所有 build、测试、HTTP、hostile fixture 与 archive rehearsal 均在仓外隔离副本执行。

## 三轨结果

- Reviewer：PASS，C0/H0/M0/L5。fresh `npm ci && npm run build` 后 generated diff=0；focused 6 files / 264 passed；Dashboard 87 files / 1633 passed；TypeScript、architecture、comments、OpenSpec strict、hermetic bundle 27/27、archive 后 37/37 全通过。全仓每个测试文件均输出绿色且只有既有 Docker/real-agent honest skips，但 Vitest 3.2.7 最后遗留空闲 worker、无摘要，等待后人工中止，诚实记录为 teardown 环境限制。
- E2E：PASS。TaskPlan/legacy/store 91/91、route 10/10、receipt 163/163、stable-hook 3/3；Store 兼容/预算专项 20/20。真实 filesystem 证明 legacy single-hyphen foreign orphan 与新 `--hash--` target 可共存、旧 flat current 可读并可幂等 republish 且不隐式迁移、same-plan future flat orphan 继续保留 ID；真实 HTTP 6/6，root replacement 均 403 且无 secret；OpenSpec archive `+7/~2` 后 37/37。无前端源码 diff，browser N/A。证据根 `/tmp/tenon-pr1-verify11.grD1AQ`。
- Codex CLI：FAIL，P2/MEDIUM=2。在 detached read-only clone `/tmp/tenon-pr1-codex-r11.jwzbbE/repo` 运行 `codex exec --sandbox read-only --ephemeral review --base dc53843e61f812938f13c684a41ffe1d935e48bf`，exit 0。启动期 malformed logs DB/models cache 警告未阻止最终输出；其自发 Vitest 命令因隔离 clone 未安装项目固定版本而由临时 npx 解析到不兼容 CLI option，诚实记为审查环境失败，不替代前两轨的 fresh 正式测试。

## 确认 findings

### MEDIUM — 非法 UTF-8 canonical bytes 经 replacement decode 后可被接受为相同 history

`readOptionalBoundedRegularTextFile` 的文本读取使用 Node 默认非 fatal UTF-8 decode。`current.json` 与 immutable twin 即使原始字节不同，只要不同非法 byte sequence 都被替换为 U+FFFD，`task-plan-store.ts` 后续的 string equality 与 codec 就可能同时通过，把 byte-corrupt canonical state 当作合法 committed history。这违反 immutable/current 逐字节相同与 corrupt-state fail-closed 契约。

主轨在冻结 Track2 构建中构造一份合法 revision，在同一 JSON string 位置分别把 U+FFFD 的 UTF-8 bytes 替换为单字节 `ff` 与 `fe`，将前者写入 current、后者写入 canonical immutable。动态结果：

```json
{"rawEqual":false,"decodedEqual":true,"currentHex":"ff","immutableHex":"fe","accepted":true,"source":"canonical","revision":"revision-1"}
```

修复要求：canonical TaskPlan state 必须在解析或 identity comparison 前使用 fatal UTF-8 decode，或保留并逐字节比较原始 Buffer；current、immutable、history scan 与 legacy fallback 的边界要明确分离。补非法单字节、多字节截断、current/immutable 不同损坏但 replacement string 相同、合法 U+FFFD、零写入发布/幂等重试回归。

### MEDIUM — 超长未知字段名绕过 object-input budget 并生成无界 error path

公开 `decodeTaskPlanRevisionV1(object)` 的 `record()` 只把 own-key 数量计入 node budget，不把 property-name bytes 计入 text/document budget；`closed()` 随后直接用 `` `${path}.${key}` `` 构造诊断。攻击者无需 accessor 或 JSON parse，即可通过一个巨大的 enumerable data-property name 让 decoder 分配同量级错误 path，突破已冻结的 bounded hostile-input diagnostics。

主轨在冻结 Track2 构建中向 otherwise-valid object 增加一个 2,097,152-byte unknown own data key；公开 decoder 在 `maxDocumentBytes=1,048,576` 时仍返回：

```json
{"ok":false,"errorCount":1,"unknownPathBytes":2097154,"overflow":false}
```

修复要求：在复制、排序和拼接前按 UTF-8 bytes 对所有 object field names 计入全局 document/text budget，并以固定有界 path 或安全截断诊断失败关闭；不得读取 accessor。补 unknown/known 巨型 key、多个 keys 累计、Unicode byte/character 差异、Proxy/getter-zero、错误数组/path 上界与普通 unknown-field 精确路径回归。

## Namespace 与 receipt bridge 已闭环

- canonical filename 使用双连字符边界，而 TaskPlan ID 明确拒绝 `--`；因此新 `<number>--<hash>--<id>` 与 legacy `<number>-<id>` 的合法语言不相交。different-plan same number/ID、旧 single-hyphen shape collision、旧 flat current、same-plan future orphan、exact-current 与 entry/read/byte budgets 均已由 fresh suites 和真实 filesystem runtime 证明。
- PR1 首次官方登记确属 receipt bridge false-negative bug。transcript metadata discovery 已从错误的 128 hard cap 对齐既有 4096 entry budget，仍只全文读取 latest 32、总量 512 MiB，并保留 exact session/turn/worktree/ABI/inode fences；inline `max_output_tokens` 仅接受正安全整数字面量。129+、真实 current-host 完成态、partial/pragma/dynamic/zero/negative/fraction/unsafe/truncated/output-only/伪造对照全部通过。

## LOW、环境限制与未完成通过门

- L1：malformed catalog 前项压缩后，后续 duplicate diagnostic path 相对 raw index 左移。
- L2：transcript mtimeNs/ctimeNs 完全相同时仍以默认 locale 的 `localeCompare` 排 path，33+ tied Unicode candidates 可能跨宿主 false-negative，不会 false-positive。
- L3：TaskPlan path-based publication 在同用户 parent swap 下仍有极窄 TOCTOU。
- L4：server TaskPlan route 的依赖/成功 body 类型仍为 `unknown`，生产 wiring 使用 kernel stable read model，但测试边界可进一步收紧。
- 非法 UTF-8 不再列 LOW：本轮已证明它可让 raw-different current/immutable 通过 identity check，故提升为确认 MEDIUM。
- 因 2 个确认 MEDIUM，Verify tasks 保持未完成，不设置 branch handled，不请求 `verify-pass`，且不复用第 11 轮任何通过轨作为修复后的放行证据。

## 下一步

登记本轮失败报告并请求精确 `verify-fail` 复核事件；按持续授权 delegated acknowledge 后回 Build。以 TDD 引入 fatal canonical UTF-8/read-byte identity 与 bounded property-name diagnostics，重建正式生成物、完成独立 pre-Verify review，再从零执行第 12 轮三轨。

---

# 第 12 轮 Verify（冻结基线 `b1fe2edb23b01833593c6257beb4112eb0e0e7bd`）

## 结论

FAIL。第 11 轮确认的 canonical 非法 UTF-8 与未知字段名预算/诊断路径缺陷均已闭环，Reviewer 与 E2E 通过；但原生 Codex CLI 在完整冻结审查中发现 1 个新的 P2/MEDIUM：公开 object decoder 虽最终会拒绝超预算字符串，`byteLength()` 与其之前的文本检查仍会先完整扫描任意长度字符串，hostile caller 可令 CPU 工作量突破冻结的 bounded-input 契约。不得以本轮两个通过轨抵消该 finding，必须回 Build 修复并从零重跑三轨。

## 冻结身份与三轨结果

- exact base：`dc53843e61f812938f13c684a41ffe1d935e48bf`；frozen SHA/tree：`b1fe2edb23b01833593c6257beb4112eb0e0e7bd` / `883dbb29a8abb836317c9fabca98b68da58c6bd2`。
- Reviewer：PASS，C0/H0/M0/L1。focused 277/277、全仓 337 files / 6078 passed / 26 honest skipped、Dashboard 87 files / 1633 passed、hermetic bundle 27/27、OpenSpec strict 37/37；fatal UTF-8、raw Buffer identity、合法 U+FFFD、manual byte counter exhaustive equality 与 hostile harness 全通过。证据根 `/tmp/tenon-pr1-r12v-track1.BUc4YC/`。
- E2E：PASS，C0/H0/M0/L0。TaskPlan 104/104、route 10/10、receipt 163/163、stable-hook 3/3；真实 FS/HTTP 证明 invalid UTF-8 typed corrupt 且零写、合法 U+FFFD、EEXIST、root-anchor replacement、legacy 与 129+ receipt 均通过。证据根 `/tmp/tenon-pr1-verify12.NmpT3Z/`。
- Codex CLI：FAIL，P2/MEDIUM=1。在 detached read-only clone `/tmp/tenon-pr1-codex-r12.Gvzl8K/repo` 对 exact frozen SHA/base 执行完整 review，exit 0；启动期 logs DB/models cache 警告未阻止最终输出。

## 确认 finding

### MEDIUM — decoder 在预算拒绝前仍完整扫描任意长度字符串

`packages/kernel/src/task-plan/internal.ts` 的 `byteLength()` 为了无分配计算 UTF-8 字节数，会遍历整个 JS 字符串。`record()` 对字段名调用它后才将结果交给 1 MiB aggregate budget；`text()` 还会先执行 surrogate、control、trim 等完整扫描，再检查字段上限。因此一个远超任何契约上限的 object-form property name 或 text value 虽最终失败关闭，仍可让 decoder 执行与攻击者提供的任意长度成正比的 CPU 工作，违反 hostile object bounded-input 契约。

修复要求：为字段名和文本引入 remaining-budget/max-field-aware 的有界 UTF-8 计数，或在进入 Unicode 扫描前以安全的 code-unit 长度上界做 O(1) 拒绝；所有 surrogate/control/trim 与 path 构造也必须只在已证明有界后执行。补巨大 known/unknown key、巨大 text、ASCII/BMP/astral 与边界值回归，证明 getter/accessor 零执行、错误 path 有界，且正常 Unicode 语义不变。

## LOW 与未完成通过门

- L1：transcript mtimeNs/ctimeNs 完全相同时仍以 locale-sensitive `localeCompare(path)` 选择 newest-32，跨 ICU locale 可能诚实漏检，但不能产生 false-positive evidence。
- 本轮 Verify tasks 保持未完成，不设置 branch handled，不请求 `verify-pass`，且不复用本轮 Reviewer/E2E 通过证据。

## 下一步

登记本轮失败报告并请求精确 `verify-fail`；按持续授权 delegated acknowledge 后回 Build。以 TDD 先证明 oversized hostile strings 在常数/预算上界内拒绝，再实现 bounded counter/前置拒绝、重建正式生成物、完成独立 pre-Verify review，并从零执行第 13 轮三轨。

---

# 第 14 轮 Verify（冻结基线 `507317153478a07343d4e1b9af1d9074a7f97828`）

## 结论

FAIL。第 13 轮发现的 terminal lone high surrogate 已由显式终点检查修复，Reviewer 与 E2E 均通过；但原生 Codex CLI 完整冻结审查发现 1 个新的 P2/MEDIUM：object-form decoder 在预算判断前以 `Reflect.ownKeys(value)` 物化全部 own keys，任意多属性 hostile object 可先消耗无界 CPU/内存。该问题违反冻结的 bounded hostile-input 契约，必须回 Build 修复并从零重跑三轨。

## 冻结身份与三轨结果

- exact base/merge-base：`dc53843e61f812938f13c684a41ffe1d935e48bf`；frozen SHA/tree：`507317153478a07343d4e1b9af1d9074a7f97828` / `907b775759ce94f9526e24793bb322628a49b419`。
- Reviewer：PASS，C0/H0/M0/L1。逐文件审查 317 paths；focused 298/298、全仓 337 files / 6096 passed / 26 honest skipped、Dashboard 87 files / 1633 passed、OpenSpec strict 37/37、archive rehearsal与 bundle 27/27 均通过。唯一 LOW 为同纳秒 transcript 候选用 locale-sensitive path tie-break，只可能 honest false-negative。证据根 `/tmp/tenon-pr1-r14v-track1.g7k2KQ/`。
- E2E：PASS，C0/H0/M0/L0。TaskPlan 122/122、atomic publish 3/3、route 10/10、receipt 163/163、stable hook 3/3；focused 29+20+46 全通过；terminal surrogate 全字段 object/JSON 116/116；真实 codec→store→filesystem→HTTP、非法 UTF-8、历史预算/namespace、129+ receipt 与 OpenSpec archive rehearsal 全通过。证据根 `/tmp/tenon-pr1-verify14.1T6B8P/`。
- Codex CLI：FAIL，P2/MEDIUM=1。在 detached read-only clone `/tmp/tenon-pr1-codex-r14.gcdi4c/repo` 对 exact frozen SHA/base 执行 `codex exec --sandbox read-only --ephemeral review --base dc53843e61f812938f13c684a41ffe1d935e48bf`，exit 0。其自发 `npx` 测试因只读沙箱代理网络 EPERM 失败，不替代前两轨正式测试；启动期 logs DB/models cache 警告未阻止最终 review。

## 确认 finding

### MEDIUM — object key 枚举在节点预算拒绝前无界物化

`packages/kernel/src/task-plan/codec.ts` 的 `record()` 先执行 `Reflect.ownKeys(value)`，随后才以 `keys.length + 1` 调用 `consumeBudget()`。因此即使最终稳定返回 `document_too_large`，具有远超 `maxDecodeNodes` own properties 的公开 object-form 输入已经让 runtime 枚举并分配全部 key array；节点预算不能约束拒绝前的 CPU/内存工作。

修复要求：以不会先物化全部键的有界枚举策略在预算上限处停止，或在公共 object-form 边界采用等价的前置有界表示；保持 symbol/accessor/Proxy 失败关闭、getter 零执行、普通闭集与 unknown-field 精确诊断，并新增大于节点预算的真实对象回归，证明不会调用 `Reflect.ownKeys` 且结果有界。

## Receipt bridge 结论与未完成通过门

- PR1 首次登记确属 receipt bridge false-negative bug；129+ transcript discovery 与正安全整数字面量 `max_output_tokens` 完成态回归、真实 current-host 官方登记及截断/伪造/ABI 错配对照在本轮均保持通过。
- 本轮 Verify tasks 保持未完成，不设置 branch handled，不请求 `verify-pass`，不得复用 Reviewer/E2E 的通过证据抵消原生 Codex finding。

## 下一步

登记本轮失败报告并请求精确 `verify-fail`；按持续授权 delegated acknowledge 后回 Build。先写键数超限且禁止 `Reflect.ownKeys` 的 RED 回归，再实现 bounded enumeration、构建正式生成物、完成独立 pre-Verify review，并从零执行第 15 轮三轨。

---

# 第 15 轮 pre-Verify（requirements-changed）

## 结论

FAIL，C0/H0/M2/L1，不设置 `pre_verify_review_result=pass`。Round14 finding 的首个修复用 `for...in` 代替显式 `Reflect.ownKeys/Object.keys` 并在 yield 后计数；全量测试虽绿，但独立 Reviewer 证明它没有满足拒绝前预算，且改变了 symbol/non-enumerable 闭集语义。主轨已执行官方 `requirements-changed` 从 Build 回到 Spec，重新冻结可实现的 object/JSON trust boundary。

## 确认 findings

1. MEDIUM：ECMAScript `for...in` 在逐项 yield 前仍经内部 `[[OwnPropertyKeys]]` 获得完整 key list。131k+ Proxy harness 观察到一次性交付全部 keys，随后才在 65,536 次 descriptor 处理预算处停止；`enumeratedKeys` 与 spy=0 只约束后续工作，未闭环前置物化。
2. MEDIUM：`for...in` 忽略 symbol 与 non-enumerable own properties，object/array harness 均从原先失败关闭变为 `ok:true`；这与本轮修复前的 frozen closed-schema 语义冲突。
3. LOW：同纳秒 transcript 候选仍以 locale-sensitive path tie-break，只可能造成 honest false-negative。

## 独立证据

- 完整映射 338 files；focused 7 files / 299 passed；全仓 337 files / 6097 passed / 26 honest skipped。
- build、architecture、comments、OpenSpec strict 37/37、docs、hygiene、default freshness、hermetic bundle 27/27 均通过；绿色测试不能抵消上述语义缺陷。
- Reviewer 对真实 worktree 零写入，最终稳定 status/diff/index/content 指纹前后一致。证据根：`/tmp/tenon-pr1-r15-preverify-track1.vm1jsE/`。

## Spec 修订方向

不可信 closed-schema 输入只走先受原始 UTF-8 byte gate 保护的 JSON；parsed key 数天然受 source bytes 约束，可以安全保留严格 unknown-field 拒绝。Direct typed object 不枚举任意 own keys，只读取固定 schema allow-list 的 enumerable own data descriptors和有上限数组索引；额外 string/symbol/non-enumerable/accessor 不读取、不复制。需要额外属性诊断的调用方必须提交 byte-bounded JSON。

---

# 第 16/17 轮 pre-Verify（最终 Build 收敛）

## 结论

PASS，最终 C0/H0/M0/L0。第 16 轮全量独立审查首先确认 TaskPlan 的 JSON closed mode 与 direct object schema-directed mode 已正确分离，C0/H0/M0；同时识别一个 LOW：mtimeNs/ctimeNs 完全相同的 transcript 用 locale-sensitive path tie-break，仍可能诚实漏掉 newest-32 中的有效当前 receipt。该 LOW 与本 Change 修复的 false-negative 属于同类，未作为剩余风险接受。

主轨按 TDD 先以强制 `localeCompare` 返回相等的回归证明不确定排序，再改为 `(mtimeNs desc, ctimeNs desc, path UTF-16 code-unit asc)` 的确定性全序并重建 CLI。第 17 轮重新审查完整待冻结 diff，确认原 LOW 消除且无新 finding。

## 独立证据

- Round16：C0/H0/M0/L1；完整候选 347 files，精确候选与合并 `origin/main` 后 focused suites 均 298/298；证据根 `/tmp/tenon-pr1-r16-preverify-track1.wyeaCw/`。
- Round17：C0/H0/M0/L0；完整候选仍为 347 files，TaskPlan、receipt bridge、正式生成物与 origin/main 合并兼容重新审查；精确快照与合并态 focused suites 均 299/299；证据根 `/tmp/tenon-pr1-r17-preverify.7lULdI/`。
- 主轨 fresh full suite：337 files / 6097 passed / 26 honest skipped；Dashboard：87 files / 1633 passed；build、architecture、comments、OpenSpec strict 37/37、docs、repository hygiene、default workflow freshness 与 hook 512/512 全通过。
- receipt 专项保持 exact session/turn/worktree/ABI/inode/mtime/ctime 与 nested `exit_code=0` 约束；129+ transcript、完整/截断 `max_output_tokens` 双 ABI、equal-timestamp Unicode path tie 均有正反回归。两轮 reviewer 对真实 worktree 前后指纹一致，所有构建与探针在 `/tmp` 隔离快照完成。

---

# 第 17 轮 Verify（冻结基线 `3621b8de4aa386d027fcf70b20d4a2d25aa41c17`）

## 结论

FAIL，C0/H1/M2/L0。receipt bridge 的首次登记误拒绝、129+ transcript discovery、合法
`max_output_tokens` 完成态以及 equal-timestamp ordinal tie-break 均已闭环，且 E2E 轨全部通过；
但 Reviewer 与原生 Codex CLI 独立复现了 canonical `tasks.md` 兼容投影的 1 个 HIGH 与 2 个
MEDIUM。展示 group 标题可改变 pipeline exit gate，合法大型投影与既有 256 KiB readers 不兼容，
WorkItem identity comment 又会进入 Dashboard task label。本轮不得以绿测抵消这些 finding，必须回
Build 修复并从零重跑三轨。

## 冻结身份与三轨结果

- exact base：`dc53843e61f812938f13c684a41ffe1d935e48bf`；frozen SHA/tree：`3621b8de4aa386d027fcf70b20d4a2d25aa41c17` / `c7cbe3d7375ff8517960ed8d369a06a80ec8cf5a`。
- Reviewer：FAIL，C0/H1/M2/L0。TaskPlan/receipt focused 296/296，hermetic build、静态检查、OpenSpec strict/archive rehearsal 与 current-main merge-tree 均通过；全仓运行完成 336 files / 6079 passed / 26 skipped 后未给最终聚合摘要，剩余 release-store integration 单独 18/18、106.99 秒通过，未把无摘要运行宣称为完整通过。三个 finding 均由独立脚本复现；真实 worktree 指纹不变。证据根 `/tmp/tenon-pr1-r17-reviewer.MxLC21/`。
- E2E：PASS，C0/H0/M0/L0。build exit 0，8 个聚焦文件 300/300，receipt verbose 164/164；真实 filesystem→store→server→HTTP 验证 missing/unregistered/canonical/root-replacement 400/404/200/403，OpenSpec 隔离 archive 后 strict 37/37。正式 pure snapshot 未解析回真实 worktree，真实 worktree 指纹不变。证据根 `/tmp/tenon-pr1-r17-e2e.TajY07/`。
- 原生 Codex CLI：FAIL，P1/HIGH=1、P2/MEDIUM=2。在 detached 临时 clone `/tmp/tenon-pr1-codex-r17.LwiRsc/repo` 对 exact frozen SHA/base 执行完整 review，exit 0；启动期 logs DB/models cache 警告未阻止最终输出。其 build 通过，但因共享依赖软链在 bundle source label 写入真实绝对路径而产生临时 bundle diff，该结果不作为 bundle freshness 证据，正式 hermetic 证据取自前两轨。

## 确认 findings

### HIGH — TaskGroup 展示标题可改变 phase exit gate

`renderTaskPlanTasksMd` 把任意 group title 写成普通 `## <title>`；既有
`incompletePipelineTasksForExit`/`projectPipelineTodo` 又把 `Build`、`Verify` 等同形标题解析成 pipeline
phase boundary。实测未完成 WorkItem 所在 group 仅从普通标题重命名为 `Verify`，build 的
`incomplete` 即从 1 变成 0。TaskGroup 本应只表达展示/所有权，不能通过重命名改变 transition
eligibility。修复必须让 canonical group headings 与 phase headings 无歧义，并以真实 renderer→gate
回归证明所有 phase-like title 都不能旁路当前阶段检查。

### MEDIUM — canonical projection 上限与既有 readers 错位

TaskPlan/store 接受最高 1,048,577-byte canonical revision/projection，但 `snapshotTasks` 与
`readAnchoredTasksMarkdown` 仍限制 262,144 bytes。实测 262,145-byte 合法 `tasks.md` 在聚合 snapshot
中静默成为无 task source，单 Change reader 则报超限；TaskPlan endpoint 同时仍会报告 projection
current。修复必须统一 canonical publication 与所有消费者的 byte contract，同时保持 legacy 256 KiB
边界和 fd/inode/root-anchor 失败关闭。

### MEDIUM — WorkItem identity comment 泄漏到 Todo/Dashboard 文本

renderer 为持久 identity 写入 `<!-- work-item:<id> -->`，但 Todo parser 将完整 checkbox payload 作为
`PipelineTodoItem.text`。实测 API/Dashboard label 为
`Implement API <!-- work-item:wi-1 -->`。修复必须保留 Markdown identity marker，同时在兼容投影边界
精确剥离该受信尾注，且不能吞掉普通用户文本或伪造/非尾部注释。

## Receipt bridge bug 结论

PR1 首次登记属于官方 receipt bridge false-negative bug，不是使用者漏读。修复已将有效 transcript
metadata candidate 上限从错误的 128 对齐到既有 4096 entry budget，仍只全文读取 newest 32，并保留
512 MiB、fd/inode/mtime/ctime、exact session/turn/worktree/ABI 与 nested `exit_code=0` 边界。inline
`max_output_tokens` 只接受正 safe-integer literal 且完整结果必须 `text(result)` 转发；截断、pragma、
动态/非法数值、output-only 与 spoofing 继续拒绝。equal timestamps 现以
`mtimeNs desc → ctimeNs desc → path UTF-16 code-unit asc` 确定排序。同一命令向 `cat` 传两个 operand
的后续失败不属于 bug，而是安全命令 grammar 的预期拒绝；逐个完整读取可正常登记。

## 下一步

本轮 Verify tasks 保持未完成，不设置 `branch_status=handled`，不请求 `verify-pass`。登记本失败报告并
请求确切 `verify-fail` transition event，按持续授权 delegated acknowledge 后回 Build。以 TDD 分别
覆盖 phase-like group title、262,145-byte canonical reader、identity marker display 三条 RED，再实现
最小兼容修复、重建正式生成物、完成独立 pre-Verify review，并从零启动下一轮三轨。

---

# 第 18 轮 pre-Verify（Round17 finding 收敛）

## 结论

PASS，C0/H0/M0/L0。Round17 的 1 个 HIGH 与 2 个 MEDIUM 均已按 TDD 闭环：canonical
TaskGroup 标题不再参与 phase gate；超过 legacy 256 KiB 的投影只有在真实 canonical current state
授权后才可由 snapshot readers 读取；WorkItem identity 尾注只在受信 canonical 投影边界剥离，legacy
用户文本保持原样。

独立 Reviewer 在本轮中继续发现并推动修复了两类信任边界问题：仅凭 canonical header spoof 不得扩大
legacy reader 预算；canonical current 授权不得在读取 tasks source 前缓存，否则会留下授权窗口
TOCTOU。最终实现采用稳定 fd 读取、真实 current projection 授权、最终 fd/path fence 的顺序，并以
aggregate 与 single Change 两类同尺寸并发写入回归证明失败关闭。

## 独立证据

- Reviewer：PASS，C0/H0/M0/L0；最新原生快照 8 files / 379 passed，TypeScript、architecture、comments、
  OpenSpec strict、docs、repository hygiene 与正式 bundle freshness 全通过。与
  `origin/main@315f334c9e7f7fa4e6b56389425476e97a789593` 自动合并无冲突，合并态重复通过同组
  379 tests、类型与静态门禁，生成 bundle 与 merge commit 精确一致。证据根
  `/tmp/tenon-pr1-r18-final2.K2ekzl`；Reviewer 对真实工作树前后指纹一致。
- 主轨 fresh full suite：337 files / 6110 passed / 26 honest skipped；Dashboard：87 files /
  1633 passed；build、TypeScript、architecture、comments、OpenSpec strict 37/37、docs、repository
  hygiene、default workflow freshness、hooks 512/512、migration CAS 13/13 与 `git diff --check`
  全通过。
- 兼容专项覆盖 phase-like group title、可信/伪造 marker、真实大于 256 KiB canonical projection、legacy
  硬上限、aggregate/single authorization-window races 与 ABA rename；receipt bridge 的 129+ discovery、
  完整/截断 `max_output_tokens`、exact session/turn/worktree/ABI 及完成态正反矩阵继续保持通过。

---

# 第 18 轮 Verify（冻结基线 `9603c01226f07558567f270632cfb4b4e740b05b`）

## 结论

FAIL，C0/H1/M3/L0。Round17 的三个兼容 finding 与 receipt bridge 专项均保持绿测，但三轨完整冻结
审查确认了 1 个 HIGH 与 3 个 MEDIUM 的文件身份/信任边界缺口。现有测试只覆盖 replacement 留在位
或同 inode 写入，没有覆盖完整目录 ABA 在最终 fence 前复位；因此不得以 6110 个全仓测试通过抵消
确定性复现，必须回 Build 修复并从零重跑三轨。

## 冻结身份与三轨结果

- exact base：`dc53843e61f812938f13c684a41ffe1d935e48bf`；frozen SHA/tree：
  `9603c01226f07558567f270632cfb4b4e740b05b` /
  `5a3b00f16bab345f6ce9384f9da363c7b66bfcee`。
- Reviewer：FAIL，C0/H1/M2/L0。三个 finding 均由真实实现确定性复现，focused 379/379、Dashboard
  1633/1633、build、静态门禁、OpenSpec strict/archive rehearsal 与 origin/main merge-tree 通过；
  真实工作树指纹前后一致。证据根 `/tmp/tenon-pr1-r18-reviewer.eMxeeH`。
- E2E：FAIL，C0/H1/M3/L0。focused 9 files / 388 passed，receipt 154/154、安全专项 27/27、
  `max_output_tokens` 10/10、snapshot 既有竞态 4/4；全仓 337 files / 6110 passed / 26 honest
  skipped，Dashboard 87 files / 1633 passed，OpenSpec 隔离 archive `+7/~2` 且前后 strict
  37/37。真实工作树指纹不变。证据根 `/tmp/tenon-pr1-r18-e2e.6Hp1Wl`。
- 原生 Codex CLI：FAIL，P2/MEDIUM=2。在 detached read-only clone
  `/tmp/tenon-pr1-codex-r18.t00V1f/repo` 审 exact frozen SHA/base，exit 0；独立确认大型投影授权未
  绑定 source bytes，并发现 canonical state 同尺寸原地改写缺少时间元数据 fence。其隔离 clone
  没有本地依赖，自动 `npx` 取得不兼容 Vitest 并因参数失败，故不把该命令当测试证据；正式测试取
  Reviewer/E2E 轨。

## 确认 findings

### HIGH — TaskPlan GET 可在完整 registered-root/change ABA 中返回 replacement plan

route 只在异步 pathname reader 前后复核 root/change inode。读取期间把完整注册 root 或 Change 目录
换成未注册 replacement，读取其 canonical plan，再在最终检查前恢复原 inode，可让首尾身份检查均
通过并返回 replacement 数据。修复必须把 canonical state 的实际读取绑定到已捕获的目录句柄/身份，
不能只依赖 pathname 首尾相等。

### MEDIUM — 大型 projection 授权未绑定已读 tasks source

reader 先从稳定 fd 读取超过 256 KiB 的 source，随后 authorizer 却按当前 `changeDir` pathname 读取
另一时刻的 canonical state。完整 Change-dir ABA 可暂时安装合法 current projection取得授权，再恢复
原目录，让最终 fd/path fence 通过并返回未授权 source。授权必须逐字节或以 digest 绑定已读 source，
并与同一 anchored canonical state 联合验证。

### MEDIUM — header spoof 会让 legacy 用户 marker 文本被剥离

没有 canonical current 的 legacy `tasks.md` 只需伪造 `<!-- tenon-task-plan ... -->` header，就会被
`adaptLegacyTasksMd`/Todo parser 当成 canonical，剥除用户原本的 task-group/work-item marker-shaped
文本。canonical 展示剥离必须来自可信 store/current 证明，不能由 Markdown 自我声明升级信任。

### MEDIUM — canonical state 同尺寸原地改写缺少 mtime/ctime fence

TaskPlan `current.json` 与 immutable revision 共用的 bounded reader 只复核 dev/inode/size。同一 inode
在读取窗口被写入不同但等长内容时，reader/CAS 可使用已经失效的旧字节。修复必须捕获并复核纳秒级
mtime/ctime，且保持原 fd 与当前 pathname 身份、字节预算和 raw identity 约束。

## Receipt bridge 结论与下一步

用户指出的 PR1 首次登记仍确认是 receipt bridge false-negative bug；129+ discovery、合法 inline
`max_output_tokens` 完成态及所有 session/turn/worktree/ABI/inode/完整输出反例本轮继续通过。当前失败
来自后续 TaskPlan 文件身份边界，不推翻该 bug 结论。本轮 Verify tasks 保持未完成，不设置
`branch_status=handled`，不请求 `verify-pass`。登记报告后请求精确 `verify-fail`，按持续授权 delegated
acknowledge 回 Build，以 TDD 同时修复上述四条并重新执行独立 pre-Verify 与三轨。

---

# 第 19 轮 pre-Verify（Round18 finding 收敛）

## 结论

PASS，C0/H0/M0/L0。Round18 的 1 个 HIGH 与 3 个 MEDIUM 均已按 TDD 闭环：TaskPlan GET
把 canonical state 读取绑定 registered root、`openspec/changes` parent chain、Change 目录句柄与
纳秒级 mutation version；大型 projection 的授权绑定已读 source、真实 current/immutable state 与
同一 root/ancestor trust context；legacy/header spoof 不再获得 marker 剥离权限；canonical bounded
reader 同时复核 fd/path 的 dev、inode、size、mtime 与 ctime。

独立 Reviewer 又确定性复现并推动修复了 3 个 MEDIUM 窄分支：missing Change 的完整 registered-root
ABA 会被误报 404；完整 `openspec/changes` ABA 可绕过仅 root 的 missing fence；大型 projection 可在
authorization window 通过完整 root ABA 借另一 Change 的 canonical state 获得授权。最终实现将每次
读取的 root mutation version 抽为共享原语，并让 route、aggregate snapshot、single-Change snapshot
及直接 tasks reader 在 source/authorization 全窗口复核 root 与 ancestor chain；三条攻击回归全部
失败关闭。

## 独立证据

- Reviewer：PASS，C0/H0/M0/L0；精确冻结副本 build 通过，全量 338/338 files、6119 passed、
  26 honest skipped；Web、hooks、TypeScript、architecture、comments、OpenSpec strict、docs、
  repository hygiene、default workflow freshness、migration CAS 与 bundle freshness 全绿。与
  `origin/main@315f334c9e7f7fa4e6b56389425476e97a789593` 自动合并无冲突，合并态 build、focused
  297、architecture 与 OpenSpec 37/37 通过。证据：
  `/tmp/tenon-pr1-r19-preverify.LuXIiA/review-report.md`；Reviewer 对真实工作树零写，前后指纹一致。
- 主轨 fresh full suite：338 files / 6119 passed / 26 honest skipped；Dashboard：87 files /
  1633 passed；hooks 512/512；build、TypeScript、architecture、comments、OpenSpec strict 37/37、
  docs、repository hygiene、default workflow freshness、migration CAS 13/13 与 `git diff --check`
  全通过。
- receipt bridge 的 129+ discovery、safe-positive literal `max_output_tokens`、exact
  session/turn/worktree/ABI、完整 awaited same-result `text(result)` 与截断/动态/pragma/spoofing
  反例继续保持通过；PR1 首次官方登记仍确认是 bridge false-negative bug，而非缺少真实 Skill 读取。

---

# 第 19 轮 Verify（冻结基线 `98c5188ff18da6dbfb333b5ab197ae2ef03ebf4b`）

## 聚合结论

FAIL。独立 Reviewer 与独立 E2E 均为 PASS（C0/H0/M0/L0），原生 Codex CLI 为 FAIL
（P0=0、P1=1、P2=4）；按三轨 findings 严格并集，任何 P0-P2 都阻断 `verify-pass`。冻结实现树为
`05bac11f`，exact base/merge-base 为 `dc53843e61f812938f13c684a41ffe1d935e48bf`；三轨均未改写
真实工作树的实现、配置或生成物。

## 已通过证据

- Reviewer：focused 388/388；全仓 338 files / 6119 passed / 26 honest skipped；Web 1633/1633；
  hooks 512/512；build、静态门禁、OpenSpec strict/archive rehearsal、bundle freshness 与
  `origin/main@315f334c9e7f7fa4e6b56389425476e97a789593` merge compatibility 全通过。证据：
  `/tmp/tenon-pr1-r19-verify-reviewer.ddkfSC/review-report.md`。
- E2E：focused 391/391；TaskPlan security boundaries 224/224；receipt/tool ABI 164/164；全仓
  338 files / 6119 passed / 26 honest skipped；Web 87 files / 1633 passed；hooks 512、migration CAS
  13、build/static/bundle freshness 全通过；OpenSpec archive rehearsal `+7/~2` 且前后 37/37。
  323379-byte canonical、64 items 的 store → server → HTTP → snapshot 链路通过，root/marker
  零泄漏，真实工作树前后指纹一致。证据：
  `/tmp/tenon-pr1-r19-verify-e2e.IcbLVW/SUMMARY.md`。
- 原生 Codex 复核确认 receipt bridge 的 129+ transcript、safe literal `max_output_tokens`、完整
  awaited same-result `text(result)`、session/turn/worktree/ABI、registered-root/change/ancestor ABA、
  missing-path ABA、大型 projection authorization 与同尺寸 mutation fence 均通过。证据：
  `/tmp/tenon-pr1-r19-codex.sxFxyw`。

## 阻断 findings

### P1 — canonical TaskGroup 标题可绕过真实 phase exit guard

canonical renderer 允许 caller-controlled TaskGroup 标题；例如 `Verify` 会产出带 `task-group` marker
的 Verify heading。展示/snapshot 链路会把 canonical state 的信任位传给 Todo parser，但真实
`tasks-through-phase` guard 只传 `tasksMarkdown`，没有传 `trustedCanonicalProjection`。因此 Build
阶段会把该未完成项错误路由到未来 Verify，返回零个到期未完成项并允许 Build 离开。现有单测只直接
调用 helper 且手工传 `trustedCanonicalProjection: true`，没有覆盖 renderer → filesystem → guard
真实调用链；`tasks.md` 第 49 项的完成声明因此不成立。

### P2 — persistence record 与 TaskPlan domain model 未分离

snake_case `TaskPlanRevisionV1` 同时充当持久化 schema、validator 输入和公开 publish API 输入，缺少
独立 aggregate/value-object model 与显式 persistence conversion，违反 BACKEND.md 的 DTO、持久化
record 与领域对象分离约束。

### P2 — 缺少 TaskPlan 专属跨进程 publication/crash-recovery 验收

TaskPlan store 组合文件锁、CAS、immutable publication 与 atomic current replacement，但测试没有
独立进程/worker contender，也未覆盖进程在 immutable/current 两步之间退出后的恢复语义，不能证明
跨进程并发与崩溃边界。

### P2 — TaskPlan HTTP 错误缺少稳定 machine code

新端点只返回本地化 `error` 文案；未注册 root 与 TaskPlan 不存在同为 404，不可信 root 与不可信
canonical path 同为 403，机器调用方无法用稳定 `code` 区分失败语义，违反项目 REST 契约。

### P2 — Verify 报告 ledger digest 在本轮写入前已 stale

冻结副本内 `.pipeline-documents.json` 的 verification-report digest 指向上一版报告，而 tracked 报告已
变化。该项是治理登记缺口，不是实现安全缺陷；本轮报告写完后必须用官方 `tenon document record`
重新登记，不能手改 ledger。

## 处理决定

两项 Verify task 保持未勾选，`branch_status` 不设 handled，不请求 `verify-pass`。先用官方 CLI 登记
本报告与三轨结果，再请求精确 `verify-fail`、delegated acknowledge 并回到 Build；下一轮以 TDD
修复 P1 与三个实现/验证 P2，并用官方登记消除 ledger stale 后重新冻结和执行三轨。
