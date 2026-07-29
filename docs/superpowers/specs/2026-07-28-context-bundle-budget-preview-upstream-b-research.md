# Com&#101;t snapshot context budget 一手证据与 Tenon 映射

读取日期：2026-07-28

上游：[`rpamis/com%65t`](https://github.com/rpamis/com%65t)

默认分支：`master`
> 研究边界：固定上游事实并判断其对 `context-bundle-budget-preview` 的设计启发；不复制 Com&#101;t 代码，不改变 Tenon canonical state、工作流投影或真实 handoff 预算。

## 结论先行

Com&#101;t `0.4.0-beta.9` 针对大仓库 baseline 的修复，真正值得 Tenon 复用的是治理原则，而不是字段集合：

1. 预检必须复用真实执行路径的选择、计量和失败规则；
2. 显式排除与资源超限必须可区分，不能把未纳入范围伪装成成功读取；
3. 有效策略、有效预算和内容摘要必须可审计；
4. 无法得到完整结果时必须返回结构化、可执行的失败，不得静默交付部分上下文。

Tenon Context Bundle 的输入已经由 document ledger 限定，不需要照搬 Com&#101;t 面向仓库遍历的
`include`、`exclude`、`max_files` 或 `max_duration_ms`。本轮最小纵向切片应只暴露与现有
Context Bundle 语义一致的字节预算和 ledger-bound 输入摘要，并由 CLI 与 Dashboard 共用同一个
compiler/application service。

## 固定版本与来源

### 默认分支

2026-07-28 读取 GitHub Repository/Commit API：

| 项目 | 固定值 |
| --- | --- |
| 默认分支 | `master` |
| 最新提交 | `2945693e4061c369be0d400ed2999a66fa87c680` |
| 提交日期 | `2026-07-26T12:19:37Z` |
| 标题 | `feat: add platform target option to init and update (#227)` |
| URL | [`rpamis/com%65t@2945693`](https://github.com/rpamis/com%65t/commit/2945693e4061c369be0d400ed2999a66fa87c680) |

该提交就是 [`PR #227`](https://github.com/rpamis/com%65t/pull/227) 的 merge commit。它增加
`com%65t init/update --platform`，不是 snapshot budget 的实现提交。

### 最新 GitHub Release 与严格 SemVer 口径

GitHub `releases/latest` 返回：

| 项目 | 固定值 |
| --- | --- |
| Release / tag | `0.4.0-beta.9` |
| GitHub `prerelease` | `false` |
| Tag commit | `84038b0d6b7c185b233f0f36b294ae74dd9121d0` |
| 发布时间 | `2026-07-24T16:55:25Z` |
| URL | [`0.4.0-beta.9 Release`](https://github.com/rpamis/com%65t/releases/tag/0.4.0-beta.9) |
| 固定源码 | [`rpamis/com%65t@84038b0`](https://github.com/rpamis/com%65t/tree/84038b0d6b7c185b233f0f36b294ae74dd9121d0) |

需保留一个版本口径 caveat：GitHub 将 beta.9 发布记录标记为非 prerelease，因此它是 GitHub
`latest` API 的稳定发布结果；但版本名包含 SemVer prerelease 标识。若“稳定版”严格定义为
不含 prerelease 标识，最新版本是
[`0.3.9`](https://github.com/rpamis/com%65t/releases/tag/0.3.9)，tag commit 为
[`053f76d8ac6aaa499b1d3f8752cb5637fc4fb914`](https://github.com/rpamis/com%65t/commit/053f76d8ac6aaa499b1d3f8752cb5637fc4fb914)。
本研究选择 beta.9 作为功能证据，因为 snapshot policy/budget 正是在该版本发布。

## 上游问题、修复和发布闭环

### Issue #226：固定上限导致合法仓库无法建立完整 baseline

[`Issue #226`](https://github.com/rpamis/com%65t/issues/226) 记录了 beta.8 的实际边界：

- 工作树 Git LFS payload 会按展开后内容计算大小与哈希；
- 固定单文件 5 MiB、总容量 64 MiB；
- 创建 Change 时没有受支持的 include/exclude 或项目级预算；
- 超限会以 `baseline-incomplete` / `resolve-native-baseline` 失败，但当时没有可执行修复路径。

Issue 明确认可“要求完整 baseline、fail-closed”这个治理方向，问题是范围与容量不可配置、诊断不可执行。
这一区分很重要：修复目标不是允许部分成功，而是让完整性约束具备安全、受限、可审计的配置入口。

### PR #233 与 beta.9：可配置但仍失败关闭

[`PR #233`](https://github.com/rpamis/com%65t/pull/233) 在
`2026-07-24T16:47:10Z` 合并，merge commit
[`84038b0d6b7c185b233f0f36b294ae74dd9121d0`](https://github.com/rpamis/com%65t/commit/84038b0d6b7c185b233f0f36b294ae74dd9121d0)
与 beta.9 tag 相同。PR 明示 “configurable baseline include/exclude policies and snapshot budgets”
用于解决 #226。

beta.9 的 [Release notes](https://github.com/rpamis/com%65t/releases/tag/0.4.0-beta.9) 又把闭环写成可验证行为：

- `.com%65t/config.yaml` 提供 file-count、total-byte、duration 预算；
- 默认总预算从 64 MiB 提升为 256 MiB；
- 不再保留独立 5 MiB 单文件上限；
- 仍对实际工作树内容做 streaming SHA-256；
- 把有效策略和有效限制写入审计证据；
- 无法捕获完整 baseline 时给出可执行配置修复。

## 固定源码事实

以下链接全部固定到 beta.9 tag commit，不依赖会漂移的 `master`。

### 1. 配置面：严格、有限且有安全校验

[`native-config.ts:29-47@84038b0`](https://github.com/rpamis/com%65t/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/com%65t-native/native-config.ts#L29-L47)
只接受：

```yaml
native:
  snapshot:
    include: ["**/*"]
    exclude: []
    max_files: 10000
    max_total_bytes: 268435456
    max_duration_ms: 60000
```

默认值是 `include=["**/*"]`、空 exclude、10,000 files、256 MiB、60 秒。解析器在
[`native-config.ts:98-129@84038b0`](https://github.com/rpamis/com%65t/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/com%65t-native/native-config.ts#L98-L129)
拒绝未知字段，并要求预算为正安全整数；pattern 不能是绝对路径、不能包含 `..`、反斜杠或 NUL，
且存在长度/通配符数量上限。

事实含义：预算可配置不等于输入任意；配置本身属于不可信边界。

### 2. 选择面：include/exclude 规范化后绑定 policy hash

[`native-snapshot.ts:1352-1485@84038b0`](https://github.com/rpamis/com%65t/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/com%65t-native/native-snapshot.ts#L1352-L1485)
对 include/exclude 去重、排序并生成 `com%65t.native.snapshot-policy.v1` 的 SHA-256 hash。
读取 manifest 时会重新计算并拒绝错误 hash。相应测试
[`native-snapshot.test.ts:1489-1519@84038b0`](https://github.com/rpamis/com%65t/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/test/domains/com%65t-native/native-snapshot.test.ts#L1489-L1519)
证明：

- `exclude: ["data/**"]` 是显式策略，不记为 omission；
- manifest 保留 include、exclude 和 64 字符策略 hash；
- 策略范围内文件仍按真实内容进入 snapshot。

事实含义：**显式不选择**和**想选择但因资源不足而遗漏**必须是两种不同状态。

### 3. 计量面：所有预算作用于同一次受控 capture

[`native-snapshot.ts:2265-2283@84038b0`](https://github.com/rpamis/com%65t/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/com%65t-native/native-snapshot.ts#L2265-L2283)
把 `maxFiles`、`maxTotalBytes`、manifest 上限和 `maxDurationMs` 固化为 effective limits。
同一个 deadline 同时约束 Git 子进程和物理树遍历；源码注释明确避免用无法取消底层 I/O 的
Promise race，超时必须成为完整性失败证据，而不是让后台读取继续运行：
[`native-snapshot.ts:128-132,251-275@84038b0`](https://github.com/rpamis/com%65t/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/com%65t-native/native-snapshot.ts#L128-L132)。

项目配置在
[`native-snapshot.ts:2956-2968@84038b0`](https://github.com/rpamis/com%65t/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/com%65t-native/native-snapshot.ts#L2956-L2968)
映射到执行预算。公开配置没有单独 `max_file_bytes`；实现把每文件上限设为
`max_total_bytes`，因此 beta.9 Release 所说“没有独立 5 MiB per-file cap”与源码一致。

事实含义：preview 若与真实执行采用不同计量算法或不同输入集合，就不能声称可以提前发现真实失败。

### 4. 完整性面：不完整 baseline 不会降级为成功

创建 Change 时，
[`native-change.ts:640-670@84038b0`](https://github.com/rpamis/com%65t/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/com%65t-native/native-change.ts#L640-L670)
使用项目策略和预算创建 baseline；只要 `complete=false`，就汇总 omission reason，抛出
`NativeBaselineIncompleteError`，不会继续写入并接受部分 baseline。

CLI 在
[`native-cli.ts:783-804@84038b0`](https://github.com/rpamis/com%65t/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/com%65t-native/native-cli.ts#L783-L804)
把它稳定映射为：

- exit code `65`；
- error code `baseline-incomplete`；
- `omittedCount` / `omittedByReason` / sample paths；
- `effectiveLimits` / `policyHash`；
- `configPath`；
- `supportedFixes`；
- `requiredAction: resolve-native-baseline`。

事实含义：错误既要机器可判定，也要给人明确下一步；“有一些输入可用”不能把失败改成 200 成功。

## 与 Tenon `context-bundle-budget-preview` 的映射

| Com&#101;t 机制 | Tenon 现状/约束 | 本轮建议 |
| --- | --- | --- |
| include/exclude 选择仓库文件 | Context Bundle 的输入由 target phase 的 document contract + ledger/read receipts 决定 | 不新增任意 glob；UI 只展示真实 contract 选中的文档 |
| `max_files` | document kinds 有限，但每个 kind 的 ledger records 仍可能无界增长 | server 固定 64 records 上限；不增加用户控件 |
| `max_total_bytes` | materialized budget 不能限制读取前的 source bytes | server 固定 256 KiB 单文件、1 MiB 总 source bytes；预览预算继续计量 materialized bytes |
| `max_duration_ms` | Context Bundle 读取有限 ledger-bound 文档，当前没有长时间仓库遍历 | 不引入无实际风险来源的 duration 控件；若未来有远程/大规模输入再独立设计 |
| policy hash | Tenon 已有 document SHA、bundle digest 与 ledger 证据 | 响应返回 bundle digest、每个输入的 ledger SHA/物化模式/字节数，但不下发完整文档内容 |
| `baseline-incomplete` | Tenon 已有 missing/stale/budget failure | 保留 fail-closed，提供稳定机器码、HTTP 状态和可执行建议；不返回“部分成功” |
| 有效限制写入证据 | 预览预算不应持久化或改变 handoff 默认值 | 响应回显请求生效预算和实际 used bytes；明确 `side_effects: none` |

### 推荐的最小契约原则

1. 由 kernel/application service 编译真实 bundle；CLI 和 server 都调用它，禁止 server 重写一套估算器。
2. Dashboard API 只返回摘要：target phase、effective budget、used bytes、bundle digest、输入
   kind/path/mode/ledger SHA/content bytes；不返回文档正文。
3. Missing、stale、budget exceeded 都返回稳定错误码和可执行提示；不生成 partial preview。
4. `budget_bytes` 只作用于当前只读请求，不写 canonical state、ledger 或配置，不改变 CLI 默认预算。
5. root 必须来自 server 注册表，Change/phase/budget 必须严格校验；不得接受任意路径或 glob。

## `master` platform target 与本轮去重结论

Com&#101;t 最新 `master` 提交
[`2945693`](https://github.com/rpamis/com%65t/commit/2945693e4061c369be0d400ed2999a66fa87c680)
对应 [`PR #227`](https://github.com/rpamis/com%65t/pull/227)，其功能是给 `init/update` 增加显式
`--platform` 单目标选择、注册/自定义 platform 校验和 scope 约束。

2026-07-28 的本地 worktree 审计已经发现独立在途分支
`codex/host-target-plan-dashboard` / Change `host-target-plan-dashboard`，正在实现：

- `host-target-plan/v1` 共享 DTO；
- `tenon host-target-plan --json`；
- `/api/host-targets` 与 `/api/host-target-plan`；
- Dashboard 的目标选择、loading/error/empty/retry 与中英文入口。

因此 Com&#101;t 最新 master 的 platform target 已与该在途 Change 实质重叠。本轮
`context-bundle-budget-preview` 不采用它作为功能候选，只使用 beta.9 snapshot budget 的治理差异，
避免并发制造同一功能。

## 事实、推断与建议边界

### 已确认事实

- master SHA、Release/tag SHA、PR/Issue 状态和源码行为均由 2026-07-28 的 GitHub 一手 API、
  固定 commit blob 与本地 worktree 文件核实。
- beta.9 仍 fail-closed；它增加的是安全配置与可执行诊断，不是 partial baseline。
- platform targeting 比 beta.9 tag 更新，并已与本地在途 host-target-plan 功能重叠。

### 推断

- Com&#101;t 的“真实执行与预检同源”原则可以降低 Tenon Dashboard 预览与 CLI handoff 漂移风险。
- 对 Tenon 而言，任意 include/exclude 和 duration/file-count 控件会扩张产品语义，当前没有证据支持。

### 建议

- Spec 将 `budget_bytes` 定义为临时、只读、受界请求参数，并固定 UTF-8 字节口径。
- API 明示 `side_effects: none` 和 schema version，客户端严格解码。
- 错误 DTO 公开 stable code、effective/required bytes 和恢复动作，不公开正文或任意磁盘路径。

## 主线仍需决断

1. API schema 是否统一为 `context-bundle-preview/v1`，并显式携带 `side_effects: "none"`？
2. `budget_bytes` 的最小值、最大值和默认值是否直接复用 CLI `DEFAULT_BUNDLE_BUDGET`，还是 server 另设更低硬上限？
3. 对 `open` 或无 required reads 的目标阶段，是返回成功空列表（UI empty state），还是拒绝为无意义 target？
4. missing、stale、budget exceeded 分别采用哪些稳定 HTTP status/code，客户端是否只按 code 分支而不匹配 message？
5. 输入摘要是否包含 ledger SHA 与 bundle digest 即足够审计，还是还需要返回 contract reason；任何情况下都不应返回文档正文。
