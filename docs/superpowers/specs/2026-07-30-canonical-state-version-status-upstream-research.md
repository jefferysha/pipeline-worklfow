# Canonical State Version Status 上游研究

读取日期：2026-07-30

## 决策问题

Tenon 如何在继续拒绝读取未知 canonical state 的同时，把“当前 runtime 太旧”与“状态损坏”稳定地区分，并在 Dashboard 给出不泄露本机路径的恢复动作？

## 固定来源

| 上游 | 默认分支固定点 | 稳定版本固定点 | 一手证据 | 对 Tenon 的映射 |
| --- | --- | --- | --- | --- |
| mindfold-ai/Trellis | `main@e4ed585e1450657f9e3c0ee23f0a823dd7ab9ad3` | GitHub Latest Release 不存在；回退稳定语义 tag `v0.6.10@c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c` | [默认分支](https://github.com/mindfold-ai/Trellis/commit/e4ed585e1450657f9e3c0ee23f0a823dd7ab9ad3)、[v0.6.10](https://github.com/mindfold-ai/Trellis/tree/v0.6.10)、[终端失败显式化](https://github.com/mindfold-ai/Trellis/commit/13862313c9dcdb61caa4e041c9524d62281d948e) | 把可恢复的兼容性失败变成显式终态，避免静默等待；不照搬终端实现。 |
| rpamis/comet | `master@92d418eb93ce07c95b0855b2d36da4f6fdaea92d` | GitHub latest `0.4.0-beta.11` 是 SemVer 预发布；稳定回退 `0.3.9@053f76d8ac6aaa499b1d3f8752cb5637fc4fb914` | [默认分支](https://github.com/rpamis/comet/commit/92d418eb93ce07c95b0855b2d36da4f6fdaea92d)、[0.4.0-beta.11](https://github.com/rpamis/comet/releases/tag/0.4.0-beta.11)、[0.3.9](https://github.com/rpamis/comet/tree/0.3.9) | managed config 回填保留既有 root 布局，支持“兼容边界显式、旧形状仍可读取”的加法演进。 |
| Chorus-AIDLC/Chorus | `main@d590b568f40fae51f71c9800841c587a3fe94b0b` | `v0.14.5@be647877b4b56a61e480e939d6a6d31b3f84f7f9` | [默认分支](https://github.com/Chorus-AIDLC/Chorus/commit/d590b568f40fae51f71c9800841c587a3fe94b0b)、[v0.14.5](https://github.com/Chorus-AIDLC/Chorus/releases/tag/v0.14.5)、[session 后端与 UI 通知](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/chorus-pi/lib/lib.ts) | 后端/共享 session 契约把配置或连接失败投影为 UI 可见通知，并保留关闭重试路径；Tenon 对应为 kernel 分类、snapshot 投影、Dashboard 重试。 |
| catlog22/maestro-flow | `master@52a4778c042da72608ccf0f633f0266b3b0d89dc` | `v0.5.59@ef797e7a445e169d245fe9f9b38ab2118419a956` | [默认分支](https://github.com/catlog22/maestro-flow/commit/52a4778c042da72608ccf0f633f0266b3b0d89dc)、[v0.5.59](https://github.com/catlog22/maestro-flow/releases/tag/v0.5.59)、[防止 state.json 静默降级](https://github.com/catlog22/maestro-flow/commit/060b09883b9bdcbbaa3e7d293620bfe30ed3119b) | 前向版本必须拒绝静默降级，同时给出可诊断状态；这是本功能的直接兼容性依据。 |
| liaohch3/claude-tap | `main@6cfe45afd7b6d009e839b178dd59b9e338b10309` | `v0.1.141@547925c9bd66f73cdcf9a4779fc88a4ffa247738` | [默认分支](https://github.com/liaohch3/claude-tap/commit/6cfe45afd7b6d009e839b178dd59b9e338b10309)、[v0.1.141](https://github.com/liaohch3/claude-tap/releases/tag/v0.1.141) | zstd SSE 解码只在明确编码时启用，未知/畸形输入保持安全回退；Tenon 同样只对明确的未来整数版本给出升级诊断。 |

## 本仓证据与非重复边界

- `packages/kernel/src/state/run-revision-codec.ts` 当前把所有非 `schemaVersion: 1` 输入折叠为 `RunStateCorruptError`。
- `packages/server/src/snapshot.ts` 当前将任何读失败拼为包含 state source 的自由文本，无法给 Dashboard 稳定分支。
- `packages/dashboard-app/src/App.tsx` 在 Changes 数为零时直接进入教学空态，会遮蔽“存在但版本不可读”的 Change。
- 既有 projection health、Context Bundle corruption、Review Handshake、session routing、AFK、Projects、Host Plan 与 frozen workflow 工作均不提供 canonical 版本兼容状态；本功能不扩展这些域。

## 方案比较

| 方案 | 优点 | 风险 | 裁决 |
| --- | --- | --- | --- |
| A. 继续复用自由文本 `error` | 改动最少 | 前端依赖中文字符串；泄露路径；无法稳定 i18n | 拒绝 |
| B. server 直接解析 canonical JSON | 不改 kernel | 复制 trust boundary；容易与真实 codec 漂移 | 拒绝 |
| C. kernel typed error + snapshot 加法 issue | 分类单一真相源；旧前端忽略字段；新前端可安全展示 | 需约束识别顺序和 DTO | 采用 |

## 推荐与未知

采用 C。codec 只在根值是对象且 `schemaVersion` 为安全整数并大于当前支持版本时抛出 typed error；不验证未来 shape，也绝不把它读成当前状态。server 只投影 Change 名、发现版本、支持版本、稳定原因码和恢复动作，不投影绝对路径或原始错误。未知点均有安全默认值：低版本、非整数、缺字段与损坏摘要继续归类 corruption；本 Change 不实现迁移。
