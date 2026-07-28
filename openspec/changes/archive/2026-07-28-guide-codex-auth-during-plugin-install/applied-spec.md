# 已应用规格

日期：2026-07-28

## 变更摘要

将已批准并在 Verify 隔离副本中演练通过的 Codex 宿主认证与获取引导 requirement，
一次性应用到 `plugin-distribution` 主规格。保留全部既有 requirement 和 scenario，不修改
`plugin-runtime` requirements。

## 已应用需求

| Delta | 主规格目标 | 结果 | Before SHA-256 | After SHA-256 |
| --- | --- | --- | --- | --- |
| `openspec/changes/guide-codex-auth-during-plugin-install/specs/plugin-distribution/spec.md` | `openspec/specs/plugin-distribution/spec.md` | `changed` | `6c4438aff1087f55a1911e84447c2c04d0686b96af7a0655b11856d2c173695a` | `02ac5acf4e39ebc9f259b79096b1ab3bb401452ed8d793bc9a2489e1f2ea94be` |

应用内容：

- 新增 `Codex 插件生命周期 SHALL 提供宿主认证状态与双路径获取引导`。
- 新增 ChatGPT 方案、device auth、Platform API Key、已登录、未登录、CLI 缺失、
  非交互、异常、重复安装、update、doctor、`CODEX_HOME` 与 clean-install 场景。
- 明确 Platform API Key 按用量计费，与 ChatGPT 订阅权益分离。
- 固定秘密不进入 argv、状态、JSON、日志、文档和异常的安全边界。

## 交付证据

- `openspec validate plugin-distribution --strict`：通过。
- `openspec validate plugin-runtime --strict`：通过。
- `openspec validate guide-codex-auth-during-plugin-install --strict`：通过。
- Verify 隔离归档演练：`specsUpdated=true`、`added=1`，归档后两个相关主规格 strict
  validate 通过。
- 当前应用与 Verify 演练的 requirement/scenario 内容一致；主规格仅因文件末尾空行规范化产生
  字节摘要差异，不影响 OpenSpec 语义。
- 冲突处理：无；主规格中不存在同名 requirement，应用一次。
