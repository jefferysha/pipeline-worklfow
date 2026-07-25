# CLI 参考

本页列出常用 pipeline 命令族。精确参数以 `pipeline <command> --help` 为准。

## Setup 与运行时

```bash
pipeline setup --codex
pipeline setup --claude
pipeline update --codex
pipeline doctor --json
pipeline runtime status
pipeline runtime repair --rollback
pipeline dashboard --open
```

## Change 与状态

```bash
pipeline init <name> --track <track> --preset <preset>
pipeline init <name> --track frontend --preset full --document-locale zh-CN
pipeline list --json
pipeline status <name> --json
pipeline workflow plan <name> --json
pipeline get <name> <field>
pipeline set <name> <field> <value>
pipeline transition <name> <event>
pipeline check <name>
```

不要用 `set phase` 绕过 workflow event。canonical state 和 YAML projection 只能由 CLI 写。

`pipeline workflow plan <name> --json` 是 Agent 编排在途 Change 的单一读取入口。它优先返回
WorkflowRun 初始化时冻结的完整计划，包括步骤、Skill、门禁、守卫、产物和转换。后来修改或删除
`.pipeline/workflows/<workflow>.yaml` 只影响新运行，不会改写已有运行的 Todo 和 Skill DAG。

## 文档证据

```bash
pipeline document init <change>
pipeline document scaffold <change> <kind>
pipeline document scaffold <change> delta-spec --capability <capability>
pipeline document record <change> <kind> <path> --producer <skill>
pipeline document read <change> all
pipeline document status <change> --json
```

scaffold 只创建缺失结构，不登记 producer；delta spec 必须显式提供真实 capability；record 必须对应真实 Skill。Change 语言固定在 `.pipeline-document-locale.json`，不写入严格 canonical schema，以保持旧版本回滚兼容。

## 项目规格骨架

```bash
pipeline scaffold spec web
pipeline scaffold spec cli --spec-dir docs/specs
pipeline scaffold spec lib --document-locale en
```

项目规格骨架也默认生成中文。只有显式传入 `--document-locale en` 才生成英文；路径、命令、OpenSpec 与
workflow token 始终保持英文。冲突策略使用 `--strategy skip|overwrite|append`。
`overwrite` 会在可信项目根下先构建完整顶层项目 envelope，再以持久事务收据提交；进程在目录
切换中崩溃时，下一次调用会先恢复上一事务。检测到仍存活的 writer，或旧 envelope 移走后正式
路径被未知内容占用时，命令会 fail-closed 并保留 lock/stage/backup 恢复证据。

## Review

```bash
pipeline review request <change> --event <event>
pipeline review acknowledge <change>
pipeline review acknowledge <change> --delegated
```

delegated 需要 Change 绑定的持续授权，且不能跳过 check。

## Session 与恢复

```bash
pipeline session activate <change>
pipeline session activate <change> --continuous --host-session <id>
pipeline session route-context <change> --json
```

## 自动化与高级命令

```bash
pipeline afk enqueue <change>
pipeline loops list
pipeline inbox --json
pipeline handoff <change> --json
pipeline tap ...
pipeline channel ...
```

高级命令可能处理本地敏感数据，先阅读对应安全说明。
