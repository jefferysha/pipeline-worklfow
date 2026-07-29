# ADR：Prompt routing bypass 归属 Hook 配置

## 背景

Tenon 需要一个只抑制当前 UserPromptSubmit 路由/面包屑输出的 escape hatch，同时保持 review、confirm、PreToolUse 和 canonical Change 不变。

## 决策

扩展项目级 `.pipeline/hooks.json`，新增 canonical `prompt_skip_keyword` 字段；由现有 `/api/hooks` 读模型返回，并以专用写端点修改。默认 `no-tenon`，空字符串禁用，非空只接受 1–32 位 ASCII 字母数字、`_`、`-`。共享纯 Bash helper 只被 `router.sh` 与 `breadcrumb.sh` 调用。

## 备选方案

- 独立配置文件：边界清晰但复制读写、信任锚和 Dashboard 请求，拒绝。
- Track registry：具备 revision/CAS，但旁路不属于 Track，拒绝。
- 通用正则：灵活但把项目配置变成可执行匹配语言，扩大误触发与注入风险，拒绝。

## 后果

- 旧 `hooks.json` 无需迁移，缺字段自动使用默认值。
- Hook toggle 与 keyword writer 必须互相保留字段。
- 当前 endpoint 仍为 last-write-wins；同目录 rename 保证单文件原子可见，不承诺跨请求 CAS。
- 若未来需要 Unicode/短语/按宿主策略，应以新 schema 和明确迁移实现，不能放宽当前 parser。
