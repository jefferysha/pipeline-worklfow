---
change: dashboard-operations-clarity-20260803
design-doc: docs/superpowers/specs/2026-08-03-dashboard-operations-clarity-design.md
---

# Dashboard 操作清晰度实施计划

## 执行原则

以一个最终 PR 交付并统一 review。每个子阶段先写/更新相邻测试，再实现最小通过面；不修改 canonical
Change 文件或手工写 ledger。现有实现和契约入口足够验证风险，本轮不制作一次性 prototype；第一阶段
用真实 repository identity→Snapshot→Projects 分组纵向链路作为 tracer bullet。

## 子阶段 1：Tracer bullet——仓库身份到 Projects 分组

1. 在 `packages/server/src/` 新增安全 repository identity probe，固定 Git argv、超时、hash 与
   primary/worktree 分类；为成功、非 Git、超时和无效输出添加单元测试。
2. 扩展 `packages/server/src/types.ts`、`snapshot.ts`、`main.ts` 与 snapshot tests，把 optional
   repository identity 投影进 `tenon-snapshot/v2`。
3. 扩展 `packages/dashboard-app/src/types.ts`、`api/snapshotDecoder.ts` 与 decoder tests；在
   `shell/projectsModel.ts` 生成 repository groups，在 `ProjectsView.tsx` 先渲染最小组→workspace 链路。
4. 运行 `npm test -- --run packages/server/src/snapshot.test.ts packages/dashboard-app/src/api/boundaryDecoders.test.tsx packages/dashboard-app/src/shell/ProjectsView.test.tsx --minWorkers=4 --maxWorkers=4`。

回滚：删除 optional repository 字段与 group projection 后，旧 root 列表仍可恢复。

**子阶段边界：此处建议 /clear。**

## 子阶段 2：Projects 完整交互与失效清理

1. 在 `projectsModel.ts` 固化 group 聚合、稳定排序、旧 Snapshot fallback、搜索/状态筛选口径。
2. 重构 `ProjectsView.tsx` 为项目组 header + workspace rows；补齐中英文项目/workspace/primary/worktree
   文案、组展开键盘语义与四档桌面布局。
3. 复用 `api/governanceClient.ts::unregisterProject` 实现批量失效登记确认、顺序/有界注销、部分失败和
   refresh；不得调用文件删除 API。
4. 扩展 `ProjectsView.test.tsx`、focus/model tests 覆盖同仓、同名异仓、无 repository、批量成功/部分失败。

验证：定向 Vitest + TypeScript；fixture 中至少包含 2 个 repo group、4 个 worktree 与 2 个失效 root。

**子阶段边界：此处建议 /clear。**

## 子阶段 3：编排主线与 Workbench 控制面

1. 在 `shared/orchestrationGraphPresentation.ts` 增加 phase trunk、secondary relations、resource groups
   的纯函数与 tests。
2. 重构 `OrchestrationGraphCard.tsx`：scope context、等尺寸阶段轨、关系区、资源区；保留筛选、搜索、
   selection、键盘与 `OrchestrationGraphAccessibleList`，移除造成交叉蛛网的全边 SVG overlay。
3. 扩展 `OrchestrationGraphCard.test.tsx`，覆盖七阶段、回退边、contains 边、1024 横向轨与键盘。
4. 让 `WorkbenchHeader.tsx` 接收 Track control row，`WorkbenchView.tsx` 移除第二外框；统一
   `TrackSelector.tsx` 与 `workbenchStyles.ts` 控件高度/圆角/padding。
5. 更新 Workbench/TrackSelector tests 与中英文文案完整性测试。

验证：两个功能域定向 Vitest、前端 typecheck，并在 1024/1440 静态测量外框与溢出。

**子阶段边界：此处建议 /clear。**

## 子阶段 4：Machine 语义与 Host 自动检测

1. 重构 `MachineView.tsx` readiness model 为 core 与 AFK optional 两组；Docker/image 不进入全局
   blockers，Loop canonical risks 保持；扩展 `MachineView.test.tsx`。
2. 在 `serverGetHostTargetPlanRoutes.ts` 或相邻模块实现严格 `host-target-detection/v1` 与 GET 路由，
   只检查 native host/plugin 存在性；扩展 route/server tests。
3. 新增前端 detection type/decoder/client，保持 catalog v1 与 plan v1 不变；旧 server 404 降级。
4. 重构 `HostTargetPlanView.tsx` 并行加载、自动推荐与自动只读 plan，保证切换取消、错误降级和整齐
   master-detail；更新 Host Plan tests 与 zh/en 文案。

验证：server route tests、Machine/Host Plan tests、typecheck；断言检测响应不含路径/secret。

**子阶段边界：此处建议 /clear。**

## 子阶段 5：统一验证、交付与回滚检查

1. 执行受影响 tests、前端/服务端 typecheck、`npm test -- --minWorkers=4 --maxWorkers=4` 和生产 build。
2. 仅在全部实现完成后调用 `code-review`，统一审查 Snapshot/API 兼容、安全 probe、异步 generation、
   a11y、i18n 与视觉层级；修复所有 actionable finding。
3. 启动隔离的最新生产 Dashboard；用项目专用浏览器一次性验收 Projects、Progress graph、Workbench、
   Machine、Host Plan，覆盖 1024/1200/1440/1920、light/dark/system、键盘、reduced-motion 与错误态。
4. 提交、推送单一分支，创建单一非 draft PR；等待 CI 全绿后合并。归档 Change，运行官方 update，
   验证本地 18765 health/release/asset 使用合并后的最新插件与 Dashboard。

回滚：PR 可整体 revert；repository/detection 都是 additive，旧客户端仍工作；registry 清理只影响登记，
可通过项目 init/官方注册路径恢复。
