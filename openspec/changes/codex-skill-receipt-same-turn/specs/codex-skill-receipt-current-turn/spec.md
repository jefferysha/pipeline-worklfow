# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Custom exec MUST preserve explicit project identity

系统 MUST 从受支持的 Codex custom tool-program 字面对象中同时解码 `cmd` 与可选
`workdir`。当 host session root 与目标项目不是同一物理目录时，系统 MUST 仅在显式
`workdir` 是绝对路径、等于目标项目且二者共享同一个 canonical Git common directory 时接受该调用。

#### Scenario: 首轮 sibling-worktree Skill 读取被确认

- **WHEN** 绑定 session 从主工作树启动，完成的 custom exec 以 sibling worktree 为字面
  `workdir`，读取当前受信 Skill，并有同一 `call_id` 的成功 output
- **THEN** fallback discovery 在同一轮确认该 Skill，第一次文档登记即可追加
  `CodexSkillRead` evidence

#### Scenario: 缺少显式目标时失败关闭

- **WHEN** session root 与目标项目不同，custom exec 读取受信 Skill 但省略 `workdir`
- **THEN** 系统 MUST 不确认该读取，也 MUST 不追加 history evidence

#### Scenario: 相对 workdir 失败关闭

- **WHEN** session root 与目标项目不同，custom exec 提供相对 `workdir`
- **THEN** 系统 MUST 不把该路径相对 verifier 当前目录解析，也 MUST 不确认该读取

#### Scenario: 非 sibling 项目被拒绝

- **WHEN** custom exec 的 `workdir` 指向目标目录，但 session root 与目标目录不共享
  canonical Git common directory
- **THEN** 系统 MUST 不把该调用视为当前项目证据

### Requirement: Tool-program decoding MUST remain bounded and literal

系统 MUST 只接受受支持对象字面量中的字符串 `cmd`/`command` 与可选字符串 `workdir`，
且 fallback discovery MUST 要求恰好一个解码成功的 exec invocation。该 invocation MUST
是顶层 awaited `tools.exec_command`，并把同一变量的完整 result 传给 `text`。表达式、
模板字符串、computed key、多个 exec invocation、只转发 `.output` 或无法解析的对象 MUST
失败关闭。

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

#### Scenario: Output-only wrapper 失败关闭

- **WHEN** tool-program 已 await exec，但只调用 `text(result.output)`
- **THEN** 解码器 MUST 不产生 invocation，因为 transcript 无法证明内部执行成功

#### Scenario: 动态 workdir 不成为证据

- **WHEN** `workdir` 是变量、函数结果、模板字符串或 computed property
- **THEN** 解码器 MUST 不产生可用于 sibling-worktree 身份证明的 workdir

### Requirement: Existing receipt completion and trust gates MUST remain enforced

修复 MUST 保留受信 Skill root、绑定 host session、当前 workflow visit 时间下界、精确
`call_id`、完整 nested result 中的 `exit_code=0` 与 history 去重要求；不得用外层完成状态、
路径名、文件 mtime 或第二用户轮次替代这些证据。

#### Scenario: Pending or failed output remains rejected

- **WHEN** 调用没有匹配 output，或完整 nested result 报告非零 exit/failed
- **THEN** 系统 MUST 不确认 Skill

#### Scenario: 外层成功不能遮蔽内部失败

- **WHEN** custom tool call 外层显示完成，但 nested exec result 的 `exit_code` 非零
- **THEN** 系统 MUST 不确认 Skill，也 MUST 不追加 history evidence

#### Scenario: Existing function-call ABI remains compatible

- **WHEN** transcript 使用 `function_call(exec_command)` 与 `function_call_output`
- **THEN** 现有同目录和 sibling-worktree 读取行为 MUST 保持不变
