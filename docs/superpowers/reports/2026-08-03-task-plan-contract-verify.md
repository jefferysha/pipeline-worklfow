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
