---
change: trace-timeline
design-doc: docs/superpowers/specs/trace-timeline-design.md
locale: zh-CN
---

# Trace Timeline 实施计划

## 构建前决策

- 不插入一次性 prototype：现有 JSONL、TraceStore port、HTTP 路由和 TrafficPanel 都已有真实实现与
  测试，未知点可用小步 TDD 直接暴露；没有 schema 或状态机可行性需要另起原型。
- Build 使用 TDD，先观察聚焦测试失败，再做最小实现并重跑。
- 不修改全局 Dashboard token/App shell，不碰开放 PR #10 的主要文件。

## 子阶段 1：Tracer bullet——一条真实记录贯穿 Store → API → UI

目标：用最小成功数据尽早打通有界 reader、timeline endpoint、严格 decoder 和一个可见时间线行。

- [ ] 在 `packages/tap/src/trace-store.test.ts` 先增加最近窗口的失败测试；在
  `packages/tap/src/trace-store.ts` 增加 `TraceRecordWindow` 与 `readRecordWindow`，先覆盖已知 session
  的两条记录、顺序和计数。
  - 验证：`npx vitest run packages/tap/src/trace-store.test.ts`
- [ ] 在 `packages/server/src/traces.test.ts` 先增加成功 timeline HTTP 测试；在
  `packages/server/src/traces.ts` 实现最小白名单 projector，在 `serverGetRoutes.ts` 与 `index.ts`
  接入 `/api/traces/timeline`。
  - 验证：`npx vitest run packages/server/src/traces.test.ts`
- [ ] 在 `packages/dashboard-app/src/advanced/TrafficPanel.test.tsx` 先把 fixture 改为 timeline 并断言
  一条 entry；扩展 `api/auditTypes.ts`、`auditDecoders.ts`、`auditClient.ts`、`api/client.ts` 与
  `advanced/trafficData.ts`，让 `TrafficPanel.tsx` 选择 session 后渲染最小 timeline。
  - 验证：`npm run test:web -- --run packages/dashboard-app/src/advanced/TrafficPanel.test.tsx`
- [ ] 重跑三层聚焦测试，确认最小 end-to-end 契约一致。

**子阶段边界：此处建议 /clear**

## 子阶段 2：完整性、隐私与 provider 归一化

- [ ] 扩展 `trace-store.test.ts`：200 条、8 MiB、损坏行、超大末记录、计数不一致、unknown/empty
  session；实现尾读预算、warning 与 integrity，不改变 `readRecords`。
- [ ] 扩展 `traces.test.ts`：Anthropic/OpenAI usage、zero vs null、非法/超长值、query 清除、三态
  outcome、饱和汇总、递归敏感键/哨兵检查、400/404/500、空 session、GET-only。
- [ ] 更新 `packages/server/src/server.test.ts` 的已知 GET 路由覆盖，并确认旧 sessions/records 回归。
- [ ] 对 projector 和 reader 做代码审查与安全审查；修复所有 high/medium 发现。

**子阶段边界：此处建议 /clear**

## 子阶段 3：Dashboard 状态闭环与可访问交互

- [ ] 在 `packages/dashboard-app/src/api/responseDecoders.test.tsx` 或既有 API 测试接缝增加 timeline
  decoder/client 的合法与 fail-closed 测试。
- [ ] 重写 `TrafficPanel.test.tsx` 覆盖：sessions/timeline 两层 loading、empty、error、retry，summary，
  all/error/success filter，filter empty/clear，partial/truncated、快速切换竞态、Escape/focus。
- [ ] 在 `TrafficPanel.tsx` 实现上述状态与交互；必要时只调整 `AdvancedPanel.tsx` 中 Traffic 项自身
  布局，不修改全局 shell/token。
- [ ] 在 `packages/dashboard-app/src/i18n/translations.ts` 补齐全部中英文 Traffic 文案；英文组件测试
  断言错误、空态、筛选和完整性提示，不只覆盖 loading。
- [ ] 运行 Dashboard 聚焦测试、`npm run typecheck:web` 与 `npm run test:web`。

**子阶段边界：此处建议 /clear**

## 子阶段 4：文档、全门禁与真实浏览器

- [ ] 更新相关源码注释/API 导出，确保术语限定为 local captured HTTP transport，不写成 Workflow
  trace 或完整 agent history。
- [ ] 运行 `npm ci`（若依赖未安装）、`npm run build`、`npm run build:web`、`npm test`，以及受影响的
  hooks/adapters/skills/bundle/oracle 门禁；代码失败先修复，外部 secret 缺失单独记录。
- [ ] 用独立端口和临时 Tenon home 启动真实 Dashboard，注入不含真实 prompt/secret 的本地 JSONL：
  验收 success/error/empty、partial/truncated、受控 loading/error/retry、Tab/Enter/Space/Escape、
  英文和窄视口；截图写入 `docs/ux/shots/trace-timeline/`。
- [ ] 运行 `git diff --check`、确认只改本 Change 范围文件，并回写 verification report。

**子阶段边界：此处建议 /clear**

## 兼容与回滚

- 不改现有文件 schema、capture 行为或 raw sessions/records API。
- 新 API 和 UI 可整体 revert；旧 Traffic raw endpoint 仍可供兼容调用方使用。
- 若有界 reader 在真实大记录上暴露不可接受的 partial，保持 8 MiB fail-closed 语义，另立性能
  Change 评估流式解析，不在本轮取消预算。

## 验证命令

```bash
npx vitest run packages/tap/src/trace-store.test.ts packages/server/src/traces.test.ts
npm run typecheck:web
npm run test:web
npm run build:web
npm run build
npm test
npm run test:hooks
npm run check:architecture
npm run check:repository-hygiene
npm run oracle
git diff --check
```
