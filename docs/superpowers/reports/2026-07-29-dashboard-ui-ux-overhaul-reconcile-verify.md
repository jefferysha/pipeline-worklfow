# Dashboard UI/UX 主线整合验证报告

## 验证对象

- Change：`dashboard-ui-ux-overhaul-reconcile-20260729`
- 冻结 SHA：`8a2d4007ae2d82a976398489ef0fcb8d94c0e496`
- 基线：`4c242b928b61285561f9cdbc63617db899a18a12`
- 范围：仅 1024×768、1200×870、1440×900、1920×1080 电脑端 Dashboard
- 结论：`FAIL`

## 三轨聚合

### Reviewer：FAIL

- HIGH：`ProjectsView.tsx` 将完整 root 放入固定 240px 的左向截断区域；共享长前缀的同 basename
  worktree 在实际桌面截图中仍无法视觉区分，存在进入错误工作区的风险。
- MEDIUM：项目行只有唯一 `data-testid`，没有 delta spec 要求的稳定唯一 DOM `id`。
- MEDIUM：`REVIEW.md` 声称 `git diff --check` 通过，但冻结区间仍有三个文档的 EOF 空行。
- MEDIUM：Nav 的 modal Dialog 覆盖设置浮层场景缺少回归测试。

### E2E / 行为：FAIL

- 隔离副本中 `npm run build`、`npm run typecheck:web`、`npm run test:web` 均退出 0；
  全量前端测试为 60 files / 1078 tests。
- 电脑端浏览器 smoke 17/17 通过，冻结 SHA 内的设置焦点、Escape 返焦、Overview 七章节锚点和
  项目 root accessible name 行为可用。
- 但隔离构建后 tracked `packages/dashboard-app/dist` 发生漂移：冻结提交中的
  `index-CuN80qlk.css` / `index-oDUz_gKv.js` 被替换为
  `index-DsdZ7MR-.css` / `index-D5lxzPXq.js`，`dist/index.html` 同步改变。
  这违反“从最终源码重新生成 tracked assets”的交付要求。

### 视觉 / 无障碍：PASS

- 真实生产 Dashboard：`http://127.0.0.1:18841`，页面标题 `Tenon Dashboard`。
- 1024、1200、1440、1920 桌面视口均无根级水平溢出、无控制台错误且只有一个 H1。
- light/dark/system、键盘焦点、Escape 返焦、skip link、章节锚点和 reduced-motion 均通过。
- 抽样最低复合对比度：light 4.67，dark 5.05。
- LOW：项目路径元数据 11px，在密集列表中略小。

### Codex CLI：降级

- `codex exec` 已启动，但完整冻结 diff 作为 stdin 超过 1,048,576 字符限制，退出 1：
  `Input exceeds the maximum length of 1048576 characters`。
- Reviewer、E2E 与视觉轨均已完成，因此按 `tenon-verify` 的降级规则不单独构成失败；下一轮改用
  让 Codex 直接读取提交区间的短提示，避免传输生成资产全文。

## OpenSpec 隔离应用演练：FAIL

- `openspec show dashboard-ui-ux-overhaul-reconcile-20260729 --json --deltas-only`：通过。
- `openspec validate dashboard-ui-ux-overhaul-reconcile-20260729 --strict`：通过。
- 在隔离副本执行
  `openspec archive dashboard-ui-ux-overhaul-reconcile-20260729 --yes --json`：失败。
- 精确错误：
  `dashboard-ui-ux-system MODIFIED failed for header "### Requirement: 自适应应用外壳" - current spec contains scenario(s) not present in the modified block: "桌面导航", "390px 移动导航", "720px 临界视口". Refresh the change spec before archiving to avoid dropping scenarios.`
- 主工作区 `openspec/specs/dashboard-ui-ux-system/spec.md` 的 SHA 在演练前后保持
  `cdc31db…`，未被隔离演练修改。

## 修复决策

持续执行授权下不接受偏差，按 `verify-fail` 回到 Build：

1. 经 `requirements-changed` 回到 Spec，把桌面外壳与桌面浏览器验收改为独立新增要求；需要修改的
   页面层级和 Progress 要求保留当前主规格全部场景，再追加电脑端场景。
2. 计算并显示同 basename worktree 的最短唯一祖先标签，保留完整 root accessible name/title，
   并增加稳定唯一 DOM `id`。
3. 补 modal Dialog 与设置浮层 Escape 的回归测试。
4. 清理 EOF 空行，重新运行 `git diff --check`。
5. 从最终源码重建 tracked dist 并在隔离副本证明再次构建无漂移。
6. 以新冻结 SHA 重新执行完整 Reviewer、E2E、Codex 和视觉验证。

## 第二轮冻结验证

### 验证对象

- 冻结 SHA：`77a32fd7ace6670d09db80edb601e03e116d3e56`
- Tree：`a7a7f13711855ce7d3c36a9e8616e3ba12cecd21`
- 基线：`4c242b928b61285561f9cdbc63617db899a18a12`
- 范围：仅 1024×768、1200×870、1440×900、1920×1080 电脑端 Dashboard
- 聚合结论：`FAIL`

### Reviewer：PASS

- 完整回读 123 个冻结 diff 文件，覆盖 Dashboard 源码、测试、tracked dist、OpenSpec、
  ADR、计划、报告、截图与 Tenon 治理证据。
- CRITICAL/HIGH/MEDIUM：0/0/0。
- 首轮的重复 basename 可见区分、严格 root DOM id、EOF、modal Dialog Escape 与 dist
  可复现性问题均已关闭。
- LOW：约 802 kB JS chunk；11px workspace 次级路径；不可达非交互行未消费 DOM id。

### E2E / 行为：PASS

- 隔离目录：`/tmp/dashboard-ui-ux-final-e2e.GhhKRS`。
- `npm ci`、定向 Nav + Projects（2 files / 47 tests）、`npm run check:comments`、
  `npm run check:architecture`、`npm run build`、`npm run typecheck:web` 均退出 0。
- `npm run test:web`：60 files / 1079 tests，退出 0；仅有既有 React `act(...)` 与
  GSAP 空 target 警告。
- 真实生产 Dashboard 的电脑端浏览器断言 25/25 通过；覆盖 1024、1200、1440、1920，
  light/dark/system、键盘、设置 Escape、loading、error/retry、empty、no-change、
  duplicate basename、Progress drawer 与 reduced-motion。
- 页面标题为 `Tenon Dashboard`，加载 `index-DvRUgA0L.js` /
  `index-DsdZ7MR-.css`；四档无页面级水平溢出、无 page error。
- build 前后 Dashboard dist 文件清单与 SHA-256 完全一致，共享工作树实现 fingerprint 未漂移。

### 视觉 / 无障碍：PASS

- 隔离证据目录：`/tmp/tenon-final-visual-qa.2JMxoo`；真实生产端口 `18842`。
- 四档电脑端矩阵均为唯一 H1、`overflowX=0`、console error 0；rail 恒为 88px，
  7/7 rail SVG 来自 Lucide 且为装饰性。
- light/dark/system、skip link、settings 首焦点/Escape 返焦、Overview 七章节锚点、
  重复 workspace 可见唯一后缀、状态语义与 reduced-motion 均通过。
- 最低抽样复合对比度：light 4.67、dark 5.05。
- LOW：11px workspace 路径长时间扫描舒适性一般；loading 为明确文本而非 skeleton。

### Codex CLI：FAIL

- `codex exec --sandbox read-only --ephemeral` 直接读取完整冻结区间，退出 0 并完成全量审查。
- HIGH：`MODIFIED` 的“统一一级页面层级”删除主规格既有的移动自然重排 MUST；
  Progress 的“状态筛选超过可用宽度”又把既有“超过移动视口”条件替换为“超过桌面内容区”。
  OpenSpec 对 `MODIFIED` 整段替换，结构校验虽通过，归档会静默弱化用户明确要求本 Change
  不应触碰的既有窄屏契约。
- MEDIUM：三态主题按钮固定 `aria-label="Theme"`，覆盖可见的 System/Light/Dark，
  屏幕阅读器无法在操作前获知当前主题偏好。
- MEDIUM：展开后的不可达同 basename 行未取得 DOM id、最短唯一可见后缀和完整 accessible
  name，与 delta 中覆盖所有 workspace 的稳定身份措辞不一致。
- LOW：Onboarding 复制状态的 2 秒 timeout 未保存或清理，快速重复复制可能被旧 timer
  提前重置，卸载后也保留回调。
- Codex 只读沙箱内定向 Vitest 因 Vite 无法写临时 config 而以 `EPERM` 未启动；E2E 隔离轨已
  对相同冻结 SHA 完成对应 47 个定向测试和 1079 个全量测试，均通过。

## 第二轮 OpenSpec 隔离应用演练

- `openspec show ... --json --deltas-only`：退出 0。
- `openspec validate dashboard-ui-ux-overhaul-reconcile-20260729 --strict`：退出 0。
- 隔离归档：退出 0，added 6、modified 2、removed 0。
- 归档后的 `dashboard-ui-ux-system` 定向 strict validate：退出 0。
- 真实主规格 SHA 前后均为
  `cdc31db8411899f7afe4ef2d09dcbd9396f4539d6416ea26ae851d3a1465d4ee`。
- 仓库级 `openspec validate --specs --strict` 的 7 个失败在 `origin/main` 对照副本中完全相同，
  属于既有基线；不影响目标规格结构通过，但也不会掩盖 Codex 找到的语义覆盖问题。

## 第二轮修复决策

持续执行模式按 `verify-fail` 默认修复，不接受偏差：

1. 返回 Spec，把两个 `MODIFIED` requirement 的既有移动 MUST 和 scenario 条件逐字保留，
   桌面行为使用新增且独立命名的 scenario 表达；这只防止误改既有契约，不把手机端纳入本次实现或验收。
2. 主题切换 accessible name 同时包含动作与当前偏好，中英文成对并覆盖 system/light/dark 测试。
3. 不可达行复用 root 派生 DOM id、最短唯一后缀、完整 title/accessibility name；仍保持非交互。
4. 复制反馈保存并清理 timeout，快速重复复制以最后一次操作为准。
5. 重新冻结新 SHA，完整重跑 Reviewer、E2E、Codex 与视觉轨。
