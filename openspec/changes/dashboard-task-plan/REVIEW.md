# Dashboard TaskPlan Build review

## Build decisions

- `build_mode=direct`, `isolation=worktree`, `direct_override=true`：统一 Dashboard 会同时收敛
  Progress、Workbench、AFK 与共享 API decoder，文件和交互边界高度重叠；用户又明确禁止新增或替换
  worktree，因此在宿主已提供的专用 worktree 内串行收敛是最保守、可逆且可审计的选择。
- 2026-08-04 已通过 `git merge --ff-only` 把共同传递基线快进到 PR1 head
  `7a46dfdc511e20609a4a3c8a57a8487ff755a5b6`。PR4 发布前不复制 PR2–PR4 的公共契约；最终实现和
  Verify 必须重新整合 `codex/task-dag-scheduler-20260803` 的最新远端 head。

## Baseline verification

- `npm ci`：通过，0 vulnerabilities。
- `npm run build`：通过；正式 Web/server/CLI 生成物重建后无 tracked diff。
- PR1 TaskPlan 定向测试：138/138 通过。
- `npm run typecheck:web`：通过。
- PR1 共同基线 `npm run test:web -- --minWorkers=4 --maxWorkers=4`：87 files、1633/1633
  通过；该结果只证明共同基线，不替代最终堆叠 Verify。

## Browser owner audit

状态：`pending`，尚未执行浏览器验收。

- 审计时 Codex host 已有 11 个历史 `playwright-mcp` node、3 个历史 Playwright browser root，另有
  1 个用户日常 Chrome root。
- 这些既有进程没有可证明的本项目 owner/session 身份；本任务不会盲连、冒认或终止它们。
- 实现冻结后必须建立或复用一个可证明身份的项目专用长期 owner，并在同一 owner 中完成
  1024/1280/1440/1920px、zh/en、状态矩阵、键盘与焦点验收；截图和日志写入仓库外目录。

## Design review rounds

状态：`pending`。实现后按 `frontend-design`、`web-design-guidelines` 与
`design-taste-frontend` 执行评审、修复和复评，直到 Critical/High/Medium 为零。
