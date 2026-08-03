# 2026-07-29 合并后统一审查：Verify 第一次尝试

## 结论

- Change：`post-merge-unified-review-20260729`
- base：`907dac067c17ed77fb440b91b20d64fd0f24773b`
- frozen Build SHA：`2003539c53db9e1d45ab099e63872ffd3fd1b17e`
- 结论：**FAIL，必须以 `verify-fail` 返回 Build**
- 汇总：Critical 0、High 0、Medium 9、Low 1；另有 1 项未完成的 E2E 轨道。

本报告取代 pre-Verify 文档中的“第二遍无发现”预期结论。冻结基线经独立 Reviewer、
Codex、真实生产浏览器和 E2E 轨道审查后仍有 Medium，不得进入 Ship 或 Release。

## 四轨执行状态

| 轨道 | 隔离/范围 | 结果 |
| --- | --- | --- |
| Reviewer | `/tmp` 隔离 clone；完整审查 `907dac0..2003539` 的 99 个变更文件 | FAIL，C0/H0/M4/L0 |
| Codex review | `codex review --commit 2003539…`，审查冻结提交 | FAIL，P2 5 项 |
| Dashboard 视觉与浏览器 | `/tmp/tenon-visual-verify.qUDpL8/repo`；65 张生产截图，11 MB；全 Dashboard | FAIL，C0/H0/M5/L1 |
| E2E/API | `/tmp/tenon-unified-verify-e2e.Vr9rn4/repo` 精确 detached checkout | INCOMPLETE；runtime 依赖发现单步挂起后被协调器有界中断，未声称通过 |

Reviewer 与视觉轨均确认没有写入共享源码。视觉轨结束时隔离 clone clean，且共享产品源码/
构建输入 diff 指纹仍为空。E2E 轨仅完成规则、Skill、冻结身份、隔离 clone 和 index 指纹，
没有执行足以支持 PASS 的 API/E2E 命令，因此本轮单独据此也不能通过。

## Medium findings

### M1 — English Workbench 仍显示硬编码中文 review gate

`ExecutionTimelineComposer.tsx` 的可见 badge 和 switch `aria-label` 硬编码“复核门”。
English 的 Explore、Spec、Verify 均可复现。必须使用同一 i18n key，并新增七阶段 English
可见文本和 accessible-name 的 CJK 防回归断言。

### M2 — English Hook fallback、描述和 tooltip 硬编码中文

`TimelineHookRows.tsx` 对三个内建 fallback 名称、通用描述和技术 tooltip 使用中文。
必须将产品 copy 本地化；hook id、event、matcher、script 等技术值保持原文。

### M3 — Track Settings 的 Policy 模板 accessible name 未本地化

`TrackSettings.tsx` 使用 `aria-label="Policy 模板"`。English 屏幕阅读器仍读到中文。
必须复用 `track_policy_template` 翻译并覆盖英文表单可访问名称。

### M4 — 持久依赖门只有 advisory audit，没有 resolved-tree 校验

根 `check:dependencies` 只运行 `npm audit --audit-level=high`；CI/release 因而未持久执行
`npm ls --all`。当前冻结树人工校验 clean 不能替代未来每次 CI/release 的依赖树门禁。
必须把 audit 与完整 resolved-tree 校验合成同一 canonical gate。

### M5 — tag 工作流发生在 tag 已创建之后，不能充当 release 前门禁

`.github/workflows/release.yml` 由 tag 触发。即使其依赖检查失败，tag 已经存在，不满足
“High/Critical 或无效依赖树必须阻止版本/tag/GitHub Release 创建”的规格。必须提供可对
精确候选 main SHA 执行并等待成功的 pre-tag release-candidate 门；tag 工作流继续作为
防御性复核。

### M6 — Workbench workflow menu 的键盘模式不完整

触发器声明 `aria-haspopup="menu"`，弹层使用 `role="menu/menuitem"`，但 Enter 展开后焦点
仍留在 trigger，ArrowDown 无作用。必须实现打开后首项/当前项聚焦、ArrowUp/Down、
Home/End、Escape 与触发器焦点恢复，并增加真实键盘回归。

### M7 — Dark/System-dark 保存旁路词按钮对比度不足

生产浏览器实测 12px/600 白字 `rgb(255,255,255)` 位于 accent
`rgb(109,155,251)`，对比度 `2.72:1`，低于普通文本 `4.5:1`。Light 通过。
必须改用在三种主题中均达标的前景/背景 token，并加 computed contrast 回归。

### M8 — English Projects 直接显示中文 default phase label

`ProjectsView.tsx` 将 canonical row 的 `current.label` 直接插入 `At {phase}`，生产页显示
`At 交付`。默认 workflow 的七个 canonical phase 属于产品 copy，必须按当前 locale 映射；
自定义 workflow 或用户数据仍保持原文。

### M9 — English Automation 的空态与动作硬编码中文

`AfkView.tsx` 在 English 下显示“当前没有自动运行任务”“开启自动运行”“新建定时任务”
和“验证定时任务”。390/1440、Light/Dark 均复现。必须接入既有 i18n，并覆盖空态、
动作和弹层标题的 English CJK=0 回归。

## Low finding

`/api/config` 返回 500 时页面能安全降级且不泄漏原始错误，但没有页面内 Retry；路由恢复后
必须刷新浏览器。统一修复轮次应补显式重试，或提供可观察的自动重试状态和回归证据。

## 全仓 OpenSpec strict 债务

隔离 rehearsal 中两个受本 Change 影响的 capability strict validation 均通过；但
`openspec validate --specs --strict` 的全仓结果为 19 pass / 7 fail。失败的既有 specs：

- `automation-loop-init`
- `declarative-document-governance`
- `effective-workflow-plan`
- `live-dashboard-project-anchor`
- `simple-task-routing`
- `skill-content-resolution`
- `workspace-verification-integrity`

七项均缺少当前 schema 要求的 `## Purpose`。它们不是 `907dac0..2003539` 新引入的差异，
但用户要求统一完成全仓前后端审查并确保没有遗留门禁，因此下一轮 Build 将做不改变 requirement
语义的 Purpose 规范化，并以全仓 strict GREEN 为出口。

## 已通过的冻结基线证据

- 隔离 Reviewer：`npm ci`、audit 0、resolved dependency tree clean。
- root build、Dashboard typecheck/build 全部通过；生成资产与冻结提交一致。
- root tests：327 files、5741 passed、14 honest-skip。
- Dashboard：67 files、1200 passed。
- architecture、comments、repository hygiene、docs check/build、Change/document status、
  JSON/JSONL、`git diff --check`、secret-pattern scan 均通过。
- 生产浏览器覆盖 390/720/1024/1440、zh/en、System/Light/Dark、七阶段、三轨道、
  loading/error/empty/normal、reduced-motion、主要 Dialog 焦点困笼/Escape/焦点恢复。
- 正常全 Dashboard 导航 console warning/error、pageerror、HTTP 4xx/5xx 为 0；
  页面级横向溢出为 0。

这些通过项不抵消 Medium，也不替代未完成的 E2E/API 轨。修复后必须冻结新的 Build SHA，
让四条轨道对完整新基线重新验证，只有 C0/H0/M0 且所有必需轨道完成才可 `verify-pass`。
