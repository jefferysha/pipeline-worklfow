# Zed pipeline 适配器（lite，档 C 静态降级）

> 契约：`adapters/contract.md`。Zed 的 Agent Panel **当前无自定义 enforcement hook**——三能力
> **全静态降级**。诚实：zed 确实只能到 C 档，本目录**无 `hooks/`**（不伪装 hook 强制）。

## 为什么是档 C（研究结论，非假设）

2026-07-07 spike 调研（官方文档 + zed-industries/zed 仓库 issue/discussion）确认：

- `zed.dev/docs/ai/rules`：Zed 支持 `.rules`、`.cursorrules`、`CLAUDE.md`、`AGENTS.md` 等**静态**
  项目级指令文件（含全局 `~/.config/zed/AGENTS.md`），项目级 `.rules` 优先于个人 AGENTS.md。
  这些都只是拼进 system prompt 的静态文本，无条件逻辑、无命令执行。
- **`zed-industries/zed` issue #57890 / discussion #57943**（"AI Agent extensibility — Custom
  Commands, Lifecycle Hooks, and Skills"）显式提出 `session_start`/`pre_tool_use`/`post_tool_use`
  生命周期钩子——但这是一份**尚未实现的社区提案**，不是已发布功能。截至本次调研，Zed Agent Panel
  没有任何用户可配置的钩子能拦截或响应工具调用。

档 A/B 要求至少一项能力在原生 hook 上等价实现；Zed 没有 hook 系统（只有静态 `.rules`/AGENTS.md），
故三能力全靠**静态注入 + 手动 Unlock sentinel**——这正是 contract §1 的档 C 定义。如实标注为 C，
不为对齐其它平台而伪装原生（GOAL C9/C10 无伪测试 + contract §1 红线）。若上述 hooks 提案未来落地，
应重新 spike 并可能升档（届时更新本文件与 registry.yaml）。

## 三能力（全静态降级，档 C）

```yaml
inject:
  status: degraded
  fallback: static-rules            # .rules（项目根，哨兵块幂等合并，不覆盖用户已有内容）
veto:
  status: degraded
  fallback: unlock-sentinel         # 无硬拦；手动 rm .pipeline-pending-<kind> 放行
track:
  status: degraded
  fallback: manual-note             # 无自动留痕（无 hook 触发点）——如实标注
```

## 安装

```bash
adapters/zed/install.sh --target <项目目录>   # 默认 $PWD
```

或经顶层派发器：`adapters/install.sh --zed --target <dir>`。

## Unlock sentinel（唯一 HITL 解封路径）

Zed 无 hook、无 `AskUserQuestion` 等价物——review 门唯一放行 = 手动删项目根 marker：

```bash
rm .pipeline-pending-review     # 或 .pipeline-pending-confirm / .pipeline-pending-interaction
```

与 CC `AskUserQuestion` 语义等价（contract §2）。
