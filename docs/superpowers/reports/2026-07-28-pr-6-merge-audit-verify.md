# PR #6 合并审计第四次冻结验证报告

## 结论

PR #6 在第四次 Build 修复后，以
`f111bd09ad5e8181bbb70ed801772cf21709a570` 为不可变 `build_sha` 重新执行完整 Verify。
Reviewer、E2E、Dashboard 视觉/无障碍三条独立轨均已完成并通过；Codex CLI 在开始审查前被
账户用量门禁阻断，按 `tenon-verify` 的“第三轨异常，降级两轨”规则记录为显式降级，不伪报为
独立审查通过。其余强制轨道、OpenSpec 隔离应用、277 个冻结路径回读、GitHub exact-head
门禁与 repo-zero-output 均通过。

- 聚合：**PASS**
- Critical：0
- High：0
- Medium：0
- Low：0
- Reviewer：PASS
- E2E：PASS
- Codex CLI：DEGRADED（额度门禁，未开始审查）
- Dashboard 视觉/无障碍：PASS

本轮没有在 Verify 修改产品、测试、配置、正式生成物或 canonical capability spec。第三轮
High finding 已在冻结生产产物上真实关闭：composer 通过 `document.body` portal 覆盖完整视口，
点击抽屉外只关闭内层 composer，父 drawer、`change=` route 与非空草稿均保留；Workbench 的
portal switch-confirm 仍有完整 GSAP 入场动画且没有空 target warning。

## 冻结边界、GitHub 与零输出

- PR：`jefferysha/tenon#6`
- head / `build_sha`：
  `f111bd09ad5e8181bbb70ed801772cf21709a570`
- tree：`4204d4ee8fa3095597cbc015e1ae1d1ba5ee3eb7`
- base / merge-base：
  `2394ac71efc87193350d476266a3219c320bb5b1`
- GitHub CI run `30376840195`：PASS，冻结 head 的 `verify` check 成功。
- 最终 GitHub 状态：OPEN、非 Draft、MERGEABLE/CLEAN；0 reviews、0 comments、
  0 review threads；本地 HEAD、远端 PR head 和冻结 SHA 完全一致。
- `git diff -- packages` 与 cached packages diff 前后均为
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- canonical capability spec 前后均为
  `39829bf745e187ee03849579099216912a8e736cdde830a4dd34c48ac3ae8fe5`。
- E2E 轨记录的完整 tracked governance diff 前后均为
  `7a13bb8024bddab8c7deacbb76c16fa5d49b920720d091c2280d256602748f40`。
- E2E 隔离副本中的 Verify Change tree 前后均为
  `108501c7487348a98c53f997a7410599e8efa0ec2177e944c10b52e4b26574c4`。
- 共享仓库只保留进入 Verify 前已有的 4 个 tracked governance projections 与 3 个
  governance records；所有写产物命令均在无 hardlink 的 `/private/tmp` 隔离副本运行。

## 四轨结果

### Reviewer Agent

结论：**PASS；C0/H0/M0/L0**。

- 277/277 个冻结路径全部回读并映射到 `verification-evidence-composer`：
  docs 14、原归档 Change 118、审计 Change 113、canonical spec 1、
  source/tests 24、dist 7，unmatched 0。
- 逐行复核 `Dialog` body portal/栈顶 Escape 与 Tab、`ProgressDrawer` 的 nested modal
  ownership、外点/草稿保留回归、Workbench concrete portal DOM target、请求
  abort/stale response、host/token/content-type、root precheck/anchor 与 hostile array
  trust boundary。
- `npm run build` 成功；CLI、server、Dashboard HTML/JS/CSS 与冻结正式产物逐字节一致，
  dist diff 为 0。
- focused backend 295/295；focused Dashboard 152/152；focused API 33/33；
  full Web 56 files / 1012 tests；root 317 files / 5469 passed /
  5 credential-conditioned honest skips。
- architecture、comments、typecheck、hygiene、docs、identity、npx、document templates、
  default-workflow freshness、Change/capability strict validation 均通过。
- hooks 482/482；adapters 272/272；Skill inventory 通过；五组 dual oracle 差异为 0。
- hostile probe 证明 revoked proxy fail-closed、getter read 为 0、超长数组在
  `ownKeys`/index descriptor 前拒绝、错误数上限和 overflow 均符合规格。
- 完整证据：
  `/private/tmp/pr6-fourth-frozen-review.bEyP6T/REVIEWER-RESULT.md`。

### E2E Agent

结论：**PASS；C0/H0/M0/L0**。

- 两次串行 `npm run build` 产生的五个 tracked dist 产物与提交及彼此字节一致。
- kernel/server 295/295；focused Web fresh serial 145/145；
  full Web 56 files / 1012 tests；root 317 files / 5469 passed /
  5 credential-gated skips；typecheck 与 bundle 31/31 通过。
- 真实 HTTP API 15/15：host/token/content-type 顺序、缺失/空白/非字符串/未知 root、
  body/array 上限、双语言成功、确定性、whitespace/CRLF、root anchor、替换/撤销 root 与
  Change tree 无副作用。
- hostile built kernel 7/7：sparse/accessor/named/symbol/overridden method/
  mutated prototype/oversized 输入全部 fail-closed，getter read 为 0。
- 真实 Chromium 覆盖 governed Build 隐藏、ungoverned Verify 可见，以及 governed Verify
  的空态、增删、条件字段、本地/服务端校验、loading 单提交、复制成功/拒绝、网络失败重试、
  close/abort、晚到 success/failure、Tab/Shift+Tab、nested Escape、opener focus restore、
  ARIA、双语言/主题、1440/768/375 与 reduced-motion。
- body portal 是 `document.body` 直接子节点，三个视口 scrim 都等于 viewport；桌面外点
  只关 composer，父 drawer 与 `change=pr-6-merge-audit` 保留，重开仍有
  `DRAFT_MUST_SURVIVE`。
- Workbench 通过 authenticated API 创建临时 workflow；switch-confirm 为 body portal，
  backdrop/panel 最终 opacity 1、identity matrix；取消保留 dirty，确认丢弃后切到 default，
  console/network warning/error 为 0；临时 workflow 已删除。
- 首个 focused run 与 full/root 并发时出现一次 GSAP focus timing 断言；隔离串行 fresh
  重跑 145/145。首个 Workbench harness 缺少生产 `manifestPath`，只产生 `/api/config`
  404；修正为真实 manifest 后 composer 与 Workbench 全链路重跑成功。这两项均按 harness
  问题保留日志，不计作产品通过证据。
- 完整证据：
  `/private/tmp/tenon-pr6-verify4-QOBMV6/artifacts/E2E-REPORT.md`。

### Codex CLI

结论：**DEGRADED；未执行独立审查**。

只读 `codex review --base origin/main` 会话
`019fa988-660d-74c0-8020-325f62479f99` 在输出审查结果前被账户用量门禁终止，明确提示可在
`2026-08-04 11:13` 后重试。该进程 exit 1，没有修改共享仓库，也没有产生可计为 PASS 的
finding 清单。`tenon-verify` 明确规定 Codex 缺失或异常时第三轨跳过、Reviewer 与 E2E 固定靶
仍有效，并在报告注明“第三轨降级”；因此本轮依规使用 Reviewer、E2E 与独立视觉轨的完整结果，
不得把此 CLI 尝试描述为通过。

### Dashboard 视觉与无障碍

结论：**PASS；C0/H0/M0/L0**。

- 用户明确要求 Dashboard 纳入 `design-taste-frontend`；本轨没有使用普通 Dashboard
  排除项，参数为 `DESIGN_VARIANCE=3`、`MOTION_INTENSITY=2`、
  `VISUAL_DENSITY=7`。
- frozen `npm run test:web` 56 files / 1012 tests；typecheck:web、build:web、
  build:server 通过。served/local production bundle SHA 同为
  `007459db7c5fcf0007493a015557e569387131ff0035b87ffa1fbf5ed9deb96a`。
- 真实浏览器覆盖 1440/1024/390、light/dark、zh/en、全部 empty/loading/success/error/
  clipboard/network/stale 状态、Tab/Shift+Tab、双层 Escape、焦点恢复、
  `aria-invalid`/`aria-describedby`/live、AX tree 与 reduced-motion；三个宽度均无横向溢出。
- composer scrim 全 viewport；外点只关闭内层并保留 route/草稿。Workbench
  switch-confirm 在 390px 仍为 390×844 body portal；逐帧从 opacity 0 /
  scale `.96` / y=4 进入稳定态，触发区间无 GSAP target warning、console warning/error、
  runtime exception 或失败请求。
- 人工复核桌面 portal、结构化字段错误、390px 中文浅色与 Workbench confirm 截图，
  hierarchy、density、spacing、contrast、readability、noise、controls 与 motion 均无
  可操作 finding。
- 全 Web 输出保留冻结 diff 外既有 React `act(...)` 和 TaskDetail 测试态 GSAP warning；
  本次 affected suites 与生产干净重载均为应用 warning/error 0，因此不列 PR #6 finding。
- 完整证据：
  `/private/tmp/pr6-verify4-visual.KIciHm`。

## OpenSpec 隔离应用

- OpenSpec：1.6.0。
- 隔离根：`/private/tmp/pr6-verify4-openspec.0Ud7n7/repo`。
- audit Change `show --deltas-only`：PASS。
- audit Change strict validation：PASS。
- isolated archive/apply：PASS，应用 2 个 MODIFIED requirements。
- 应用后 `verification-evidence-composer` strict validation：PASS。
- 隔离 applied digest：
  `927a7d42955acca081d559b92dac862fb6a4c81d704ae302143387f16d523bfc`。
- 真实 capability spec 与 packages 指纹前后未变。

## 逐文件 capability 回读

`git diff --name-only 2394ac71...f111bd09` 共 277 个文件，以下互斥分组覆盖每个路径；
Reviewer 同时对 24 个 source/test 与 7 个 dist 路径逐行复核，未发现 unmatched 文件。

| 完整改动文件组 | 数量 | capability / evidence | 回读 |
| --- | ---: | --- | --- |
| `docs/**` | 14 | composer 研究、设计、ADR、计划与历轮验证报告 | ☑ |
| 原归档 `verification-evidence-composer` Change | 118 | 原 delta/applied spec、ledger、review、revision、transition provenance | ☑ |
| `openspec/changes/pr-6-merge-audit/**` | 113 | 审计 delta、返工、文档、review、revision、transition provenance | ☑ |
| canonical capability spec | 1 | `verification-evidence-composer` requirements/scenarios | ☑ |
| `packages/**/src/**` | 24 | kernel、server、API、Dashboard、shared Dialog、drawer、Workbench 与测试 | ☑ |
| `packages/**/dist/**` | 7 | CLI/server/Dashboard 正式生成物与旧 asset 删除 | ☑ |
| **合计** | **277** | `verification-evidence-composer`，无遗漏 | ☑ |

## Ship 准入与回滚

当前无已知 Critical/High/Medium/Low finding，冻结 head 可进入 exact-event `verify-pass`
review。Ship 仍必须作为唯一真实 OpenSpec 应用边界：幂等应用 2 个 MODIFIED requirements，
严格校验 canonical capability，记录 applied-spec、README/docs 与回滚决定，提交并等待新
exact-head GitHub checks 全绿。随后才可使用仓库既有 merge commit 方法合并 PR #6。

若 Ship 应用、最终 CI、base/head 身份、mergeability、review threads 或 main 漂移，必须停止
合并并修复/重新冻结；不得复用本报告绕过新差异。产品回滚仍可删除 formatter、route、client 和
UI 入口而无需 state/schema/data migration；集成回滚使用普通 revert，不改写 PR 历史或强推。
