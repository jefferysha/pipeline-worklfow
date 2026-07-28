# PR #6 合并审计验证报告（第二轮失败）

> Change：`pr-6-merge-audit`
> 冻结构建：`a08e5ed3a3fb58a59c3de6ff9b377aab8c7af8aa`
> 对比基线：`2394ac71efc87193350d476266a3219c320bb5b1`
> 结论：失败；取得精确 `verify-fail` receipt 后返回 Build 修复并重新冻结

## 结论

四轨、OpenSpec 隔离应用、GitHub exact-head CI 与 repo-zero-output 聚合为 **FAIL**：

- Critical：0
- High：0
- Medium：2 个产品问题，另有 1 个完整 workspace 环境/镜像门禁失败
- Low：1
- 真实 API：PASS
- 真实 Chromium 功能、视觉与无障碍：PASS

本轮不在 Verify 修改实现、测试或规格。Codex 与独立 Reviewer 均确认 kernel 的不可信数组边界
存在 Medium；Codex 另确认有效的非文档治理 Verify workflow 看不到 composer。完整 workspace
测试在两个隔离轨各出现一个与 composer 无关、但不能忽略的环境/并发失败，因此也没有完整
全绿证据。以上任一项都禁止进入 Ship 或合并。

## 冻结边界、CI 与零输出

- PR #6 head / `build_sha`：
  `a08e5ed3a3fb58a59c3de6ff9b377aab8c7af8aa`
- tree：`b9a8d723a857945cd702e71ed00a8f36faf94e35`
- base / merge-base：`2394ac71efc87193350d476266a3219c320bb5b1`
- GitHub product-head CI run `30363765437`：PASS，6m29s。
- GitHub final-governance-head CI run `30364374450`：PASS，7m25s。
- 冻结时 GitHub 为 OPEN、非 Draft、MERGEABLE/CLEAN；本报告的失败裁决优先，禁止合并。
- 页面身份：`Tenon Dashboard`；真实服务 `http://127.0.0.1:18977/`；
  served `index-C2cHWZ4f.js` 与冻结 dist 逐字节一致。
- 四轨前后 HEAD 均为冻结 SHA。
- `git diff -- packages` 前后均为
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- canonical capability spec 前后均为
  `39829bf745e187ee03849579099216912a8e736cdde830a4dd34c48ac3ae8fe5`。
- full tracked workspace diff 前后均为
  `3c46ab381814f8f8aa7a864b1163b720a86f4cac744f1b44240f420ebee85c5b`。
- 共享仓库仅保留进入 Verify 前已有的 4 个 tracked governance projection 与 3 个
  governance records；四轨未写入被冻结产品或主规格。

## 聚合发现

### M1：kernel 未安全快照不可信 `entries` 数组

`packages/kernel/src/verification/evidence-composer.ts` 只检查
`Array.isArray` 与 `length`，随后调用输入实例自己的 `flatMap`。独立 Reviewer 与 Codex 均在
隔离环境复现：

- `new Array(1)` 返回 `ok:true`、`entryCount:0`；
- accessor index 会在校验期间执行；
- 覆盖实例 `flatMap` 可把未经过 `entryFromUnknown` 的值送入渲染。

HTTP JSON 无法表达 getter 或稀疏洞，因此这不是远程 route exploit；但该函数是公开的 kernel
不可信输入边界，违反 1–12 条闭集 DTO 与“只从 canonical copy 纯生成”的规格，定为 Medium。

修复方向：用 property descriptor 安全地逐个快照 `0..length-1`；拒绝 sparse、accessor、
异常 prototype、额外 named/symbol 字段与实例方法覆盖；仅在可信新数组上使用显式循环，并补
全部回归。

### M2：有效的非文档治理 Verify workflow 看不到 composer

`packages/dashboard-app/src/shared/TaskDetail.tsx` 仅在
`change.documents?.governed` 为真时渲染整个 `TaskDocumentsSection`，而 composer slot 也被包在
其中。内置 `simple` workflow 有真实 `verify` step，但 snapshot 明确返回
`documents: { governed: false, ... }`；这类 Verify 用户永远看不到入口。

规格要求入口由 `phase=verify` 决定，并放在 Change detail 的 document evidence 区域；没有要求
workflow 必须启用 document ledger。修复方向：让 Verify composer slot 独立于文档治理 guard，
或提供独立的 Verify 容器；继续保证非 Verify phase 完全隐藏。

### M3（验证门禁）：完整 workspace suite 未获得单次全绿

E2E 隔离副本的 `npm test` 为 316/317 files、5465 passed、5 honest skips、1 failed。
失败位于未改动的 `packages/cli/src/afk-run.integration.test.ts` L1 report-only 场景：
sandcastle 镜像内 Tenon CLI dist/attestation 与冻结源码不匹配，返回 exit 95，期望
`automation: paused` 而实际仍为 `queued`。

Reviewer 的另一隔离副本也得到 316/317 files、5465 passed、5 skips、1 failed，但失败为未改动
`release-store.integration` 的临时 lock 目录在并发全量中提前移除；精确用例隔离重跑 1/1
通过。

两次失败均没有证据表明由 composer diff 引入，但完整门禁仍未全绿，不能豁免。下一轮应重建
与冻结 SHA 匹配的 sandcastle 镜像，并在避免并发验证互扰的条件下串行重跑完整 suite。

### L1：旧请求晚失败缺少组件回归

返工计划要求旧请求晚成功和晚失败都不得污染新会话。真实 Chromium 已验证两条行为均正确，
实现的 success/catch/finally 也有对称 request identity 与 aborted guard；但组件测试只覆盖
旧请求晚成功。补充“旧 promise 在新成功后 reject”的回归，并断言新 output、error、loading
与 draft 均不变。

## 四轨结果

### Reviewer Agent

结论：**FAIL；C0/H0/M1/L1**。

- 239 个冻结 diff 路径全部逐文件回读。
- `git diff --check`、secret scan、architecture、comments、Web typecheck：PASS。
- backend focused：2 files / 292 passed。
- Web focused：4 files / 81 passed。
- Web 全量：56 files / 1008 passed。
- bundle：31/31。
- 正式 build：PASS；5 个当前 tracked 生成物前后逐字节一致。
- `npm test`：316 files passed、1 failed；5465 passed、5 skipped、1 failed；精确失败用例
  隔离重跑 1/1 PASS。
- 证据根：`/private/tmp/pr6-reviewer-a08-Voj1Qj`。

### E2E Agent

结论：**FAIL；C0/H0/M1/L0**。产品 API/Chromium PASS，但完整 workspace gate 未绿。

- 隔离根：`/private/tmp/tenon-pr6-verify2-sq8kvw`。
- 正式 build：PASS；tracked dist 无差异。
- Web 全量：56 files / 1008 tests PASS。
- 真实 HTTP 13 个场景 PASS：Host→token→content-type、root 闭集、64KiB+、en/zh、
  确定性、title CRLF/Tab/首尾空白、anchor replacement。
- Change 树前后均为
  `54d5259e48b727ac5f515177fb45d8a465599ef1191c1b1e7bc3050e6c361d6a`。
- Chromium PASS：Build 隐藏/Verify 显示、空态、增删、字段互斥、本地/服务端验证、
  ARIA/首错 focus、loading/单请求、成功、复制成功/失败、断网重试、AbortSignal、旧成功/
  旧失败隔离、双向 Tab、嵌套 Escape、焦点归还、zh/en、light/dark、1440/768/375、
  reduced-motion；非预期 console/page/network 错误为 0。
- 未完成：axe 自动扫描、像素基线、第二次正式构建哈希及额外 static/OpenSpec/shell suites。

### Codex CLI

结论：**FAIL；C0/H0/M2/L0**。

只读 `codex exec review --base origin/main` 会话
`019fa8fb-be1c-7c23-bce7-76e4f2a457ee` 自行读取冻结 diff、实现、测试、规格与调用方，确认：

1. 非文档治理 Verify workflow 的入口被外层 guard 吞掉；
2. 公开 kernel validator 调用不可信数组实例方法，稀疏/覆盖数组可绕过 canonical validation。

Codex 审查进程 exit 0，未修改共享仓库。

### 视觉与无障碍

结论：**PASS；C0/H0/M0/L0**。

- 真实服务、冻结 asset、root、Change phase 身份一致。
- 完整覆盖 empty、增删、字段互斥、本地/真实 400、断网、loading、单请求、成功、复制、
  慢旧成功/失败取消与不污染、嵌套 dialog 双向 Tab/Escape/focus return。
- 1728、1024、390×844、375×667 无 document/dialog 横向溢出；移动端 footer 可达。
- zh/en、light/dark、reduced-motion 通过；浅色 input/secondary 对比度 15.03:1/7.36:1，
  暗色 15.28:1/9.56:1。
- 干净重载后 console warning/error/exception=0，unexpected network failure=0。
- 仓库没有 axe-core，本轨未临时安装；以真实浏览器语义、键盘、ARIA、样式和手工对比度完成。
- 13 张截图与证据：
  `/private/tmp/pr6-verify2-visual.fangKa`。

## OpenSpec 隔离应用

- OpenSpec：1.6.0。
- audit Change strict：PASS。
- canonical `verification-evidence-composer` strict：PASS。
- 隔离根：`/private/tmp/pr6-openspec-verify-a08e.ohEYZp`。
- archive/apply：PASS，应用 2 个 MODIFIED requirements。
- 隔离目标 capability strict：PASS。
- 隔离 applied digest：
  `927a7d42955acca081d559b92dac862fb6a4c81d704ae302143387f16d523bfc`。
- 真实主规格 digest 与 packages diff 前后未变。
- 全库 `openspec validate --all --strict` 如实为 14 pass / 12 个既有非目标 baseline fail；
  CLI 仍返回 0，因此不得表述成“全库 strict 全绿”。

## 逐文件 capability 回读

`git diff --name-only 2394ac71...a08e5ed3` 共 239 个文件，以下互斥分组覆盖全部路径：

| 完整改动文件组 | 数量 | capability / evidence | 回读 |
| --- | ---: | --- | --- |
| `docs/**` | 12 | composer 设计、ADR、计划、两轮失败与既有验证报告 | ☑ |
| 原归档 `verification-evidence-composer` Change | 118 | 原 delta/applied spec、ledger、review、revision、transition provenance | ☑ |
| `openspec/changes/pr-6-merge-audit/**` | 79 | 审计 delta、返工、文档、review、revision、transition provenance | ☑ |
| canonical capability spec | 1 | `verification-evidence-composer` 5 requirements / 13 scenarios | ☑ |
| `packages/**/src/**` | 22 | kernel、server、API、Dashboard、shared dialog 与测试 | ☑ |
| `packages/**/dist/**` | 7 | CLI/server/Dashboard 正式生成物与旧 asset 删除 | ☑ |
| **合计** | **239** | 无遗漏 | ☑ |

## 回退与下一轮

1. 登记本报告，取得 exact-event `verify-fail` review receipt，返回 Build。
2. 以 TDD 修复 M1、M2，并补 L1；不扩大到不相关重构。
3. 重建与新冻结 SHA 匹配的正式产物和 sandcastle 镜像，串行运行风险匹配的定向与全量门禁。
4. 独立 pre-Verify 审查达到 C0/H0/M0；不得遗留本轮已知 Low。
5. 非强制 push 新 exact head，等待全部 GitHub checks 成功。
6. 重新冻结，重新执行四轨、OpenSpec 隔离 apply、逐文件回读与 repo-zero-output。
7. 只有新一轮全部通过，才能进入 Ship、合并、main CI、Archive 与批量 release。
