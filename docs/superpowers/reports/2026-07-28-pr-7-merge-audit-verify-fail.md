# PR #7 合并审计验证报告（第一轮失败）

> Change：`pr-7-merge-audit`
> 冻结构建：`92f2bde9b1f435e8181600eb4f4019dcf852a053`
> 对比基线：`8f9c5fa2b5712b5f0422f61d9ecea32b0f3d41b9`
> 结论：失败；取得精确 `verify-fail` receipt 后返回 Build，并以
> `requirements-changed` 修正规格应用语义

## 结论

Reviewer、E2E/API/browser、Codex CLI 与 Dashboard 视觉/无障碍四轨均已结束；OpenSpec
隔离应用、292 个冻结路径回读、GitHub exact-head 门禁与 repo-zero-output 也已完成。
聚合结论为 **FAIL**：

- Critical：0
- High：0
- Medium：1
- Low：2 个需修复项，另保留 1 个并发测试可靠性观察
- Reviewer：FAIL（文档新鲜度 Low）
- E2E/API/browser：FAIL（OpenSpec apply Medium）
- Codex CLI：DEGRADED（账户额度门禁，未开始独立审查）
- Dashboard 视觉/无障碍：FAIL（英文默认阶段标签 Low）

本轮没有在 Verify 修改产品源码、测试、配置、正式生成物或 canonical capability spec。真实
Linux/Darwin API、安全负面路径、CLI、Context Bundle、Verify Evidence 共存与浏览器矩阵均通过；
但是 audit delta 将已存在的 Requirement 再声明为 `ADDED`，隔离 archive/apply 明确失败，Ship
无法生成可信 applied-spec。另有两项与本次交付直接相关的可修 Low：测试现实文档计数/行数判断
漂移，以及英文 Progress/Verify 界面嵌入中文默认阶段标签。按本次“没有任何问题”的交付要求，
三项都必须回 Build 修复，禁止进入 Ship 或合并。

## 冻结边界、CI 与零输出

- PR #7 head / `build_sha`：
  `92f2bde9b1f435e8181600eb4f4019dcf852a053`
- tree：`7045a57d8b09b7559f37e8c9ce5078fce04abbc2`
- base / merge-base：`8f9c5fa2b5712b5f0422f61d9ecea32b0f3d41b9`
- GitHub CI run `30389618335`：PASS；冻结 head 的 `verify` check 成功。
- GitHub 状态：OPEN、非 Draft、MERGEABLE/CLEAN；0 reviews、0 comments、
  0 review threads。本报告失败裁决优先，禁止合并。
- shared status 前后：
  `1e2d80d61cd9a95343c3f4ef762ca8a8c514812e569b9f67ce00f7495ad08805`。
- tracked worktree diff 前后：
  `d3be80066f6eeb6512760980c895fef1deda9c68eec6efa41f2004ba63b3f248`。
- cached diff 前后：
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- tracked packages 前后：
  `1e143d1cc28fc74dda7bcd91eb7877bfdb26f5b3c9464a811df1111c49729f49`。
- canonical specs 前后：
  `08aef9037ae8b1053a6ed4b3a7ce98827289e0e3a5bbc234fcb9e370c25caf06`。
- 共享仓库只保留进入 Verify 前已有的 canonical transition、projection、revision 与 read
  receipts；各轨的 build、测试、日志、截图、trace、OpenSpec 演练均位于无 hardlink 的
  `/private/tmp/tenon-pr7-verify.gvUofR` 隔离目录。

E2E 轨额外试算过包含 925 个 ignored build/test artifact 的 broad packages hash，但没有保存
逐文件前置 manifest，不能据此反推路径变化；正式 tracked packages、diff、spec 与状态指纹均
精确稳定，因此不把这个探索值伪报为 repo-zero 失败或通过证据。

## 聚合发现

### M1：audit delta 使用重复 `ADDED` Requirement，隔离应用失败

真实命令：

```text
openspec validate pr-7-merge-audit --strict
openspec archive pr-7-merge-audit --yes
```

第一条通过；第二条在全新 `git clone --no-local --no-hardlinks` 中 exit 1：

```text
context-bundle-budget-preview ADDED failed for header
"### Requirement: CLI 与预览 SHALL 复用同一 ledger-bound 编译服务" - already exists
Aborted. No files were changed.
```

原因是 `openspec/specs/context-bundle-budget-preview/spec.md` 已随原 PR 的归档证据存在，而
`openspec/changes/pr-7-merge-audit/specs/context-bundle-budget-preview/spec.md` 又把同名
Requirement 放在 `## ADDED Requirements`。strict 只验证 delta 结构，不能证明它可应用。
隔离主规格 digest 在失败前后保持 `08aef903...`，真实工作树没有被修改。

修复必须回 Spec：用现有 canonical Requirement 的精确标题生成完整 `MODIFIED Requirements`，
只把真正新增的“Context Bundle preview 与 Verify evidence 共存”声明为 `ADDED`；同时保留
canonical 既有场景，加入本轮已实现的 transition anchor、closed record、fd-relative 可信读取、
资源边界、snapshot barrier、身份竞态与双工具共存语义。修订后必须在隔离副本 archive/apply
成功，且应用后 capability strict validation 通过。

### L1：测试现实与架构行数说明已经漂移

- `docs/TEST-REALITY.md:61` 记录 `ContextBundlePreview.test.tsx` 15 例；冻结文件和真实运行均为
  16 例。
- `docs/superpowers/specs/2026-07-28-pr-7-merge-audit-design.md:131` 记录
  `contextBundleTrustedReader.ts` 298 行且低于 300 行建议线；冻结文件实际为 323 行。
  `check:architecture` 仍通过，因为 storage adapter 是超过 300 行建议拆分、超过 500 行才必须
  拆分。文档必须改为准确计数，并说明为何完整信任边界仍保持单文件凝聚。

### L2：英文默认 Workflow 动作句嵌入中文阶段标签

英文 Dashboard 的壳、Context Bundle 与 Verify Evidence 文案已本地化，但 default workflow 的
`labelByStep` 仍优先返回中文模板标签，真实页面出现 `Approve into 交付`、`↩ 实现`、
`05 · 验证`。自定义 workflow 标签应保留作者语言；default 七阶段属于产品内建词汇，在英文界面
必须使用 `phases.*` 英文翻译。该问题出现在本次强制验收的 Progress/Verify 抽屉内，按用户明确
要求不得作为可忽略 Low 留存。

### 测试可靠性观察：并发 Web focus 时序不稳定

默认并发 `test:web` 在 Reviewer 两次运行与 E2E 全量运行中各出现一个时序失败，涉及
`ProgressView` close 后 focus restore 或 `CreateChangeDialog`；精确 focused 重跑均通过，
单 worker 完整 Web 59 files / 1052 tests 通过，真实 Chromium 的 Escape/focus restore 也通过。
本轮没有证据证明是确定性产品回归，但下一 Build 必须保留首次失败日志，修复上述三项后重跑
默认与串行 Web；若默认门再次稳定失败，必须进一步修复而不是用串行结果覆盖。

## 四轨结果

### Reviewer Agent

结论：**FAIL；C0/H0/M0/L1**。

- 292/292 个冻结路径全部回读：governance/archive 231、docs 11、main spec 1、
  production source 29、tests 10、dist 6、oracle 4。
- transition head anchor、64 revision / 8 MiB legacy bound、closed TransitionRecord；
  root/change/ledger/source fd-relative reader、资源上限、错误脱敏、snapshot barrier；
  CLI positive safe integer；Dashboard identity abort/stale response 与 Evidence 共存均无
  C/H/M finding。
- targeted kernel/server/CLI：383 pass / 9 Darwin 条件 skip；targeted Web：40/40；
  root：5520 pass / 14 honest skip；serial Web：1052/1052。
- build、docs、typecheck、architecture 639、comments、bundle 31/31、oracle 0 differences、
  oracle harness 16/16、OpenSpec strict 均通过。
- 证据：`/private/tmp/tenon-pr7-verify.gvUofR/reviewer/report.md`。

### E2E / API / Browser

结论：**FAIL；C0/H0/M1/L1**。

- target backend 317 pass / 9 skip；Web 52/52；CLI 49/49；root 5520 pass /
  14 honest skip。
- 真实 CLI → filesystem handoff 返回 `context-bundle/v1`、8 inputs、
  `16914 / 120000` bytes，Change digest 前后不变。
- Linux API 26 项覆盖 200 success/policy-empty/retry、422、409、413、Host/root/change、
  canonical/ledger/source、symlink swap 与响应脱敏。
- Darwin 返回安全 501；token 401、Host 403、非法请求 400、未注册 root 404 均通过。
- 真实 production Chromium 覆盖正确标题/root/Change、Verify 两工具共存、成功/空态/422/
  resubmit、Evidence 草稿、Enter/Escape/focus、light 1440、dark English 390 与
  reduced-motion。
- OpenSpec show/strict 通过，但 isolated archive/apply 因 M1 失败。
- 证据：
  `/private/tmp/tenon-pr7-verify.gvUofR/e2e/evidence/VERIFY-REPORT.md`。

### Codex CLI

结论：**DEGRADED；未执行独立审查**。

只读 ephemeral 会话 `019faa1d-9b6e-7c50-a814-70927b91c6c6` 在输出任何 review finding 前被
账户额度门禁终止，明确提示在 `2026-08-04 11:13` 后重试。进程 exit 1，没有修改共享仓库。
`tenon-verify` 允许第三轨异常时显式降级，但不得把它写成 PASS；本轮 Reviewer、E2E 与视觉轨
仍完整执行。原始输出：
`/private/tmp/tenon-pr7-verify.gvUofR/codex/review.txt`。

### Dashboard 视觉与无障碍

结论：**FAIL；C0/H0/M0/L1**。

- 按用户要求实际加载 `web-design-guidelines` + `design-taste-frontend`，参数为
  `DESIGN_VARIANCE=3`、`MOTION_INTENSITY=2`、`VISUAL_DENSITY=7`。
- 真实 production Dashboard 覆盖 idle/loading/success/policy-empty/422/409/501/network/
  retry；root/change/phase/target/budget 切换产生 4 次 abort，旧结果均未覆盖新身份。
- Context Bundle 与 Verify Evidence 共存；body portal、Tab/Shift+Tab、Enter、Escape、
  focus-visible/restore、ARIA/live、reduced-motion 均通过。
- light/dark、zh/en、1440/1024/768/390 均无横向溢出；最终干净标签页 console
  warn/error 0、network failure 0。
- 唯一 finding 为 L2；证据：
  `/private/tmp/tenon-pr7-verify.gvUofR/visual/dashboard-visual-fourth-track.md`。

## 逐文件 capability 回读

`git diff --name-only 8f9c5fa2...92f2bde9` 共 292 个路径，以下互斥分组覆盖全部：

| 完整改动文件组 | 数量 | capability / evidence | 回读 |
| --- | ---: | --- | --- |
| 原归档 Change 与 audit governance | 231 | 原 PR 与本 Change 的 ledger/revision/transition/spec evidence | ☑ |
| `docs/**` | 11 | contract、test reality、设计、ADR、计划与 review | ☑ |
| canonical capability spec | 1 | `context-bundle-budget-preview` | ☑ |
| production source | 29 | kernel、CLI、server、Dashboard | ☑ |
| tests | 10 | kernel、CLI、server、Dashboard | ☑ |
| generated dist | 6 | CLI/server/Dashboard 正式产物 | ☑ |
| oracle | 4 | anchor validator、harness、runner、stub | ☑ |
| **合计** | **292** | 无遗漏 | ☑ |

## 回退与下一轮

1. 登记本报告，取得 exact-event `verify-fail` delegated receipt，返回 Build。
2. 以 `requirements-changed` 回 Spec，修正 delta 的 MODIFIED/ADDED 应用语义、测试现实计数、
   323 行 adapter 的凝聚性说明，并明确 default phase label 的 i18n 约束。
3. 回 Build 先写红测复现英文界面混合阶段标签，再做最小实现；自定义 workflow 标签不得被翻译。
4. 隔离 archive/apply 必须成功，应用后的 capability strict validation 必须通过。
5. 重跑 focused/default/serial Web、root、build、docs、architecture、安全、oracle、生成物与
   `design-taste-frontend` 复审；任何再次出现的确定性 focus 失败必须修复。
6. 完成独立 pre-Verify review、普通 push 与新 exact-head CI 后冻结新 SHA。
7. 下一轮重新全量执行四轨、OpenSpec 隔离 apply、292+ 路径回读与 repo-zero；不得只复查本轮
   M1/L1/L2。
8. 只有新一轮 C/H/M/L 均为 0 且全部门禁通过，才能进入 Ship、合并、main CI 与 Archive。
