---
change: verification-evidence-composer
design-doc: docs/superpowers/specs/2026-07-28-verification-evidence-composer-design.md
---

# 验证证据编排器实施计划

## 目标与边界

交付一个真实纵向切片：kernel 以独立闭集 DTO 生成确定性 Markdown，受保护 server POST route 暴露该能力，
Dashboard Verify 详情提供中英文、可访问的编辑/生成/复制交互。输出只是一份不可信草稿，不读取文件、
不执行命令、不保存 report、不修改 gate 或可信 `VerificationResult`。

一次性 prototype 决策：在本 Change 的持续授权下选择不插入独立原型。kernel/server/Dialog/API client
均有现成扩展缝，核心未知可以更早由第一阶段 tracer bullet 的失败测试与真 HTTP 集成暴露；若实现发现需求
语义变化，必须走 `requirements-changed` 回 Spec，而不是用原型绕开契约。

## 子阶段 1：Tracer bullet 打通最小全链路

目标：先让一条合法 command entry 从 kernel 经过真 HTTP 和 Dashboard API，到 Verify dialog 中显示
server Markdown，尽早暴露包导出、route 接线、root guard 和组件 props 风险。

1. 在 `packages/kernel/src/verification/evidence-composer.test.ts` 写最小成功与“草稿不等于
   VerificationResult”失败测试；在 `evidence-composer.ts` 实现最窄 canonical DTO/renderer，并从
   `verification/index.ts` 导出。
   - 验收：单 entry、显式 locale、确定输出通过。
   - 验证：`npm test -w @tenon/kernel -- evidence-composer.test.ts`。
2. 在 `packages/server/src/serverPostVerificationRoutes.ts` 接入
   `/api/verification-evidence/compose`，从 `serverPostRoutes.ts` 的统一安全守卫后调用，使用
   `workflowRootForRequest`/anchor 校验；在 `server.test.ts` 用真实 HTTP 写 success、token 和 root 测试。
   - 验收：200 只返回 Markdown/count；无文件/状态副作用；401/404 沿用现有契约。
   - 验证：`npm test -w @tenon/server -- server.test.ts`。
3. 新增 `packages/dashboard-app/src/api/verificationEvidenceTypes.ts`、decoder 与
   `verificationEvidenceClient.ts`，从 `api/client.ts` 导出；先写 client/decoder tests。
   - 验收：请求携带 root/locale/entries，畸形成功响应失败关闭。
   - 验证：`npm run test:web -- verificationEvidence`。
4. 新增最小 `VerificationEvidenceComposer.tsx`，让 `TaskDocumentsSection.tsx` 接收 root/phase/locale/toast，
   由 `TaskDetail.tsx` 传入；先写 phase visibility 和一条成功生成测试。
   - 验收：仅 Verify 可见，真实 client 返回值在 dialog 呈现。
   - 验证：`npm run test:web -- VerificationEvidenceComposer TaskDocumentsSection`。

**子阶段边界：此处建议 /clear。**

## 子阶段 2：收紧领域契约、错误与确定性

1. 扩充 kernel 红测，覆盖四种 kind、三种 status、result/skipReason XOR、unknown fields、空/12 条边界、
   UTF-8 byte 限额、错误 20 条上限、CRLF、CJK/emoji、NUL/control/surrogate、32 KiB 输出上限。
   - 验收：所有失败均有稳定 code/path；canonical copy 不保留 getter/原对象身份。
2. 用 golden tests 锁定 zh-CN/en Markdown、输入顺序、末尾换行、自适应 fence 和 title/result/reason
   注入字符。
   - 验收：相同输入逐字节相等，用户内容不能新增结构。
3. 扩充真 HTTP 测试，覆盖 malformed body、content type、Host、空输入、字段错误、locale、body/output
   边界和 response envelope；断言 formatter route 不触碰 state/ledger。
4. 扩充 Dashboard decoder/client 测试，对 details/code/path 做窄解码，网络与非 JSON 响应保持兼容错误。

**子阶段边界：此处建议 /clear。**

## 子阶段 3：完成 Dashboard 状态、i18n 与可访问性

1. 完成 `VerificationEvidenceComposer.tsx` 的空态、添加/删除、kind/status 条件字段、client-side 必填提示、
   loading 防重、内联 error/live region、只读结果和 copy success/failure。
2. 在 `packages/dashboard-app/src/i18n/translations.ts` 同步全部 zh-CN/en key；不在纯组件逻辑硬编码读者文案。
3. 完成组件测试：空态不请求、切换 status、删除、loading、API error 保留草稿、retry、copy 两路径、
   Escape/Tab/focus return，并断言非 Verify phase 无入口。
4. 运行 `npm run typecheck:web`、`npm run test:web`、`npm run build:web`；修复真实失败。

**子阶段边界：此处建议 /clear。**

## 子阶段 4：集成验证、浏览器验收与治理收尾

1. 运行 kernel/server 定向测试、`npm run build`、`npm test`、comments/default-workflow freshness、
   hooks/adapters/skills/bundle/oracle 门禁；区分代码失败与外部 secret 缺失。
2. 用目标 worktree 启动真实 Tenon Dashboard 到唯一端口，先核对 `/api/health`、页面 title 与 Tenon
   内容，再覆盖 Verify 入口、空态、成功、server error、copy、Tab/Escape/focus return，并保存截图/日志证据。
3. 检查 `git diff --check`、生产文件大小、依赖变化和仅本轮文件；写 verification report，完成 Verify
   exact-event delegated review。
4. 应用 delta spec，更新 tasks、提交、推送并创建非草稿 PR；PR 包含 上游 A/上游 B 固定来源、差异映射、
   API/持久化/兼容、真实测试/浏览器证据和回滚。检查 CI，修复代码失败，外部阻塞如实记录。

## 兼容、回滚与风险

- 无 schema、state、ledger、report 或依赖 migration。
- route 只有受保护 POST；UI 只在 Verify 显示，但后端安全不依赖 UI 隐藏。
- 回滚删除新增 kernel/server/client/component，并撤回三处 barrel/接线与 i18n key 即可。
- 高风险点是 Markdown 注入、草稿冒充可信结果、root 守卫漏接和 clipboard 假成功；均有独立自动测试与
  浏览器验收。
