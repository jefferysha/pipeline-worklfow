# Dashboard TaskPlan Build review

## Build decisions

- `build_mode=subagent-driven-development`、`isolation=worktree`。主线程负责拆解、复杂性与风险决策、
  code review、finding 分级和最终验收；`luna_worker` 只在独立 worktree 中实施边界明确的任务。
- PR5 已在 ancestry 校验后整合 PR4 最终已归档 head `673465c24aecd12b9f7178227bf9423f1d01c07b`
  及 merge commit `285f042b4edb6edf4e866b4ce93d75a772d4d195`，不复制或重定义 PR3/PR4 的
  WorkflowPolicy、TaskPlan、TaskRun 与调度契约。
- 实施分为严格 TaskPlan client、Workflow policy runtime summary、WorkItem evidence/read-only TaskRun、
  TaskPlan inspection panel 和 TaskDetail integration。写入任务均在独立 worktree 完成，主线程逐项读取
  完整 diff、复跑测试并决定接受或退回。

## Baseline verification

- `npm run test:web -- --minWorkers=4 --maxWorkers=4`：96 files、1735/1735 通过；首次运行仅因
  worktree 缺少 `packages/kernel/dist` 无法加载 API integration，生成仓库测试所需声明产物后从头复跑全绿。
- `npm test -- --minWorkers=4 --maxWorkers=4`：通过（包含 TaskPlan、TaskRun、workflow、server、CLI
  与 automation 回归；真实 Codex 条件用例按仓库契约诚实 skip）。
- `npm run typecheck:web`、`npm run build`：通过；Dashboard tracked release assets 已由最终源码重建。
- TaskPlan client/panel、i18n、policy summary、Skill evidence、read-only TaskRun 和 TaskDetail integration
  定向测试均由主线程在接受实现前复跑通过。

## Browser owner audit

状态：`pending`，尚未执行浏览器验收。

- 审计时 Codex host 已有 11 个历史 `playwright-mcp` node、3 个历史 Playwright browser root，另有
  1 个用户日常 Chrome root。
- 这些既有进程没有可证明的本项目 owner/session 身份；本任务不会盲连、冒认或终止它们。
- 实现冻结后必须建立或复用一个可证明身份的项目专用长期 owner，并在同一 owner 中完成
  1024/1280/1440/1920px、zh/en、状态矩阵、键盘与焦点验收；截图和日志写入仓库外目录。

## Design review rounds

状态：Build 收敛通过；真实浏览器验收仍在 Verify 执行。

### Round 1 — 主线程全量 Standards + Spec 审查

- 覆盖严格 API decoder、TaskPlan 状态机、canonical/legacy 展示、策略 runtime summary、WorkItem 证据、
  只读 TaskRun、TaskDetail 装配、zh/en、键盘/focus、release assets 与 OpenSpec 契约。
- 退回两个阻塞问题：普通 refresh 尚未失败就提前标记 stale；语言测试通过重新挂载读取 localStorage，
  没有证明已挂载界面能真实切换语言。
- 退回 read-only helper 的两个阻塞问题：TaskRun 绕过共享 `taskRunPresentation` 且存在 O(n²) 查找；
  WorkItem 空证据错误复用“整个 Change 无证据”文案。

### Round 2 — 修复复评

- refresh 进行中保留缓存但不提前 stale，失败后才显示 stale/retry；已有 stale 的 retry 保持诚实状态。
- 同一 `I18nProvider` 通过 `setLang` 完成 zh→en 运行时切换测试。
- TaskRun 默认/只读路径共用服务端 DTO 的 `taskRunPresentation`，只读路径无操作按钮且不发 POST。
- WorkItem 证据有独立 zh/en 空态；scope-key 在 root/Change 切换的首次新渲染即屏蔽旧 WorkItem。
- `TaskDetail.tsx` 保持 396 行；新增 46 行单一职责协调组件，未把跨域装配继续堆进共享详情。

### 最终结论

- Critical / High / Medium：0。
- Low：严格 TaskPlan decoder 文件较长，但它是单一封闭协议边界，拥有 37 项专门测试、节点/文本/数组预算、
  closed-schema 校验和稳定错误码；本 Change 不为行数偏好拆散同一 wire contract。
- 没有客户端调度、wave 推导或写端点复制；TaskPlan/TaskRun/WorkflowPolicy 均只消费服务端权威结果。
