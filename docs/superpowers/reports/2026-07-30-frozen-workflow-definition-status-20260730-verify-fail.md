# Orchestration Graph Foundation 验证报告（第一轮失败）

> Change：`frozen-workflow-definition-status-20260730`
> 冻结构建：`9c442a636babf7ca192ccf6eca02276216ad4f8e`
> 对比基线：`ef728bf63f6902251e87fb9495a3dfafe10e42b7`
> 结论：失败；取得精确 `verify-fail` receipt 后返回 Build 修复

## 结论

Reviewer、E2E/安全、Codex CLI、真实浏览器视觉四轨均已完成且读取同一冻结 SHA。
聚合结论为 **FAIL — Critical 0 / High 0 / Medium 11 / Low 1**，另有一项
OpenSpec 隔离应用硬阻断。冻结实现没有漂移，不能在 Verify 内修复；必须回退 Build，
其中 delta 操作类型需要再用 `requirements-changed` 回 Spec 修订。

## 聚合发现

### 协议、服务端和兼容性

1. **M1 — transition edge ID 不唯一。** 合法 workflow 可让同一 source 的不同 event
   指向同一 target；当前 ID 只有 `kind/source/target`，strict client 因重复 ID 拒绝整图。
2. **M2 — 单 Change GET 触发全局、可能写盘的 snapshot 扫描。**
   `serverOrchestrationRoutes.ts` 通过 `buildSnapshot()` 扫描所有注册项目；缺失 projection
   时还可能修复 `.pipeline.yaml`，违反端点的有界、只读范围。应直接安全读取目标 Change。
3. **M3 — 损坏的目标 Change 被误报为不存在。** 全局 snapshot 吞并目标读取错误后，
   route 返回 400 “找不到 change”，未保留 canonical corruption 的稳定错误语义。
4. **M4 — 缺失 `root` 可隐式落到 server cwd。** route 把 `''` 交给 root resolver；
   cwd 恰为注册 root 时会错误接受请求。必须在 resolver 前显式拒绝空 root。
5. **M5 — 合法空 phase label 不能端到端解码。** kernel 允许空 label，投影保留 `''`，
   strict client 却拒绝空 node label。服务端应提供稳定非空 fallback。
6. **M6 — strict decoder 未闭合 status。** workflow diagnostic 的未知 v1 status 会作为
   原始字符串渲染，未按闭集协议 fail closed。
7. **M7 — 旧 Server 404 与真实 scope 404 无法区分。** Dashboard 把所有 404 当作
   “端点不可用”，注册 root 消失等真实请求错误也会被错误降级。需要稳定 error code。

### Dashboard 图、可访问性和双语

8. **M8 — 有向边与边详情不完整。** 视觉图只有无箭头、无标签的同色 `<line>`；
   选中详情没有 incoming/outgoing 边，语义列表丢失 edge label/event。
9. **M9 — 双语闭环不完整。** review label、metadata key、deferred capability token、
   `failed` 等状态未翻译；英文界面还直接显示中文 phase label。需按闭集 key/value
   映射，不改服务端 canonical label。
10. **M10 — 焦点和选择反馈不可辨。** 3px focus ring 与白底约 `1.20:1`；
    选中态引用未定义 `--blue`，失焦后 computed `box-shadow:none`。
11. **M11 — 边和过滤状态依赖低对比颜色。** 边与画布约 `1.29:1`，无方向/类型标识；
    pressed filter 仅靠颜色变化，需可见勾选或等价非颜色标识。
12. **L1 — 组件职责过重。** 381 行单消费组件同时负责请求、布局和渲染，修复时应至少
    提取纯函数/小组件，避免继续扩大，但不以无价值重构取代上述行为修复。

### OpenSpec 硬阻断

OpenSpec CLI `1.6.0`：

- `openspec show frozen-workflow-definition-status-20260730 --json --deltas-only`：exit 0，
  deltaCount 7；
- `openspec validate frozen-workflow-definition-status-20260730 --strict`：exit 0；
- 隔离副本 `openspec archive ... --yes --json`：exit 1，
  `archive_spec_update_failed`，且明确 `No files were changed`。

原因是 delta 将不存在的 canonical capability
`frozen-workflow-definition-status` 写成 `MODIFIED Requirements`；新 spec 必须使用
`ADDED Requirements`。真实 `openspec/specs/` 前后 aggregate digest 均为
`ee9ec373…`，没有被 Verify 演练修改。

## 各轨证据

### Reviewer

结论：FAIL，C0/H0/M3/L0。完整回读冻结 diff、调用方、测试、生成物、correctness、
security、错误处理、并发、兼容与运维；确认 M1、M8、M9。`git diff --check` exit 0。

### E2E / 安全

结论：FAIL，C0/H0/M3/L0。确认 M1、M4、M5；route/projection 4/4、真实 HTTP
2/2、strict decoder/UI/键盘/错误态 12/12、workflow definition 安全 reader 11/11
均通过。未发现新增写 API、tracked persistence、secret、原始异常或完整路径泄露。
生产端口 `18977` 在黑盒复核前已停止，三次连接均失败，因此未将该次 smoke 计为通过。

### Codex CLI

结论：FAIL，C0/H0/M7/L1。首个完整二进制/生成物 diff 超过 1 MiB 输入上限，exit 1；
去除 dist 与 canonical run logs 后重试，session
`019fb1c3-7ad9-76a2-b073-2a4efc5fd16e` 最终 exit 0。它独立确认 M1–M3、M6–M9
与 L1。定向 Server 311 pass/9 skip、Dashboard 53/53、`typecheck:web` 和
`git diff --check` 均通过。logs DB/model cache warnings 是工具环境噪声，不是产品通过项。

### 真实浏览器视觉

结论：FAIL，C0/H0/M4/L0。独立 production Dashboard 端口 `19277`：

- 1024/1440/1920 无页面级横向溢出；
- loading、500、retry、真实空态、过滤空态均可用；
- End → Enter → Escape 完成焦点、选择、清除，Change URL 不变；
- 确认 M9–M11；英文阶段中文泄漏、焦点/选择不可辨、边与 filter 依赖低对比颜色；
- 浏览器与服务结束后均已关闭，未留下额外 runtime。

截图位于仓库外：
`/tmp/tenon-orchestration-{visual-1024-card,visual-1440,visual-1920-card,loading-1440,error-1440,empty-1440,filtered-empty-1440,en-1440,keyboard-focus-1440}.png`。

## 已执行验证

- 定向 frontend：53/53；
- 完整 Web：71 files / 1227 pass；
- 完整 root：331 files / 5760 pass / 14 honest skips；
- rebase 后受影响 Server：311 pass / 9 skip；
- `typecheck:web`、`test:web`、`build:web`、`build:server`、root `build`：pass；
- hooks：512 pass；architecture：676 production files pass；
- bundle、docs、identity、interaction contract、hygiene：pass；
- oracle：5 fixtures / 0 differences；
- OpenSpec strict validate：pass；隔离 archive/apply：fail（见上）。

Vite 仅有既存 `>500 kB` chunk warning。测试绿色不能覆盖上面的协议和视觉缺陷，
所以不构成 Verify pass。

## 逐文件 capability 回读

| 路径类别 | capability / 规范 | 结论 |
| --- | --- | --- |
| `packages/server/src/orchestrationGraph*` | `orchestration-graph` | 已回读；M1/M5/M9 |
| `packages/server/src/serverOrchestration*` | `orchestration-graph` | 已回读；M2/M3/M4/M7 |
| `packages/server/src/workflowDefinitionStatus*` | `frozen-workflow-definition-status` | 已回读；功能本体安全 |
| `packages/dashboard-app/src/api/*Graph*` | `orchestration-graph` | 已回读；M1/M5/M6/M7 |
| `packages/dashboard-app/src/shared/OrchestrationGraphCard*` | `orchestration-graph` | 已回读；M8–M11/L1 |
| `TaskDetail.tsx`、`client.ts`、`translations.ts` | `orchestration-graph` | 已回读；入口正确，M9 |
| docs、ADR、plan、Change proposal/design/spec/tasks | 两个 delta capability | 已回读；archive 操作类型阻断 |
| `packages/*/dist/**` | 对应源码生成物 | 已回读；冻结版本新鲜 |

全部冻结提交路径均归入以上互斥类别；没有未映射交付文件。

## Repo-zero 与修复计划

聚合前后 HEAD 均为 `9c442a636babf7ca192ccf6eca02276216ad4f8e`。
实现/配置/生成物与真实 main specs 相对 HEAD 的 diff digest 均为
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`；
只有本 Change 的合法 Verify canonical receipt/state 在运行中更新。

下一轮必须：

1. 登记本报告，取得 exact-event `verify-fail` delegated receipt，返回 Build；
2. 用 `requirements-changed` 进入 Spec，将新 capability delta 改为 `ADDED` 并重新 review；
3. 先补上述边界和 UI 行为红测，再最小修复、重建生成物、真实浏览器复验；
4. 重新完成 Build pre-Verify review、冻结新 SHA，并从零重跑四轨及隔离 archive/apply；
5. 只有 C/H/M 全零、OpenSpec 应用成功、冻结 fingerprint 不漂移时才能 `verify-pass`。
