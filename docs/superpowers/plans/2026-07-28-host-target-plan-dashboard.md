---
change: host-target-plan-dashboard
design-doc: docs/superpowers/specs/host-target-plan-dashboard-design.md
capability: host-target-plan
---

# Host Target Plan Center 实施计划

## 目标与实施原则

在不执行真实 setup/update 的前提下，以一个最小纵向切片先贯通 CLI 计划真相、server 只读 API 与 Dashboard 预览，再扩展到全部已注册宿主、完整状态和验证。每一步都保持 additive、可测试、可回滚。

## Decision Log

- 采用 CLI `host-target-plan` 作为唯一计划真相源；server 不复制 setup/update 规则。
- P1 仅接受 `TENON_HOSTS`，不实现 Comet 的 custom target。
- Trellis 只 clean-room 借鉴按目标、有界、版本化上下文原则；不复制 AGPL-3.0 代码。
- 持续自主模式下不插入一次性 prototype：现有 CLI plan、`PipelineCliRunner` 和 Dashboard view 都有稳定接缝，风险可由首个 tracer bullet 和契约测试更直接地暴露。
- Adapter 计划按真实命令控制流区分：setup 为五步，update 为前三步；不能用三端一致的 fixture 替代对 `cmdSetup`/`cmdUpdate` 的独立集成证明。

## 子阶段 1：Tracer bullet，贯通 Codex setup 计划

目标：用最简单真实数据打通 `service/CLI → route → client → UI`，尽早暴露集成问题。

1. 在 `packages/cli/src/commands/host-target-plan.ts` 定义 `host-target-plan/v1` DTO、Codex setup 最小 plan generator 与纯 decoder/validator 测试；在 `packages/cli/src/program-install.ts` 注册只读命令。
2. 在 `packages/server/src/serverGetHostTargetPlanRoutes.ts` 以严格查询校验和 `PipelineCliRunner` 固定 argv 暴露两个 GET；通过 `packages/server/src/serverGetRoutes.ts` 与 `server.ts` 装配，保持文件行数门禁。
3. 在 `packages/dashboard-app/src/api/hostTargetPlanClient.ts`、`hostTargetPlanDecoders.ts` 与 `hostTargetPlanTypes.ts` 建立 DTO client/decoder/types，在 `packages/dashboard-app/src/hostPlan/HostTargetPlanView.tsx` 展示 Codex 卡和 setup 计划；通过 `App.tsx`、`Nav.tsx`、`dashboardLocation.ts` 装配机器级视图。
4. 为 CLI、server route、client 与 component 各增加至少一个通过案例，运行对应定向测试与 `npm run typecheck:web`。

验收：真实数据从 CLI 经过 server 严格 decoder 到 UI 显示 `tenon setup --codex`；路径中无 setup/update 函数调用。

回滚：移除新命令、路由和视图装配，不影响既有命令与 API。

**此处建议 /clear**

## 子阶段 2：完整契约与失败关闭

1. 扩展 `packages/cli/src/commands/host-target-plan.ts` 到全部 `TENON_HOSTS` 与 setup/update；native 复用 `nativeInstallPlan`/`nativeUpdatePlan`，adapter 只生成稳定的 project-scope 外层步骤。
2. 补齐 CLI 参数互斥、未知 host/operation、schema、顺序与零副作用测试；更新 `packages/cli/src/program.test.ts` 和 bundle。
3. 在 server route 中严格拒绝缺失、空、重复、多余、未知查询；严格校验 catalog/plan v1 DTO，映射 `400/502/503` 且隐藏内部 stderr。
4. 补齐 server 的 runner 未调用、固定 argv、Host header、CLI unavailable/nonzero/malformed 契约测试。

验收：所有已注册 host × 两种 operation 均生成确定性计划；任何非法输入在 runner 前失败。

回滚：新命令与路由仍是独立 additive 单元，可整体删除。

**此处建议 /clear**

## 子阶段 3：完整 Dashboard 状态与可访问性

1. 在 `HostTargetPlanView.tsx` 完成 catalog loading/empty/error/retry、awaiting selection、plan loading/error/retry/ready 状态机；切换选择时清除陈旧计划。
2. 实现可键盘操作的目标卡、具名 operation button group、命令/步骤/notices 预览、Clipboard API 成功/失败反馈；无执行按钮。
3. 在 `packages/dashboard-app/src/i18n/translations.ts` 增加中英文同构键；完成桌面网格、移动单列、长命令换行和可见 focus ring。
4. 增加 component/client/location/nav 测试，覆盖 loading/empty/error/retry、选择、切换、复制、双语和键盘语义。

验收：组件测试覆盖所有规范状态，键盘与移动布局无功能退化。

回滚：移除 Host Plan view，不改变 project 页面和既有导航。

**此处建议 /clear**

## 子阶段 4：Adapter setup/update 语义回归修复

1. 先在 CLI 命令集成测试中对已注册 adapter 写入失败断言：setup 为五步，update 仅为前三步且排除 `bundled-skills`/`runtime-readiness`；立即运行并确认 RED。
2. 在 `packages/cli/src/commands/host-target-plan.ts` 以 operation 分支生成最小正确步骤，保持 catalog、native 计划与真实 setup/update 写路径不变。
3. 同步 CLI/server/Dashboard 的严格 decoder fixtures 与组件预览断言；测试必须分别断言 setup/update，禁止三个 fixture 互相复制同一错误数组。
4. 运行 CLI/server/Dashboard 定向测试与真实 10 adapter × 2 operation 烟测，确认 setup 5 步、update 3 步、零副作用。

验收：所有 adapter 的 update 计划均在 `adapter-deploy` 后结束；setup 仍包含部署后的 skills/readiness，且现有只读 API/UI 正确展示。

回滚：仅回退 operation-specific 步骤分支与对应测试/fixture，不影响 host catalog、API 路由或 UI 状态机。

**此处建议 /clear**

## 子阶段 5：Native update 与严格 stdout 回归修复

1. 在 CLI 计划测试与真实注入式 `cmdUpdate(codex)` 测试中先断言 native update 只有现有 update plan 加 managed runtime，并排除 `bundled-skills`/`runtime-readiness`；立即运行确认 RED。
2. 在 server route 测试中先覆盖前置杂讯、后置杂讯与多个 JSON 文档，要求全部 `502 HOST_TARGET_PLAN_INVALID`；立即运行确认 RED。
3. 在 `host-target-plan.ts` 最小按 operation 追加 native 产品步骤；在 `serverGetHostTargetPlanRoutes.ts` 增加局部完整 stdout `JSON.parse`，不改变其他 route 的通用 parser。
4. 同步 server/Dashboard 严格 decoder fixtures，运行定向测试、全部 12 hosts × setup/update 烟测与真实 server 错误路径。

验收：native update 不再宣称 setup-only 尾步；Host Plan API 只接受单一完整 JSON 文档；既有 mutation routes 的输出兼容性不变。

回滚：仅回退 native operation-specific 产品步骤、局部 strict parser 与对应测试，不改变 UI 状态机、route argv 或通用 parser。

**此处建议 /clear**

## 子阶段 6：验证、浏览器与交付证据

1. 运行定向 CLI/server/Dashboard 测试、`npm run typecheck:web`、`npm run test:web`、`npm run build`、`npm test`、bundle 与受影响门禁；修复全部可修复失败。
2. 启动真实 Tenon Dashboard，先用标题、导航和 API health 确认页面身份；验证真实成功路径。
3. 使用浏览器网络控制覆盖 desktop/mobile、键盘 focus、loading/empty/error/retry 与复制命令，保存可复核截图/日志。
4. 生成 verification report，应用 OpenSpec，提交限定文件，推送 `codex/host-target-plan-dashboard` 并创建面向 main 的非草稿 PR；记录固定上游 URL/SHA、许可边界、契约、安全、测试、浏览器与 CI 状态。

验收：规范矩阵全部有真实证据；PR CI 通过，或仅保留无法由本 Change 修复的外部 secret 阻塞并如实标注。

回滚：PR 可整体 revert；新 API/视图没有数据迁移或生产副作用。

## 验证命令

```bash
npm test -- --run packages/cli/src/commands/host-target-plan.test.ts
npm test -- --run packages/server/src/serverGetHostTargetPlanRoutes.test.ts
npm run test:web -- --run packages/dashboard-app/src/hostPlan/HostTargetPlanView.test.tsx
npm run typecheck:web
npm run test:web
npm run build
npm test
npm run bundle
bash tools/test-bundle.sh
```

## 兼容与安全检查

- 不更改现有 setup/update flags、默认行为、写 token 或 project registry。
- API 只接受固定 GET 与白名单查询，继续受 loopback Host header guard 保护。
- runner 使用 argv 数组；客户端错误不包含 stderr、绝对路径、环境或 secret。
- 不新增依赖，不访问真实 setup/update，不接受任意自定义 target。
