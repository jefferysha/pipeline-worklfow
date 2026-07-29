# 上游参考 A：单轮注入旁路调研

## 范围与固定来源

本报告仅研究上游参考 A 的单轮 skip keyword，不把上游实现代码直接移植到 Tenon。仓库名与
精确 URL 只保留在 PR 和自动化运行记忆中，避免把参考项目身份写入 Tenon 的受治理文档。
读取日期：**2026-07-28**。

| 项目 | 固定结果 | 一手来源 |
| --- | --- | --- |
| 默认分支 | `main`，读取时指向 `12e279a8af00456b1d0d4e3d0f7f59e7b702202e` | 固定 commit；精确 URL 见 PR |
| 最新稳定版本 | GitHub Latest Release API 返回 `404`，因此回退到最新语义版本 tag `v0.6.9`；该 tag 同样指向 `12e279a8af00456b1d0d4e3d0f7f59e7b702202e` | 固定 tag 与 commit；精确 URL 见 PR |
| 功能引入 | `64df8759b4d62584eea5b41a20204b050be965db`，单轮 skip keyword 功能提交 | 固定 commit 与 issue；精确 URL 见 PR |
| 固定性核对 | 引入 commit 是 v0.6.9 的祖先；从引入 commit 到 v0.6.9，Python/JS 匹配器、配置读取器与专项集成测试无相关变更 | 上述两个 commit 的固定源码树与 Git history |

## 上游行为契约

### 配置与默认值

- 项目级配置使用上游项目配置文件中的 `prompt_injection.skip_keyword`；模板只放注释，默认值存在于代码中。
- 配置文件、section 或 key 缺失时使用默认值；显式自定义词会替换默认词。
- `skip_keyword: ""` 必须是可保留的显式空字符串；空 keyword 永不匹配，因此完全禁用 escape hatch。为此，引入 commit 同时修复了简化 YAML parser 将 quoted empty string 误判为无值的问题。

### 大小写与词边界

Python 与 OpenCode JS 均先转义自定义 keyword，再应用：

```text
(?<![\w-])<escaped-keyword>(?![\w-])
```

- 匹配不区分大小写。
- keyword 两侧不能紧邻 `\w` 或 `-`，词内片段与连字符连接均不命中。
- 空白和标点是边界。
- `/` 与 `.` 也是边界，因此 `path/no-upstream.md` 会命中；上游把它明确记为可接受的 false positive。
- 匹配对象是宿主传入的**原始用户 prompt 文本**，不是解析后的命令；命中后只跳过当前 turn，下一 turn 不受影响。

固定实现已在上述 SHA 的 Python 与 OpenCode JS 匹配器、早退位置中逐行核对；精确 URL 见 PR。

### 实际旁路范围

命中时，Python hook 以 `0` 退出且 stdout 为空；OpenCode plugin 保持用户 text part 原样，不前置
`<workflow-state>`。检查发生在项目 root 与配置读取之后、task resolution 与 breadcrumb template
读取之前。

它只旁路**每轮 workflow-state breadcrumb**，不旁路 SessionStart、sub-agent context 或 shell-session
context，也不改变 task/change 状态。对 Tenon 的可迁移原则是：旁路只能截断 UserPromptSubmit
路由/面包屑注入，不能成为 PreToolUse、review、confirm 或其他安全门的通用关闭开关。
该范围已对照固定 SHA 的平台集成规格核对。

## 宿主覆盖

| 宿主面 | v0.6.9 行为与证据强度 |
| --- | --- |
| Claude Code、Codex、Gemini CLI、Qoder、Copilot CLI、CodeBuddy、Droid、Kiro、Trae、ZCode | 都分发同一个 Python `inject-workflow-state.py`，因此共享同一匹配实现；专项测试通过真实 `python3` + 临时仓库验证 shared hook，但没有逐宿主重放各自真实 payload schema。 |
| OpenCode | 有独立 JS 实现；测试覆盖默认命中、边界 negative、自定义词、空值禁用并断言原始 prompt 不被改写。 |
| Cursor | 不分发 per-turn injector，因为 `beforeSubmitPrompt` 没有 context-injection 字段；仅 SessionStart，不存在此单轮旁路入口。 |
| Pi | 明确未覆盖：没有允许读取/改写用户文本的 `input` handler，且 per-turn `systemPrompt` 必须保持字节一致以维持 provider prefix cache。 |

## 测试证据

Python 集成测试覆盖：缺失配置/section 的默认值、custom keyword、quoted empty string、默认命中、
大小写不敏感、无词边界 negative、路径与标点边界、正常注入回归，以及 SessionStart/sub-agent 不受影响。
专项集成测试已在固定 SHA 中逐项回读；精确 URL 见 PR。

本轮审阅了固定源码与测试，没有在上游参考 A 仓库执行其测试套件；不能把“存在上游测试”表述成“本轮测试已通过”。

## 明确缺口与 Tenon 映射

1. **没有前后端管理闭环。** 上游参考 A 只有注释化 YAML 配置和 hook/plugin 消费，没有 Dashboard、
   配置 API、保存错误恢复或并发持久化契约；Tenon 不能把上游文件编辑体验当成 UI 方案。
2. **逐宿主证据不足。** shared Python 测试只使用统一 `{prompt, cwd, ...}` fixture，没有逐一验证上述
   十个宿主的真实事件字段和输出 envelope；Tenon 只需对自己的 UserPromptSubmit 契约负责，不应照抄
   “全宿主已验证”的表述。
3. **Python/JS Unicode 边界并非完全同义。** Python 默认 Unicode `\w`，JS `\w` 是 ASCII 集合；
   在固定正则的确定性探针中，Unicode 字符包围默认词时 Python 不命中、JS 命中。上游测试只覆盖 ASCII，
   自定义 Unicode keyword 也没有 parity 测试。Tenon 应固定一种明确、可跨层复现的字符边界规则。
4. **“非字符串回退默认值”文档强于实际 scalar parser。** 简化 YAML parser 把 `false`、数字等裸
   scalar 保留为字符串；专项测试只覆盖缺失/custom/quoted-empty，没有验证非法 scalar/container。
   Tenon API 应做真实 schema 校验并返回可见错误，而不是依赖弱 YAML coercion。
5. **已接受的路径误命中不一定适合 Tenon。** `path/no-upstream.md` 会静默整个 turn；若 Dashboard
   允许自定义，应把边界示例和命中预览明确展示，避免用户把配置词误当普通文件名。

## 给 Explore 主线的开放问题

1. Tenon 是否接受上游参考 A 的 ASCII 风格 `[\w-]` 边界，还是定义 Unicode 字母/数字也属于相邻词字符？
2. 是否保留 `path/<keyword>.md` 这类已知 false positive，还是要求空白/行首/行尾边界以降低误触发？
3. 空字符串禁用时，Dashboard 应保存显式 `""`，还是使用独立 `enabled` 字段避免空值语义混淆？
4. 配置 API 对空白、超长、换行、控制字符和重复默认词应拒绝还是规范化？
5. UI 是否需要“试匹配当前 keyword”的即时预览，以把大小写、边界和路径误命中暴露给用户？
