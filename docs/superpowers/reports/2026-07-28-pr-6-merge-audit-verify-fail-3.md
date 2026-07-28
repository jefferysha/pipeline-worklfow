# PR #6 合并审计验证报告（第三轮失败）

> Change：`pr-6-merge-audit`
> 冻结构建：`e980efb030f46755bba777d58697d5457acd92bd`
> 对比基线：`2394ac71efc87193350d476266a3219c320bb5b1`
> 结论：失败；取得精确 `verify-fail` receipt 后返回 Build 修复并重新冻结

## 结论

Reviewer、E2E、Codex CLI、视觉/无障碍四轨均已完整结束；OpenSpec 隔离应用、260 个冻结
路径回读、GitHub exact-head 门禁和 repo-zero-output 也已复核。聚合结论为 **FAIL**：

- Critical：0
- High：1
- Medium：0
- Low：0
- Reviewer：PASS
- E2E：PASS
- Codex CLI：FAIL（P2，视觉轨真实复现后聚合为 High）
- 视觉/无障碍：FAIL（High 1）

本轮没有在 Verify 修改实现、测试、规格或生成物。真实浏览器确认 composer 被渲染在带
`transform` 的抽屉 `<aside>` 内，导致其 `fixed inset-0` modal scrim 只覆盖 559px 宽抽屉。
用户在 composer 中保留非空草稿后点击抽屉外仍可见的父 scrim，会同时关闭子 composer 和父
详情，清除 URL 中的 `change=`，再次打开时草稿已丢失。该问题违反顶层 modal/backdrop 语义，
造成无提示的未保存数据丢失，禁止进入 Ship 或合并。

## 冻结边界、CI 与零输出

- PR #6 head / `build_sha`：
  `e980efb030f46755bba777d58697d5457acd92bd`
- tree：`e4c95189a0b30c777cff9c1541d420b4ed962f02`
- base / merge-base：`2394ac71efc87193350d476266a3219c320bb5b1`
- GitHub CI run `30370627401`：PASS，冻结 head 的 `verify` check 成功。
- 最终 GitHub 状态：OPEN、非 Draft、MERGEABLE/CLEAN、0 reviews、0 comments、
  0 review threads；本报告的失败裁决优先，禁止合并。
- `git diff -- packages` 与 cached diff 前后均为
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- canonical capability spec 前后均为
  `39829bf745e187ee03849579099216912a8e736cdde830a4dd34c48ac3ae8fe5`。
- full tracked workspace diff 前后均为
  `b920e0b3f685926975f5d024c19165b5c5c7d77c3539c3fd69b4a5480822e144`。
- 共享仓库只保留进入 Verify 前已有的 4 个 tracked governance projections 与 3 个
  governance records；四轨未写被冻结产品、生成物、canonical spec 或 Docker tag。

## 聚合发现

### H1：嵌套 composer modal 被 transformed drawer 限制，外部点击丢失草稿

源码锚点：

- `packages/dashboard-app/src/progress/ProgressDrawer.tsx:30-38`：父级全视口 scrim 与带
  `data-anim="prg-drawer"` 的抽屉 `<aside>`；
- `packages/dashboard-app/src/progress/ProgressDrawer.tsx:48-55`：composer 作为抽屉后代；
- `packages/dashboard-app/src/shared/Dialog.tsx:158-164`：composer 使用后代
  `fixed inset-0` scrim。

桌面真实运行时，抽屉 computed transform 为 `matrix(1, 0, 0, 1, 0, 0)`，抽屉矩形为
`x=880..1440`；内层 `fixed inset-0` scrim 实际仅为 `x=881..1440`，而非整个 viewport。
视觉轨在 composer 内输入 `必须保留的草稿` / `DRAFT_MUST_SURVIVE` 后，以真实用户点击
`(500, 450)`：

1. 点击命中外层 `prg9-scrim`；
2. composer 与父详情同时关闭；
3. URL 的 `change=` 被移除；
4. 重开 composer 后条目数为 0，草稿不存在。

这不是理论风险：Codex 首先从 CSS containing-block 规则识别 P2，随后视觉轨在冻结产物上
稳定复现了实际数据丢失，因此按用户影响聚合为 High。

修复方向：将 composer dialog 通过 body-level portal 渲染到 transformed drawer 外，并为父子
modal 明确 topmost ownership；或在 composer 打开时阻止父 scrim 关闭详情。必须新增真实回归，
覆盖非空草稿、抽屉外点击、父详情保持打开、子 dialog 行为和草稿保留。

## 四轨结果

### Reviewer Agent

结论：**PASS；C0/H0/M0/L0**。

- 260 个冻结路径全部回读；docs 13、原归档 Change 118、审计 Change 99、
  canonical spec 1、source/tests 22、dist 7。
- full repo：317/317 files，5469 passed，5 个契约内 honest-skip。
- Web：56/56 files、1010/1010；focused Web 83/83；server 280/280；kernel 15/15。
- hooks 482/482、adapters 272/272、bundle 31/31、migration CAS 13/13。
- 构建与正式生成物逐字节复现；hostile Proxy、100,000 长度提前限流、abort/stale、
  whitespace/CRLF、ARIA 等专项均通过。
- 证据：`/private/tmp/pr6-third-frozen-review.bctZEX/artifacts/logs`。

### E2E Agent

结论：**PASS；C0/H0/M0/L0**。

- API 15/15；hostile kernel 7/7；kernel 15/15；server 280/280；
  affected Dashboard 84/84；full Dashboard 1010/1010；bundle 31/31。
- 双次正式 build 逐字节一致，tracked dist 零差异。
- 真实 Chromium 覆盖受管/非受管 Verify、validation、loading、复制、失败重试、
  stale success/failure、真实 abort、焦点 trap、Escape、ARIA、双语言/主题、三档响应式和
  reduced-motion；非预期 console/page/network 事件为 0。
- 本轨的既定 E2E 没有包含“子 modal 打开时点击抽屉外父 scrim”的场景，因此通过结果不覆盖 H1。
- 证据：`/private/tmp/tenon-pr6-verify3-A8Ml6N/artifacts/E2E-REPORT.md`。

### Codex CLI

结论：**FAIL；P2 1 项**。

只读 `codex exec review --base origin/main` 会话
`019fa941-beeb-7511-a1d9-52d6d11b20ef` 识别 transformed drawer 会成为 fixed modal
containing block，抽屉外父 scrim 仍可关闭整个详情并丢失 composer 上下文与草稿。进程 exit 0，
未修改共享仓库。其尝试在只读 sandbox 运行 Vitest 时因 Vite 临时配置写入 `EPERM` 未执行；
完整测试证据由 Reviewer/E2E 隔离轨提供，不把该尝试表述为通过。

### 视觉与无障碍

结论：**FAIL；C0/H1/M0/L0**。

- 在冻结产物上真实复现 H1，截图：
  `/private/tmp/pr6-verify3-visual.kcIHJW/12-transformed-aside-scrim-before-click.png` 与
  `/private/tmp/pr6-verify3-visual.kcIHJW/13-outside-aside-click-parent-closed.png`。
- 其余 empty/loading/success/field validation/server 400/network/copy、stale abort/reopen、
  nested Escape/Tab/focus、zh/en、light/dark、1440/1024/390、reduced-motion、AX tree
  与 overflow 检查通过。
- `npm run test:web`：56 files / 1010 tests；focused 5/5；typecheck PASS。
- served JS 与冻结 dist 一致；共享前端 diff 和状态树前后不变。
- 证据根：`/private/tmp/pr6-verify3-visual.kcIHJW`。

## OpenSpec 隔离应用

- OpenSpec：1.6.0。
- 隔离根：`/private/tmp/pr6-openspec-verify-e980.xtfeN0`。
- audit Change show/delta strict：PASS。
- archive/apply：PASS，应用 2 个 MODIFIED requirements。
- 隔离目标 capability strict：PASS。
- 隔离 applied digest：
  `927a7d42955acca081d559b92dac862fb6a4c81d704ae302143387f16d523bfc`。
- 首次隔离尝试误用不存在的 repo-local binary，所有命令均以
  `no such file or directory` 失败，不计作证据；随后使用 `/opt/homebrew/bin/openspec`
  完整重跑并通过。
- 真实主规格 digest 与 packages diff 前后未变。

## 逐文件 capability 回读

`git diff --name-only 2394ac71...e980efb` 共 260 个文件，以下互斥分组覆盖全部路径：

| 完整改动文件组 | 数量 | capability / evidence | 回读 |
| --- | ---: | --- | --- |
| `docs/**` | 13 | composer 设计、ADR、计划、历轮验证报告 | ☑ |
| 原归档 `verification-evidence-composer` Change | 118 | 原 delta/applied spec、ledger、review、revision、transition provenance | ☑ |
| `openspec/changes/pr-6-merge-audit/**` | 99 | 审计 delta、返工、文档、review、revision、transition provenance | ☑ |
| canonical capability spec | 1 | `verification-evidence-composer` requirements/scenarios | ☑ |
| `packages/**/src/**` | 22 | kernel、server、API、Dashboard、shared dialog 与测试 | ☑ |
| `packages/**/dist/**` | 7 | CLI/server/Dashboard 正式生成物与旧 asset 删除 | ☑ |
| **合计** | **260** | 无遗漏 | ☑ |

## 回退与下一轮

1. 登记本报告，取得 exact-event `verify-fail` delegated receipt，返回 Build。
2. 先以失败回归锁定：composer 有非空草稿时点击抽屉外区域不得关闭父详情或丢失草稿。
3. 用 body-level portal 或等价的明确 modal ownership 做最小修复，同时保持 Escape、focus trap、
   opener focus restore、移动端布局与既有受管/非受管 Verify 语义。
4. 重建正式产物，串行重跑 focused/full tests、build、真实浏览器和独立 pre-Verify review。
5. 非强制 push 新 exact head，等待全部 GitHub checks 成功。
6. 重新冻结后再次完整执行四轨、OpenSpec 隔离 apply、260+ 新路径回读与 repo-zero-output；
   不得只复查 H1。
7. 只有新一轮全部通过，才能进入 Ship、合并、main CI、Archive 与批量 release。
