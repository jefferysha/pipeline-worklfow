---
change: dashboard-host-plan-clarity-20260729
design-doc: docs/superpowers/specs/2026-07-29-dashboard-host-plan-clarity-design.md
---

# Host Plan 桌面信息清晰度实施计划

## 目标与边界

在不改变 `host-target-plan/v1`、server、App/Nav、全局 token、依赖或只读语义的前提下，把 12 个高重复宿主卡片改为紧凑目录，并把完整 capabilities 集中到已选宿主详情。只验证 1024–1920px 电脑端。

## 原型决策

不插入一次性 prototype。现有生产页面、真实 catalog、组件测试和浏览器基线已经证明数据、状态机与 master-detail 可运行；本批次只改变既有字段的展示归属，不存在需要用原型排除的数据模型或状态机未知。

## 子阶段 1：Tracer bullet——从目录选择到详情上下文

**受影响文件**

- `packages/dashboard-app/src/hostPlan/HostTargetPlanView.test.tsx`
- `packages/dashboard-app/src/hostPlan/HostTargetPlanView.tsx`
- `packages/dashboard-app/src/hostPlan/HostOperationPlanPanel.tsx`

**步骤**

1. 先在 `HostTargetPlanView.test.tsx` 增加失败断言：目录项只显示 name/flag/kind/scope，未选项不重复 capability；选择 Codex 后详情在 operation group 前展示全部 capabilities。
2. 将目录 article 压缩为稳定的横向信息行和全宽选择动作，保留原始 catalog 顺序、`aria-pressed` 与 data attributes。
3. 在 `HostOperationPlanPanel` 顶部加入已选宿主摘要，复用现有 kind/scope/capability 翻译 key。
4. 运行：
   `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/hostPlan/HostTargetPlanView.test.tsx`

**预期行为**

一条最小纵向链路“真实 catalog → 紧凑目录 → 选择宿主 → 详情 capabilities → operation group”贯通，API 和请求状态不变。

**回滚**

恢复两个组件的 JSX/className 与对应测试，不涉及数据迁移。

> 此处建议 /clear

## 子阶段 2：状态、可访问性与桌面布局回归

**受影响文件**

- `packages/dashboard-app/src/hostPlan/HostTargetPlanView.test.tsx`
- `packages/dashboard-app/src/hostPlan/HostTargetPlanView.tsx`
- `packages/dashboard-app/src/hostPlan/HostOperationPlanPanel.tsx`

**步骤**

1. 覆盖 loading/error/empty/retry、plan loading/error/ready、切换宿主取消旧请求与复制反馈现有分支。
2. 断言视觉顺序与 DOM 顺序一致，详情标题/operation group、`aria-pressed` 和 live status 保持。
3. 运行定向测试与 `npm run typecheck:web`。

**预期行为**

布局重排不改变状态所有权、取消语义、错误映射或键盘可达性。

**回滚**

删除新增断言并恢复组件展示；API client 与 i18n 不受影响。

> 此处建议 /clear

## 子阶段 3：构建与真实电脑端验收

**步骤**

1. 运行 `npm run test:web`、`npm run build:web`；检查 tracked Dashboard dist freshness。
2. 启动真实同源 Dashboard，覆盖 1024×768、1200×870、1440×900、1920×1080。
3. 对 light/dark/system、键盘、成功/loading/error/empty、复制成功/失败和 reduced-motion 做浏览器验收。
4. 测量 1024×768 至少完整显示 6 个目录项；四视口无横向溢出、目录/详情无重叠。
5. 将命令、结果、截图位置、DOM/几何断言与残余风险写入 verification report。

**预期行为**

目标页面真实可用，视觉密度提升有量化证据，构建与测试不代替浏览器结论。

**回滚**

回滚本批次提交即可；无配置、协议、依赖或持久数据回滚。
