# 设计

## 设计结论

- 扩展 `.pipeline/hooks.json` version 1，新增 `prompt_skip_keyword`；旧文件无迁移。
- 默认 `no-tenon`，空字符串禁用；非空仅接受 `^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$`。
- 共享纯 Bash helper 执行 ASCII 大小写折叠与独立边界匹配，只接入 `router`/`breadcrumb`。
- Dashboard 控制器放在 UserPromptSubmit 执行时间线，覆盖 loading、ready、disabled、validation、save error、success 和键盘提交。
- 详细设计见 `docs/superpowers/specs/2026-07-28-prompt-routing-bypass-design.md`，架构决策见 `docs/adr/2026-07-28-prompt-routing-bypass-explore.md`。

## 风险

- 标点属于边界，因此路径片段可能命中；UI 明示该语义并用严格 token 限制降低误触发。
- 手改损坏配置必须回退默认值，不能把项目字节求值为 shell/regex。
- Hook config 现有 endpoint 是 last-write-wins；本轮保证原子可见与字段互保，不冒充 CAS。

## 已验证问题

- 上游参考 A 的 GitHub Latest Release API 返回 404，已按规则回退 `v0.6.9` tag；其单轮旁路契约与测试已固定。
- 上游参考 B 的 latest release 为 `0.4.0-beta.9`，当前 `master` 的 platform target 变化与本功能无关。
- 现有 `/api/hooks`、`.pipeline/hooks.json` 和 Workbench Hook 时间线可直接承载闭环；不需要新依赖或新顶层模块。
