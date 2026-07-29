# Trace Timeline 验证报告

## 结论

第一轮冻结基线 `3270811245b32dc92d01393e2bc36c1749208478` 验证结论为 **FAIL**：
OpenSpec strict 与 absolute-form request target 隐私边界存在 Medium 阻断，均已修复。

第二轮冻结基线 `dbed720a2ea8affd0d927388a60fbf05057258f5` 验证结论仍为 **FAIL**。
Reviewer 与 API/E2E 通过，OpenSpec 隔离应用演练通过，但真实浏览器视觉轨发现筛选按钮在键盘
聚焦时没有可见焦点环（P2 Important）。持续自主模式按保守策略再次选择修复，不接受偏差。

第三轮冻结基线 `c0060ba02ff5a7dc76b1ff0d53f6c06c9eecff93` 的最终验证结论为 **PASS**。
完整 reviewer、API/E2E、真实浏览器/视觉与 OpenSpec 隔离应用演练均通过，Critical/High/Medium
findings 为 0。Codex CLI 因本机运行时损坏未返回最终摘要，按降级而非绿色记录；独立 reviewer 与
E2E 轨未降级。

## 冻结基线与隔离

- base：`origin/main` / `4c242b928b61285561f9cdbc63617db899a18a12`
- build SHA：`3270811245b32dc92d01393e2bc36c1749208478`
- reviewer tree：`8bdbe83cbc96cd1706aba3a3010b230ed441da91`
- reviewer diff fingerprint 前后均为
  `cb330b14923e2c77a15d748cb2b6d5c199bd7489a3ed089db3acfe3a5605f47f`
- API E2E 真实仓库 fingerprint 前后均为
  `907fcbfec4dcb2f3a8186126e5bcc8e672da62d788e6b2b2833370c9526c9759`
- 所有 Verify 测试、浏览器输出与 OpenSpec apply 演练均在仓库外隔离副本执行；真实仓库只写本报告
  与 Tenon canonical 治理证据。

## 四轨聚合

### Reviewer

- 结论：FAIL。
- Critical/High：0；Medium：1。
- `openspec/changes/trace-timeline/specs/trace-timeline/spec.md` 六个 Requirement 只在标题包含
  SHALL，正文首段只有中文“必须”。`openspec validate trace-timeline --strict` exit 1，六条均报
  `must contain SHALL or MUST in the requirement body, not only in the header`。
- 实现面覆盖 Store 尾读、安全路径、metadata allowlist、usage/outcome、HTTP 语义、旧 API 兼容、
  Dashboard 状态/i18n/键盘与生成 bundle，除上述规格格式外无额外中高风险 finding。

### API / E2E

- 隔离副本：`/tmp/tenon-trace-verify.4CVQLQ`
- `npm ci`：exit 0；报告既有 7 项 audit 告警（5 moderate、1 high、1 critical），未执行自动修复。
- `npx tsc -b packages/kernel packages/channel packages/tap packages/automation packages/server`：exit 0。
- 仓外真实 HTTP + JSONL E2E：1/1 passed，exit 0。
- `npx vitest run packages/tap/src/trace-store.test.ts packages/tap/src/security.test.ts packages/server/src/traces.test.ts --reporter=verbose`：
  41/41 passed，exit 0。
- 覆盖 200 success、已知空 200、malformed partial、symlink generic 500、usage、query/header/prompt/
  response/upstream 哨兵不进入响应，外部 symlink sentinel 未改变。
- 首次一次性测试放在副本根目录不匹配 Vitest include，exit 1 / `No test files found`；移到副本
  `packages/server/src` 后通过。该失败不是产品行为失败。

### Browser / Visual

- 隔离副本：`/tmp/tenon-trace-browser-VMGtMQ`
- 真实服务：`http://127.0.0.1:19876`；页面标题 `Tenon Dashboard`，Machine H1
  `机器就绪与风险`。
- Chromium headless，1440×1100 与 390×844。
- success/loading/empty/partial/error→retry、Enter/Space 筛选、Escape 焦点恢复、中英文窄屏、
  `scrollWidth === clientWidth` 全部通过；0 个非预期 page error。
- P3：英文单数显示 `1 records`；中文仍混用 raw session status 与 `cached/stream events`。
  不作为当前 FAIL 主因，但回 Build 一并修复。

### Codex CLI

- 完整 2.2 MiB diff 超过 Codex 1 MiB 输入上限，首次 exit 1；随后改审 source/spec diff。
- 源代码轨通过 66/66 web、`typecheck:web`、`check:architecture`，server 监听测试在该子沙箱因
  `listen EPERM 127.0.0.1` 无法运行；独立 E2E 轨已在允许监听的隔离副本补齐 41/41。
- Codex 进程受本机损坏的 `logs_2.sqlite` 与旧 model-cache schema 持续告警影响，未在合理时间内
  返回最终摘要，已中止并按降级记录。
- 但该轨实际构造 `request.path =
  "https://user:secret@upstream.example/v1/messages?api_key=hidden"`，现 projector 输出
  `"https://user:secret@upstream.example/v1/messages"`。这违反“upstream URL 不进入响应”的
  metadata-only 边界，列为 Medium，需把 absolute-form target 归一化为 pathname 并补回归测试。

## Build 阶段既有全量结果

- `npm test -- --reporter=dot`：320 files passed；5533 passed、14 skipped / 5547。
- `npm run test:web`：59 files、1068 tests passed。
- `npm run typecheck:web`：pass。
- `npm run build`：pass；仅既有 Vite chunk size warning。
- `npm run check:architecture`：pass，641 production files；5 size-only exceptions。
- repository hygiene、comments、docs、interaction contract：pass。
- hooks：482 passed、0 failed。
- oracle：0 处不一致。
- 外部凭证边界：未设置 `TENON_REQUIRE_REAL_CODEX=1`，且缺少
  `CLAUDE_CODE_OAUTH_TOKEN`；这些是外部 secret 路径未运行，不是代码失败。

## 逐文件规格回读

冻结提交的交付文件逐项按以下映射回读：

| 文件/精确集合 | capability / 规范 | 结果 |
| --- | --- | --- |
| `packages/tap/src/trace-store.ts`、`trace-store.test.ts` | trace-timeline / bounded window | 已比对 |
| `packages/server/src/traces.ts`、`traces.test.ts`、`serverGetTraceRoutes.ts` | trace-timeline / metadata-only API | 已比对；absolute-form finding |
| `packages/server/src/server.ts`、`serverGetRoutes.ts`、`main.ts`、`index.ts`、`types.ts` | trace-timeline / adapter compatibility | 已比对 |
| `packages/dashboard-app/src/api/auditTypes.ts`、`auditDecoders.ts`、`auditClient.ts`、`client.ts`、`traceDecoders.ts` | trace-timeline / strict client contract | 已比对 |
| `packages/dashboard-app/src/api/boundaryDecoders.test.tsx`、`client.test.tsx` | trace-timeline / fail-closed API | 已比对 |
| `packages/dashboard-app/src/advanced/TrafficPanel.tsx`、`trafficData.ts` 及测试 | trace-timeline / states and filters | 已比对 |
| `packages/dashboard-app/src/advanced/AdvancedPanel.tsx` 及测试、`machine/MachineView.tsx` 及测试 | trace-timeline / real Dashboard entry | 已比对 |
| `packages/dashboard-app/src/i18n/translations.ts` | trace-timeline / zh-en i18n | 已比对；P3 文案 finding |
| `packages/cli/dist/tenon.mjs`、`packages/server/dist/dashboard.mjs`、`packages/dashboard-app/dist/**` | generated release assets | build 与内容检索已比对 |
| `docs/adr/trace-timeline.md`、`docs/superpowers/{plans,specs}/**trace-timeline*.md` | ADR / upstream / plan | 已比对 |
| `docs/ux/shots/trace-timeline/*.png` | browser acceptance evidence | 已比对 |
| `openspec/changes/trace-timeline/{proposal.md,design.md,tasks.md,REVIEW.md,specs/**}` | governed Change | 已比对；strict finding |
| `openspec/changes/trace-timeline/.pipeline-*`、`.pipeline-run/**`、`.pipeline-transitions/**` | Tenon canonical evidence | CLI 生成并按 event/revision 回读 |

## OpenSpec 隔离应用演练

- `openspec show trace-timeline --json --deltas-only`：成功生成 delta。
- `openspec validate trace-timeline --strict`：exit 1，六个 Requirement body 缺少 SHALL/MUST。
- 因 strict validation 已失败，未把 archive/apply 失败伪装为通过；真实
  `openspec/specs/**/spec.md` digest 在演练前保持
  `6e250699915fd6a10a38cd434c89f432c87dbb7001a3887f11cdba5b048c91d0`。

## 修复与下一轮

1. 以 `verify-fail` 精确事件回到 Build，再以 `requirements-changed` 回到 Spec 修正六条 SHALL/MUST
   正文（语义不变，只满足 canonical parser）。
2. 回 Build 为 absolute-form request target 增加先红测试与 pathname-only 归一化；补统一 Host
   guard 的 timeline 路由覆盖。
3. 修复英文单复数和中文 raw status/detail 标签。
4. 重建 tracked bundles，重新完成全量审查、冻结 SHA，并完整重跑 Verify 四轨和 OpenSpec
   隔离 archive/apply 演练。

## 第二轮冻结验证（`dbed720a`）

### Reviewer / API E2E

- 完整冻结 diff reviewer：PASS；119 个交付文件全部覆盖，Critical/High/Medium/Low 均为 0。
  冻结 tree 为 `1b867f2a4715c4abbf91193033a95e1687da26f2`，diff fingerprint 前后均为
  `9af3e685c90c72d5145ebb6eb09464a274eff27746199ac1cd083202c449476b`。
- API/E2E 隔离副本：`/tmp/tenon-trace-verify-dbed.z6Rbw0`。TypeScript packages build、
  `typecheck:web`、41/41 TraceStore/安全/server 定向测试、1/1 真实 HTTP+JSONL E2E、
  `build:server` 与 `build:web` 均 exit 0。
- E2E 实测 success、known empty、malformed partial、symlink generic 500、absolute-form URL
  pathname-only；userinfo、authority、query、headers、prompt、response、upstream 均未跨过
  metadata allowlist。

### Browser / Visual

- 隔离副本：`/tmp/tenon-trace-dbed-browser-LaE1CK`。
- success、loading、empty、partial、真实 500 error→retry、Enter/Space/Escape、390 px 中英文、
  local-only/metadata-only 与无敏感 query 均通过；视觉层级、间距、材质和状态区分通过。
- P2 Important：未选中的 `Errors` 筛选按钮获得键盘焦点后，计算样式为
  `outline-style: none` 且 `box-shadow: none`，没有可辨识焦点环。该 finding 阻断 Verify。
- 截图：`/tmp/tenon-trace-dbed-browser-LaE1CK/qa-output/`。

### Codex CLI

- 使用仓外只读 clone 审精确区间
  `4c242b928b61285561f9cdbc63617db899a18a12...dbed720a2ea8affd0d927388a60fbf05057258f5`。
- Codex CLI 正确读取完整范围并完成多轮源码、安全、OpenSpec 与 diff 检查，但受本机损坏的
  `logs_2.sqlite`、旧 model-cache schema 和长时间子审查影响，未在有界时间返回最终摘要，已中止
  并按降级记录；不将其伪装为 PASS。

### OpenSpec 隔离应用演练

- 真实主规格聚合 digest 前后均为
  `0e87559624052236a07de18e951e3705d6aa627d09a89b0462f1acce20d46fd1`。
- `openspec show trace-timeline --json --deltas-only` 与
  `openspec validate trace-timeline --strict` 通过。
- 仓外副本 `/tmp/tenon-trace-openspec.1CMEyj` 的
  `openspec archive trace-timeline --yes --json` 成功，新增 6 条 requirement；归档后
  `openspec validate trace-timeline --type spec --strict --no-interactive` 通过。
- `openspec validate --all --strict` 仍列出 12 个与本 Change 无关的既有 change/spec 失败；
  本轮未把全仓既有失败表述为绿色。

### 第二轮决定

以精确 `verify-fail` 返回 Build，为所有 Trace 筛选与操作按钮增加统一、可见且符合现有 token 的
focus-visible 样式，补组件断言并重新做真实浏览器键盘复验；完成后生成第三个冻结 SHA。

## 第三轮冻结前修复验收

- 所有 Trace session、filter、retry 与 clear 原生按钮统一使用 accent border 加 3 px
  `focus-visible` ring；组件测试先红后绿，`TrafficPanel` 9/9、完整 Web 1068/1068 通过。
- 独立完整 diff 复审 PASS，Critical/High/Medium/Low 均为 0；新 bundle 引用正确且没有旧孤儿
  asset，OpenSpec strict、architecture、comments 与 diff hygiene 均通过。
- 仓外副本 `/tmp/tenon-trace-focus-reverify-KdUgRI` 的真实 Chromium 验收 PASS。Tab 聚焦未选中的
  Errors 按钮时，`:focus-visible=true`、`border-color=rgb(37, 99, 235)`，并出现 3 px
  `rgba(37, 99, 235, 0.12)` ring；Enter、Space、Escape、partial、empty 与 390 px 路径无回归。
- 该轮仅证明 Build 修复已具备重新冻结条件；最终 Verify 结论仍以后续第三个冻结 SHA 的四轨结果
  为准。

## 第三轮冻结验证（`c0060ba0`）

### 冻结与 reviewer

- 冻结 SHA：`c0060ba02ff5a7dc76b1ff0d53f6c06c9eecff93`；base/merge-base：
  `4c242b928b61285561f9cdbc63617db899a18a12`。
- 仓外 reviewer 副本：`/tmp/tenon-trace-review-c006.TZlD6v/repo`。完整覆盖 133 个
  delivery/canonical/generated 文件；Standards、Spec、correctness、security/privacy、error、
  compatibility、UI/a11y 与生成物全部 PASS，Critical/High/Medium/Low 均为 0。
- 完整 binary diff fingerprint 前后均为
  `a0674512533a4757a4590646b569aeda963f4b39775f41b1015fc506e05de9ce`；隔离副本最终 clean。
- reviewer 在隔离副本重跑 Trace/Host 定向测试、Web 1068 tests、typecheck、architecture、
  comments、OpenSpec strict 与 tracked bundle freshness，均通过。

### API / E2E

- 仓外副本：`/tmp/tenon-trace-verify-c006.xz8LtB`；真实仓库 fingerprint 前后均为
  `2720dd06d89d1de9ad2e6ca3a0f03504e51fad5242a5b5b22ff35de02e83fd3e`。
- `npm ci`、受影响 TypeScript packages build、`typecheck:web`、`build:server` 与 `build:web`
  均 exit 0。
- TraceStore/security/server 定向测试 3 files / 41 tests PASS；真实 HTTP+JSONL E2E 1/1 PASS。
- success、known empty、malformed partial、symlink generic 500、absolute-form pathname-only 均通过；
  userinfo、authority、query、headers、prompt、response 与 upstream 哨兵均未跨过 metadata
  allowlist，外部 symlink target 未变。
- 非失败观察：依赖安装报告既有 7 项 audit；Vite 保留既有大 chunk warning。本 Change 未改依赖。

### Browser / Visual

- 仓外副本：`/tmp/tenon-trace-c006-verify-4Q0vlV`；真实入口：
  `http://127.0.0.1:19880/?view=machine`，页面标题 `Tenon Dashboard`，H1 `机器就绪与风险`。
- loading、3-record success、known empty、partial、真实 500→键盘 retry、快速切换晚响应防覆盖、
  Tab/Enter/Space/Escape 与 session 焦点恢复全部通过。
- 未选中 Errors 按钮的计算样式为 `:focus-visible=true`、
  `border-color=rgb(37, 99, 235)`，并含 3 px `rgba(37, 99, 235, 0.12)` ring。
- 中文/英文 390 px 下 document/body 均为 390/390、Trace 面板为 324/324，无横向溢出；
  `pageerror=0`，console error 仅两条预期真实 HTTP 500。
- local-only/metadata-only 与页面隐私检查通过；视觉 P0/P1/P2 为 0。非阻断 P3：retry 成功后按钮
  卸载，浏览器把焦点落到 `BODY`；规格没有要求该路径恢复焦点，Escape 的明确焦点恢复契约通过。
- 11 张截图与日志保存在 `/tmp/tenon-trace-c006-verify-4Q0vlV/qa-output/`。

### Codex CLI

- 在仓外只读副本运行 `codex exec review`。进程实际读取了 Trace delta spec、Store、server、
  Dashboard/client 与测试，并尝试运行定向测试。
- 本机 `logs_2.sqlite` 损坏、model-cache schema 过旧；子沙箱又因
  `connect EPERM 127.0.0.1:7897` 无法按需访问 npm registry。进程未在有界时间输出最终摘要，
  以 exit 143 终止。
- 本轨结论为 **degraded**，不得表述为 PASS。相同冻结 SHA 的独立 reviewer、API E2E 与浏览器轨
  已完整覆盖代码、行为、安全与视觉边界。

### OpenSpec 隔离应用演练

- 真实主规格聚合 digest 前后均为
  `0e87559624052236a07de18e951e3705d6aa627d09a89b0462f1acce20d46fd1`。
- 仓外副本 `/tmp/tenon-trace-openspec-third.sFR4LG/repo` 中，
  `openspec show trace-timeline --json --deltas-only`、strict validate、archive 与归档后
  `trace-timeline` 主规格 strict validate 全部通过；archive 新增 6 条 requirement。
- `openspec validate --all --strict` 为 18 passed / 12 failed；12 项均是本 Change 以外的既有
  change/spec，不表述为全仓绿色。

### 最终决定

第三轮冻结的独立强制轨和隔离 OpenSpec 应用边界全部通过，无 Critical/High/Medium finding。
Codex CLI 的运行时降级已被如实隔离记录，不掩盖为绿色，也不改变其他三轨的真实 PASS 结论。
因此本 Change 可请求精确 `verify-pass` 评审并进入 Ship。
