# Codex pipeline 适配器（lite，档 A/B/C）

> 契约：`adapters/contract.md`。本 adapter 把 Codex hook 能力映射到 pipeline 三能力。
> Codex 与 Claude Code **hook 协议同构**（spike 实证）：三 wrapper 薄包 lite baseline
> `hooks/session-start.sh` · `hooks/gate.sh` · `hooks/skill-tracker.sh`。

## 安装（分档）

```bash
adapters/codex/install.sh --target <项目目录>            # 档 A 全保真·manual-trust（默认）
adapters/codex/install.sh --managed --target <项目目录>  # 档 B 全保真·managed/MDM（需 root，免 trust）
adapters/codex/install.sh --static  --target <项目目录>  # 档 C 静态降级（无 hook，靠 Unlock sentinel）
```

或经顶层派发器：`adapters/install.sh --codex --target <dir>`。

## 三能力（全 native，档 A/B）

```yaml
inject:
  status: native
  event: SessionStart
  format: json-additionalContext   # {"hookSpecificOutput":{"hookEventName","additionalContext"}}
  impl: hooks/inject.sh 薄包 hooks/session-start.sh 的 stdout（纯 bash json_escape，不引 jq）
veto:
  status: native
  event: PreToolUse
  format: exit2-stderr             # 命中新鲜 .pipeline-pending-* marker → exit 2 + stderr 指引
  impl: hooks/veto.sh 透传 hooks/gate.sh 退出码与 stderr
track:
  status: native
  event: PostToolUse
  format: history-append           # append openspec/changes/<name>/.pipeline-history.jsonl
  impl: hooks/track.sh 透传 hooks/skill-tracker.sh
```

## 分档降级

| 档 | 部署 | inject/veto/track | trust |
|----|------|-------------------|-------|
| A 全保真·manual-trust | hooks.json → CODEX_HOME | 全 native | 一次性人工 trust（`/hooks` 按 t） |
| B 全保真·managed/MDM | /etc/codex/managed_hooks | 全 native | **免 trust**（唯一 headless 路径，需 root） |
| C 静态降级 | 仅 AGENTS.md 静态层 | 无 enforcement hook | 无 hook；靠自律 + Unlock sentinel |

## Unlock sentinel（HITL 解封）

档 C（无 hook）或 headless 无 `AskUserQuestion` 时，review 门放行 = 删项目根 marker：

```bash
rm .pipeline-pending-review     # 或 .pipeline-pending-confirm / .pipeline-pending-interaction
```

与 Claude Code `AskUserQuestion` 自动清 marker 语义等价（contract §2）。

## hook trust（Codex 特有约束）

Codex 普通用户态对自定义 hook 要求一次性人工 trust；未 trust 前三能力静默不触发。档 B（managed
hooks + `/etc/codex/requirements.toml`）是唯一 always-on 免 trust 的路径，但只对 root/MDM 管理层生效。
