---
change: related-session-memory
design-doc: docs/superpowers/specs/2026-07-28-related-session-memory-design.md
---

# Related Session Memory 实现计划

## 原型决策

本轮不插入一次性 prototype。现有四宿主 mem adapter、Dashboard POST 防护、server 路由分派与
React 详情区块都已有可执行测试边界；未知点是“真实读取预算如何贯穿到 UI”，可直接用下面的
TDD tracer bullet 回答。独立原型会重复真实边界且不能验证兼容性。该决策来自持续授权下的保守选择：
不新增 schema、依赖或持久化，所有改动可通过删除新用例、路由和组件完整回滚。

## Build 子阶段 1：纵向 tracer bullet

目标：先让一条受限 Codex fixture 从真实文件读取、POST、前端 decoder 到 TaskDetail 成功态贯通。

1. 在 `packages/kernel/src/mem/fs.ts` 为 `MemFs` 增加向后兼容的可选 bounded read 原语，并在
   同文件的 `nodeMemFs` 用 Node 文件句柄实现真实字节上限。
   在 `packages/kernel/src/mem/relatedSearch.test.ts` 先写红测，证明超大文件不会整文件进入内存。
   验证：`npm exec vitest run packages/kernel/src/mem/relatedSearch.test.ts`。
2. 新建 `packages/kernel/src/mem/relatedSearch.ts`，实现查询校验、单一平台选择、候选/结果预算、
   user-only 摘要和安全 DTO；只在既有 `searchMemSessions` 增加可选候选上限，不改变 CLI 默认值。
   验证：同一测试覆盖 `codex` 成功结果和 `all` adapter 调用。
3. 在 `packages/server/src/serverPostRoutes.ts` 与相邻依赖类型中挂载
   `POST /api/mem/related-sessions/search`，复用 root/Change/Host/token/content-type/body guard；
   添加真实 HTTP 测试。
4. 在 `packages/dashboard-app/src/api/` 增加 related-memory DTO、严格 decoder 与 POST client；
   新建 `packages/dashboard-app/src/shared/RelatedSessionsSection.tsx`，先只实现 idle/loading/results
   以及原生 form Enter 提交，并在 `TaskDetail.tsx` 最小挂载。
   验证：对应组件测试从 Enter 提交走到结果渲染。

**子阶段边界：此处建议 /clear**

## Build 子阶段 2：预算、隐私与 typed errors

1. 完成 2–128 字符/8 token、100 候选、8 结果、2 MiB 单文件、16 MiB 总读取、320 字符摘要约束。
2. 只把 user 命中的会话映射到 DTO；验证 assistant/thinking/tool-only 命中不出现在响应，
   path/cwd 永不序列化，OpenCode parent/child 只返回父项与 `descendants_merged`。
3. 在 server 建立单实例 single-flight，映射
   `400 invalid-request`、`404 project-or-change-not-found`、`429 memory-search-busy`、
   `500 memory-search-unavailable`，并将预算耗尽映射为 200 partial/warnings。
4. 用真实 HTTP 测试覆盖缺 token、错误 content-type、未注册/漂移 root、非法 Change、
   未知 platform、busy 与内部异常脱敏。

验证：

```bash
npm exec vitest run packages/kernel/src/mem packages/server/src
```

**子阶段边界：此处建议 /clear**

## Build 子阶段 3：Dashboard 完整状态与 i18n

1. 完善 `RelatedSessionsSection` 的 `idle|loading|results|empty|error` reducer/state machine，
   使用 AbortController 与请求序号防止旧响应覆盖新查询。
2. 增加显式 `all|claude|codex|opencode|pi` 选择、partial warning、重试、结果元数据和安全摘要。
   root/name 改变时回到 idle；不自动搜索、不写 localStorage。
3. 在 `packages/dashboard-app/src/translations.ts` 对称增加中英文文案；只使用既有 semantic
   Tailwind tokens，保持触控目标、键盘焦点、`role=status` 与 `role=alert`。
4. 组件与 decoder 测试覆盖成功、空、partial、typed/network error、Enter、重复提交、
   旧响应丢弃和 Change 切换。

验证：

```bash
npm exec vitest run packages/dashboard-app/src
npm run typecheck:web
```

**子阶段边界：此处建议 /clear**

## Build 子阶段 4：集成、兼容与生成物

1. 运行 formatter/typecheck，更新受影响的 server、Dashboard 和 CLI bundle 生成物；
   不提交 `npm ci` 引起的无关 mode 变化。
2. 回归 `/api/mem/session-link(s)`、`tenon mem search`、四宿主 adapter、bundle freshness、
   hooks 与文档/skill/oracle 门禁，确认无旧契约变化。
3. 更新与此能力直接相关的文档说明；不得加入恢复命令或把历史命中描述成 canonical evidence。

验证：

```bash
npm run build:web
npm run build
npm run bundle
npm test
```

**子阶段边界：此处建议 /clear**

## Verify 子阶段：真实 Dashboard 验收

1. 在唯一空闲端口启动本 worktree 构建的 Tenon Dashboard；先断言页面 title、产品标识和 API
   health 属于目标实例。
2. 用真实受限 session fixture 验收键盘提交与成功结果，确认页面不显示 path/cwd/assistant 内容。
3. 验收空结果、partial warning、typed error、网络错误和 retry；切换 Change 后确认旧结果清除。
4. 记录浏览器 URL、端口、截图/日志与断言，不把其他应用占用端口或 `file:` 页面算作通过。
5. 运行 `npm run typecheck:web`、`npm run test:web`、`npm run build:web`、`npm run build`、
   `npm test` 和所有受影响专项门禁，形成 verify report。

**子阶段边界：此处建议 /clear**

## 兼容、发布与回滚

- API 仅新增受保护 POST；旧 session-link 与 CLI mem search 不变，无数据库或文件迁移。
- 没有 feature flag；若资源或隐私门禁失败，回滚新路由、kernel use case 与 Dashboard 区块即可，
  不需要清理用户数据。
- PR 合入前若 Dashboard overhaul PR #5 已合并，只机械调整 TaskDetail 挂载与 i18n 冲突，
  不扩大功能范围。
- 发布判据：OpenSpec 应用、全量测试与真实浏览器验收通过、非草稿 PR 可审查；外部 CI secret
  缺失必须与代码失败分开记录。
