# Frozen Workflow Definition Status：Chorus 交互与 claude-tap Viewer 一手源码研究

## 1. 研究范围与结论边界

- Change：`frozen-workflow-definition-status-20260730`
- 研究轨：`tenon-researcher`，只读一手源码
- 读取日期：2026-07-30
- 研究问题：
  1. 上游如何避免多个配置来源拼出一个不可信的“当前配置”；
  2. 上游如何把 session 的创建、关闭失败、重试和用户可见状态串成闭环；
  3. Viewer 如何区分“DOM 已生成”和“内容真正可验收”；
  4. 这些原则如何映射为 Tenon“冻结 workflow plan 与当前 workflow 定义的状态”，且不改变冻结执行真相。
- 本报告只记录事实、推断和建议；没有修改 Tenon 产品代码、canonical state 或 `.pipeline.yaml`。

## 2. 固定上游证据

| 仓库 | 固定版本 | 固定 SHA | 一手来源 | 读取日期 |
| --- | --- | --- | --- | --- |
| `Chorus-AIDLC/Chorus` | 默认分支 `main` | `d590b568f40fae51f71c9800841c587a3fe94b0b` | [commit](https://github.com/Chorus-AIDLC/Chorus/commit/d590b568f40fae51f71c9800841c587a3fe94b0b) · [tree](https://github.com/Chorus-AIDLC/Chorus/tree/d590b568f40fae51f71c9800841c587a3fe94b0b) | 2026-07-30 |
| `Chorus-AIDLC/Chorus` | 稳定 release `v0.14.5` | `be647877b4b56a61e480e939d6a6d31b3f84f7f9` | [release](https://github.com/Chorus-AIDLC/Chorus/releases/tag/v0.14.5) · [tag tree](https://github.com/Chorus-AIDLC/Chorus/tree/v0.14.5) | 2026-07-30 |
| `liaohch3/claude-tap` | 默认分支 `main` | `6cfe45afd7b6d009e839b178dd59b9e338b10309` | [commit](https://github.com/liaohch3/claude-tap/commit/6cfe45afd7b6d009e839b178dd59b9e338b10309) · [tree](https://github.com/liaohch3/claude-tap/tree/6cfe45afd7b6d009e839b178dd59b9e338b10309) | 2026-07-30 |
| `liaohch3/claude-tap` | 稳定 release `v0.1.141` | `547925c9bd66f73cdcf9a4779fc88a4ffa247738` | [release](https://github.com/liaohch3/claude-tap/releases/tag/v0.1.141) · [tag tree](https://github.com/liaohch3/claude-tap/tree/v0.1.141) | 2026-07-30 |

版本核对：

- Chorus `v0.14.5` 是正式 GitHub Release，发布时间为 `2026-07-27T08:56:24Z`，不是 tag 回退。
- claude-tap `v0.1.141` 是正式 GitHub Release，发布时间为 `2026-07-29T10:16:45Z`，不是 tag 回退。
- [Chorus `v0.14.5...main` 比较](https://github.com/Chorus-AIDLC/Chorus/compare/v0.14.5...d590b568f40fae51f71c9800841c587a3fe94b0b) 显示本研究关注的 `chorus-pi/` 是 main 新增能力；稳定版不含该目录。
- [claude-tap `v0.1.141...main` 比较](https://github.com/liaohch3/claude-tap/compare/v0.1.141...6cfe45afd7b6d009e839b178dd59b9e338b10309) 只有 `tests/test_responses_browser.py` 一行变化，没有生产 Viewer 变化。

## 3. Chorus：共享契约与后端生命周期

### 3.1 main 相对 `v0.14.5` 的真实差异

`d590b568…` 的相关新增不在 Chorus Web Dashboard 后端本身，而在新的 Pi 插件适配层：

- `chorus-pi/lib/lib.ts`：纯函数共享契约，包括配置解析、完整候选选择、worker 分类和可见 banner 投影；
- `chorus-pi/extensions/chorus.ts`：Pi 原生事件到 Chorus MCP session 生命周期的应用编排；
- `chorus-pi/bin/chorus-mcp-call.sh`：OpenSpec shell 调用面的同构配置回退；
- `chorus-pi/test/lib.test.ts` 与 `chorus-pi/test/ext-events.test.ts`：纯契约和真实事件编排测试；
- `chorus-pi/README.md` / `docs/CONNECT_PI.md`：安装和交互说明。

稳定 `v0.14.5` 已包含 daemon 把 `CHORUS_URL` 与 `CHORUS_API_KEY` 一起注入所有 spawner 的修复，但还没有 Pi 扩展。main 把这套能力移植到 Pi，并补上针对 Pi 自身配置发现、session 生命周期和 UI 通知的闭环。

### 3.2 Single-source config fallback

一手源码：

- [共享解析器 `chorus-pi/lib/lib.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/chorus-pi/lib/lib.ts)
- [扩展装配 `chorus-pi/extensions/chorus.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/chorus-pi/extensions/chorus.ts)
- [shell 同构实现 `chorus-pi/bin/chorus-mcp-call.sh`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/chorus-pi/bin/chorus-mcp-call.sh)
- [回归测试 `chorus-pi/test/lib.test.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/chorus-pi/test/lib.test.ts)

确认事实：

1. `parseChorusServerFromMcpJson` 只读取标准
   `mcpServers.chorus.{url,headers.Authorization}`，`Authorization` 只接受
   `Bearer cho_…` 或裸 `cho_…`，非法 JSON、缺 server 或不可识别 auth 都投影为空字符串。
2. `resolveChorusConfigFromMcpJson` 按“项目 `.mcp.json` → 全局
   `~/.pi/agent/mcp.json`”顺序查找，但只接受同一个候选内同时具有 `url` 和 `apiKey` 的完整 pair。
   项目候选只有 URL 时不会遮住后面的完整全局候选；两个半配置也不会跨候选拼接。
3. 扩展和 shell wrapper 使用同一优先级意图：环境变量优先，环境不完整时才读取 `.mcp.json`。
4. 解析失败不是“仍然 ready”：没有完整 pair 时扩展以 `CONFIGURED=false` 运行，shell wrapper
   则输出可行动错误并非零退出。

需要区分的源码细节：

- “`.mcp.json` 候选之间不拼接”已由共享纯函数与测试明确保证。
- 但扩展最终使用 `_envUrl || _mcp.url` 和 `_envKey || _mcp.apiKey`；shell 也只回填缺失的环境字段。
  因而“只设置环境 URL + `.mcp.json` 提供完整另一实例”仍可能得到环境 URL 与 fallback key 的混合 pair。
  这不是猜测，而是当前装配代码的直接结果。Tenon 不应照搬这种跨层字段级合并；workflow 当前定义应从
  一个解析成功的 definition source 得到完整 canonical plan。

对 Tenon 的可复用原则：

- 状态比较必须以完整、已验证的 current plan 为单位，不能把名称、步骤、document policy 或 fingerprint
  从不同来源拼接。
- 一个候选只有在完整编译并产生 canonical fingerprint 后才可进入 `matching/changed` 比较；
  部分或解析失败候选应落入独立的 `invalid`，不能继续用 fallback 字段把它伪装成有效定义。
- “未找到候选”与“候选存在但无效”必须分开，分别对应 `missing` 与 `invalid`。

### 3.3 Session lifecycle：create → map → close → retain → retry

一手源码：

- [事件编排 `chorus-pi/extensions/chorus.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/chorus-pi/extensions/chorus.ts)
- [事件回归 `chorus-pi/test/ext-events.test.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/chorus-pi/test/ext-events.test.ts)
- [worker 正向 allowlist `chorus-pi/lib/lib.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/chorus-pi/lib/lib.ts)

确认的共享/后端不变量：

1. 只有正向 allowlist 中的 canonical `worker` 会创建 Chorus session。`scout`、`planner`、
   `reviewer`、三个 Chorus reviewer 和任意自定义名字均不会因“不是 reviewer”而误获写生命周期。
2. `tool_call(subagent_spawn)` 在 worker 真正启动前创建 Chorus session，并把 session UUID 与
   生命周期说明注入 worker task；创建结果先放入 `pendingSessions(toolCallId → sessionUuid)`。
3. `tool_result(subagent_spawn)` 是主映射路径：
   `agentId → sessionUuid` 写入 `sessionMap`；`tool_execution_end` 只作为 shape/事件缺失时的 fallback。
4. spawn 本身失败或两条事件都无法提取 `agentId` 时，扩展主动关闭 orphan session，不会直接丢弃 UUID。
5. `closeSessionOrRetain` 只有在 `chorus_close_session` 成功后才调用 `onSuccess` 删除映射并显示成功。
   失败时保留 `sessionMap` 或 `pendingSessions`，显示“will retry on shutdown”的 warning。
6. `session_shutdown` 对两个 map 中残留 UUID 再调用 close，然后清理本地 map；测试钉住立即关闭失败后，
   shutdown 会对同一个 session UUID 再试一次。

这是一条重要的“观察确认后再清本地事实”原则：关闭请求被发出不等于 session 已关闭，暂时失败也不等于
可以把重试锚点删除。

限制：

- shutdown 的最终 close 用 `.catch(() => {})` 吞掉错误，随后无条件清 map；因此它只保证一次 shutdown
  重试，不保证跨进程持久重试，也没有把最终失败留成可查询 durable state。
- 这项限制对 Chorus Pi 是真实剩余风险；它不应被描述成“最终一定关闭”。

### 3.4 Chorus 既有 Server / Dashboard session close-reopen 契约

为覆盖 Chorus 的后端、Dashboard 和交互路径，本研究也读取了稳定版与 main 均存在的 Web Dashboard 路径：

- [session API](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/src/app/api/sessions/%5Buuid%5D/route.ts)
- [session service](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/src/services/session.service.ts)
- [Settings UI](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/src/app/%28dashboard%29/settings/page.tsx)
- [中英文消息](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/messages/en.json)

确认事实：

- `PATCH /api/sessions/:uuid` 只接受 `status: "closed"` 或 `"active"`，分别调用
  `closeSession` / `reopenSession`；其他值为 400。
- close 先批量 checkout 全部活跃 task checkin，再刷新 `lastActiveAt`，最后把 session 置为 closed；
  这样 close 时间不会因 closed guard 被跳过。
- reopen 只接受 closed session，并用一次 update 同时写 `status=active` 与新的 `lastActiveAt`，
  避免“已 active 但时间仍 stale”的半状态。
- Settings UI 对已加载 row 乐观替换状态，closed row 显示“Reopen”；但首次加载的
  `listAgentSessionsForUI` 只查“active 且一小时内 fresh”，因此刷新页面后 closed row 不在该列表中。
  “Reopen”主要是同页 close 后的短生命周期恢复入口，而非完整 closed-session 管理器。

这条既有 Web 路径与新 Pi 路径共同说明：状态动作必须由后端不变量定义；前端只展示明确状态和可达动作，
但 UI 是否能在刷新后重新发现恢复对象必须单独验证，不能由一次乐观交互推断。

## 4. Chorus：Dashboard / frontend 可见 readiness

### 4.1 Pi host UI 的启动 readiness

一手源码：

- [banner 纯函数](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/chorus-pi/lib/lib.ts)
- [`session_start` 通知装配](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/chorus-pi/extensions/chorus.ts)
- [banner 测试](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/chorus-pi/test/lib.test.ts)

main 新增 `buildSessionBanner`，并在 `session_start` 通过 `ctx.ui.notify` 显示：

| 后端/共享事实 | 用户可见结果 |
| --- | --- |
| 缺完整配置 | warning：插件未配置 |
| 有配置但 `chorus_checkin` 失败 | error：连接失败并显示 URL |
| checkin 成功 + OpenSpec active | info：connected + `OpenSpec Enabled` |
| checkin 成功 + 显式 opt-out | info：connected + 中性 `OpenSpec off` |
| checkin 成功 + 未设置 | info：connected + 可执行 enable 提示 |

这不是隐藏 agent context：扩展同时保留 `display:false` 的深层上下文和一条真正用户可见的 toast。
因此“内部有诊断字段”不等于“用户知道是否 ready”，必须有独立读者投影。

### 4.2 Chorus Web Dashboard 的加载、空态和错误态

一手源码：

- [shell 级 presence spine](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/src/contexts/agent-presence-context.tsx)
- [浮动入口](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/src/components/daemon-presence-entry.tsx)
- [连接 CTA](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/src/components/agent-presence/daemon-connect-cta.tsx)

稳定版已具备、main 没有改变的 Dashboard 交互规则：

- provider 把 `loading | ok | error` 与 `onlineCount` 分开；请求失败不能把在线数清零并伪装成真实空态。
- 浮动入口有四种显示：loading、error/unavailable、idle/0、online/N；错误态明确不显示“0 online”。
- 连接列表每 15 秒自愈轮询，并用 SSE 降低延迟；失败后自动重试。
- 真正 0 online 时才显示共享的 daemon CTA、可复制启动命令和 onboarding 链接。
- execution 首次聚合未完成时显示 loading，不提前闪成“Nothing running”。

对 Tenon 的直接映射是：

- `workflow definition unavailable`（旧 server 不提供新字段）不能显示成 `matching`；
- snapshot 请求失败不能显示成 `missing definition`；
- `missing` 只表示 server 成功读取、确认定义不存在；
- `invalid` 只表示定义候选存在但解析/编译失败；
- transition readiness 与 definition freshness 必须是两套并列、不同命名的状态。

## 5. Chorus 完整交互路径

```text
扩展加载
  └─ 解析完整连接配置
      ├─ 无完整配置 → 用户 warning；不发 checkin
      └─ 有完整配置 → session_start / chorus_checkin
          ├─ 失败 → 用户 error；session 继续但 hooks 不 ready
          └─ 成功 → 用户 info + OpenSpec 状态；隐藏上下文注入 agent
              └─ subagent_spawn(worker)
                  ├─ create 失败 → worker 继续，无 observability
                  └─ create 成功 → pending(toolCallId → sessionUuid)
                      ├─ result 可提取 agentId → map(agentId → sessionUuid)
                      ├─ spawn 失败/无法提取 → 尝试关闭 orphan
                      │   ├─ 成功 → 删除 pending + 用户 warning/info
                      │   └─ 失败 → 保留 pending + 用户 warning
                      └─ subagent_manage close
                          ├─ close 成功 → 删除 map + 用户 success
                          └─ close 失败 → 保留 map + 用户 warning
                              └─ session_shutdown 再试一次
```

Tenon 本轮功能是只读状态投影，不应引入对应的“刷新/替换 frozen plan”写动作；可复用的是上面三条纪律：

1. 完整来源才可判 ready；
2. 失败不能伪装成空或成功；
3. 只有观察到成功后才能清除/替换原有事实。

## 6. claude-tap：viewer decode 与验收 readiness

### 6.1 稳定版已有的生产解码边界

一手源码：

- [Viewer renderer](https://github.com/liaohch3/claude-tap/blob/547925c9bd66f73cdcf9a4779fc88a4ffa247738/claude_tap/viewer_assets/renderers.js)
- [Viewer CSS](https://github.com/liaohch3/claude-tap/blob/547925c9bd66f73cdcf9a4779fc88a4ffa247738/claude_tap/viewer_assets/viewer.css)
- [浏览器契约测试](https://github.com/liaohch3/claude-tap/blob/547925c9bd66f73cdcf9a4779fc88a4ffa247738/tests/test_responses_browser.py)

`v0.1.141` 的 Viewer 已经定义：

- 只把 `data:image/...` 或明确 base64 source 解码为 `<img>`；
- `file_id` 只显示 `image: file_id …` placeholder，不假装已经取得图片；
- 远程 `https://...` 图片不自动加载，只显示 `image: url` placeholder，避免 Viewer 读取私有 URL；
- 图片用 `loading="lazy"`，因此“元素已插入 DOM”早于“图片已解码且有 natural dimensions”是合法状态。

### 6.2 main 的唯一差异

一手源码：

- [main commit](https://github.com/liaohch3/claude-tap/commit/6cfe45afd7b6d009e839b178dd59b9e338b10309)
- [main 浏览器测试](https://github.com/liaohch3/claude-tap/blob/6cfe45afd7b6d009e839b178dd59b9e338b10309/tests/test_responses_browser.py)

`6cfe45a…` 相对 `v0.1.141` 只增加：

```python
responses_page.wait_for_function("image => image.complete", arg=image.first.element_handle())
```

之后才断言 `naturalWidth == 8`、实际宽高和 CSS `minWidth`。生产代码没有变化。

事实与推断必须分开：

- 事实：这是一项测试时序修复，不是新的用户功能或新生产 readiness 字段。
- 推断：上游确认 selector 出现不足以证明视觉内容可验收；异步资源要等待它自己的完成条件。
- 对 Tenon：浏览器验收不能只等 workflow status badge 出现。需要先等真实 snapshot 完成、decoder 接受
  新字段，再分别验证 `matching/changed/missing/invalid/unavailable` 文案、详情和布局；如果状态详情使用
  异步 popover/dialog，也要等它真正打开并完成布局再取证。

## 7. Tenon 当前 frozen/current workflow 事实

本地一手源码：

- `packages/kernel/src/workflow/effective-plan.ts`
- `packages/kernel/src/state/workflow-plan-snapshot.ts`
- `packages/server/src/workflowSnapshot.ts`
- `packages/server/src/snapshot.ts`
- `packages/server/src/types.ts`
- `packages/dashboard-app/src/api/snapshotDecoder.ts`
- `packages/dashboard-app/src/types.ts`
- `packages/dashboard-app/src/model/progressModel.ts`
- `packages/dashboard-app/src/progress/WorkflowCanvas.tsx`

确认事实：

1. `workflowPlanSnapshot(plan)` 冻结完整 workflow IR、document policy 和 SHA-256
   `workflowFingerprint`；读取时会重新编译并验证内容与 fingerprint 一致。
2. Change 已有 snapshot 时，`resolveBoundEffectiveWorkflowPlan` 直接从 frozen snapshot
   重建 effective plan，不读取当前 definition；这正是“在途执行不受后来编辑影响”的核心不变量。
3. Server `GET /api/snapshot` 当前只投影：
   `workflowPlanFingerprint`、同一冻结 plan 的 `workflowRules`，以及当前 Change/Track 的
   `workflowExecution.readinessByTransition`。
4. Dashboard decoder 严格校验 64 位 fingerprint、step 集合、边、gate、label、outputs 和 readiness；
   非法结构不会被宽松解释。
5. Progress 按 `root + frozen fingerprint` 分组，并使用 frozen rules 判断 gate/readiness；UI 目前没有
   当前 definition fingerprint、比较状态或解释。
6. `computeFingerprint` 当前监听 canonical state、`tasks.md`、document ledger 和 terminal activity，
   没有把 custom workflow 文件或 default workflow source 变更纳入 SSE 唤醒源。

因此当前用户只能看到“这个 Change 正在按哪个冻结 plan 跑”，无法看到“同名当前定义是否仍与冻结 plan 一致”。

## 8. 差异映射与建议契约

### 8.1 状态含义

建议只读投影保持四个服务端事实状态，并把旧 server 的字段缺失留给客户端兼容态：

| 状态 | 服务端必须证明 | 不得暗示 |
| --- | --- | --- |
| `matching` | 当前定义完整加载/编译成功，canonical fingerprint 等于 frozen fingerprint | transition 已 ready |
| `changed` | 当前定义完整加载/编译成功，fingerprint 不同 | frozen plan 已失效或应自动更新 |
| `missing` | 当前 custom workflow 的权威查找成功完成，但定义不存在 | snapshot 损坏 |
| `invalid` | 当前定义候选存在，但读取、解析、校验或编译失败 | 与 frozen fingerprint 可比较 |
| 客户端 `unavailable` | 新字段缺失（滚动升级旧 server） | `matching`、`missing` 或 `invalid` 中任一个 |

default workflow 不存在“项目文件被删除”这一 custom 路径；它应从当前 builtin/default source 编译后比较，
编译异常属于 `invalid`，而非 `missing`。

### 8.2 后端 / shared contract

建议的最小加法字段应属于 `ChangeSnapshot`，与 execution readiness 并列：

```ts
type WorkflowDefinitionStatus =
  | { status: 'matching'; currentFingerprint: string }
  | { status: 'changed'; currentFingerprint: string }
  | { status: 'missing' }
  | { status: 'invalid'; code: string }
```

约束：

- frozen fingerprint 继续使用既有 `workflowPlanFingerprint`，不复制第二份。
- `currentFingerprint` 只在成功编译时出现，且必须是同一 canonical `EffectiveWorkflowPlan` 计算路径的结果。
- `invalid.code` 使用稳定机器码；不把绝对路径、原始 YAML、stack 或可能含敏感内容的 parser error 发给前端。
- 当前定义读取失败只影响这个新投影，不能让 `workflowRules`、readiness 或 transition 改用当前定义。
- 这是只读 API 加法；不得增加“刷新 frozen plan”“接受 current definition”或写入 canonical state 的端点。

### 8.3 Dashboard / frontend

建议入口：

- WorkflowCanvas 的 workflow group header 显示简短状态 badge；同一 group 已按 frozen fingerprint 聚合，
  可避免每个 Change 卡重复噪声。
- badge 使用真正的 `<button type="button">` 打开详情，支持 Tab、Enter/Space、Esc 和焦点回返。
- 详情明确分两行：
  1. `执行定义：已冻结`；
  2. `当前定义：一致 / 已变化 / 已缺失 / 无效 / 状态不可用`。
- `changed` 只提供解释，不提供修复写按钮；文案必须说明当前编辑不会追溯改变该 Change。

状态路径：

- loading：沿用 snapshot 首屏 loading，不提前渲染 freshness；
- error：snapshot/decoder 失败沿用页面错误与重试，不降级成 `missing`；
- empty：没有 Change 时仍是现有 Progress 空态，不渲染虚构 workflow status；
- old server：字段缺失显示中性 `状态不可用`；
- present malformed：decoder fail-closed，进入真实错误路径；
- i18n：所有 badge、说明、详情标题和不可用文案同时加入中英文资源。

### 8.4 用户交互路径

```text
GET /api/snapshot
  ├─ 请求失败 / decoder 失败 → 页面 error + retry
  └─ Change snapshot 成功
      ├─ 新字段缺失 → 状态不可用（旧 server 兼容）
      ├─ matching → “当前定义一致”
      ├─ changed → “当前定义已变化” + “冻结执行不受影响”
      ├─ missing → “当前定义已缺失” + “仍按冻结定义执行”
      └─ invalid → “当前定义无效” + 稳定错误说明
          └─ 键盘/鼠标打开详情 → 只读解释 → Esc/关闭后焦点返回 trigger
```

这个路径刻意不复用 `workflowExecution.readinessByTransition` 的“ready/blocker”词汇，避免用户把
definition freshness 误读为 phase 放行条件。

## 9. 风险与验证启示

1. **执行真相污染**：若为比较 current definition 而改变 `resolveSnapshotEffectivePlan` 的优先级，
   会破坏 frozen plan 不变量。比较器必须是旁路投影。
2. **SSE 陈旧**：即便 snapshot builder 能计算状态，workflow 文件变化若不进入 fingerprint，
   已打开 Dashboard 仍可能不刷新；必须设计有界、项目内、非 symlink 的 wake source 或明确刷新策略。
3. **错误泄漏**：parser 原文可能带路径或输入片段；前端只需要 stable code 与本地化解释。
4. **兼容解码**：缺字段是旧 server，非法字段是协议错误，两者不能合并。
5. **视觉假阳性**：badge selector 出现不等于详情/字体/布局就绪；浏览器测试应等待实际交互状态，
   对异步视觉资源采用类似 claude-tap `image.complete` 的语义条件。
6. **状态名称冲突**：`matching/changed` 是定义新鲜度；`ready/blocked` 是 transition readiness。
   类型、i18n key、badge 颜色和可访问名称都应保持分离。

## 10. 开放问题

1. 当前 custom workflow 文件发生变化时，应把哪些受信任路径/mtime 纳入 `computeFingerprint`，
   才能触发 SSE 更新且不跟随 symlink、不扩大 root 信任边界？
2. `invalid` 是否只暴露一个稳定 `code`，还是还需要安全裁剪后的 `detail`；哪些诊断必须留在 server 日志？
3. `currentFingerprint` 是否需要下发给 Dashboard 详情，还是仅服务端比较后返回状态即可，以减少面向用户的内部噪声？
4. 同名 workflow 下若同时存在多个 frozen fingerprint group，状态 badge 是逐 group 展示，还是在 workflow
   header 聚合成“多个历史版本”；哪种最不容易被误读为执行 readiness？
5. 环境/项目/global 多来源未来若用于 Tenon workflow 发现，是否明确采用“第一个完整且合法的定义候选”
   而完全禁止 Chorus 当前仍可能出现的 partial-env + fallback-field 混合？
