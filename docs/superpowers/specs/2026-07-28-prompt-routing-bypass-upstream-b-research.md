# 上游参考 B：边界安全映射调研

## 固定来源

读取日期：**2026-07-28**。本报告只提炼边界原则，不移植上游参考 B 的代码。仓库名与
精确 URL 只保留在 PR 和自动化运行记忆中。

| 项目 | 固定结果 | 一手来源 |
| --- | --- | --- |
| 默认分支 | `master`，读取时指向 `2945693e4061c369be0d400ed2999a66fa87c680` | 固定 commit；精确 URL 见 PR |
| GitHub Latest Release | `0.4.0-beta.9`，`84038b0d6b7c185b233f0f36b294ae74dd9121d0`，GitHub 标记 `prerelease=false` | 固定 release 与 commit；精确 URL 见 PR |
| 相关安全提交 | `965e9e3e4fcf18bded66a52c5499b92d22949a6e`，位于 beta.9 历史内 | 固定 commit；精确 URL 见 PR |

`master` 相比 release 的最新能力是平台 target 选项，与提示旁路无直接关系；本轮不为“追最新”牵强扩展范围。

## 可映射原则

上游参考 B 的 beta.9 把文件输入视为不可信边界：限定大小、拒绝非普通文件/符号链接、在同一描述符上读取并复核身份，避免“先检查路径、后重新打开”的竞态。它还为 canonical verification evidence 提供格式化命令，避免消费者依赖手写字节细节。

对本功能的直接映射是：

1. Dashboard 写端点必须只接受明确 schema；空字符串代表禁用，非空值限制为短 ASCII token，拒绝空白、控制符、路径字符和正则元字符。
2. 持久化沿用 Tenon 已有 `.pipeline/hooks.json` 的同目录临时文件 + rename；写任一字段时必须保留另一字段，避免局部写回造成配置丢失。
3. Hook 只消费 server 能生成的 canonical 单行字段，并在手改损坏时回退到安全默认值；项目配置绝不作为 shell 程序求值。
4. 旁路只影响 UserPromptSubmit 的 `router`/`breadcrumb` 输出，不改变 review、confirm、PreToolUse、Skill evidence 或 canonical Change。

## 不应照搬

- 本轮不是新的通用文件读取原语，不应把上游参考 B 的 fd/inode 抽象移植到 Tenon kernel。
- `hooks.json` 已有读取与信任边界；全面改造成 race-safe repository 是独立安全工程，不能夹带进最小功能。
- canonical evidence formatter 面向另一份文档契约；本功能只借用“生产者给出窄 canonical 格式、消费者不猜”的原则。
- 上游参考 B 的 snapshot budget 与 prompt keyword 无直接用户价值，不在本轮增加 snapshot/schema。

## 结论

采用“窄 DTO + canonical JSON 行 + 原子替换 + Bash 白名单复核”。这比复制上游参考 B 的底层文件原语更符合 Tenon 现有包边界，同时保留了其 fail-loud 输入、fail-safe 消费和不把手写格式当权威的核心价值。
