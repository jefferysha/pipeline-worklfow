# PR #7 合并审计验证报告（第二轮失败）

> Change：`pr-7-merge-audit`
> 冻结构建：`563ded6aafe4597d21f15e7adf9300ac985ab041`
> 对比基线：`8f9c5fa2b5712b5f0422f61d9ecea32b0f3d41b9`
> 结论：失败；保留 PR，取得精确 `verify-fail` receipt 后返回 Build

## 结论

Reviewer、真实 E2E/API/browser、Codex CLI 与 Dashboard
`design-taste-frontend` 视觉/无障碍四轨均已结束。聚合结论为 **FAIL**：

- Critical：1（Verify 只读窗口内共享树发生瞬时写入，repo-zero 硬门失效）
- High：0
- Medium：0
- Low：1（production Chromium 父抽屉焦点恢复 1/2 失败）
- 冻结产品审查：除上述 Low 外无其他 C/H/M/L finding
- Codex CLI：DEGRADED（账户额度门禁，未产出独立 finding）

本轮不得进入 `verify-pass`。共享产品、canonical spec 与状态虽然已恢复到本轮起始指纹，
但 `tenon-verify` 要求从冻结到聚合的全过程零输出；恢复不能追认已污染的运行。另有真实
Chromium 复现的焦点恢复不稳定，按本次“没有任何问题”的交付要求也必须回 Build 修复。

## 冻结边界、CI 与路径覆盖

- PR #7 head / `build_sha`：
  `563ded6aafe4597d21f15e7adf9300ac985ab041`
- base / merge-base：
  `8f9c5fa2b5712b5f0422f61d9ecea32b0f3d41b9`
- 产品提交 CI run `30395329457`：PASS。
- 精确治理 head CI run `30395983747`：PASS，冻结后未改产品。
- 进入 Verify 前 GitHub 状态：OPEN、非 Draft、MERGEABLE/CLEAN；0 reviews、
  0 comments、0 review threads。
- `base...frozen` 共 334 个唯一路径，完整映射：
  - OpenSpec Change / governance：267
  - docs：12
  - canonical capability spec：1
  - production source：33
  - tests：11
  - generated dist：6
  - oracle / other：4
- 映射表：
  `/private/tmp/tenon-pr7-verify2.xxxO7w/file-capability-map.tsv`
  （SHA-256 `a41ad3740d5f6c4f3aa9d6fdf069aa8a541c6f83763f89a281d08fde59000603`）。

## C1：repo-zero 瞬时漂移使本轮冻结证据不可用

主轨为 OpenSpec archive/apply 创建了隔离副本，但首次命令遗漏进入隔离目录，在共享工作树执行：

```text
openspec archive pr-7-merge-audit --yes
```

该命令瞬时移动当前 Change 并修改 canonical capability spec。本轮起始指纹：

```text
head=563ded6aafe4597d21f15e7adf9300ac985ab041
product_diff=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
cached_diff=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
packages=6b78b8a4d85c57afdbd63ea73208b7dac5f0cb89f2939d4714201ae1f06a82bd
canonical_specs=08aef9037ae8b1053a6ed4b3a7ce98827289e0e3a5bbc234fcb9e370c25caf06
status=632a22319371c407f38e52e1d8c1bdca8f93f8be91bbc055af18c1bc03ef98e5
```

漂移时：

```text
product_diff=78cfca9486802958ff8b43d5595ffd6c89c834efd05ef91784bc5deb815d0bf4
packages=6b78b8a4d85c57afdbd63ea73208b7dac5f0cb89f2939d4714201ae1f06a82bd
canonical_specs=43ac1910774a5dc9a30f514fa56460a0053b4635a757ed54b7f9ed6e2db348d3
status=0253ecd806624b20627281034bc5f2b51e2fcbe3d2b172126e8cbda6936071ae
```

主轨随后把精确 archive 目录移回 active Change，并从冻结 HEAD 恢复 canonical spec。恢复后
所有上述指纹与起始值逐字节一致，Change 仍处于 Verify；事故前、中、后证据保存在：

`/private/tmp/tenon-pr7-verify2.xxxO7w/repo-zero-violation/`

恢复只防止继续污染，不会消除已发生的写入事实。按硬门禁，本轮必须失败并从新的冻结边界完整
重跑，不能复用本轮四轨作 `verify-pass`。

## L1：父抽屉 Escape 焦点恢复不稳定

冻结 production Dashboard 在真实 Chromium、`prefers-reduced-motion: reduce` 下，两次通过
Escape 关闭同一 `pr-7-merge-audit` 父抽屉：

- 第一次：抽屉 detached 并等待 500ms 后，焦点未回到
  `prg-cv-chg-pr-7-merge-audit`；
- 第二次：焦点正确恢复；
- Evidence 子对话框两次均稳定恢复到自身 opener。

结果记录为 `focusRestore.parentTrigger: [false, true]`。当前恢复逻辑位于
`packages/dashboard-app/src/progress/useProgressDrawer.ts` 的 effect cleanup，只在原
`triggerRef` 仍连接时聚焦；真实快照刷新可替换触发卡 DOM，使第一次恢复缺少稳定 fallback。

修复要求：

1. 先以红测覆盖“原 trigger 被同 key 新节点替换后关闭抽屉”的场景；
2. 保留原元素优先恢复，同时按 drawer key 查找当前连接的同一触发卡作为安全 fallback；
3. 避免任意选择相同文本元素或把焦点落到已断开的节点；
4. 单元测试与 production Chromium 至少连续两次关闭都必须恢复成功。

## OpenSpec 隔离应用结果

发现事故后，主轨使用显式子 shell 进入无 hardlink 的隔离副本，并重新运行：

```text
openspec show pr-7-merge-audit --json --deltas-only
openspec validate pr-7-merge-audit --strict
openspec archive pr-7-merge-audit --yes
openspec validate context-bundle-budget-preview --strict
```

结果：

- 1 个 `ADDED`、5 个完整 `MODIFIED`；
- archive/apply：`+1 added / ~5 modified / -0 removed`；
- applied capability strict validation：PASS；
- 6 个 Requirement 标题唯一；
- 正确隔离运行没有再改变共享产品/spec 指纹。

日志：
`/private/tmp/tenon-pr7-verify2.xxxO7w/openspec/isolated-run.log`。
该结果证明规格可应用，但不抵消本轮 repo-zero 失败。

## 四轨结果

### Reviewer Agent

结论：**FAIL；产品 C0/H0/M0/L0，证据完整性硬失败 1**。

- 334/334 个冻结路径全部审阅或结构化解析。
- root：320 files、5520 passed、14 honest environment skips；
  Web：59 files、1053 passed。
- backend/kernel/CLI 定向：383 passed、9 skipped；
  Dashboard 定向：117/117；oracle：16/16 + 5 fixtures；bundle：31/31。
- build、typecheck、architecture（639 production files、5 个既有 size-only exception）、
  comments、OpenSpec strict 与生成物比较均通过。
- 报告：
  `/private/tmp/tenon-pr7-verify2.xxxO7w/reviewer/report.md`
  （SHA-256 `fede4c90d57bab80fdd70ad105cefa50e6d0c6798c551f3c8c16db414b45604b`）。

### E2E / API / Browser

结论：**FAIL；C1/H0/M0/L1**。

- 真实 CLI → filesystem handoff：`context-bundle/v1`、8 inputs、
  `24120 / 120000` bytes，Change digest 前后不变。
- Darwin：345 pass / 9 Linux skip；production 501、Host 403、非法 Change 400、
  未注册 root 404。
- Linux Docker：353 pass / 1 Darwin skip；额外 Context Bundle verbose 26/26，
  覆盖 200/empty/409/413/422、root/change/symlink/swap/redaction。
- Web 专项：98/98。
- Production Chromium 覆盖 success、policy-empty、422、409/retry、Evidence 共存、
  Tab/Enter、主题、语言、390px 与 reduced-motion；唯一产品 finding 为 L1。
- 报告：
  `/private/tmp/tenon-pr7-verify2.xxxO7w/e2e/VERIFY-REPORT.md`
  （SHA-256 `18c8c1418058be6ebbd63abd9d1a7df93d398e65ad29a1ad689d31d7cb978c22`）。

### Codex CLI

结论：**DEGRADED；未执行独立审查**。

`codex review --base 8f9c5fa2b5712b5f0422f61d9ecea32b0f3d41b9` 创建只读会话
`019faa6e-cfc1-7502-b021-1b2229a1d0e8`，随后在产出 finding 前被账户额度门禁终止，
提示在 `2026-08-04 11:13` 后重试，exit 1。Reviewer、E2E 与视觉轨仍完整执行，因此按
`tenon-verify` 显式记录为 DEGRADED，不能伪报 PASS。

原始输出：
`/private/tmp/tenon-pr7-verify2.xxxO7w/codex/review-base.txt`
（SHA-256 `16d5f9b6021931cd8a8a1ec0fb4934083b437eba83e7d7f0fea5402de7fb10ef`）。

### Dashboard 视觉与无障碍

结论：**FAIL（repo-zero）；UI 产品 C0/H0/M0/L0**。

- 实际加载并执行 `web-design-guidelines` + `design-taste-frontend`；
  参数为 `DESIGN_VARIANCE=3`、`MOTION_INTENSITY=2`、`VISUAL_DENSITY=7`。
- 15 张 fresh 截图覆盖 success/loading/idle/policy-empty/422/409/501/network/retry、
  Verify Evidence 共存、light/dark、zh/en、1440/1024/768/390。
- 默认七阶段与动作全英文；custom 作者标签保留。
- 1024/768/390 无 body 或 Context 横向溢出；390 下 Context 为 `308/308`。
- 深色标题约 `17.72:1`，主按钮约 `6.95:1`。
- Tab/Shift+Tab、Evidence Escape/focus、ARIA 与 reduced-motion 通过。
- root-B identity 尾端因 QA helper 的单项目 fixture 硬编码停止，明确作为 harness 覆盖缺口，
  未伪报通过，也未发现对应产品错误。
- 报告：
  `/private/tmp/tenon-pr7-verify2.xxxO7w/visual/dashboard-visual-fourth-track.md`
  （SHA-256 `371123be99f0b68e827f110d5ebf729708746cfa01f529ece576f35a41980402`）。

视觉轨单次焦点路径通过，不推翻 E2E 轨两次关闭中的 1 次真实失败；聚合按发现保守取 L1。

## 回退与下一轮

1. 登记本报告，取得 exact-event `verify-fail` delegated receipt，返回 Build。
2. 以 TDD 修复父抽屉在原 trigger 被快照替换后的稳定焦点恢复。
3. 用带显式 `cd`、`pwd` 与共享指纹断言的 wrapper 执行任何 archive/apply 演练；
   禁止从共享根直接运行可写 OpenSpec 命令。
4. 重跑前后端全量、生成物、架构、安全、hooks、adapters、bundle、oracle、OpenSpec、
   Dashboard `design-taste-frontend`、真实 production Chromium 与独立 pre-Verify review。
5. 普通提交、推送，取得新 exact-head CI 后冻结新的 `build_sha`。
6. 下一轮重新执行四轨、334+ 全路径映射、Linux/Darwin/浏览器、GitHub 与 repo-zero；
   不得只复查焦点修复。
7. 只有新一轮 C/H/M/L 全为 0 且所有门禁通过，才能进入 Ship、合并、main CI 与 Archive。
