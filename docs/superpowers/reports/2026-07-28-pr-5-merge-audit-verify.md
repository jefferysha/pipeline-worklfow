# PR #5 合并审计验证报告

> Change：`pr-5-merge-audit`
> 冻结构建：`ad568f36eb4853553c1a98ff4bb2302e0df70724`
> merge-base：`2d103e330f847e003ff5909097d892f5722cca04`
> 验证时最新 `origin/main`：`15fe619b2885b928dd27be9668cca6b0ee903c57`
> 结论：PASS

## 聚合结论

四轨验证全部完成，Critical / High / Medium 均为 0：

| 轨道 | 结论 | Findings |
| --- | --- | --- |
| Rules / architecture Reviewer | PASS | 0C / 0H / 0M / 1L |
| 真实 Chromium E2E | PASS | 12/12 场景；0 unexpected browser error |
| Codex CLI independent review | PASS | 无可执行正确性回归 |
| 多视口视觉与交互验收 | PASS | 0C / 0H / 0M / 1L |

两个 Low 均不阻塞交付：

1. `PageHeader` 固定 `mb-7` 后拼接调用方 `mb-5` / `mb-6`，生成 CSS 顺序会让调用方的预期
   间距覆盖不生效。行为、可访问性和布局门禁均不受影响，留给后续窄 Change 使用 Tailwind-aware
   class merge 处理。
2. 从无选中 root 的 Projects 进入 Machine 时，light-state 会显示英文诊断
   `readiness: no registered project selected`。目标 root 的 Machine 就绪流程正常，留作后续
   本地化一致性修复。

## 冻结身份、GitHub 与 repo-zero-output

- PR：`jefferysha/tenon#5`，head `codex/dashboard-ui-ux-overhaul`。
- GitHub head 与 `build_sha` 同为
  `ad568f36eb4853553c1a98ff4bb2302e0df70724`。
- 2026-07-28 复核：`MERGEABLE` / `CLEAN`；review threads 为 0。
- 当前 head 的 `CI / verify` 成功；Documentation Pages `build` 成功；PR 条件下 `deploy`
  正常 skipped。
- 页面身份：title `Tenon Dashboard`，目标 root
  `/Users/a1234/.codex/worktrees/8d07/pipeline-worklfow`，Change `pr-5-merge-audit`。
- 生产 HTML 引用冻结资产 `index-BWrG5odG.js` 与 `index-pBTBvMM6.css`；真实服务与冻结
  `dist/index.html` 文件名一致。
- 各只读轨道均确认 HEAD 为冻结 SHA，开始/结束仓库指纹一致。聚合期间真实工作区只保留
  Tenon Verify phase 产生的治理状态路径，没有实现、配置或生成物漂移。

## 工程验证

冻结 Build 已完成：

| 命令或门禁 | 结果 |
| --- | --- |
| 根 `npm test` | 315/315 files；5399 passed；5 个 credential-gated honest skips |
| `npm run test:web` | 54/54 files；988/988 tests |
| `npm run typecheck:web` | exit 0 |
| 根 `npm run build` | exit 0 |
| architecture / comments / docs / repository-hygiene | 全部通过 |
| `bash tools/test-bundle.sh` | 31/31 |
| `git diff --check` | exit 0 |

E2E 隔离副本
`/private/tmp/tenon-pr5-e2e.sdrVcZ/isolated` 精确 checkout 冻结 SHA，所有会写
build/test/log/screenshot 的命令只在隔离树或 `/private/tmp` 运行：

| 隔离验证 | 结果 |
| --- | --- |
| 定向 Vitest | 7/7 files；60/60 tests |
| `npm run build:web` / `npm run build:server` | exit 0 |
| `npm run typecheck:web` | exit 0 |
| 完整 `npm run test:web` 稳定重跑 | 54/54 files；988/988 tests |
| dist 可复现检查 | `git diff --exit-code` |
| 生产 Chromium harness | 12/12 PASS |
| API smoke | health、snapshot、workflows、config、traces 全 200 JSON |

第一次隔离宽测在 `ProgressView.test.tsx` 的 GSAP no-preference 焦点归还用例出现一次
987/988 的并发时序失败。没有修改产品或弱化断言；随后精确用例连续 3/3 PASS，真实 Chromium
同行为 PASS，原始全量命令稳定重跑 988/988 PASS。因此判定为 jsdom/GSAP 负载时序抖动，
不是适用产品失败。既有 React `act(...)`、GSAP target 与 Vite chunk warning 仍作为测试噪声
记录，不描述为消失。

## 真实浏览器 E2E

生产 Dashboard 在隔离端口 `21975` 启动，结束后已停止并确认端口关闭。结构化结果：
`/private/tmp/tenon-pr5-e2e.sdrVcZ/evidence/browser-e2e-results.json`
（SHA-256
`31d4e276123970f705fb04c118f46d72935ff1316404f143084365723e791f2e`）。

12 个场景覆盖：

- title、root、Change 和 UI→API 身份。
- Progress change 卡片通过 Enter 打开 drawer；初始焦点、Escape 关闭与焦点归还。
- skip link 的 Tab / Enter 主内容跳转。
- light / dark 主题与 ease-out computed style。
- 1024px Workbench 的可见滚动提示、`aria-describedby`、横向滚动与 Archive 阶段切换。
- 720px 固定底部导航与 721px 88px sticky rail 的互补临界行为。
- 390px 页面无横向溢出。
- reduced-motion 下无导航 transition，drawer 到达 identity transform。
- loading、真实 empty、503 error、retry 与恢复。
- 同源只读 API 的真实响应。

唯一 console 503 是主动构造 error 状态的预期证据；没有 unexpected console/page error。

## 多视口视觉与交互验收

证据目录：`/private/tmp/pr5-visual-verify-ad568f36/`，共 17 张截图。覆盖
1440×900、1024×768、721×900、720×900、390×844，light / dark，
Progress、Projects、AFK、Workbench、Machine、drawer、hover、press、键盘焦点、
loading、empty、error、recovery 与 reduced-motion。

关键观测：

- 1024px 阶段 region 为 886px client / 1024px scroll width；提示可见并通过
  `aria-describedby` 绑定。滚动到 `scrollLeft=138` 后 Archive 112px 完整可见且可切换。
- 720px：`max-width:720px=true`、`min-width:720.02px=false`，fixed bottom nav，
  主区保留 88px；页面宽度 720/720。
- 721px：两个媒体查询状态互补，恢复 sticky rail；页面宽度 721/721。
- 390px：无页面横向溢出，主要导航目标至少 44×44。
- 默认 transition 与 `--ease-out` 均为 `cubic-bezier(0, 0, .2, 1)`；Nav、主按钮与 drawer
  close 的 computed timing 一致。
- 键盘焦点有 2px solid outline；drawer 初始焦点落在“关闭详情”。
- reduced-motion 媒体查询生效，导航 transition 为 `none`，项目卡位移为 identity。
- 主内容未发现 emoji；浏览器扩展的翻译浮标不属于产品 UI。

## Reviewer 与 Codex

Rules / architecture Reviewer 全量回读
`origin/main...ad568f36eb4853553c1a98ff4bb2302e0df70724` 的 327 个文件：

- Dashboard source/dist：86
- docs：10
- OpenSpec / 治理证据：230
- 官方截图：1

主题/token、Lucide、Nav、五个一级页面、Progress/AFK/Machine/Projects、Workbench 阶段
发现性、i18n、motion/reduced-motion、可访问状态、测试和 dist 均已覆盖。没有新增 API、
网络、鉴权、持久化、依赖、lockfile、危险 DOM、原始 SVG、跨层反向依赖或 secret。

Codex CLI 使用只读 sandbox 独立审查完整 diff，最终结论：
`No actionable correctness regressions were identified.` 它的只读 sandbox 阻止 Vite 创建
临时 config，因此其本地测试没有启动；这项环境限制没有被当作测试通过，而由上面的根测试、
隔离 E2E 和 GitHub CI 独立覆盖。

## OpenSpec 隔离应用演练

真实工作区：

- OpenSpec 1.6.0。
- `openspec show pr-5-merge-audit --json --deltas-only`：exit 0，4 条 modified delta。
- `openspec validate pr-5-merge-audit --strict`：exit 0。
- 主规格 digest 前后均为
  `e8588281864394aef8c438e85d6011a74e9992c9fea52f587aa707e779483f67`。

隔离副本 `/private/tmp/pr5-openspec-verify.hEBpHQ`：

- `openspec archive pr-5-merge-audit --yes --json`：exit 0。
- `specsUpdated=true`，4 条 modified requirement 被应用。
- `openspec validate dashboard-ui-ux-system --strict`：exit 0。

## 逐文件 capability 回读

以下分组由冻结三点 diff 生成，数量合计 327；每个改动文件至少属于一行：

| 完整改动文件组 | 数量 | capability spec | 回读 |
| --- | ---: | --- | --- |
| `packages/dashboard-app/src/**` 与 `dist/**` | 86 | `dashboard-ui-ux-system` | ☑ |
| `docs-site/public/images/dashboard-progress.webp` | 1 | `dashboard-ui-ux-system` | ☑ |
| 原 UI/UX audit、ADR、plan、spec、verify/review 文档 | 7 | `dashboard-ui-ux-system` | ☑ |
| PR #5 audit ADR、plan、spec 文档 | 3 | `repository-architecture-compliance` | ☑ |
| archived 原 Change 的 proposal/design/tasks/REVIEW/applied-spec 与 delta | 6 | `dashboard-ui-ux-system` | ☑ |
| audit Change 的 proposal/design/tasks/REVIEW 与 delta | 5 | `repository-architecture-compliance` / `dashboard-ui-ux-system` | ☑ |
| 两个 Change 的 `.pipeline-documents.json` | 2 | `document-evidence-contract` | ☑ |
| 两个 Change 的 `.pipeline-history.jsonl` 与 transitions | 44 | `interaction-and-skill-provenance` | ☑ |
| 两个 Change 的 `.pipeline-run/**` 与 workflow plan | 167 | `dashboard-execution-provenance` | ☑ |
| 两个 Change 其余 `.pipeline*.json/yaml` | 5 | `dashboard-execution-provenance` | ☑ |
| `openspec/specs/dashboard-ui-ux-system/spec.md` | 1 | `dashboard-ui-ux-system` | ☑ |

分组计数以冻结 diff 为准；Reviewer 的上层统计为 Dashboard 86、docs 10、OpenSpec/治理
230、截图 1，两种口径合计均为 327。

## 残余风险

- 未执行 Firefox/WebKit 或真实屏幕阅读器人工验收。
- 既有 React `act(...)`、GSAP target 和大 chunk warning 仍在。
- 本 PR 没有依赖或 lockfile 变化；既有依赖审计项留给独立依赖维护 Change。
- 两个 Low 文案/间距一致性问题不影响本次 capability 与门禁，后续单独修复。

## 放行决定

冻结 SHA、GitHub head、源码、生成物、OpenSpec、真实页面与四轨证据已绑定。没有
Critical / High / Medium finding，没有未解决 review thread，CI 成功，真实仓库未被验证轨
污染。本轮 Verify 判定 PASS，可请求确切 `verify-pass` 人类 review receipt 后进入 Ship。
