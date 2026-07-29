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
