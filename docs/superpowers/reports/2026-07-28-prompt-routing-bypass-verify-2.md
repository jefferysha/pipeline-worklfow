# Prompt Routing Bypass 第二轮验证报告

## 结论

**FAIL，返回 Build 修复。**

冻结基线为 `98af95291bd071aa9284c51a0673720f273ddda3`。Reviewer 与 commit-scoped
Codex 审查确认 3 个 Medium；其中普通输入替换路径被两个审查轨独立命中。视觉轨为干净
PASS。无 Critical / High，但 Medium 不允许放行。

## 冻结与零输出屏障

- `tenon get prompt-routing-bypass build_sha`
  → `98af95291bd071aa9284c51a0673720f273ddda3`。
- 审查区间为 `origin/main(2d103e330f847e003ff5909097d892f5722cca04)...98af952`，
  共 2 个提交、96 个文件。
- Reviewer 和视觉审前后 `HEAD` 与实现指纹均未变化；工作区仅有进入 Verify 产生的
  `.pipeline*` 治理证据变化。
- OpenSpec 应用演练在隔离副本
  `/tmp/tenon-verify2-prompt-routing-bypass.VkATzL` 中执行；截图和审查输出均写入 `/tmp`。

## 四轨结果

### Reviewer Agent

结论：FAIL（0 Critical / 0 High / 3 Medium / 1 Low）。

1. **MEDIUM** — `packages/dashboard-app/src/workbench/TimelineHookRows.tsx:112-165`：
   `enabled` 由 `draft !== ''` 推导，输入框又在 `!enabled` 时禁用。用户执行
   Select All → Delete 后输入框立即失效，不能继续键入替换词。应把开关状态和草稿内容拆开，
   并补“清空、继续键入、Enter 保存”测试。
2. **MEDIUM** — `packages/dashboard-app/src/workbench/HookTimeline.tsx:84-109,147-165`：
   加载 effect 依赖 `t`，切换语言会在同一 root 上递增 generation、解除 busy 并重发 GET，
   使进行中的 POST 成为 stale；乱序返回可能导致 UI、磁盘与 Hook 不一致。generation 应只绑定
   root，并补 pending POST + 切换语言 + 乱序响应测试。
3. **MEDIUM** — `hooks/prompt-intent.sh:18-94` 与
   `packages/server/src/hooksConfig.ts:65-95`：Bash 对 duplicate / 非 canonical JSON 整体回退，
   server 却按 `JSON.parse` 的末值显示，Dashboard 与实际 Hook 可能使用不同 keyword。两端必须
   共享相同的 canonical 有效性判据，并用相同 fixture 做 parity 测试。
4. **LOW** — 中英文提示未明确标点和 `path/<keyword>.md` 也形成 token 边界。

此前 7 个 Medium 中的加载失败、持久空值、跨 root 迟到响应、绿色对比度、matrix trailing
comma、精确整行及 loading i18n 均已闭环；parser 的 nested / truncated 已闭环，但 duplicate
跨层 parity 尚未闭环。

### E2E

结论：FAIL。独立确认输入替换 P2；其余冻结闭环通过。

- 隔离副本：`/tmp/tenon-prompt-bypass-v2.MpIYh1`，前后 HEAD、status、diff 和文件指纹
  全部一致；测试端口 `28178` 已关闭。
- `npm run build` PASS（仅既有 chunk warning）；server 定向 299/299、HookTimeline
  14/14、hooks 494/494 PASS。
- OpenSpec show / strict validate / 隔离 archive 演练均成功。
- 真实 Chrome title=`Tenon Dashboard`，URL 精确绑定隔离 root；覆盖默认/custom/禁用、
  非法输入零 POST、GET/POST 失败与重试、中英文 loading、键盘焦点、
  UI → API → `.pipeline/hooks.json`、跨 root 迟到成功、router/breadcrumb 边界以及
  confirm gate 保持 `rc=2`。
- P2 实测：输入框 `⌘A` → Delete 后 switch 自动关闭、input disabled、焦点落到 BODY，
  后续键入无效。截图：`/tmp/prompt-routing-bypass-v2-clear-disables-input.png`。
- 其他截图：`/tmp/prompt-routing-bypass-v2-custom-success.png`、
  `/tmp/prompt-routing-bypass-v2-english-loading-keyboard.png`；详细日志：
  `/tmp/prompt-routing-bypass-v2-{build,server-tests,ui-tests,hooks-tests,openspec-show,openspec-strict,openspec-archive}.log`。

### Codex CLI

结论：FAIL。`codex exec -s read-only --ephemeral ... review --base origin/main` 独立命中
Reviewer 的输入替换 P2：清空 keyword 后 `enabled=false` 会立即禁用输入框。只读 sandbox
中的 Vitest 与 hook 临时目录写入因 `EPERM` 受限；这是审查环境限制，测试证据由独立 E2E /
Build 轨提供，不记作产品失败。输出：
`/tmp/prompt-routing-bypass-verify2-codex-review.txt`。

### 视觉审

结论：PASS，无 Critical / High / Medium / Low。

- 真实 Dashboard title=`Tenon Dashboard`，root、Change、phase、冻结 SHA 与目标一致。
- 覆盖 1440px / 375px、中英文、loading、ready、error、success、disabled、键盘、
  reduced-motion、溢出与对比度；所有 POST 均在浏览器层拦截，保持零输出。
- 最低对比度 4.673:1；冻结状态文本实测约 4.803:1。
- 新英文 context 延迟 GET 3 秒，实测英文 loading 4 个、中文 0 个，证明当前冻结 bundle
  使用 i18n key，而不是旧 bundle 的硬编码中文。
- 证据：
  `/tmp/tenon-prb-v2-loading-confirmed-zh-1440.png`、
  `/tmp/tenon-prb-v2-ready-zh-1440.png`、
  `/tmp/tenon-prb-v2-error-zh-1440.png`、
  `/tmp/tenon-prb-v2-success-zh-1440.png`、
  `/tmp/tenon-prb-v2-mobile-en-375.png`、
  `/tmp/tenon-prb-v2-loading-en-fresh-context.png`。

## Build 阶段证据

- `bash tools/test-hooks.sh`：PASS（收敛版新增 parser 反例）。
- Dashboard 定向测试：14/14 PASS。
- `npm run test:web`：50 files / 971 tests PASS。
- `npm run typecheck:web`：PASS。
- `npm run build`：PASS，生成 `index-QWqq9Onw.js`；仅既有 chunk size warning。
- `npm run check:architecture`：614 files PASS。
- `npm run oracle`：双跑一致，0 处不一致。
- `npm test` 首次重跑：315 files，5402 pass / 5 skip / 2 fail；失败分别为
  `internal-skill-gate` 超时和 `release-store` 初始事件为空。精确隔离复跑这两个文件：
  2 files / 27 tests PASS（`release-store` 约 285 秒）。这两项按资源/时序波动记录，不冒充
  首次全量绿色；更早同一 Build 的全量运行曾为 5404 pass / 5 skip。

## OpenSpec 隔离应用演练

- `openspec show prompt-routing-bypass --json --deltas-only`：4 个 ADDED requirements。
- `openspec validate prompt-routing-bypass --strict`：PASS。
- 隔离副本 `openspec archive prompt-routing-bypass --yes --json`：PASS，新增 4、
  修改/删除/重命名 0。
- 副本 main spec strict validate：PASS。
- 真实 `openspec/specs/**/spec.md` 聚合摘要演练前后均为
  `44328f9c948d747c455e279f141d5eeb4d0f9db8571afdbb2de3bcc40aa299eb`。

## 逐文件规格回读

96 个改动文件均已回读。产品文件逐项映射如下；其余 56 个 revisions / transitions /
pre-review / ledger 治理文件均映射并核对
`openspec/specs/document-evidence-contract/spec.md`，Change 文档映射冻结 delta。

| 改动范围 | capability spec | 状态 |
| --- | --- | --- |
| `docs/CONTRACT.md`、ADR、plan、上游研究、设计与本报告 | `prompt-routing-bypass` delta | 已回读 |
| `hooks/breadcrumb.sh`、`hooks/prompt-intent.sh`、`hooks/router.sh`、`tools/test-hooks.sh` | delta + `normal-chat-routing` | 已回读 |
| `packages/server/src/hooksConfig*`、server GET/POST routes、server dist | delta + `live-dashboard-project-anchor` | 已回读 |
| Dashboard API、decoder/types、i18n、Workbench source/tests、web dist | delta + `live-dashboard-project-anchor` | 已回读 |
| `openspec/changes/prompt-routing-bypass/**` Change 文档 | frozen delta | 已回读 |
| `.pipeline*` ledger/revision/transition/workflow 文件 | `document-evidence-contract` | 已回读 |

## 修复出口

返回 Build 后修复 3 个 Medium，并同时收敛提示语 Low；用失败优先测试覆盖键盘替换、
locale 与同 root 请求乱序、server/Hook parser parity。重新生成产物、运行定向与全量门禁、
提交新冻结 SHA，再执行完整四轨 Verify。
