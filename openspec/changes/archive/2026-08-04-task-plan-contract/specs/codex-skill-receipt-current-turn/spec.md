# OpenSpec 增量规格

## MODIFIED Requirements

### Requirement: Tool-program decoding MUST remain bounded and literal

系统 MUST 只接受受支持对象字面量中的字符串 `cmd`/`command` 与可选字符串 `workdir`，
且 fallback discovery MUST 要求恰好一个解码成功的 exec invocation。该 invocation MUST
是顶层 awaited `tools.exec_command`，并把同一变量的完整 result 传给 `text`。表达式、
模板字符串、computed key、多个 exec invocation、只转发 `.output` 或无法解析的对象 MUST
失败关闭。Inline `max_output_tokens` 仅在值为正安全整数字面量时可作为不受信执行选项被忽略；
pragma、动态值、零、负数、非整数与超出安全整数范围的值 MUST 失败关闭。

#### Scenario: 当前 JSON ABI 保留 workdir

- **WHEN** tool-program 使用 `tools.exec_command({"cmd":"...","workdir":"..."})`
- **THEN** 解码结果 MUST 同时包含原始 command 与 workdir

#### Scenario: Safe unquoted ABI 保留 workdir

- **WHEN** tool-program 使用仅含安全 identifier key 和字符串字面量的对象
- **THEN** 解码结果 MUST 同时包含 command 与可选 workdir

#### Scenario: JSON 非信任选项保持兼容

- **WHEN** JSON tool-program 除 `cmd` 与 `workdir` 外还包含数组等纯数据选项，例如
  `prefix_rule`
- **THEN** 解码器 MUST 忽略这些非信任选项，并继续只验证 command 与 workdir

#### Scenario: 合法 inline max_output_tokens 保持完成态证明

- **WHEN** custom 或 function ABI 的 inline exec arguments 包含正安全整数 `max_output_tokens`，nested result 为 `exit_code=0` 且输出逐字节等于受信 Skill
- **THEN** 解码器 MUST 保留 invocation，完整 reconcile 可追加当前 phase 的 `CodexSkillRead`

#### Scenario: max_output_tokens 不得放宽完整输出

- **WHEN** 合法 `max_output_tokens` 导致 nested output 截断，或值来自 pragma、动态表达式、零、负数、非整数或超出安全整数范围
- **THEN** 系统 MUST 不确认 Skill，也 MUST 不追加 history evidence

#### Scenario: Output-only wrapper 失败关闭

- **WHEN** tool-program 已 await exec，但只调用 `text(result.output)`
- **THEN** 解码器 MUST 不产生 invocation，因为 transcript 无法证明内部执行成功

#### Scenario: 伪造的 stdout JSON 不能冒充完整结果

- **WHEN** `input_text` 仅包含形似 `{output, wall_time_seconds, exit_code}` 的 JSON，
  或 output item 是带 `exit_code=0` 的任意未标型对象
- **THEN** 系统 MUST 不把它当作 exec 完成信封；只有当前 host 的完整结果信封或明确
  标型的旧 `execution_result` 才能证明成功

#### Scenario: 动态 workdir 不成为证据

- **WHEN** `workdir` 是变量、函数结果、模板字符串或 computed property
- **THEN** 解码器 MUST 不产生可用于 sibling-worktree 身份证明的 workdir

### Requirement: Transcript fallback MUST bind an exact current session and intact turn

fallback discovery MUST 只把 `session_meta.payload.id` 作为 host session 身份，并只接受
同一 transcript 中完整、可解析的当前 turn。`payload.session_id`、fork 继承字段、损坏 JSON
或读取失败不得触发旧 transcript 回退。exact receipt 与 fallback discovery 都 MUST 在
读取前以 `O_NOFOLLOW` 打开候选并把 device/inode/size/mtime/ctime 绑定到枚举快照，按快照
大小限制读取范围；读取结束后 MUST 同时复核原 fd 和当前 candidate path 仍指向同一完整身份。
discovery MUST 在 4096 metadata-entry 预算内支持超过 128 个合法 transcript，同时仍只全文读取
最新 32 个候选并遵守单文件/总字节预算。

#### Scenario: 129 个历史 transcript 后仍发现当前 session

- **WHEN** 精确当前 session Skill read 位于 129 个合法历史 transcript 之后
- **THEN** 完整 reconcile 只追加该当前 phase 的 `CodexSkillRead`

#### Scenario: Fork 缺少 payload.id 时失败关闭

- **WHEN** fork transcript 缺少 `session_meta.payload.id`，但继承的
  `payload.session_id` 等于当前绑定 session
- **THEN** 系统 MUST 不把该 transcript 归属到当前 session

#### Scenario: 当前 turn 含损坏 JSON 时失败关闭

- **WHEN** 候选 transcript 已出现匹配 session/turn 的调用，但后续任一行不是有效 JSON
- **THEN** 系统 MUST 丢弃该候选的全部 evidence，且不得回退到更旧 transcript

#### Scenario: 候选 transcript 读取失败时失败关闭

- **WHEN** 最新候选 transcript 在读取期间发生 I/O 失败
- **THEN** discovery MUST 停止并返回无 evidence，不得继续扫描更旧文件

#### Scenario: 枚举阶段无法证明最新候选完整时失败关闭

- **WHEN** transcript 在枚举阶段发生目录读取、`lstat`、`realpath` 失败，或最新候选超过
  单文件/总字节预算
- **THEN** discovery MUST 返回无 evidence，且不得跳过该候选后接受更旧、更小的 transcript

#### Scenario: 打开后 candidate path 被轮换时失败关闭

- **WHEN** verifier 已打开候选 transcript，但 host 随后 rename/unlink 该 inode，并在原路径
  创建新的 transcript
- **THEN** 系统 MUST 不接受旧 fd 中的 evidence；读后 path 身份复核 MUST 失败关闭

#### Scenario: Exact receipt 读取保持同一有界 inode

- **WHEN** exact receipt 指向受信 transcript path
- **THEN** 系统 MUST 固定打开时的 inode 与字节上限，且只有原 fd 和当前 path 在读取后仍与
  捕获快照一致时才能确认 receipt
