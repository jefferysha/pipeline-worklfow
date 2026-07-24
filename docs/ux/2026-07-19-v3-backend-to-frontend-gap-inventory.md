# v3 后端能力 → 前端/生产接入全量复扫

> 复扫日期：2026-07-20
> 范围：`GOAL.md` G1–G6、T-R1–R7、H1–H15，以及对应 server/CLI 生产用例。
> 判定基准：同时检查 source、构建产物、真实 HTTP、真实浏览器和真实 Docker/Codex 落盘事实；不以组件存在或测试替代生产验收。

## 0. 结论

当前没有“后端已有公共用例、前端完全没有体现”的 v3 功能。此前盘点中的 P0/P1 零接入项已经清零，source、dist、live 已同步。

| 层级 | 当前真值 |
|---|---|
| Source | Change Route Lock、Track/Workflow Studio、Operations、Run Audit、Machine、cadence、H2 context 等均已接线 |
| Production dist | kernel/automation/CLI/server/dashboard 已重建；当前 SPA 为 `index-DVqNjuRz.js` |
| Live | 真实 server 运行于 `http://127.0.0.1:18765/`，health/API/HTML/JS/CSS 均返回 HTTP 200 |
| Real run | 浏览器发起 `ui-real-browser` L1：Docker 中真实 Codex 创建 Git commit `b389cb806e26…`；ledger 记录 provider usage 78,635 tokens；H7 验证门因缺可信 verifier 而 fail-closed 暂停，未误合并 |
| Black box | `PIPELINE_REQUIRE_REAL_CODEX=1` 的 H14 10/10、零 skip、exit 0；覆盖真实 L1、真实 L3 merge、budget-before-Docker |
| Task SSOT | `GOAL.md` 94/94 已勾选、0 未勾选；`BACKLOG.md` 当前队列为空。历史计划文档中的未勾选步骤不作为当前待办真相源 |

“全部接入”不表示把没有后端契约的按钮画出来。Re-verify、逐边 policy-decision facts、Change intent 持久化仍属于后端/产品契约边界，见第 3 节。

## 1. v3 工作包覆盖总表

| 工作包 | 前端产品面 | 当前判定 |
|---|---|---|
| G1 WorkflowRun / revision / TransitionRecord | Run identity、当前 revision、完整 revision/mutation/digest 历史、Transition effects、projection repair/import | 完整 |
| G2 Workflow IR / Artifact | Step prompt、inputs/outputs、artifact producer policy、guards、edge action/transition、真实 artifact register | 完整 |
| G3 Hook 控制面 | event 分组、required/toggleable/unsupported、matcher/script/scope、真实 toggle | 完整 |
| G4 channel compatibility | GOAL 明确为 historical/experimental CLI compatibility，禁止新增 dashboard 默认运行面 | 有意不接，不是缺口 |
| G5 ExecutionContext / DAG | Run/attempt/reservation/iteration、reservation owner、ledger 生命周期、执行结算与 Git build artifacts | 完整到当前投影边界 |
| G6 Workflow CRUD | create/copy/save/delete、default 只读、结构化 blocker | 完整 |
| T-R1–R4/R6/R7 | effective registry、Track CRUD、builtin 锁、policy template/profile、workflow allowed、skill profile/继承、删除 blocker | 完整 |
| T-R5 Router | Change 创建前真实 Route Lock；Track Studio 可用代表 intent 实时预览 winner/score/priority/digest | 完整到公共 preview API 边界 |
| H1 durable ledger | 全生命周期 timeline、坏行 line/hash/error、owner、budget/usage/merge/run | 完整 |
| H2 attempt context / stagnation | source records、omitted attempts、rendered context、fingerprint、repeated attempts、stagnant 状态 | 完整 |
| H3/H11 starters | 版本化模板、paused draft、wiring、真实 init | 完整 |
| H4 immutable goal/policy | goal、policy id/version/digest/captured time | 完整 |
| H5 constraints | 冻结 allow/deny/human gates、budget、kill policy、terminal reason | 完整到现有 ledger 投影边界 |
| H6 provider budget/usage | provider/model/request、input/output/cached/reasoning/total、reserved/charged/source | 完整 |
| H7 verifier | verdict、issuer/trust、subject SHA、binding、evidence、policy binding | 完整到公共只读用例边界 |
| H8 kill switch | required status、inactive action、四个 recheck 点、terminal reason | 完整到现有 ledger 投影边界 |
| H9 iteration/run split | LoopIteration、WorkflowRun、Attempt、Reservation identity 与关联 timeline | 完整 |
| H10 skill snapshot | bundle/source/snapshot/CAS、workflow/step/track、coordinate/epoch、alternatives/concrete/tree digest | 完整 |
| H12 triage | 真实确认入口、observation/classification/reason、checkpoint、created/existing WorkflowRun 卡片与 Change 跳转 | 完整 |
| H13 sync | dry-run/apply、双确认、current/desired/risk/CAS blocker 与 plan 结构化展示 | 完整 |
| H14 real run | dry-run/real/L3 确认、admission/runner/level/settlement/budget/ledger/skill bundle、运行中队列、结果与 Run 跳转 | 完整 |
| H15 cadence | Global server 真实时钟、poll 状态、last/next/due、durable ledger 与真实 CLI exit code | 完整 |

## 2. 已清零的原“前端零接入”项

1. H2 Attempt Context 已进入 Run Audit。
2. AFK enqueue/retry/dismiss 已有真 Web 动作；结果可跳精确 Change。
3. Add Project 已成为 no-project 主路径，并走注册端点。
4. canonical revision/effects/rejected/owner 已完整消费，不再丢 HTTP 字段。
5. Machine 页面统一展示 Docker、镜像、Codex 登录来源、skills、operations 和跨项目风险。
6. Track Studio 已接 router preview；Change 创建会锁定并展示真实路由结果。
7. Loop graduation 在点击前展示 authoritative preflight，server 仍持最终裁决权。
8. Operations 不再以 raw JSON 为主界面；Triage/Sync/Run 各有结构化结果卡，raw output 只留诊断折叠层。
9. URL 已保存 `view/root/change`；创建、AFK、Triage、Run result 都能打开精确 Change，刷新保持位置。
10. 真实 cadence scheduler 已实现并在浏览器显示在线状态，不再把“能编辑 cadence”冒充“已调度”。

## 3. 仍未画成按钮的能力边界

这些不是“前端漏接”，而是当前没有可诚实调用的公共后端契约：

1. **Re-verify**：没有公共 re-verification command/API。前端不能重放旧 verdict 冒充重新验证。
2. **逐边 policy-decision facts**：ledger 目前没有为 admission/write/transition/merge 每次 evaluator 决定都产出独立结构化事实；UI 只能展示冻结 policy、recheck 链和终局。
3. **Change intent/goal 持久化**：`POST /api/changes` 的 intent 是 Router 输入，不进入 Change goal；创建对话框已明确说明这一点。
4. **G4 channel runtime 页面**：GOAL 明确冻结为 compatibility surface；除非重新定义具名产品场景，否则不扩建默认 UI。

## 4. 仍可增强、但不构成功能阉割的交互

1. Run Audit 目前作为精确 Change deep-link 内的审计区，不另建重复的顶级 Run 路由。
2. Track preview 是单条代表 intent 模拟器；批量比较所有现有 Change 需要新的批量影响 API。
3. 浏览器在 real run 期间展示 running/queue 和完成结果，但不是逐 ledger record 的 WebSocket 日志流；完成后可进入完整 Run Audit。
4. 本机 skills readiness 诚实显示 66/67；唯一缺项 `zoom-out` 是上游已移除、registry 明确标为 unavailable 的 optional skill，既不伪造安装命令也不构成机器阻断。
5. Change 阶段声明字段仍只显示 canonical state；automation 的 branch/build SHA 不反写伪字段，而是在 Run Audit 的“执行结算与 Git 构建产物”卡展示 ledger 真值。

## 5. 真实浏览器验收覆盖

- Add Project 注册隔离 Git 工程。
- Workbench 读取真实 workflow、tracks、skills、hooks。
- Create Change Route Lock 选择 Frontend，创建后自动打开精确 Change；刷新保持 deep-link。
- Track Studio 新建 `design-e2e`、应用 frontend policy、预览路由分数并保存。
- Starter 创建 paused Loop；Loop run dry-run、sync dry-run、AFK enqueue 与结果跳转。
- Machine 识别 Docker、`sandcastle:local`、Codex `default-home` 登录和真实 skill blockers。
- 浏览器真实启动 `ui-real-browser`：UI → HTTP → CLI → Docker → Codex → Git branch → ledger → Run Audit 全链通过；无可信 verifier 时按 H7 暂停、未误合并。
- Run Audit 展示 canonical revisions、policy、owner、H2 context、usage、verification、skill snapshot、execution artifacts 和 ledger timeline。
- 浏览器控制台的 GSAP 空目标 warning 已修复；生产页面重载后无该 warning。

## 6. 完成门

- source、dist、live 同版本。
- build、主测试、web 测试、oracle、default-workflow freshness、hooks、skills、adapters、bundle、CLI binary 全部以真实 exit code 0 收官。
- `PIPELINE_REQUIRE_REAL_CODEX=1` 的 H14 必须 10/10、零 skip。
- 真实浏览器必须至少走一次非 dry-run Codex/Docker 执行，并独立核 Git commit、产物字节、ledger 和 Run Audit。
