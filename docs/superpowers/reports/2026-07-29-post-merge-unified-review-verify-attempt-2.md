# 2026-07-29 合并后统一审查：Verify 第二次尝试

## 结论

- Change：`post-merge-unified-review-20260729`
- base：`907dac067c17ed77fb440b91b20d64fd0f24773b`
- frozen Build SHA：`180787fe4f152e1922312cea2eaffe9ba78a6269`
- tree：`5abed2a8bdd4e62eaccfd0d9aab8767507342e9d`
- 结论：**FAIL，必须以 `verify-fail` 返回 Build**
- 去重汇总：Critical 0、High 3、Medium 3、Low 0

第二轮确认第一次 Verify 的九个 Medium 与一个 Low 均已回归关闭，完整安装、构建、测试、
OpenSpec、API/E2E 和大部分 Dashboard 矩阵也通过；但独立 Reviewer、Codex 和生产浏览器
在新的冻结 SHA 上发现三项 release High 与三项 Dashboard Medium。任何一项都足以阻止
Ship、main 合并、tag 与 GitHub Release，因此本轮不能以已有绿色结果抵消。

## 四轨状态

| 轨道 | 隔离/范围 | 结果 |
| --- | --- | --- |
| Reviewer | `/tmp/tenon-reviewer2.tDwc6i/repo`，完整 `907dac0..180787f`、132 文件、两次提交 | FAIL，C0/H3/M2/L0 |
| Codex review | `/tmp/tenon-codex-review.2We8Bg/repo`，`codex review --base 907dac…` | FAIL，P1 1 项、P2 1 项；分别与 H1、M2 重合 |
| E2E/API | `/tmp/tenon-unified-verify-e2e-round2.S13lV3/repo`，真实 CLI→fs、server/API、Chromium UI→API | PASS，C0/H0/M0/L0 |
| Dashboard 视觉 | `/tmp/tenon-visual-verify-r2.24Joxu/repo`，全 Dashboard 断点/语言/主题/状态/键盘矩阵 | FAIL，C0/H0/M1/L0 |

所有轨道针对同一 frozen SHA；Reviewer 与 E2E 证明隔离 clone 最终 clean，E2E 证明共享
HEAD、status 和 132 个交付文件内容指纹前后不变。视觉轨在完成既定矩阵并确认 Medium 后
由协调器有界结束；其截图与测量证据已落在仓库外，未写共享源码。

## High findings

### H1 — pre-tag 未验证精确候选 SHA 的 canonical CI

`.github/workflows/release-candidate.yml` 在本地门禁后直接创建 tag，没有查询候选 SHA 的
canonical `CI` 成功状态。该候选流程没有复现 CI 的 sandcastle build、配置凭据时的
real-Codex H14 强门和 prepared N-1 compatibility run，因此 CI 红灯、等待中或缺失时仍可能
创建 tag。必须在 tag 前 fail-closed 查询精确 SHA 的成功 push CI，并为缺失、排队、失败和
错误 SHA 建立 anti-bypass 测试。

### H2 — pre-tag 验证全过程持有可写 Git 凭据

`release-candidate.yml` 顶层授予 `contents: write`，默认 checkout 还持久化凭据；随后在同一
job 中运行 `npm ci`、依赖生命周期脚本、构建、测试和仓库脚本。任一被污染的依赖或脚本都可
在正式 tag 步骤之前直接写远端 ref。必须拆成 `contents: read` 且
`persist-credentials: false` 的验证 job，以及不 checkout/不执行仓库代码、只做最终身份复核
与 tag 创建的最小 `contents: write` job。

### H3 — 已批准 SHA 未绑定到 reusable packaging

candidate 只把 tag 传给 `.github/workflows/release.yml`；packaging 仅验证 tag 自洽，不核对
已通过门禁的 candidate SHA。若 tag 在两个 job 之间被移动，packaging 可以从未经批准的提交
生成发布物。必须传递 `expected_sha`，在 packaging 中比较 peeled tag commit 与该 SHA，
并保持 checkout 不持久化写凭据。

## Medium findings

### M1 — AFK 两个 dialog 没有键盘和焦点闭环

`packages/dashboard-app/src/afk/AfkView.tsx` 的工具弹窗与重试弹窗自行声明 `role=dialog`；
前者还声明 `aria-modal=true`，但两者均无初始焦点、Tab 困笼、Escape 关闭和关闭后焦点恢复。
必须迁移到共享 `Dialog` primitive，保留现有内容/动作语义，并以真实键盘测试覆盖打开、
Tab/Shift+Tab、Escape、关闭按钮和动作完成后的焦点归位。

### M2 — TrackSelector tooltip 仍使用原始 track label

`TrackSelector.tsx` 的可见文本和屏幕阅读器名称已使用 `trackDisplayName(..., lang)`，但
`title` 仍拼接 `candidate.label` 和继承 track 的原始 `label`。内建 track 因而会在当前语言
显示另一语言 tooltip。必须对 candidate 与 inherited track 同样使用 locale-aware helper，
自定义 track 保留用户原值，并增加 zh/en tooltip CJK/英文一致性回归。

### M3 — 390px Automation 动作条裁掉键盘焦点目标

生产 Chromium 在 English、Dark、390px 的 Automation 空态中，底部三动作 nav 使用
`overflow-x:auto`，第三个 `Validate schedule` 的 rect 为 `324.48..476.96`，viewport 为
`390`、nav right 为 `374`，约 103px 被裁掉。从 `New schedule` 按 Tab 后第三按钮取得焦点，
但 `nav.scrollLeft` 仍为 0，焦点控件大半不可见。必须让三项在 390px 下完整可达且聚焦可见，
不能依赖未发生的横向自动滚动。

证据：

- `/tmp/tenon-visual-verify-r2.24Joxu/screens/nav-en-dark-390-automation.png`
- `/tmp/tenon-visual-verify-r2.24Joxu/screens/automation-390-validate-focused.png`

## 第一次 Verify findings 回归

以下第一次 Verify 问题在 frozen SHA 上均已通过定向单测与生产浏览器回归：

- review gate、Hook fallback/tooltip、Policy template、Projects canonical phase、Automation
  产品文案的 zh/en 完整性；
- workflow menu 初始/方向/Home/End/Escape/Tab 键盘行为；
- Dark/System-dark 旁路保存按钮对比度；
- config error 显式 Retry；
- audit + `npm ls --all` canonical dependency gate；
- 七个既有 OpenSpec capability 的 Purpose 与全仓 strict validation。

这些关闭项不包含本轮新发现的 TrackSelector tooltip、AFK dialog 和 Automation mobile nav。

## 已通过证据

- Reviewer：`npm ci`、audit 0、`npm run build`、root 5741 tests/14 honest skips、
  Dashboard 1205 tests、typecheck、dependency/release/architecture/comments/hygiene/identity/
  freshness/docs 门禁全部通过。
- OpenSpec：26 个主 specs strict 通过；Change strict 通过；隔离 apply/archive rehearsal 后
  26/26 通过，真实 workspace spec digest 保持
  `d5feb1aea778b666a9de7013a8360a6eaba56690e21789a1a8baf65e708a4193`。
- E2E/API：真实 bundle `init→status` 通过，`../escape` fail-closed 且无越界文件；关键
  CLI/server/security 386 passed/9 honest skips；Dashboard/API/Workbench 139 passed。
- 真实 server：health/static/snapshot 200；未知 root 404；恶意 Host 403；无/错 token 401；
  非 JSON 与 skill-token 注入 400；所有负向请求前后 manifest 字节不变。
- 真实 Chromium：390px config loading→200、500 error→Retry→恢复；无横向页面溢出，无非预期
  console error/pageerror。
- E2E 补充 `npm run test:all` 进入长期 Docker/真实容器段后按有界要求中止，exit 130；中止前
  相关测试通过。缺少 `CLAUDE_CODE_OAUTH_TOKEN` 的真实 Claude sandbox 为明确 honest skip，
  未冒充通过。
- `actionlint` 未安装；workflow 行为由静态审查和 repository node tests 覆盖，但现有三条
  release tests 没有捕获 H1-H3，必须在下一轮补 RED→GREEN。

## 132 文件 capability 映射

| 精确文件集合 | 数量 | capability / 责任 |
| --- | ---: | --- |
| `.github/workflows/{ci,release-candidate,release}.yml` | 3 | `repository-architecture-compliance` |
| `README*`、`docs/**`（ADR、计划、设计、pre-Verify/attempt-1、测试现实、安全文档） | 10 | `open-source-documentation-experience`、本 Change 两个 delta |
| `openspec/changes/post-merge-unified-review-20260729/**` | 72 | `document-evidence-contract`、`workspace-verification-integrity`、本 Change 两个 delta |
| `openspec/specs/{automation-loop-init,declarative-document-governance,effective-workflow-plan,live-dashboard-project-anchor,simple-task-routing,skill-content-resolution,workspace-verification-integrity}/spec.md` | 7 | 各同名 capability；仅 Purpose 规范化 |
| `package.json`、`package-lock.json` | 2 | `repository-architecture-compliance` |
| `packages/dashboard-app/{package.json,dist/**}` | 6 | `dashboard-ui-ux-system`、发布生成物新鲜度 |
| `packages/dashboard-app/src/**`（本 diff 的 31 个实现/测试文件） | 31 | `dashboard-ui-ux-system` |
| `tools/check-release-workflows.node-test.mjs` | 1 | `repository-architecture-compliance` |
| **合计** | **132** | 全部冻结 diff 已映射 |

## 下一轮 Build 出口

1. 为 H1-H3 先增加会失败的 workflow contract tests，再实现只读验证、精确 SHA CI、
   最小写权限 tag job和 `expected_sha` packaging 绑定。
2. 迁移 AFK 两个 dialog 到共享 primitive并补键盘/focus 回归。
3. 修正 TrackSelector tooltip 的 locale-aware track 名。
4. 重排 390px Automation 三动作，使全部按钮无需隐藏滚动即可见；补 390px English
   键盘 focus visibility 回归。
5. 重新运行完整 Build 门禁、生产构建并冻结新 SHA；四轨必须从新 SHA 全量重跑，只有
   C0/H0/M0 且 exact-SHA GitHub CI 成功才可 `verify-pass`。
