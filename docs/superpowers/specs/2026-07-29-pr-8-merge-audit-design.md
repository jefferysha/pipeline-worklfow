# PR #8 Host Target Plan 合并审计设计

## 问题与结果

PR #8 在较早的 `main@15fe619b` 上新增 `host-target-plan/v1`、两个只读 Dashboard API 和 Host Plan 视图。当前 `main@4c242b92` 已前进 55 个提交，PR 自身有 11 个提交。目标不是机械合并，而是在当前主线保留有价值的只读预览能力，同时重新证明真实 setup/update 一致性、本机 HTTP 安全、跨端 DTO、Dashboard 质量和分发兼容性。

非目标：

- 不从 Dashboard 执行 setup/update。
- 不接受自定义宿主、任意路径或 project root 查询。
- 不把原 Change、PR 描述或旧 CI 当作当前主线的验证证据。
- 不引入新框架、数据库、运行时依赖或第二套宿主注册表。

## 证据基线

- 合并基点：`15fe619b2885b928dd27be9668cca6b0ee903c57`。
- 当前主线：`4c242b928b61285561f9cdbc63617db899a18a12`。
- PR head：`942520bb0de49bd9bc4d7c40cc7f405d5a846791`。
- `git rev-list --left-right --count origin/main...HEAD` 为 `55 11`。
- `git merge-tree --write-tree origin/main HEAD` 只报告 4 个内容冲突：CLI bundle、Dashboard `dist/index.html`、`Nav.tsx`、`Nav.test.tsx`；其余源码可三方合并，但不代表语义自动兼容。
- PR 不增加 package manifest/lock 依赖；实现分别位于 CLI、server、Dashboard client/decoder 与 `hostPlan` 功能域。
- 原 `host-target-plan` durable spec 仅存在于 PR 分支；它与当前主线的 plugin distribution、runtime、Dashboard 和 repository architecture capability 有交叉约束。

## 关键业务规则

1. `TENON_HOSTS` 与 native/adapter 分类只有一个 CLI owner；catalog 必须确定性、零副作用、固定顺序。
2. 单计划只接受一个已注册 host 和 `setup|update`；命令与步骤必须从当前真实 owner 派生，不能复制会漂移的第二份真相。
3. `side_effects: "none"` 只描述计划生成；可复制的后续终端命令具有真实副作用，UI 必须明确区分。
4. server 仅接受 GET，先经过现有 loopback Host 守卫，再校验 exact query，使用固定 argv，严格消费一个完整 JSON 文档，并对 stderr、路径和内部异常脱敏。
5. 成功结果可有界缓存，同 key 并发可共享；失败不得缓存且必须允许重试。任何队列都必须有界或由固定 25-key 空间证明边界。
6. Dashboard 不需要 project context，不提供执行控件；adapter 可复制命令固定为 `--target .` 并明确要求用户先进入目标项目，禁止输出 `<project>` 这类会被 shell 当作重定向的伪占位符；必须覆盖 loading、empty、error、retry、ready、陈旧响应抑制、复制失败、zh/en、light/dark、键盘、焦点、响应式和 reduced motion。
7. 源码、测试、CLI/server bundle、Dashboard hashed assets、OpenSpec 与用户文档必须从同一最终 head 生成并原子提交。

## 状态机与数据流

```text
TENON_HOSTS + nativeInstallPlan/nativeUpdatePlan
                |
                v
tenon host-target-plan --json
                |
        fixed argv + exact JSON
                v
GET /api/host-targets | /api/host-target-plan
                |
      strict server DTO + bounded runtime
                v
Dashboard api client/decoder
                |
catalog loading/error/empty/ready
                |
host -> operation -> plan loading/error/ready -> copy only
```

请求状态使用递增 sequence 丢弃过期 Promise 结果；选择新 host 时必须清除 operation 与旧 plan。server runtime 只缓存 `200`，in-flight 完成后清理；CLI 非零、无效 JSON/DTO 或异常统一映射为稳定失败码。

## 方案比较

| 方案 | 优点 | 风险 | 决策 |
| --- | --- | --- | --- |
| A. 直接接受原 PR 与旧证据 | 最快 | 忽略 55 个主线提交、4 个冲突及 setup/runtime 演进 | 拒绝 |
| B. 丢弃 PR，从当前主线重写 | 边界最干净 | 容易重复已经存在的测试与交互工作，扩大差异 | 仅在合并后架构不可修复时采用 |
| C. 普通合并当前主线，保留 capability 后按当前规则 TDD 审计 | 最大化复用，同时重新证明兼容 | Build 与 Verify 成本最高 | 采用 |

## Dashboard 设计门禁

用户明确要求 Dashboard 也覆盖 `design-taste-frontend`，因此它是强制门禁，而不是普通 scope note。Build 与 Verify 均需至少覆盖：

- 1440、1024、768/769、390 视口，长命令与长宿主名无 body 横向溢出；
- light/dark 与 zh/en；
- keyboard Enter/Space、可见 focus、`aria-pressed`、live status、retry 与 copy success/error；
- loading/empty/decoder error/network error/ready；
- 导航与当前主线新增 view 共存，不能覆盖 PR #5–#7 的 Dashboard IA；
- `DESIGN_VARIANCE=3`、`MOTION_INTENSITY=2`、`VISUAL_DENSITY=7` 的保守审查基线；
- 没有 Run/Execute 控件，没有 POST/PATCH/DELETE API mutation。

## 安全与架构红队

- `display` 的直接 token 拼接只适用于当前封闭协议中的安全 argv；Build 必须锁定 token 白名单，并以 `--target .` 取代会被 shell 解释的 `<project>`，三端 decoder 必须拒绝漂移、空白、控制字符或 shell 元字符。
- server decoder 当前复制 native 命令真相以做严格校验；这增强 fail-closed，但也形成跨包漂移点。Build 必须评估公开共享 contract、生成 fixture或保留复制并用跨端测试锁定三者的一致性。
- 25 个固定 key 证明缓存 key 空间有界，但串行 `queueTail` 可能让一个慢 child 阻塞全部不同 key；需用并发/超时事实决定是否接受、限时或改成明确并发上限。
- 当前主线的 setup/update 已包含更强的 managed runtime、事务/WAL 和 Dashboard handoff 语义；计划步骤必须诚实描述稳定层级，不能把粗粒度摘要声称为逐条真实执行日志。
- `serverGetRoutes` 是高风险共享 handler；合并时不得继续压缩依赖声明或增加跨层耦合，触及硬上限则按职责拆分。

## Assumptions / Decision Log

- 持续授权采用最保守选择：`preset=full`、独立 worktree、普通 merge、发现偏差一律修复。
- PR #8 的产品方向“只读计划中心”暂定保留；具体 requirement 只有在 Spec 对当前主线调用链完成核对后冻结。
- 原外部参考项目调研仅作为历史输入；本次不需要新增外部依赖或复制外部实现，因此 `search-first` 以仓库内 contract/测试/相邻实现为主。
- 原 PR 的测试与浏览器报告只是风险清单，不是当前 Change 的通过证据。
- 合并后任何 requirement 语义变化必须从 Build 走 `requirements-changed` 回 Spec，不能覆盖已登记 SHA。

## 验证策略

Spec 阶段把上述规则转为完整 requirement/scenario。Build 使用普通主线合并、冲突保留矩阵和 TDD，随后运行 CLI/server/Dashboard 定向测试、全仓与前端全量、类型/构建、正式资产、hooks/adapters/skills/bundle/oracle、OpenSpec 隔离应用、hygiene、依赖审计与真实 production Dashboard。Verify 从冻结 SHA 重新执行独立 Reviewer、E2E/API/浏览器、Codex（可用时）和 Dashboard visual/accessibility 全轨，且保持共享 worktree repo-zero。

```coverage
touches:
L1_api:      filled -> #安全与架构红队
L2_data:     waived -> 不新增持久化 schema；只消费确定性内存 DTO 和有界派生缓存
L3_rules:    filled -> #关键业务规则
L4_state:    filled -> #状态机与数据流
L5_errors:   filled -> #安全与架构红队
L6_security: filled -> #安全与架构红队
L7_perf:     filled -> #安全与架构红队
L8_deps:     filled -> #证据基线
L10_terms:   filled -> #问题与结果
```
