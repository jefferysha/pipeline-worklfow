# Default Pipeline 文档契约设计

change: normal-chat-default-orchestration
design-doc: openspec/changes/normal-chat-default-orchestration/design.md

## 问题

现有 default pipeline 的 OpenSpec、Superpowers 与 ADR 仅存在于 skill 文案中。状态机和 Dashboard
不知道这些文件是否真实生成，也不知道 build、verify、ship 是否读取当前版本。因此“调用了 default”并
不等价于“走完可追溯的规范链”。

## 决策

新增一个 change 内的独立文档账本：`.pipeline-documents.json`。账本以规范化项目相对路径作为标识，记录
SHA-256，拒绝空文件、符号链接、项目根外路径和 `..` 穿越。写入与 state 变化共享 change lock，使用原子
替换发布。

账本记录不替代 OpenSpec 文件，也不把文档内容塞入状态 YAML。它只把“哪一份文件、由哪个契约内 skill
产出、何时被哪一 phase 读取”的事实固化下来。

## 强制矩阵

| phase exit | produced | read receipts |
| --- | --- | --- |
| open | proposal, design, tasks | — |
| explore | superpower-design, adr | proposal, design, tasks |
| spec | delta-spec, superpower-plan, plan | proposal, design, tasks, superpower-design, adr |
| build | — | proposal, design, tasks, delta-spec, superpower-design, superpower-plan, adr, plan |
| verify | verification-report | all build inputs |
| ship | applied-spec | all prior documents plus verification-report |

若文件内容在 read 后发生变化，hash 不同即视为没有 read receipt；无需脆弱的 mtime 约定。

## 兼容性

既有 custom workflow 默认不受该契约影响，以免无提示地改变任意私有步骤图。新建 workflow 可显式声明
`openspec_contract: required`；校验器要求标准七 phase 与对应可达转换，才允许带“OpenSpec governed”标记。
默认 workflow 永远启用该契约。

## Simple Track 与完整治理的边界

普通开发对话不应只有“完整 default”与“完全绕过”两个极端。新增内建 `simple` Track，绑定插件只读的
轻量 workflow：

```text
change ──change-complete──▶ verify ──verify-pass──▶ done
   │                           │
   └──scope-expanded──▶ escalated ◀── verify-fail 返回 change
```

它不启用 OpenSpec 文档账本，也不生成 Superpowers/ADR；但仍保留 canonical Change、host-session
活跃状态、skill 证据与聚焦验证。只有明确的局部正向信号且不命中否决规则时才可进入 simple。公共 API、
schema/migration、数据库、认证/权限/安全、跨模块/多文件、依赖、并发/事务、生产数据、部署/发布等
任一信号都使 simple 候选失效。执行中发现范围扩张时，必须先把轻量 Change 转为 `escalated`，再创建
新的 default Change；不能把“已经开始改了”当成继续绕过治理的理由。

## 验收

1. `pipeline document record` 只能登记项目内普通非空文件，并持久化 producer/hash。
2. `pipeline document read` 必须基于当前 hash；文档被编辑后旧 receipt 失效。
3. `pipeline check`、`pipeline transition` 对 default/合规 custom workflow 都报告准确缺项。
4. Dashboard snapshot 显示每个文档的路径、producer、当前性和各 phase read 状态。
5. Codex 安装后可发现 required Superpowers skills；cache-only 状态不能被 doctor 误报为可调用。
