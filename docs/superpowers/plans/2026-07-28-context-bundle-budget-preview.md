---
change: context-bundle-budget-preview
design-doc: docs/superpowers/specs/2026-07-28-context-bundle-budget-preview-design.md
---

# Context Bundle 预算预览实施计划

## 入口与决策

本计划实施 `context-bundle-budget-preview` delta spec，以现有 CLI bundle fixture 作为真实数据，不做
假数据演示。原型决策：不插入一次性 prototype。现有 kernel compiler、server GET guard、
ProgressDrawer 和 API transport 均有可测试接缝，未知集中在契约迁移而非不可验证的新技术；第一阶段
用 TDD tracer bullet 尽早暴露集成风险，比另建不可交付原型更保守、可审计。

兼容基线：

- `context-bundle/v1`、CLI JSON/text、默认 `120_000` bytes 和 non-bundle handoff 不变；
- API additive，只读，不新增持久化、migration、依赖或模型调用；
- Dashboard 只接收 metadata，不接收 document content。

## 子阶段 1：TDD tracer bullet，打通最小纵向链路

目标：用一个真实 Change/ledger fixture 打通 kernel service → server route → Dashboard component，
先只覆盖预算足够的成功态，尽早暴露跨包 DTO 和路由接缝。

1. 在 `packages/kernel/src/compress/ledger-context-bundle.test.ts` 写失败测试：共享服务从真实 ledger
   生成与现有 CLI 一致的单输入 bundle 和 byte stats。
2. 新增 `packages/kernel/src/compress/ledger-context-bundle.ts`，最小提取 CLI 私有 policy/reason/
   mode/ledger 组装；从 `packages/kernel/src/compress/index.ts` 导出。
3. 在 `packages/server/src/serverGetActivityRoutes.ts` 加最小 anchored GET 分支和 metadata mapper，
   在 `packages/server/src/server.test.ts` 写 200、不含 `content` 的真 HTTP 测试。
4. 新增 `packages/dashboard-app/src/api/contextBundleTypes.ts`、
   `packages/dashboard-app/src/api/contextBundleClient.ts` 和
   `packages/dashboard-app/src/progress/ContextBundlePreview.tsx`；在
   `packages/dashboard-app/src/progress/ProgressDrawer.tsx` 单点挂载，先渲染成功摘要。
5. 新增 `ContextBundlePreview.test.tsx`，以真实 response decoder contract 覆盖 mount loading→success。

验证：

```text
npm test --workspace @tenon/kernel -- ledger-context-bundle
npm test --workspace @tenon/server -- server
npm test --workspace @tenon/dashboard-app -- ContextBundlePreview
```

子阶段边界：此处建议 `/clear`。

## 子阶段 2：共享编译器完整语义与 CLI 兼容

1. 为 `LedgerContextBundleError` 先写 missing ledger/kind/file、stale、invalid target/budget、
   duplicate reference、policy-empty 与 budget exceeded 测试；错误携带 stable code、repair action
   和可选 safe preview，不靠 message 分类。
2. 抽出显式 ledger repository 与 source-reader port；实现同序 `sourceBytes` /
   `materializedBytes`，确保 `reference` 为 0，budget failure 不生成 aggregate digest。
3. 修改 `packages/cli/src/commands/handoff.ts` 调共享服务，删除私有重复常量与编译函数。
4. 扩展 `packages/cli/src/commands/handoff.test.ts` 及 CLI 集成 fixture，对比迁移前成功 JSON、
   stderr、exit code、默认预算和 non-bundle 输出。

验证：

```text
npm test --workspace @tenon/kernel -- context-bundle ledger-context-bundle
npm test --workspace @tenon/cli -- handoff
```

子阶段边界：此处建议 `/clear`。

## 子阶段 3：只读 API、安全与错误契约

1. 新增 server trusted-reader adapter：逐层打开 registered-root 目录 fd，并以 `O_NOFOLLOW`
   file fd 读取 ledger/source；在读取正文前执行 64 records、262144 bytes/file、1048576 bytes
   total 上限。
2. 在无可遍历目录 fd 的平台先返回稳定 501 capability error；不得回退到词法 pathname。成功、
   预算、缺失与空态的真实验收在 Linux runtime 运行，Darwin 验证 fail-closed 路径。
3. 在 `packages/server/src/serverGetActivityRoutes.ts` 完成参数解析、Change canonical state 读取、
   custom current-step 兼容、root anchor 前后复核和 stable HTTP 映射。
   canonical revision/UTF-8/连续性损坏映射为安全 `CONTEXT_BUNDLE_STATE_CORRUPT` 409。
4. 响应固定 `context-bundle-preview/v1`、`sideEffects: "none"`，成功包含 aggregate digest；
   422 只含 safe preview，不含 digest/content。
5. 在 `packages/server/src/server.test.ts` 增加非法 root/Change/phase/budget、root/目录/文件换位、
   资源 413、empty 200、missing/stale 409、budget 422 和绝对路径/content 泄漏断言。
6. 在 `packages/dashboard-app/src/api/contextBundleClient.ts` 严格 decode success/error/422 preview；
   校验 UI-neutral domain `reasonCode` 的闭合集合，不从 kind 推导 reason；在 API 测试覆盖网络
   失败、无效 response 和 stable code 保留。

验证：

```text
npm test --workspace @tenon/server -- server
npm test --workspace @tenon/dashboard-app -- contextBundle
```

子阶段边界：此处建议 `/clear`。

## 子阶段 4：Dashboard 完整状态、i18n 与可访问性

1. 完成 `ContextBundlePreview` 的 target select、number input、submit、retry、AbortController/request
   generation，以及 success/empty/budget-error/error 分支。
2. 在 `packages/dashboard-app/src/i18n/translations.ts` 对称添加 zh/en keys；复用现有 tokens 和
   ProgressDrawer 布局，不改导航或视觉系统；由组件显式映射 domain reason token 到 i18n key。
3. 组件测试覆盖自动默认下一阶段、显式 `open` 空态、422 summary、missing/stale retry、
   target/budget 快速修改旧响应隔离、custom current-step、结构化中英文错误、Enter 提交、
   label/aria/focus、关闭 unmount。
4. 扩展 ProgressDrawer/ProgressView 测试，确保额外按需 fetch 不影响抽屉关闭、焦点恢复和其他
   Change 动作。

验证：

```text
npm run typecheck:web
npm run test:web -- ContextBundlePreview ProgressView
npm run build:web
```

子阶段边界：此处建议 `/clear`。

## 子阶段 5：跨端验收与回滚证明

1. 运行 kernel/CLI/server/Dashboard 定向测试和 `git diff --check`。
2. 运行 `npm run typecheck:web`、`npm run test:web`、`npm run build:web`、`npm run build`、
   `npm test`，以及受影响的 hooks/adapters/skills/bundle/oracle 门禁。
3. 在 Darwin 唯一端口确认 capability error 不泄露路径；再在 Linux 容器唯一端口启动本分支
   Tenon Dashboard，先验证 `/api/health` 的产品/版本身份和页面
   title/内容，再用真实浏览器覆盖：
   - 预算足够成功；
   - 低预算 422 后调大并重试；
   - `open` policy-empty；
   - 临时 fixture 的 missing/stale 错误，修复后 retry；
   - Tab/Enter/关闭抽屉焦点恢复。
4. 记录截图、请求状态和验证报告。若任何行为与 delta spec 不符，回 Build 修复；若需求语义变化，
   以 `requirements-changed` 回 Spec。

回滚：

- 前端可移除独立组件挂载与 API client/i18n keys；
- server 可移除 additive GET route；
- CLI 保持共享服务调用，或在保持输出测试全绿的前提下恢复适配；
- 无数据 migration、state/ledger/config 回滚或生产清理。

子阶段边界：此处建议 `/clear`。
