---
change: issue-43-phase-skill-enforcement
design-doc: docs/superpowers/specs/issue-43-phase-skill-enforcement-design.md
locale: zh-CN
---

# 实施计划

## 实施边界

唯一实现执行者为一个 `luna_worker`；根代理保留任务拆解、代码 review、finding 定级与最终验收。
worker 在当前用户分配的独立 worktree 中串行写入，不创建/替换 worktree，不提交、不推送，不修改
canonical Tenon state、ledger、review receipts、本机插件或主 checkout 的 PNG。

允许修改的实现面：

- `templates/workflows/default.yaml` 及其受控 generated/runtime/dist 投影；
- `packages/kernel/src/workflow/` 的 effective Skill/plan/bundle resolver 与测试；
- `packages/cli/src/commands/` 中 Hook、artifact、doctor，`executionCoordinatePort.ts` 及集成测试；
- `packages/automation/src/admission/` 的 coordinate/preparation 契约与测试；
- 仅为证明共享 transition 行为所需的 CLI/Server transition 测试；
- manifest 注释/fixtures、`skills/tenon/SKILL.md`、适用英文和 zh-CN usage 文档、docs/freshness 检查；
- build 命令确定生成的 tracked `dist/`、bundle 或 fixture。

非目标：不新增 public Workflow/Track schema，不迁移历史 snapshot，不改变 custom/simple DAG、review
budget、receipt ABI、canonical state schema、automation eligibility、版本号或发布流程。

## 子阶段 1：Tracer bullet — resolver 到 free/default transition

- [ ] 先在 kernel resolver、真实 Hook 和 CLI transition 增加 RED：default phase slot 不受
  `matrix=false` 影响，缺 receipt 时 free/default Hook/exit 均拒绝；确认失败原因命中旧缺口。
- [ ] 在 `templates/workflows/default.yaml` 声明七个 `tenon-<phase>`，实现 phase/overlay/explicit-profile
  三种统一投影并保持 custom、matrix-enabled、stable-dedupe 行为。
- [ ] 让 Hook 阻断 phase receipt 前的 declared/optional Skill，让 CLI/Server transition 继续共享
  required projection；运行 kernel + Hook + CLI/Server transition 定向测试。

验收：一个新建 free/default Change 从 default source、effective plan、Hook 到 transition 形成最小纵向
闭环；缺 phase receipt 为 RED，补当前 visit receipt 后为 GREEN。

**子阶段边界：此处建议 /clear。**

## 子阶段 2：AFK 与显式 profile 兼容

- [ ] 扩展 default execution coordinate/bundle input，使 frozen capability 与 digest 进入 AFK
  preparation；显式 `skill_bundle_id` 使用 phase + named profile，不反向改变 matrix gate。
- [ ] 增加 bundle/preparation RED：profile 合法但 phase Skill 不可定位时拒绝；成功 snapshot phase-first；
  custom bundle、TOCTOU reason 和无收费/无 sandbox 行为保持。
- [ ] 保留 artifact free profile producer 合同，改为具名 explicit-profile 投影并补 phase-first/兼容测试。

验收：Hook/transition 的 free 仅 phase，artifact/AFK 的显式 profile 同时包含 phase 与既有 allowlist，
三者不再通过 ad-hoc `matrix=false` 解释互相污染。

**子阶段边界：此处建议 /clear。**

## 子阶段 3：观测、发行投影与文档

- [ ] doctor 从编译后的 default Workflow 派生 phase requirements，并区分 overlay/explicit profile；
  更新 manifest/runtime 注释与 doctor tests。
- [ ] 同步 `skills/tenon/SKILL.md`、英文/zh-CN usage 文档与 CI contract check；生成 default runtime、
  tracked dist/bundle/fixtures，确保 source/generated/documented drift 可机械失败。
- [ ] 只运行风险匹配的定向 typecheck/tests/freshness，向根代理回传 diff、RED→GREEN 命令、真实 skip 和
  残余风险；不得自审或给最终 PASS。

验收：定向门全部绿，`git diff --check` 无错误，受控生成物与源一致。完整全仓最终门由根代理在实现
稳定并完成 code review 后只运行一次。

**子阶段边界：此处建议 /clear。**

## 原型决策

不插入一次性 prototype：缺口已由现有 resolver、snapshot、Hook/transition 与 AFK seam 确定性复现，
没有未知外部 API、数据模型或状态机需要先摸底。采用 TDD tracer bullet 是更小且可回滚的验证路径。

## 根代理 Review 与验收

- 根代理逐文件检查 worker diff，核对 issue #43 每条 Acceptance/Measurement 与本 delta spec。
- Build 收敛后先 fetch `origin/main` 并验证祖先关系；将稳定实现提交为 candidate commit，再在该精确
  `HEAD` 上只运行一次完整最终门。确认工作区无未提交实现后，才触发 `build-complete`，使 `build_sha`
  绑定该 candidate SHA。
- Verify 的 code-review 尝试全 issue 最多两次；只围绕已确认 finding 回 Build，不能换 Skill/agent
  重置计数。定向 regression、package build/typecheck、hook adapters、default workflow/docs/release
  freshness 与完整测试套件属于同一次最终门；无 UI diff，browser E2E 明确 N/A。
- Verify/Ship/Archive 完成后 push、创建含 `Closes #43` 的 PR 并等待 exact-head CI。不得 merge 或发布。

## 验证命令基线

- `npm test -- --minWorkers=4 --maxWorkers=4 <targeted test files>`（具体文件按实现落点）
- `npm run generate:default-workflow && npm run check:default-workflow-freshness`
- `npm run check:docs`（含 default phase Skill source/generated/Skills/中英文文档 contract check）
- `npm run build`
- `npm test -- --minWorkers=4 --maxWorkers=4`（仅最终门）

## 回滚

回滚本 Change 的单一提交即可恢复旧 resolver/default source；不得手改或回退用户的其他 worktree
变更。若 exact-head CI 发现 public contract finding，保留 PR/Change 证据并在两次 review 上限内仅修复
确认项；超限则报告 blocked。
