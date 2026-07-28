# Trellis v0.6.9 对 Tenon 验证证据编排器的设计启示

## 调研问题与结论

本报告回答：Trellis v0.6.9 的 structured journal flags、journal
`merge=union` 与 binary context handling，哪些原则可以映射到 Tenon 的
`verification-evidence-composer`，哪些实现不能照搬。

结论：

1. **采用“结构化输入、确定性渲染、无内容即省略”的原则**，但 Tenon 必须使用显式
   `pass` / `fail` / `blocked` / `skipped` 结果，而不能像 Trellis journal 的
   `--test` 一样只要出现就渲染为 `[OK]`。
2. **保留本 Change 的纯预览、显式复制、不自动写 canonical report 的边界**。
   Trellis 的 `merge=union` 只适合严格追加型 journal；验证结论有顺序、唯一性和 gate
   语义，union merge 可能静默拼接互相矛盾的 verdict，不适合 Tenon。
3. **本轮不引入文件读取或附件内联**。若未来支持文件证据，应复用 Trellis 的关键顺序：
   先读取/检查原始 bytes，再严格 UTF-8 解码；二进制只返回可审计 notice，不能把替换字符
   或 NUL 注入 Markdown。
4. 服务端应是唯一的校验与渲染实现：相同规范化输入必须得到逐字节相同的 Markdown；
   Dashboard 只负责输入、加载/空/错误状态和复制。

## 固定上游版本

读取日期：**2026-07-28**。

| 项目 | 固定值 | 一手来源 |
| --- | --- | --- |
| 仓库 | `mindfold-ai/Trellis` | [仓库](https://github.com/mindfold-ai/Trellis) |
| 默认分支 | `main` | GitHub repository API：`GET /repos/mindfold-ai/Trellis` |
| `main` HEAD | `12e279a8af00456b1d0d4e3d0f7f59e7b702202e` | [固定 commit](https://github.com/mindfold-ai/Trellis/commit/12e279a8af00456b1d0d4e3d0f7f59e7b702202e) |
| latest GitHub Release | **不存在；API 返回 HTTP 404** | `GET https://api.github.com/repos/mindfold-ai/Trellis/releases/latest` |
| 稳定版本回退 | 语义版本 tag `v0.6.9` | [tag](https://github.com/mindfold-ai/Trellis/tree/v0.6.9) |
| tag 指向 | `v0.6.9` 与 `main` HEAD 同为 `12e279a8af00456b1d0d4e3d0f7f59e7b702202e` | GitHub Git ref API：`GET /repos/mindfold-ai/Trellis/git/ref/tags/v0.6.9` |

本地对 tag 做 `git tag --sort=-v:refname`，`v0.6.9` 位于 `v0.6.8`、
`v0.6.7` 之前；因此在 latest Release 404 后，将它作为最新稳定语义版本 tag。
Trellis 自身的
[`0.6.9.json` L1-L8](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/migrations/manifests/0.6.9.json#L1-L8)
把 binary handling、structured flags 和 journal conflict relief 都列入同一非 breaking
版本说明。

## 一手源码证据

### 1. Structured journal flags

相关提交：
[`53a29d414a2a92949865a5d9ed1f493c2ae0fd7b`](https://github.com/mindfold-ai/Trellis/commit/53a29d414a2a92949865a5d9ed1f493c2ae0fd7b)。

| 证据 | 已验证事实 | 对 Tenon 的意义 |
| --- | --- | --- |
| [`add_session.py` L246-L264](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/.trellis/scripts/add_session.py#L246-L264) | 列表按输入顺序渲染；空列表返回空字符串；structured `changes` 优先于 freeform `extra_content` | 数组输入可稳定映射为 Markdown；空 section 不应生成假占位 |
| [`add_session.py` L267-L315](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/.trellis/scripts/add_session.py#L267-L315) | `changes`、`tests`、`next_steps` 各自形成 section；只有有值时出现 | “字段存在”和“section 可见”可以一一对应，便于测试 |
| [`add_session.py` L618-L677](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/.trellis/scripts/add_session.py#L618-L677) | `--change` / `--test` / `--next-step` 均为 repeatable `append` 参数；旧 `--content-file` / `--stdin` 路径保留 | 新结构化入口可以增量加入，不必破坏旧调用方 |
| [`add-session.integration.test.ts` L185-L238](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/test/scripts/add-session.integration.test.ts#L185-L238) | 测试同时锁定 legacy 空 section 省略与 repeatable flags 的顺序/格式 | Tenon 应同时测试空态、兼容态和多条记录的稳定顺序 |

值得注意的是，Trellis 对任何 `--test` 都使用固定 `- [OK] ` 前缀
（`add_session.py` L293-L295）。这适用于“完成后的 session journal”，但不适用于可能记录
失败、阻塞或跳过的 verification evidence。Tenon 必须要求每条记录携带显式结果，不能从
“用户填了测试”推断通过。

### 2. Journal `merge=union`

相关提交：
[`a53748643d259f0e7fbf5ffed76115e6785c6ce4`](https://github.com/mindfold-ai/Trellis/commit/a53748643d259f0e7fbf5ffed76115e6785c6ce4)。

| 证据 | 已验证事实 | 对 Tenon 的意义 |
| --- | --- | --- |
| [`.gitattributes` L1-L9](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/.gitattributes#L1-L9) | union 只覆盖 `.trellis/workspace/*/journal-*.md`；明确排除全量重写的 `index.md` | 合并策略必须匹配 artifact 的真实写入模型，不能按文件扩展名泛化 |
| [`workflow.ts` L75-L110](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/configurators/workflow.ts#L75-L110) | 初始化只追加缺失规则；已有匹配规则时 no-op；不整体覆盖用户 `.gitattributes` | 管理用户仓库文件时应 additive、幂等、避免全文件覆盖 |
| [`update.ts` L2402-L2408](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/commands/update.ts#L2402-L2408) | update 也补规则，但 dry-run 不落盘 | 可变操作与预览必须有明确边界 |
| [`gitattributes-journal-merge.integration.test.ts` L1-L9](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/test/scripts/gitattributes-journal-merge.integration.test.ts#L1-L9) | 测试用真实 `git merge`，不是只断言配置字符串 | 涉及 merge/持久化的能力要验证真实系统行为 |
| [`gitattributes-journal-merge.integration.test.ts` L66-L98](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/test/scripts/gitattributes-journal-merge.integration.test.ts#L66-L98) | 两分支追加 journal 可无冲突合并，且两侧内容都保留 | union 的安全前提是内容块独立且 artifact 严格 append-only |
| [`gitattributes-journal-merge.integration.test.ts` L100-L131](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/test/scripts/gitattributes-journal-merge.integration.test.ts#L100-L131) | 同样的并行改写对 `index.md` 仍产生普通冲突 | 对非 append-only artifact，让冲突显式暴露比静默 union 更安全 |

该能力支持 Tenon 当前的非目标：composer 只返回可复制 Markdown，不触碰 canonical
`verification_report`、document ledger 或 Change state。若未来要写报告，应继续走 Tenon 现有
受治理 producer、hash/read receipt、CAS/原子发布语义，而不是用 Git union 解决并发。

### 3. Binary context handling

相关提交：
[`f7d8c32fb98b42cc7e13261fe90bab5596bef43c`](https://github.com/mindfold-ai/Trellis/commit/f7d8c32fb98b42cc7e13261fe90bab5596bef43c)。

| 证据 | 已验证事实 | 对 Tenon 的意义 |
| --- | --- | --- |
| [`inject-subagent-context.py` L233-L264](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/shared-hooks/inject-subagent-context.py#L233-L264) | 先以 raw bytes 读取；含 NUL 或无法 strict UTF-8 decode 即判 binary；notice 带 path、size、reason | 禁止先 lossy decode 再检查；降级结果也要可审计 |
| [`inject-subagent-context.py` L294-L318](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/shared-hooks/inject-subagent-context.py#L294-L318) | binary 在 truncate/文本 decode 之前短路；notice 自身计入总预算 | 安全分类必须先于截断；错误/notice 不能绕过响应预算 |
| [`trellis-context.js` L211-L270](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/opencode/lib/trellis-context.js#L211-L270) | OpenCode adapter 保持同一 binary notice 与 budget 语义 | 公共契约应在服务端集中实现，避免不同前端/adapter 漂移 |
| [`Pi index.ts` L839-L901](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/pi/extensions/trellis/index.ts.txt#L839-L901) | Pi adapter 同样先 binary 检查，再 UTF-8 安全截断 | 跨入口应共享行为矩阵 |
| [`context-injection-limits.integration.test.ts` L329-L372](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/test/scripts/context-injection-limits.integration.test.ts#L329-L372) | 即使配置“无限”预算，binary 仍只返回 notice；输出不得含 NUL 或替换字符 | 安全边界不能被容量配置关闭 |
| [`context-injection-limits.integration.test.ts` L374-L426](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/test/scripts/context-injection-limits.integration.test.ts#L374-L426) | emoji、CJK、accented Latin 不得误判；binary bytes 只出现在文本尾部也必须检出 | 检测要覆盖完整输入，并有 Unicode 反例测试 |

## 与 Tenon `verification-evidence-composer` 的差异映射

| 维度 | Trellis v0.6.9 | Tenon 本轮应采用 | 原因 |
| --- | --- | --- | --- |
| 用户目标 | 记录已完成 session；向 agent 注入上下文 | 在 Dashboard 中编排可复核的验证证据片段 | Tenon 输出会被 reviewer 用来判断 gate，语义更严格 |
| 输入 | repeatable CLI flags；JSONL 文件引用 | 受限 JSON DTO，由 Dashboard API client 提交 | 浏览器输入是不可信边界，需服务端统一校验 |
| 结果模型 | `--test` 隐式渲染 `[OK]` | 每条证据显式 result，不从存在性推断 pass | 防止失败/阻塞证据被误写成通过 |
| 空值 | 无条目则省略 section | UI 保留真实空态；服务端拒绝“零证据”提交；可选 section 省略 | 空白预览不能伪装成有效验证记录 |
| 序列化 | Markdown section + bullets | 纯函数、固定 section 顺序、固定换行、保留条目输入顺序 | 便于复制、快照测试和 reviewer diff |
| 持久化 | journal append，并可能自动 commit | 本轮不写文件、不改 canonical state/ledger | 避免越过 Verify producer 和 review gate |
| 并发 | append-only journal 可 `merge=union` | composer 无持久化；未来报告写入仍用 Tenon CAS/原子发布 | verdict/report 不是可安全 union 的独立日志块 |
| 二进制 | 文件引用可读 raw bytes，binary 降级 notice | 本轮 DTO 仅允许文本，不接收路径/附件 | 最小切片无需扩大文件系统与敏感数据边界 |
| Unicode | strict UTF-8，合法多字节文本保留 | 接收 JSON 字符串；拒绝 NUL/孤立 surrogate 等控制输入并按 UTF-8 byte 限额 | 防止 Markdown/HTTP 输出损坏，保持中英文可用 |
| 多入口一致性 | Python、OpenCode、Pi 各有实现和同构测试 | kernel 纯 composer 为单一实现；server 只做 DTO/错误映射；Dashboard 不自行拼 Markdown | 减少格式与状态语义漂移 |
| 兼容 | 新 flags 增量加入，旧 freeform 仍可用 | 新增独立 API/组件，不改变现有 report、transition 或 snapshot 契约 | 保持既有 workflow/API 向后兼容 |

## 推荐的可迁移设计原则

1. **结果显式化**：证据项至少包含 label/command、result 和可选 detail/reason；`blocked`、
   `skipped` 必须有原因。禁止根据数组非空、HTTP 200 或命令字段存在推断 pass。
2. **确定性规范化**：固定 section 和条目顺序；trim 可见字段；统一换行；不加入当前时间、
   随机 ID 或服务端环境数据。相同输入应得到完全相同的 Markdown。
3. **省略而非伪造**：可选 failures/risks 为空时省略对应 section，不输出
   “None”“N/A”“已通过”等假证据。整个 evidence 列表为空时返回稳定的 4xx validation
   error，由 Dashboard 呈现空态。
4. **Markdown 结构防护**：字段值不得直接获得新增 heading、list 或 code fence 的能力。
   对换行、反引号、`#`、`-`、管道符和控制字符采用明确的 escaping/quoting 规则，并用
   golden tests 锁定；不能照搬 Trellis 的直接字符串插值。
5. **预算不可关闭**：限制条目数、单字段字符/byte 数、请求总 byte 数和输出总 byte 数；
   validation error 也保持有界。Trellis “binary 检查不受 unlimited 配置关闭”是可迁移原则。
6. **纯生成边界**：API 只返回 `{ markdown, normalizedEvidence }` 或同等只读结果，不调用
   `tenon set`、不写 `verification_report`、不登记 document ledger、不触发 transition。
7. **单一领域实现**：kernel 提供无 I/O composer；server 保留既有 Host/token、
   content-type、root 信任锚和错误映射；Dashboard 只消费 API 响应并提供复制交互。
8. **行为矩阵测试**：至少覆盖多条顺序、每种 result、合法 CJK/emoji、Markdown 特殊字符、
   空输入、超限、非法 enum、重复条目、服务端错误和稳定输出；前端覆盖 loading、empty、
   success、error、copy success/failure 与键盘路径。

## 不可照搬项

- 不照搬 `--test` 自动 `[OK]`：这会把“执行过”与“通过”混为一谈。
- 不照搬 raw Markdown 插值：Dashboard API 输入是不可信文本，可能改变 section 层级、
  伪造额外 verdict 或打断 code fence。
- 不给 canonical verification report 配置 `merge=union`：两边的 pass/fail、命令顺序、
  风险或 frozen build SHA 可能互相矛盾，静默保留两侧比显式冲突更危险。
- 不照搬 journal 的自动 commit/工作区写入：本 Change 的价值是先生成高质量证据，不是
  代理受治理的 Verify producer。
- 不在最小切片中接受任意文件路径、目录或二进制附件：这会立即引入 root anchoring、
  symlink、path traversal、敏感内容、MIME、内存预算和日志泄露问题。
- 不复制三套 adapter 实现：Tenon 已有 kernel/server/Dashboard 分层，应让格式规则只在
  kernel 存在一次。

## 风险与约束

| 风险 | 后果 | 建议约束 |
| --- | --- | --- |
| 隐式成功语义 | 失败或未运行命令被复制成通过证据 | 强制 result enum；blocked/skipped 强制 reason |
| Markdown 注入 | 用户文本伪造标题、清单或 reviewer 结论 | 规范化/escape，并做 golden + adversarial tests |
| union 式静默合并 | 同一验证项出现相反结果且无冲突提示 | 本轮不持久化；未来写入用 revision/CAS 和 document ledger |
| payload 过大 | server 内存、响应延迟、剪贴板失败 | 条目/字段/request/output 多层上限，按 UTF-8 bytes 计量 |
| Unicode 误判或损坏 | 中文、emoji 被拒绝或生成替换字符 | 合法多字节反例；拒绝控制/NUL，不做 lossy replacement |
| 命令/详情含 secret | 复制后进入 PR 或验证报告 | UI 提醒和服务端拒绝明显 NUL/control；不记录 request body；不声称自动 secret 检测完整可靠 |
| 前端自行格式化 | 浏览器与 API 输出漂移 | 前端只展示/复制服务端 Markdown |
| 误写治理状态 | 预览动作绕过 producer/review gate | composer route 不持有 Change mutation 能力 |

## 方案比较

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| A. Dashboard 本地拼 Markdown | 实现快，无 server round-trip | 格式与校验散落前端；无法形成共享契约；容易绕过安全上限 | 拒绝 |
| B. kernel 纯 composer + server 校验路由 + Dashboard 交互 | 单一规则、可定向测试、跨端闭环、无持久化副作用 | 需要 DTO、错误映射和前端状态测试 | **推荐** |
| C. 直接写 canonical verification report | 用户少一次复制 | 扩大到 producer、ledger、CAS、review gate 和回滚；与本轮非目标冲突 | 拒绝 |
| D. append-only evidence journal + union merge | 并行记录方便 | Tenon verdict 不是可交换/可重复的追加事件；冲突会被隐藏 | 拒绝 |

## 开放问题

1. 输出语言应由请求显式 `locale` 决定，还是跟随 Dashboard 当前 locale？建议显式
   `locale: "zh-CN" | "en"`，避免同一 payload 因客户端隐式状态产生不同 Markdown。
2. `command` 应作为单行 inline code、缩进文本还是 fenced block？需要定义反引号和多行命令
   的确定性 escaping，不能依赖浏览器渲染器猜测。
3. 是否允许同 command/label 重复？若允许应保留输入顺序；若去重，需明确稳定 key，避免
   把不同环境或重跑结果合并。
4. `failures` 是否从 failed evidence 派生，还是允许用户另填？双来源会产生矛盾；建议
   failures 由 evidence 派生，额外文字只作为 detail。
5. 空字符串、全空白和只有 `skipped` 的请求分别返回什么？需要在 delta spec 中给出精确
   status code、error code 与中英文展示。
6. 单字段、条目数、请求与输出的 byte 上限是多少？应根据现有 server body limit 和
   Dashboard 使用场景确定，而不是继承 Trellis context injection 的数值。
7. API 是否返回 normalized DTO 供 Dashboard 回显？返回可提高可解释性，但需避免前端把
   normalized DTO 当作新的持久化真相源。
8. 复制失败（权限、非 secure context、浏览器拒绝）是否提供可选中文本框回退？这属于真实
   浏览器验收必测路径。

## 对本 Change 的建议决策

采用方案 B：把 composer 放在 kernel 的纯领域层；server 新增受现有本机安全守卫保护的
只读生成 route；Dashboard 在 Change 详情的文档/验证证据区域提供表单、预览与显式复制。
本轮 DTO 只接收有界文本与显式结果 enum，不接受文件路径或附件，不写任何 Change 文件，
不修改 `verification_report`、document ledger 或 canonical state。

Trellis 的三项能力分别提供了三个边界判断：

- structured flags 证明“小型 typed collection → 可预测 Markdown”有真实用户价值；
- `merge=union` 证明并发策略必须由 artifact 的更新模型决定，也反向证明 Tenon report
  不应被当成 append-only journal；
- binary handling 证明“不安全内容要降级成可审计 notice，而不是 lossy 注入”，但文件读取
  应留给未来有独立安全规格的 Change。
