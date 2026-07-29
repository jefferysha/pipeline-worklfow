# 上游 B 对 Tenon Verification Evidence Composer 的一手源码研究

- 读取日期：2026-07-28
- 读取时间：2026-07-28T04:21:00Z（Asia/Shanghai 12:21）
- 上游仓库：上游 B（完整仓库名与 URL 见 PR 证据）
- 默认分支：`master`
- 默认分支固定 HEAD：`2945693e4061c369be0d400ed2999a66fa87c680`
- GitHub latest release：`0.4.0-beta.9`
- release tag 固定 SHA：`84038b0d6b7c185b233f0f36b294ae74dd9121d0`
- 核验方式：`git ls-remote`、GitHub Releases/Refs API、本地只读 clone 与固定 SHA 源码逐行阅读

## 结论

上游 B 最值得迁移的不是它的 `verification.md` 固定 marker 或字段名称，而是四条组合原则：

1. **同一个纯函数负责校验与确定性生成**，消费端再以“重新生成后逐字节相等”识别非规范或含重复键的手写内容。
2. **证据条目采用闭集 schema 与互斥状态**：一条验收项要么有证据引用，要么有诚实的跳过原因，不能两者都有，也不能两者都没有。
3. **不可信输入在解析前就有字节上限，文件输入还要防普通文件替换、symlink/FIFO 与读取期增长**；格式化功能不能成为新的文件读取或资源耗尽入口。
4. **澄清按可见结果的依赖顺序推进**：先自行调查仓库事实，每轮只问一个最上游产品决策，回答后立即写入正式工件，所有分支闭合后再取得一次完整共享理解确认。

对 Tenon 本轮最小纵向切片的建议是：新增一个**只读、无持久化副作用**的 evidence composer，复用现有 server 的 Host/token/JSON/body-size 边界，在 kernel 内对一个小型闭集 DTO 做字段级和总量级校验，再输出稳定 Markdown。不要把该输出冒充 Tenon 已有的可信 `VerificationResult`，不要自动写 `verification_report`，也不要改变 Verify/review gate。

## 固定来源与分支差异

| 来源 | 固定事实 | 一手证据 |
| --- | --- | --- |
| `master` | 2026-07-28 读取时 HEAD 为 `2945693…`；该提交仅新增 init/update 的显式 platform target，未修改本报告重点文件 | `commit`，`release..master compare` |
| GitHub latest release | Releases API 返回非 draft、`prerelease: false` 的 `0.4.0-beta.9`，发布时间 `2026-07-24T16:55:25Z`；tag 直接指向 `84038b0…` | `release`，`tag ref` |
| release 内容 | beta.9 明确加入 `upstream-b native evidence format`、加强 Sequential clarification，并修复 evidence entries 等文件读取的 race/symlink/FIFO 风险 | `CHANGELOG.md L11-L32`，`PR #228`，`PR #233` |
| 默认分支与 release 的相关性 | `84038b0…` 是 `2945693…` 的祖先；以下重点文件在 release tag 到当前 HEAD 之间无差异，因此固定 HEAD 的行号也代表 latest release 的实现 | `native-acceptance.ts`，`native-cli.ts`，`race-safe-read.ts` |

补充说明：`master` 的 changelog 已出现 `0.4.0-beta.10` 标题，但 GitHub latest release 仍是 `0.4.0-beta.9`。本报告按“已发布 GitHub Release”固定版本，不把未发布的 changelog 标题当成稳定 release。

## 1. Evidence format 与 canonical serialization

### 1.1 输入先变成闭集、规范值

上游 B 的条目只允许 `acceptance_id`、`evidence_refs`、`skipped_reason` 三个字段，未知字段直接拒绝。`acceptance_id` 必须符合固定模式且不可重复；`evidence_refs` 必须是非空字符串数组、不可重复；跳过原因必须是非空字符串。`native-acceptance.ts L482-L532`

证据与跳过原因构成显式 XOR：

- `evidence_refs.length === 0` 时必须有 `skipped_reason`；
- 有证据时禁止同时提供 `skipped_reason`。

对应实现见 `native-acceptance.ts L533-L548`，回归测试覆盖“两者皆无”和“两者皆有”见 `native-acceptance.test.ts L380-L396`。

### 1.2 证据引用是数据，不是任意 Markdown 或任意路径

引用先 trim、统一反斜杠，再拒绝：

- 空值和控制字符；
- POSIX/Windows 绝对路径、home、URL/URI scheme；
- `..` 逃逸；
- `.git` 和 `.env*` 敏感路径。

最后只返回规范化的 portable relative ref。`native-acceptance.ts L455-L479`

这说明格式化器不能简单把前端字符串拼进 Markdown。Tenon 即使不打开引用文件，也应把命令、结果、说明等字段当作不可信文本，限制换行/控制字符并做 Markdown 语境转义。

### 1.3 “canonical” 是单一生成路径，不是宽松美化

上游 B 的 parser 要求正文中恰好有一对固定 marker、顺序正确、payload 非空且是 JSON 数组；marker 藏在 code fence 或外层 HTML comment 内也不算合法正文。`native-acceptance.ts L551-L591`

通过 schema 校验后，parser 再：

1. 对每项 `evidence_refs` 排序；
2. 按 `acceptance_id` 排序；
3. 使用 `JSON.stringify(value, null, 2)` 生成唯一 payload；
4. 将原 payload 与规范 payload 逐字节比较；
5. 不相等即报 `canonical serialization`。

生成器和 parser 共享 `canonicalEvidencePayload`，并由唯一 serializer 加 marker。`native-acceptance.ts L592-L613`

这种 round-trip 相等检查还会拒绝 JSON 重复键：`JSON.parse` 虽保留最后一个键，但重新生成后的文本不再等于原文。测试也验证了输入顺序不影响输出、手改一个缩进即被拒绝。`native-acceptance.test.ts L288-L304`，`native-acceptance.test.ts L339-L357`

### 1.4 CLI 把“正确生成”做成正式能力

`upstream-b native evidence format` 接受 `--entries <path>` 或 stdin，解析 JSON 数组后只调用上述 serializer，输出含 marker 的完整块；TTY 无输入源、畸形 JSON、非数组都会给出明确错误。`native-cli.ts L536-L570`

CLI 测试验证了：

- 输入引用排序为 `b.ts, a.ts`，输出稳定成为 `a.ts, b.ts`；
- 生成结果可被 parser 接受；
- 手写缩进版本被 canonical 检查拒绝。

见 `native-cli.test.ts L802-L830`。

## 2. 输入校验、有界读取与安全修复

### 2.1 字节预算覆盖文件和 stdin

evidence format 复用 Native evidence document 的 1 MiB 上限。文件输入调用 race-safe reader；stdin 按 chunk 累计字节，超过上限立即失败。`native-cli.ts L191-L228`，`native-cli.ts L539-L554`

回归测试覆盖超限文件、FIFO 和 symlink 输入。`native-cli.test.ts L867-L932`

### 2.2 文件读取防 TOCTOU、symlink 与 FIFO

beta.9 的安全修复不是一次 `lstat` 后直接 `readFile`，而是：

1. 打开前要求普通文件并检查初始大小；
2. POSIX 用 `O_NOFOLLOW | O_NONBLOCK`，避免 symlink 跟随和 FIFO 阻塞；
3. 打开后对 descriptor、当前路径、realpath 和文件对象 identity 交叉核对；
4. 从同一 descriptor 分块读取，读取期增长也受 `maxBytes + 1` 限制；
5. 读取后再次核对 identity 和 realpath；
6. 任意替换或漂移都 fail closed。

核心实现见 `race-safe-read.ts L87-L135` 与 `race-safe-read.ts L137-L194`。测试覆盖预存 symlink、FIFO、打开期同路径替换、读取期增长与检查回调。`race-safe-read.test.ts L35-L77`，`race-safe-read.test.ts L87-L175`

上游 B 还有更窄的 Native artifact reader：规范化相对 ref、拒绝 sensitive/runtime 路径、捕获整个父目录 identity 链、前后复验、严格 UTF-8 解码并返回 hash/size/text。`native-bounded-file.ts L40-L74`，`native-bounded-file.ts L103-L154`，`native-bounded-file.ts L156-L227`

### 2.3 对 Tenon 的直接含义

Tenon 当前 server 已有 64 KiB POST body 上限，并在流式接收时累计字节、超限断开；所有 POST 路由还统一经过 loopback Host、Bearer token、`application/json` 三闸。对应本仓证据为 `packages/server/src/serverTransport.ts` 和 `packages/server/src/serverPostRoutes.ts`。

因此本轮 composer 应：

- 复用既有 POST transport 和写端点安全入口，不另建绕开守卫的 server；
- 在 kernel/route DTO 内再加**条目数、单字段长度、总输出长度**上限，因为 transport 的 64 KiB 只限制原始请求，不限制错误数量和扩展后的 Markdown；
- 不读取或验证用户输入的文件路径，不让“格式化证据”升级成文件系统能力；
- 若未来新增 `--entries` 式文件输入，再引入 descriptor-based race-safe reader，而不是只做 `realpath`/`lstat` 预检。

## 3. Sequential clarification 的可迁移设计

### 3.1 事实与产品决策分离

上游 B 要求 agent 自行调查仓库、工具、运行环境中可查的事实，不能把事实调查甩给用户；但仓库惯例、依赖默认值和行业实践只能支持推荐，不能替代用户对可见结果的决定。`upstream-b-native/SKILL.md L14-L24`

映射到本 Change：可由源码确定的事项——已有 `VerificationResult`、server 安全入口、Change detail 扩展点、clipboard 模式、i18n 结构——应直接调查；真正需要在 spec 明确的是用户输入字段、状态/跳过语义、输出顺序、复制行为与错误展示。

### 3.2 每轮只处理一个最上游可见结果

Sequential 把目标视为决策树：先遍历可达的成功、失败、空/default 分支，再选前置条件已闭合的最上游问题；brief 只保留当前 blocking question；提问必须包含 Question / Recommendation / Impact，不能把独立决策塞进一个多选或并列问句。`upstream-b-native/SKILL.md L35-L45`

回答后必须在同一轮把已确认内容写入 Decisions 和完整目标 spec，再重新遍历决策树；一个答案只能关闭它明确选择的 input→output，不得顺带替用户决定空输入、失败或边界行为。`upstream-b-native/SKILL.md L45-L47`

### 3.3 最终确认是 traceability gate

所有问题解决后仍不能直接 Build。上游 B 要求做完整性复核，并用 outcome、scope、key decisions、acceptance criteria、explicit non-goals 形成共享理解摘要；摘要中的每个产品行为都必须追溯到用户原话、已确认答案或适用的 published contract。首次出现在摘要中的策略说明澄清未完成，必须退回成问题。明确确认之前禁止改实现或推进 phase。`upstream-b-native/SKILL.md L47-L48`

Runtime 侧还有独立兜底：离开 Shape 没有 `confirmed` 会产生 `shape-confirmation-required`，旧的 implicit approval 在离开 Build 前也必须确认。`native-guards.ts L121-L147`

### 3.4 不是只写文档：有可重复 eval 检查行为

beta.9 的 clarification-depth eval 验证：

- 每轮恰好一个产品问题，并含 recommendation/impact；
- 隐藏与依赖决策按固定依赖顺序出现；
- 最后一轮只能是完整 shared-understanding confirmation；
- 第一问前已调查现有实现；
- 每次后续提问前，上一答案已同时写进 brief 与 spec；
- 明确确认前没有实现写入，确认后才有实现写入。

见 `test_native_clarification_depth.py L326-L421` 和 `L423-L475`。

对 Tenon 的启发是：composer 的测试不能只断言“按钮存在”。至少要验证成功/失败/空/加载、跳过与证据互斥、输入错误定位、稳定输出、复制键盘路径，以及浏览器中从 Change detail 到复制结果的完整链路。

## 4. 与 Tenon 当前模型的差异映射

| 维度 | 上游 B beta.9 | Tenon 当前现实 | 本轮建议 |
| --- | --- | --- | --- |
| 权威对象 | `verification.md` 内固定 acceptance block，Runtime 后续解析并约束 Verify | `verification_report` 是受治理文档路径；automation 另有结构化 `VerificationResult` 与 ledger | composer 只生成可复制 Markdown，不自动写 report、不推进 gate |
| 条目标识 | Runtime 派生 `acceptance_id`，用户不得自算 | 本轮普通 Change detail 没有等价的每条 acceptance ID 来源 | 不发明 ID；使用简单条目次序/类型，除非 spec 找到权威 ID 来源 |
| 证据语义 | `evidence_refs` 或 `skipped_reason` 二选一 | `VerificationResult` 的 evidence 只有 `repo-file` / `command-result`，passed 还绑定 revision 与 trusted issuer | 不把 composer DTO 命名为或序列化成 `VerificationResult`；它是报告草稿，不是授权证据 |
| 确定性 | 排序 + 2-space JSON + marker，parser 强制逐字节相等 | kernel 已有 read-once narrow validation/frozen canonical copy，但没有这类 Markdown composer | 复用“先抽取校验，再从 canonical copy 生成”的方向；输出顺序写进 spec |
| 输入边界 | 1 MiB 总输入，文件/stdin 有界；文件路径 race-safe | server transport 64 KiB；kernel `VerificationResult` 校验目前没有通用条目数/字符串长度预算 | composer 单独设较小 count/field/output limits，并返回字段路径错误 |
| 路径安全 | 禁绝对、URI、`..`、`.git`、`.env*` | `repo-file` 已禁绝对/`..`/非规范路径并绑定 hash/revision，但不等同于 Markdown 草稿字段 | 若 composer 接受“证据引用”，只做规范相对 ref；不得打开文件或暗示已核验 |
| 可见 UI | 上游 B 主要提供 CLI/文档协议 | Tenon 本轮必须有 Dashboard 入口、i18n、交互和浏览器验收 | 入口放 Change detail 文档/Verify 上下文，按 phase/context 清晰说明“仅生成，不保存” |
| 澄清 | 单问题依赖树 + 正式工件即时持久化 + 最终 confirmation | Tenon 有 OpenSpec/phase review/exact-event gate | 把字段、状态、顺序、非目标写进 delta spec；不要另造一套 review/confirmation 状态 |

Tenon 已有的 `VerificationResult` 比 上游 B composer 条目更强：它绑定 workflow run、attempt、change、named branch SHA、issuer、binding 和时间；`passed` 必须有 evidence，`repo-file` 必须绑定 subject revision。对应本仓实现为 `packages/kernel/src/verification/types.ts` 和 `packages/kernel/src/verification/validate.ts`。这也是“不照搬 上游 B schema”的主要原因。

## 5. 建议的最小契约方向

以下是设计原则，不替代 Spec 阶段最终字段裁决：

1. **纯函数**：`composeVerificationEvidence(input: unknown)` 返回 `{ ok, markdown }` 或 `{ ok:false, errors[] }`；不读盘、不写盘、不取当前 Change 状态。
2. **闭集条目**：建议只覆盖本轮用户价值所需的 `label/command/status/summary-or-skip`；status 至少区分 passed、failed、skipped，避免把失败与未运行混为一谈。
3. **互斥约束**：skipped 必须给 reason 且不能带伪成功结果；passed/failed 必须有实际 command/result 摘要；空列表返回明确 empty 状态，不生成看似已验证的报告。
4. **确定性**：从校验后的 plain canonical copy 生成；固定 section、字段顺序、换行、末尾换行和 Markdown escaping。若用户顺序具有叙事意义，应保留输入顺序，不照搬 上游 B 的 `localeCompare` 排序。
5. **边界**：限制条目数、label/command/result/reason 字节或字符长度、总输出字节；控制字符与无法安全呈现的 fence/backtick/newline 要拒绝或统一转义。
6. **HTTP**：走现有同源受保护 POST；400 返回可定位字段错误，413/等价错误表达超限，500 只用于真实内部错误；不得把不可信错误原样扩散成 HTML。
7. **UI**：编辑态、加载态、生成成功、校验失败、空态、复制成功/失败；按钮有可见 label、键盘可达、状态通过 live region 或等价方式反馈。
8. **诚实边界**：UI 和输出明确写明“生成证据片段，不执行命令、不保存报告、不改变 Verify 状态”。

## 6. 不可照搬项

1. **不可照搬 上游 B marker/acceptance ID**：这些属于 上游 B Native Runtime 的 canonical report contract，Tenon 没有相同派生来源。
2. **不可把草稿当 `VerificationResult`**：Tenon 的结构化结果参与 automation merge 授权，含 issuer/revision/binding；Dashboard 用户输入不能自行宣称 trusted pass。
3. **不可自动写 `verification_report`**：本轮提案明确只显式复制，自动写会碰文档 ledger、producer/read receipt 与 review gate，扩大 Change 语义。
4. **不可引入文件读取**：上游 B 因 CLI 支持 `--entries <path>` 才需要复杂 race-safe I/O；Tenon 的 JSON API 不需要这个攻击面。
5. **不可盲目排序用户条目**：上游 B 的 acceptance ID 是 ASCII hash 型 ID，排序无歧义；Tenon 的命令/检查可能按执行顺序叙述，排序会改变报告意义。
6. **不可只依赖总 body 上限**：上游 B 目前主要依赖 1 MiB 输入预算，schema 中看不到显式 entry count 或单字符串长度上限；Tenon 应补上结构级边界。
7. **不可复制 上游 B 的 phase/confirmation 状态**：Tenon 已有 open→explore→spec⇄build⇄verify→ship→archive、exact-event review 和 document ledger，应在现有治理上实现，不创建第二状态机。

## 7. 风险

| 风险 | 严重性 | 处理建议 |
| --- | --- | --- |
| Markdown 注入导致输出结构被截断或伪造额外“passed”段 | 高 | 所有文本字段走统一 renderer/escape；测试 backtick、fence、换行、HTML/comment marker |
| 草稿被误解为可信验证结论 | 高 | API/类型/UI/文案避免 `VerificationResult` 命名；显示“未执行、未保存、未改变 gate” |
| 超长数组/字段造成 CPU、内存或巨大错误响应 | 中高 | body + entry count + per-field + output byte 四层预算；错误数量也截断并给 overflow 标记 |
| 顺序不稳定导致 reviewer diff 噪声 | 中 | 固定字段/section/newline；对用户条目明确选择“保留输入顺序”或 stable key sort，并写进 spec |
| 路径或 URL 被当作可核事实 | 中 | 仅接受规范项目相对 ref；不打开、不解析 URL、不自动 hash；输出标注“引用”而非“已核验” |
| 复用现有 validator 时混淆授权边界 | 高 | 新 composer DTO 独立于 `VerificationResult`；可复用低层 path/text helper，但不复用 trusted verdict 名义 |
| 新 POST route 漏过 Host/token/content-type/root 入口 | 高 | 注册在现有 post router 下，复用统一前置守卫；server tests 复刻现有 401/403/400 边界 |
| 只做组件单测，真实 Dashboard 入口或 clipboard 失败 | 中 | 真实服务 + 浏览器验收，先确认页面 title/content 属于 Tenon，再测成功/错误/空态和键盘复制 |

## 8. 开放问题

1. composer 的条目是否需要保留执行顺序？本报告推荐保留输入顺序；若采用排序，必须定义 ASCII/code-point 稳定键，不能依赖本地化 label。
2. `failed` 条目是否允许没有输出摘要但有 exit code？应在 Spec 用具体 input→Markdown 示例钉死。
3. “空态”是前端禁止提交，还是后端成功返回空提示 Markdown？推荐前端给空态、后端仍拒绝空数组，避免生成看似有效的空验证片段。
4. evidence ref 是否属于本轮最小用户价值？若只需要命令、状态、结果、跳过原因，建议先不开放路径字段，减少误导与安全面。
5. 输出是否包含时间？若由 server 自动填当前时间会破坏确定性和可重放；推荐本轮不自动注入时间。
6. 错误协议是否需要稳定 machine code 与 field path？推荐需要，以便中英文 UI 自己翻译，不把 kernel 中文错误直接当 API 文案。
7. 生成入口应只在 Verify phase 可见，还是所有 Change detail 可见但带上下文说明？需要结合现有详情布局和浏览器可发现性决定；不应靠隐藏入口替代后端授权/校验。

## 9. 推荐决策

采用“**上游 B 的严格生成边界 + Tenon 自己的信任与治理模型**”：

- 迁移：closed DTO、XOR skip/evidence、canonical copy→stable renderer、结构级预算、诚实错误、成功/失败/空/加载测试，以及 Sequential 的事实先查与可见分支完整性。
- 保留 Tenon：现有 `VerificationResult` 信任绑定、document ledger、review gate、POST security、Change detail 与 i18n 结构。
- 明确不做：文件读取、命令执行、自动保存、自动 transition、可信 verdict 生成、上游 B marker/acceptance ID 兼容。

这样能形成真实的前后端闭环，同时把功能限定为“帮助用户正确编排可审查证据”，不会把便利工具升级成新的验证授权面。
