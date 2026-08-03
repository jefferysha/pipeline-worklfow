# 2026-07-29 合并后统一审查：Verify 第五次尝试

## 结论

- Change：`post-merge-unified-review-20260729`
- 最终主干基线：`445aa1411d45a2c112d296a9fc3530db0f62e31e`
- frozen Build SHA：`f292d00ac47288f40be08f963859a15cb1ffa483`
- PR：[jefferysha/tenon#20](https://github.com/jefferysha/tenon/pull/20)
- 四轨聚合：**Critical 0 / High 0 / Medium 5 / Low 1**
- 结论：**FAIL，必须以 `verify-fail` 返回 Build；不得合并或发布**

GitHub exact-head CI、独立完整测试、API/browser acceptance 与 OpenSpec 隔离演练均通过，
但 Reviewer 和 Codex CLI 发现了可复现的 mutation identity、确认快照 identity、成功响应
runtime decode 与规则版本漂移。视觉轨完成了部分 exact-SHA 状态截图后执行代理未能正常收敛，
因此本轮也不把视觉矩阵标记为通过；新 Build SHA 必须重新执行完整四轨。

## 冻结基线与零输出

Reviewer clone `/private/tmp/tenon-attempt5-review.3OKAsm/repo`、Codex clone
`/private/tmp/tenon-codex-review-f292.ttZzDA/repo`、E2E clone
`/private/tmp/tenon-verify-attempt5.MoTyE5/repo` 均以 detached
`f292d00ac47288f40be08f963859a15cb1ffa483` 执行。Reviewer 与 E2E 均证明 clone
前后 clean、共享 implementation/config/generated 指纹前后一致；Codex 以 read-only sandbox
执行。视觉证据只写入外部目录 `/private/tmp/tenon-visual-v5.01Ofy5`。

共享工作树只保留主流程通过 Tenon CLI 生成的 phase、document-read 和 transition canonical
状态；验证轨没有写入共享 `packages/`、生成物或 Change canonical state。

## 四轨结果

| 轨道 | 结论 | 证据 |
| --- | --- | --- |
| Reviewer | C0/H0/M2/L1，FAIL | 401/401 changed paths、完整调用链、规则和规格审查；独立 build/typecheck/full tests/gates 通过 |
| Codex CLI | C0/H0/M3/L0，FAIL | detached exact-SHA read-only `codex exec review`，三个 finding 与 Reviewer 不重复 |
| E2E/API | C0/H0/M0/L0，PASS | clean install/build/typecheck/full tests、真实 API 安全正负路径、七个 Dashboard 页面 |
| Dashboard visual | 未完成，不得外推 PASS | 完成 6 个 exact-SHA 状态截图；执行代理未正常收敛，下一 SHA 必须重跑完整矩阵 |

## 去重 findings

### M1：Operations 危险确认未绑定完整决策输入

OperationsPanel 的确认状态没有在 selector、level、commit、sync mode、source/model 等操作输入
改变时失效。用户可先确认 A，再修改目标或操作参数并把旧确认用于 B。

修复要求：

- 以 exact root + operation + 所有决策输入形成确认 identity。
- 任一决策输入改变时关闭确认并恢复焦点；增加逐输入变更回归。

### M2：Loop 升档确认未绑定完整权威决策事实

LoopCard 只在 root/Loop ID 改变时关闭升档 dialog。同一个 Loop 的 autonomy、readiness、
budget、blocker 或目标等级事实改变后，旧 dialog 仍可提交。

修复要求：

- 以服务器权威决策事实形成稳定 decision key。
- 逻辑等价 refresh 保持 dialog；任一相关事实改变立即关闭，且旧确认不得提交。

### M3：Workbench save/create 未严格解码 2xx success

Workbench save/create 对任意 2xx 都按成功处理。`200 {}`、`200 {ok:false}` 或非 JSON 可清除
dirty 状态、选择并不存在的 Workflow 或给出成功反馈。

修复要求：

- 在 API 边界严格要求 endpoint 的精确 success schema。
- malformed 2xx 进入当前语言 invalid-response，保留编辑状态；覆盖空对象、false 和非 JSON。

### M4：同 root 跨实体 mutation completion 可污染当前编辑器

`TrackSettings.tsx` 的 save/remove 没有在 response/catch/finally 校验完整
`{root, track, revision, operationToken}`。保存 A 后切换 B，A 的迟到成功可关闭 B，迟到错误可
显示在 B，finally 可错误清除 B 的 busy。

`DefaultSkillChain.tsx` 虽创建 token/cellKey，但 success/error 只校验 root；A cell 的迟到结果
可关闭或污染 B cell 编辑器，只有 finally token guard 不足。

修复要求：

- 所有 success/error/finally 使用 exact root + entity/cell + revision + operation token。
- 增加同 root A→B、并发不同 cell 与交错完成顺序回归。

### M5：AFK mutation client 把畸形 2xx 误报成功

`automationClient.ts` 的 settings、enqueue、retry、dismiss 只检查 HTTP status，没有解码
服务器 success envelope。`200 {ok:false}`、`200 {}` 或 200 非 JSON 会在 `AfkView` 显示成功。

修复要求：

- 分别严格解码 `{ok:true, settings}` 与 action result envelope，不使用宽松 void 成功。
- malformed 2xx 显示当前语言 invalid-response，且不提交乐观状态或成功 toast。
- 审计同类 mutation client，补齐 deterministic malformed-200 回归。

### L1：权威前端规则仍声明 Vite 5

`.agent-rules/FRONTEND.md` 仍写 Vite 5，而 root 与 Dashboard manifests 已升级至 Vite 6.4.3。

修复要求：将权威规则同步为 Vite 6，并检查仓库是否还有同类版本漂移。

## 真实执行证据

### GitHub exact-head CI

PR #20 head 精确为 frozen SHA；`CI / verify` 与 `Documentation Pages / build` 均成功，
PR 上 deploy 按设计 skipped，merge state 为 `CLEAN`。绿色 CI 不覆盖上述静态 findings。

### Reviewer

- `npm ci`：audit 0；
- root build、Dashboard typecheck；
- root 327 files / 5729 passed / 26 honest skips；
- Dashboard 69 files / 1287 passed；
- architecture、comments、dependencies、release workflows、repository hygiene、docs、
  default-workflow freshness、`git diff --check` 全部通过；
- OpenSpec strict 32/32。

### E2E/API

隔离环境使用 Node `24.18.0`、npm `11.16.0`、server `127.0.0.1:18869`：

- clean `npm ci`：408 packages，418 audited，0 vulnerabilities；
- build、typecheck、dependency/release/architecture/repository-hygiene gates 全部通过；
- 干净条件复跑 root 327/327 files、5728 passed、27 honest skips；
- Dashboard 69/69 files、1287 passed；
- health/snapshot/config/Host Plan/trace/evidence/related/router 正路径通过；
- malformed evidence/query/traversal 400，无/错 token 401，content-type 400，未知 root 404，
  duplicate registration 409，恶意 Host 403；
- 负向请求前后 `templates/manifest.yaml` SHA-256 不变；
- overview/projects/progress/afk/workbench/machine/hostPlan 七页真实渲染；
- 390px 七页与 1440px Workbench 无根级横向溢出；
- Snapshot SSE 恢复、Workbench retry、modal focus/Escape/return focus、Machine empty、
  Host Plan 503→retry 通过；
- 0 pageerror、0 unexpected console error；端口已关闭。

首轮全测在 Reviewer 的另一套高并发 Vitest 同时运行时出现 159 个跨模块 timeout 与
ENOTEMPTY；竞争结束后同一 SHA/HOME/命令完整通过，未复现，因此保留原日志但不判产品失败。
27 个 skip 为 Docker/容器、隔离 HOME 下真实 Claude plugin、opt-in real Codex 与 macOS 上
Linux-only 安全用例，均未伪绿。

### OpenSpec 隔离应用演练

隔离副本 `/private/tmp/tenon-openspec-f292.mcocsB/repo`：

- Change deltaCount 5；
- target strict validation 通过；
- 官方 archive `specsUpdated=true`，应用 5 个 delta；
- post-archive strict 31/31；
- 共享主规格摘要前后均为
  `9abfd0a106a90d42e0874016d95341e4235bd5f4365b37732e800ed9e706fbe3`。

## 下一轮 Build 出口

1. 使用 exact `verify-fail` event 返回 Build，不接受偏差。
2. 为 5 个 Medium 和 1 个 Low 增加 deterministic RED，再完成最小修复。
3. 重建 tracked Dashboard assets，重跑完整 Build 门与独立 pre-Verify review。
4. 冻结新 SHA 后重新执行 Reviewer、Codex、E2E/API、全 Dashboard visual 四轨；本轮任何
   绿色执行证据不得外推。
