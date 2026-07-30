---
change: frozen-workflow-definition-status-20260730
design-doc: docs/superpowers/specs/frozen-workflow-definition-status-20260730-design.md
---

# Orchestration Graph Foundation 实施计划

## 目标与边界

交付只读 graph v1 纵向切片：真实 Server 投影、严格 Dashboard client、可交互/可访问图、双语完整
状态和浏览器验收。现有 definition status 成为 workflow node 属性。不得新增写权限、canonical
字段、依赖或 persistence。

## 子阶段 1：Tracer bullet 端到端最小链路

1. 新建 `packages/server/src/orchestrationGraph.ts` 与测试，从 `ChangeSnapshot` 投影稳定
   workflow/change/phase/task/document/review/session nodes/edges。
2. 新建 `packages/server/src/serverOrchestrationGraphRoutes.ts` 与真实 HTTP 测试，复用 registered
   root、snapshot 和 definition status。
3. 新建 `packages/dashboard-app/src/api/orchestrationGraphClient.ts` 与严格 decoder 测试。
4. 新建 `packages/dashboard-app/src/shared/OrchestrationGraphCard.tsx`，在 `TaskDetail.tsx` 替换窄
   definition card挂载，先打通 loading→graph→selection。
5. 运行 server/client/component 定向测试。

验证：

```bash
npm test -- packages/server/src/orchestrationGraph.test.ts packages/server/src/serverOrchestrationGraphRoutes.test.ts
npm run test:web -- packages/dashboard-app/src/api/orchestrationGraphClient.test.tsx packages/dashboard-app/src/shared/OrchestrationGraphCard.test.tsx
```

回滚：删除新图文件与 route/mount；保留独立 definition comparator 也不会改变执行。

**子阶段边界：此处建议 /clear**

## 子阶段 2：交互、状态、i18n 与安全闭环

1. 以 TDD 补齐稳定排序、文档路径不泄露、review/session 可选节点、非法 scope 和 definition
   changed/missing/invalid/unavailable。
2. strict decoder 补齐唯一 id、枚举、悬空边、coverage 和畸形 200 fail-closed。
3. 图组件补齐类型 filters、search、visible edge、selection/detail、Arrow/Home/End/Escape、
   accessible node/edge list。
4. 中英文补齐 loading/error/retry/true-empty/filtered-empty/unavailable/node/edge/coverage。
5. 覆盖 abort/generation 迟到响应和 reduced motion/focus visible。

验证：

```bash
npm test -- packages/server/src/orchestrationGraph.test.ts packages/server/src/serverOrchestrationGraphRoutes.test.ts packages/server/src/server.test.ts
npm run test:web -- packages/dashboard-app/src/api/orchestrationGraphClient.test.tsx packages/dashboard-app/src/shared/OrchestrationGraphCard.test.tsx packages/dashboard-app/src/shared/TaskDetail.test.tsx
npm run typecheck:web
```

回滚：移除图 UI/client/route；无状态修复。

**子阶段边界：此处建议 /clear**

## 子阶段 3：真实集成、浏览器与冻结基线

1. 启动当前 worktree 的 production Dashboard，验证页面 title、端口和项目/Change identity。
2. 在 1024/1440/1920 验收成功、加载、error/retry、真实空、过滤空、404 unavailable、中英文、
   light/dark 与键盘路径。
3. 验证 definition drift 只改变 workflow node诊断，不改变 phase/edges/readiness。
4. 运行 typecheck:web、test:web、build:web/build、npm test 和受影响 hooks/adapters/skills 门禁。
5. 更新 tasks/验证报告/ledger，提交并冻结精确 build SHA。

验证：

```bash
npm run typecheck:web
npm run test:web
npm run build:web
npm run build
npm test
```

兼容：旧 Server 404 降级 unavailable；未知/畸形 v1 fail closed。回滚为单提交 revert。

**原型决策**：当前 snapshot/read model、严格 GET 模式与 Dashboard 测试基建均已存在；持续授权下
选择不做一次性 prototype，直接以 TDD tracer bullet 验证未知点，避免引入未治理临时代码。
