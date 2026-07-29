---
change: loop-scope-preview
design-doc: docs/superpowers/specs/2026-07-28-loop-scope-preview-design.md
---

# Loop 路径策略预检实施计划

## 目标与不可变边界

在不执行 Loop、不读取输入路径、不写配置或许可的前提下，让 Workbench 用户按当前真实
allowlist/denylist 预检一组项目相对路径。实现复用 kernel `ConstraintPolicy` 与 automation
生产 matcher，保持既有 aggregate gate、Loop YAML 与 API 兼容。

原型决策：Explore 已确认生产 matcher、策略 evaluator、受保护 POST 和 Dialog 基础设施均存在，
未知点可由定向 contract test 消除；持续自主模式选择不插入一次性 prototype，直接以可回退的
TDD 曳光弹验证。若首个真 HTTP/组件测试暴露包边界或状态机假设错误，立即停止横向扩展并回到
Spec，而不是继续堆实现。

## Build 子阶段 1：B1 曳光弹纵向切片

目标：以一个允许路径和一个拒绝路径，最早打通 kernel → server → client → UI。

1. 在 `packages/kernel/src/loops/automation-policy.test.ts` 先写失败测试，钉死逐路径解释的
   deny-first、首个命中 pattern 与空 allowlist；在
   `packages/kernel/src/loops/automation-policy.ts` 添加协议无关结果类型与
   `explainConstraintPaths`，并让 aggregate evaluator 复用同一规则且保持原返回行为。
   - 验证：`npm test -w @tenon/kernel -- automation-policy`
   - 回滚：移除新导出与测试，旧 evaluator 无格式或语义变化。
2. 新建 `packages/server/src/loopScopePreview.ts` 及测试，先实现最小闭集请求解析和成功响应；
   在 `packages/server/src/serverPostOperationsRoutes.ts` 装配
   `POST /api/loops/scope-preview`，从 registered root 的真实 registry 读取 Loop，
   注入 `matchesPathGlob`。
   - 验证：`npx vitest run packages/server/src/loopScopePreview.test.ts packages/server/src/server.test.ts`
   - 回滚：删除纯函数模块和单一路由块，不影响既有 Loop update/level/run。
3. 在 `packages/dashboard-app/src/api/loopsClient.ts` 与独立 decoder 中加入 typed client；
   新建 `packages/dashboard-app/src/workbench/LoopScopePreview.tsx`，挂到
   `LoopAdvancedFields.tsx`，先渲染提交、加载、允许/拒绝。
   - 验证：`npm run test:web -- LoopScopePreview`
   - 回滚：删除挂载点、client 与组件，现有 Loop 编辑 UI 不变。

**此处建议 /clear**：曳光弹完成且三层定向测试通过后再进入边界加固。

## Build 子阶段 2：B2a 内核与服务端边界加固

1. 扩展 kernel 测试覆盖同批 deny/outside、顺序、write/merge 选择、aggregate 回归；
   保证 frozen policy 输入不被修改。
2. 完成 server 闭集解析：1–100 条、去重保序、1024/32768 UTF-8 bytes、canonical
   Git 相对路径、transport-safe 字符（含未成对 surrogate 拒绝）、合法 POSIX 冒号、未知 key、
   稳定错误码；请求只做字符串匹配。
3. 增加真 HTTP 覆盖：Host/token/content-type 继续由公共 POST 入口保护，测试未知 root、
   未知 Loop、损坏 registry、active L3 与 paused/L1/L2 提示，以及响应无绝对路径。
4. 通过既有可信 `.pipeline` 目录链校验与 `O_NOFOLLOW` 文件描述符读取 `loops.yaml`，读取前后
   复核子项与 inode；预置 symlink 或已观测到的换位统一 fail-closed。Node/Darwin 缺少
   `openat` 时，明确沿用项目既有的同 principal writer 信任边界，不承诺消除最后 pathname lookup
   的恶意微竞态。

验证：

- `npm test -w @tenon/kernel -- automation-policy`
- `npx vitest run packages/server/src/loopScopePreview.test.ts packages/server/src/server.test.ts`
- `npm run check:architecture`

回滚边界：仅新解释投影和只读路由；不迁移、不改 registry schema。

**此处建议 /clear**：服务端所有失败路径稳定后再扩展前端状态。

## Build 子阶段 3：B2b Dashboard 状态与可访问性闭环

1. 完整 decoder 拒绝未知/缺失枚举、错误汇总、items 长度/上限不一致；client 在解码后绑定
   原请求 Loop id、路径逐项顺序与 `active && L3` 派生值；client 自行校验、去重保序并冻结请求，
   以同一序列发送与绑定响应，并统一映射 network、HTTP 与 decode error。
2. 完成 Dialog 的 closed/open-empty/invalid/loading/ready/error 状态；错误保留输入，
   Retry 使用同一请求，关闭后清除路径且不写 localStorage。
3. 在 `packages/dashboard-app/src/i18n/translations.ts` 对称加入 zh/en 文案，协议 reason
   通过映射展示，不把 token 当用户文案。
4. 组件测试覆盖空、无请求、加载禁用、全部允许、部分拒绝、错误重试、
   `Ctrl+Enter`/`Meta+Enter`、Escape 与触发器焦点返回。

验证：

- `npm run test:web -- LoopScopePreview loopsClient`
- `npm run typecheck:web`
- `npm run test:web`

回滚边界：独立组件与局部挂载，无全局状态、route 或存储迁移。

**此处建议 /clear**：组件状态机测试通过后进入集成和真实浏览器验收。

## Build 子阶段 4：B2c 集成、生成物与文档收束

1. 检查 `LoopCard.tsx` 未突破 400 行、所有新生产文件不超过 500 行，依赖方向仍为
   Dashboard → API、server → kernel/automation。
2. 运行 formatter/lint（若仓库已有）、更新受影响的 server Dashboard bundle，
   验证生成物与源码一致。
3. 在 OpenSpec tasks 中只勾选真实完成项；若 API、reason 或输入边界变化，使用
   `requirements-changed` 回 Spec 重审，不在 Build 覆盖旧规格。

验证：

- `npm run build:web`
- `npm run build`
- `npm test`
- `git diff --check`

## Verify 计划

1. 生成 Verify 报告，记录所有定向/全量命令的真实退出状态，区分代码失败和外部 secret。
2. 启动目标分支的 Tenon Dashboard，核对页面标题、`/api/health` 与项目 root，拒绝把其他端口
   上的应用当作证据。
3. 浏览器覆盖桌面与移动视口、明暗主题、空输入、加载、允许、阻断、错误重试及
   Tab/Shift+Tab/Ctrl-or-Cmd+Enter/Escape。
4. 复核 POST 无文件/队列/registry 写入；运行 full gates 后再请求 `verify-pass` exact event。
5. 在保留 symlink/权限的隔离副本运行 `openspec show`、`openspec validate --strict` 与
   archive/apply 演练，证明真实主规格 digest 前后不变。

## Ship、兼容与回滚

- API 是新增端点；Loop registry/YAML、既有响应与执行 gate 均不变，无数据库或配置迁移。
- 回滚可按相反顺序删除 UI 挂载、client/decoder、server route/module、kernel explanation；
  既有 aggregate evaluator 测试保证运行时路径策略不受影响。
- PR 记录完整上游固定 SHA、URL、release/tag 回退与许可证边界，以及 Tenon Change/phase、
  测试与浏览器证据，
  检查远端 CI；仅外部 secret 缜密标为阻塞。
