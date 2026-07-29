# 技术设计

## 背景

Tenon 在 Codex host 缺少严格 Pre/PostToolUse receipt 时，会扫描绑定 session 的 host-owned
JSONL transcript。只有受信插件 Skill 路径、当前 Change visit、成功的 tool output 和正确
项目身份全部匹配，才追加 `CodexSkillRead` history。

自动化线程从原始工作树启动，但按隔离要求把命令显式执行在 sibling worktree。现场 transcript
证明相同轮次存在两种 ABI：

- `function_call(exec_command)`：参数直接包含 `cmd` 与 `workdir`，现有代码能验证 sibling worktree。
- `custom_tool_call(exec)`：`input` 是调用 `tools.exec_command({...})` 的 JavaScript 源码；
  现有代码只提取 `cmd`，在检查项目身份前丢弃 `workdir`。

因此后一分支即使完整读取 Skill 且 output 成功，也因 session metadata 的 `cwd` 仍指向原始
worktree 而被拒绝。用户下一轮偶尔能前进，是因为后续出现了另一种可识别读取，并非调度器没有触发。

## 决策

扩展受限 tool-program 解码器，使其返回 `{ command, workdir? }`，同时保留现有
`transcriptExecCommands` 兼容入口。只接受以下可静态证明的完整 wrapper：

`const result = await tools.exec_command({...}); text(result);`

`text(result.output)` 不携带 nested `exit_code`，即使外层 custom tool 显示完成也不能成为证据。
`custom_tool_call` 发现路径与 `function_call` 使用相同判定：

1. session `cwd` 与目标 repo 为同一物理目录；或
2. tool-program 中恰有一个安全解码的 `tools.exec_command`，其 `workdir` 与目标 repo
   是同一物理目录，且二者共享同一个 canonical Git common directory。

只有通过项目身份后才检查命令是否读取当前受信 Skill；随后仍须同一 `call_id` 的 output，且
完整 nested result 明确包含 `exit_code=0`。
不根据路径名字、mtime、Change 名或最近工作树猜测身份。

## 状态机

`unseen → call-decoded → project-bound → trusted-read → nested-exit-zero → history-recorded`。
任一解析失败、缺少显式 workdir、Git common directory 不同、输出 pending/failed、call ID
不匹配都停在当前状态并返回“未确认”，不追加证据。

## 关键业务规则

- 新 ABI 和旧 ABI 使用相同的 sibling-worktree 身份约束。
- 一个 custom tool program 必须恰有一个安全解码的 exec invocation；多调用继续失败关闭。
- exec 必须在顶层被 await，完整 result 必须以同一变量传给 `text`；只转发 `.output` 拒绝。
- `workdir` 必须是字面字符串；表达式、模板字符串、computed key 不进入证据路径。
- `workdir` 若存在必须是绝对路径；相对路径不能证明目标身份。
- 字面 `workdir` 必须由 `lstat` 证明是普通目录；即使 `realpath` 等于目标目录，符号链接
  也不能成为项目身份。
- 保留受信 Skill root、host session、visit 时间下界、nested `exit_code=0` 与去重规则。
- host session 只匹配 `session_meta.payload.id`；fork 继承的 `payload.session_id` 不具有
  身份证明力。
- 最新候选 transcript 的 malformed JSON 或读取 I/O 错误使 discovery 整体失败关闭，
  不向旧 transcript 回退。
- invocation 与 output ABI 严格配对；custom/function 不能用相同 `call_id` 交叉借用
  对方的成功判定。
- discovery 的失败关闭覆盖枚举阶段；候选元数据或物理路径无法读取、最新候选超过预算时
  返回无 evidence，而不是跳过后接受旧文件。
- 项目根与 `workdir` 都必须是其物理字面路径；二者使用相同的祖先 symlink 别名仍拒绝。
- exact receipt 与 fallback 使用同一 transcript candidate 身份：读取前捕获
  device/inode/size/mtime/ctime，以 `O_NOFOLLOW` 打开，固定读取到捕获的 size。
- 读取结束后同时复核原 fd 与 candidate path 当前打开结果；路径轮换、新 inode、增长或
  元数据漂移都使本次证据失败关闭。

## 备选方案

1. **让自动化避免独立 worktree**：违反仓库隔离规则，也会让并发 Change 相互污染，拒绝。
2. **将 session metadata cwd 视为整个 Git 仓库都可信**：无法证明实际命令在哪个 worktree
   执行，扩大跨 Change 证据面，拒绝。
3. **仅在 hook 侧补 receipt**：当前 host ABI 正是可能缺少该回调，不能解决 fallback，拒绝。
4. **在 transcript parser 中结构化保留 workdir（采用）**：复用已存在的物理目录与 Git
   common-dir 校验，改动最小且两种 ABI 对称。

## 风险

- tool-program JSON 对象可能含数组等选项；`JSON.parse` 已保证它们是纯数据，解析器只验证
  `cmd`/`command`/`workdir` 三个信任字段并忽略其余字段。unquoted safe-object fallback
  继续只接受受限 primitive 字面量并失败关闭。
- 解析器公共返回类型改变可能影响既有 command-only 调用；保留旧函数作为映射层。
- 修复同时收紧 fallback discovery 与严格 receipt 的 transcript 读取原语，不修改 receipt
  journal、ledger schema 或 review gate。

## 验证矩阵

- 红灯：session 在主 worktree，custom tool 明确以 sibling worktree 为 `workdir`，当前实现拒绝。
- 绿灯：同一 fixture 修复后确认 `openspec-propose` 并追加 history。
- 拒绝：省略/相对 workdir、目标非 sibling Git 仓库、workdir 表达式、多个 exec、
  workdir 符号链接、output-only wrapper、nested 非零 exit、failed/pending output。
- 拒绝：只有 `{output, wall_time_seconds, exit_code}` 的 stdout JSON、任意未标型对象、
  缺少 `payload.id` 但继承 `session_id` 的 fork、malformed JSON 与读取 I/O 失败。
- 拒绝：custom/function 调用与 output 错型配对、枚举阶段超预算后回退旧文件、目标与
  `workdir` 同时使用相同祖先 symlink 别名。
- 拒绝：候选打开后原路径被新 inode 占据、打开后增长，以及 exact receipt 在读取期间发生
  同类路径或元数据漂移。
- 兼容：JSON `prefix_rule` 数组等非信任纯数据选项不影响 command/workdir 解码。
- 集成：全新 Change 在同一自动化首轮用 custom ABI 读取后，第一次文档登记成功。

## 解析契约

内部解析 API 返回只读 invocation：必需 `command` 与可选绝对字面字符串 `workdir`。旧的
command-only 导出继续映射该结构，避免调用方破坏。解析器只接受单一 awaited exec 加完整
result 转发；其他工具程序返回零个 invocation。

## 错误与拒绝

解析失败不是 CLI 异常：它返回无可确认读取，文档 gate 继续给出既有“缺少 Skill 调用证据”
错误。output-only wrapper、nested non-zero exit、`Script failed`、call/output identity
不同继续拒绝。当前 custom ABI 只接受包含 `chunk_id`、`wall_time_seconds`、`exit_code`、
`original_token_count` 与 `output` 的完整结果信封；旧格式必须明确标型为
`execution_result`。调用 ABI 与 output ABI 必须同型。损坏 JSON、流式 I/O 或枚举阶段
无法证明候选完整都会终止本次 discovery，而不是尝试更旧文件。

## 安全边界

目标身份必须同时满足字面路径等于物理路径、显式物理目录相等与同一 canonical Git common
directory；不跟随最终组件或祖先 symlink、不接受动态 workdir、不扫描 host sessions root
之外的 transcript，也不扩大文件和总字节预算。session 绑定只认 host 自有 `payload.id`，
不把 fork 继承字段当作主身份。transcript 读取以 `O_NOFOLLOW` fd、捕获 size 和读后
fd/path 双重身份复核组成单一失败关闭边界。

## 术语

- **host session root**：`session_meta.cwd` 指向的会话启动目录。
- **target repo root**：本次 `tenon` 命令的物理项目目录。
- **explicit sibling worktree**：tool call 的字面 `workdir` 等于 target，且与 session root
  共享 canonical Git common directory。

```coverage
touches:
L1_api:      filled -> #解析契约
L2_data:     waived -> 不改变持久化 schema 或 ledger 格式
L3_rules:    filled -> #关键业务规则
L4_state:    filled -> #状态机
L5_errors:   filled -> #错误与拒绝
L6_security: filled -> #安全边界
L7_perf:     waived -> 仍沿用既有 transcript 数量与字节预算
L8_deps:     waived -> 不新增依赖
L10_terms:   filled -> #术语
```
