# Context Bundle 预算预览：Tre&#108;lis v0.6.9 上游研究

## 研究问题与范围

- 读取日期：2026-07-28
- 上游：[`mindfold-ai/Tre&#108;lis`](https://github.com/mindfold-ai/Tre&#108;lis)
- 问题：Tre&#108;lis 最新稳定版本怎样限制 sub-agent 首次上下文注入，并在超预算时保留可追踪性？这些行为应怎样映射为 Tenon `context-bundle-budget-preview` 的用户价值和边界？
- 范围：只研究 v0.6.9 相比前一稳定 tag v0.6.8 的 context injection budget / overflow 行为，不把 Tre&#108;lis 代码复制进 Tenon。

## 固定版本与来源

| 事实 | 固定值 | 一手来源 |
| --- | --- | --- |
| 默认分支 | `main` | [仓库元数据](https://api.github.com/repos/mindfold-ai/Tre&#108;lis) |
| `main` 最新 SHA | `12e279a8af00456b1d0d4e3d0f7f59e7b702202e`，提交信息 `0.6.9`，提交时间 2026-07-24T14:53:52Z | [固定提交](https://github.com/mindfold-ai/Tre&#108;lis/commit/12e279a8af00456b1d0d4e3d0f7f59e7b702202e) |
| GitHub latest release | [`GET /releases/latest`](https://api.github.com/repos/mindfold-ai/Tre&#108;lis/releases/latest) 于 2026-07-28 返回 HTTP 404；仓库没有可作为 latest release 的 GitHub Release | [GitHub Releases 页面](https://github.com/mindfold-ai/Tre&#108;lis/releases) |
| release 回退 | 回退到最新稳定语义版本 tag `v0.6.9`；tag 与 `main` 同指 `12e279a8af00456b1d0d4e3d0f7f59e7b702202e` | [`v0.6.9`](https://github.com/mindfold-ai/Tre&#108;lis/tree/v0.6.9) |
| 前一稳定 tag | `v0.6.8` → `dc68f5a92a68489b681c511f4a784e413d724e85` | [`v0.6.8`](https://github.com/mindfold-ai/Tre&#108;lis/tree/v0.6.8) |
| 比较边界 | `v0.6.8...v0.6.9`，v0.6.9 ahead 28 commits | [GitHub compare](https://github.com/mindfold-ai/Tre&#108;lis/compare/v0.6.8...v0.6.9) |

结论：本轮不存在可引用的 GitHub Release；后续设计和 PR 必须明确写“latest release API 404，按规则回退到最新稳定语义 tag v0.6.9”，不能把 tag 伪称为 GitHub Release。

## v0.6.8 → v0.6.9 的问题与实现链

### 1. 根因：索引被当成无条件 payload 列表

[Issue #441](https://github.com/mindfold-ai/Tre&#108;lis/issues/441) 记录了 v0.6.7 的真实缺陷：Tre&#108;lis 生成的 sub-agent 集成会把 `implement.jsonl` / `check.jsonl` 引用的所有文件完整拼进首次模型请求，也会加入 `prd.md`、`design.md`、`implement.md`，但没有单文件、单 artifact 或总 payload 上限。issue 给出的复现是把一个 2 MiB 文件写入 `implement.jsonl`，随后观察整个文件被注入。

这不是单纯的性能问题。用户在启动 agent 前看不到实际要发送的材料、顺序和总体积，超大请求只会在运行时暴露，且引用清单失去了“按需读取索引”的语义。

### 2. 第一段修复：统一 Python hook 与 Pi

[提交 `ea399def`](https://github.com/mindfold-ai/Tre&#108;lis/commit/ea399def505f26331919915753ae2c0f21ea6b00) 在 2026-07-22 关闭 #441，并引入：

- JSONL 引用文件默认每文件 `32 KiB`；
- `prd.md` / `design.md` / `implement.md` 默认每 artifact `64 KiB`；
- 整体注入默认预算 `128 KiB`；
- UTF-8 安全截断，并附带原路径；
- 当下一个完整 block 无法容纳时，不继续内联正文，而输出 `path + size + reason` 的索引行；
- `0` 表示关闭对应限制，负数或非整数回退默认值并告警；
- `task.py validate` 对疑似代码文件和超大 JSONL 引用做非阻塞卫生告警。

固定实现与测试：

- [共享 Python hook](https://github.com/mindfold-ai/Tre&#108;lis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/shared-hooks/inject-subagent-context.py)
- [Pi extension](https://github.com/mindfold-ai/Tre&#108;lis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/pi/extensions/trel%6cis/index.ts.txt)
- [集成测试](https://github.com/mindfold-ai/Tre&#108;lis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/test/scripts/context-injection-limits.integration.test.ts)

### 3. 跟进修复：OpenCode 补齐同一契约

[PR #456](https://github.com/mindfold-ai/Tre&#108;lis/pull/456) / [提交 `bc36a0ed`](https://github.com/mindfold-ai/Tre&#108;lis/commit/bc36a0ed0b857769f92628e4de9b327c97e847c9) 指出第一段修复遗漏了 OpenCode：它仍会完整内联 JSONL 引用和 task artifacts。v0.6.9 最终把同样的阈值、UTF-8 截断、索引降级、配置回退和测试矩阵同步到 OpenCode。

这条跟进是重要设计信号：预算策略如果分别实现在不同入口，极易产生平台漂移。Tenon 的 Dashboard 预览不能复制 CLI 的一套私有计算逻辑，必须复用同一 shared compiler/application service。

## v0.6.9 最终行为

固定配置模板位于 [`packages/cli/src/templates/trel%6cis/config.yaml`](https://github.com/mindfold-ai/Tre&#108;lis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/trel%6cis/config.yaml)：

```yaml
# context_injection:
#   max_file_bytes: 32768
#   max_artifact_bytes: 65536
#   max_total_bytes: 131072
```

该段默认被注释，但代码内建同样的默认值。最终契约在 [platform integration spec](https://github.com/mindfold-ai/Tre&#108;lis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/.trel%6cis/spec/cli/backend/platform-integration.md#context-injection-limits-contract-context_injection) 中固定：

1. 保持输入顺序：JSONL entries → `prd.md` → `design.md` → `implement.md`。
2. 单文件或 artifact 超限时，在完整 UTF-8 code point 边界截断，并输出含原路径的 notice。
3. 下一个 block 无法纳入总预算时，正文降级为索引行，仍保留 path、原始 byte size 和 reason。
4. headers、truncation notice 和 index notice 都参与预算核算。
5. 二进制或无效 UTF-8 永不解码内联，只产生带 path / size / reason 的索引 notice。
6. 缺失或不可读引用沿用既有行为：跳过，不让注入器崩溃。
7. `0` 是显式 unlimited；配置错误时使用安全默认值并告警。

### 一个需要准确表述的实现边界

“`max_total_bytes` 是严格的最终输出硬上限”不成立。固定源码中的 `_budgeted_block` 在完整 block 放不下时，会无条件加入 index notice 的字节数，不再检查该 notice 自身是否仍有空间；后续每个超限输入也继续产生 notice。相应的三文件测试只断言后两个文件变成 index line，没有断言最终输出 `<= max_total_bytes`。

因此，v0.6.9 的准确语义是：`max_total_bytes` 决定何时停止内联正文并降级为索引，不保证大量索引 notice 后的最终 payload 绝对不超过该值。这是对固定源码的推断，不是上游文档明说的保证。

## 与 Tenon 当前能力的差异

Tenon 已有 `context-bundle/v1`：

- `packages/kernel/src/compress/context-bundle.ts` 计算内嵌 `content` 的 UTF-8 bytes，超出 `maxBytes` 时整体 fail-closed；
- `packages/cli/src/commands/handoff.ts` 从 document ledger 选出目标 phase 的必读文档，校验文件存在和 SHA-256 未漂移，再按 `full` / `summary` / `reference` materialize；
- CLI 默认预算为 `120_000` bytes；
- 当前入口是显式 `tenon handoff <change> --bundle --target <phase> --json`，Dashboard 没有同等预检入口。

| 维度 | Tre&#108;lis v0.6.9 | Tenon 当前 | 对本 Change 的含义 |
| --- | --- | --- | --- |
| 输入信任 | JSONL 路径清单与 task artifacts | ledger-bound 文档 + SHA-256 漂移校验 | 预览必须保留 Tenon 的 ledger 与 digest，不降级信任模型 |
| 超预算 | 停止内联正文，降级成索引 notice | 整个 bundle 报错，fail-closed | Dashboard 应预先显示“将失败”，不能悄悄改变 materialization |
| 预算可见性 | 配置和注入后的 notice | CLI JSON 的 `usedBytes/maxBytes` | 在 Dashboard 请求执行前展示文档、mode、bytes 和预算占用 |
| 多入口一致性 | v0.6.9 通过跟进 PR 才补齐 OpenCode | 编译装配当前私有在 CLI | 抽取共享服务，让 CLI 与 server 调同一实现 |
| 完整内容 | 注入器返回正文或索引 | CLI JSON 可含 materialized content | Dashboard API 只需返回 preview metadata，避免把完整文档再次暴露给浏览器 |

## 可映射的用户价值

1. **把运行时失败前移。** 用户在 Dashboard 中选择 consumer phase 和预算后，立即知道 ledger 当前会选中哪些文档、采用 `full` / `summary` / `reference` 哪种模式、预计占用多少 bytes，以及是否会被 Tenon 的硬预算拒绝。
2. **让预算结果可解释。** 每项显示 `kind`、路径、reason、mode、digest 和 materialized byte count；这对应 Tre&#108;lis 降级 notice 中保留 path / size / reason 的价值，但不复制其自动降级策略。
3. **保持 CLI / Dashboard 一致。** 共享编译服务必须同时执行目标 phase 校验、ledger 记录选择、缺文档、缺文件、SHA 漂移、重复路径 reference 化和预算计算；前端只渲染服务端事实。
4. **保持只读、非持久化。** 预览预算是一次性参数，不修改 handoff 默认预算、ledger、Change state 或文档。
5. **明确错误恢复。** 缺文档、stale digest、预算超限分别给稳定错误码与修复提示；Dashboard 提供 retry，而不是用空态掩盖错误。

## 建议

- 保留 Tenon 当前“超预算整体 fail-closed”的语义；本 Change 只增加可见性和预检，不引入 Tre&#108;lis 式自动降级。
- 将 CLI 内现有 ledger-to-bundle 装配抽成共享应用服务，由 CLI 和只读 Dashboard API 共用；不要在 server 再实现一次策略。
- API 成功响应返回 bundle metadata 和逐项 `contentBytes`，不返回完整 `content`；预算失败响应仍返回 `requiredBytes` / `availableBytes` 与输入摘要，便于用户调整。
- Dashboard 默认使用下一 canonical phase 和现有 `120_000` bytes，但允许本次预览覆写；不得把该值写回配置或状态。
- 空态只表示目标 phase 没有必读文档；缺失 ledger record、缺文件和 digest 漂移都必须是错误态。

## 仍需主线决断

1. 预算超限时，API 是返回 `422 + preview summary`，还是 `200 + fitsBudget=false`？前者更贴近 fail-closed，后者更利于统一成功渲染。
2. 逐项 `contentBytes` 应计算 materialized `full/summary` 内容，还是同时返回 source bytes？建议两者都返回并明确命名，避免“压缩后大小”被误解成源文件大小。
3. 默认 target 是当前 phase 的下一 canonical phase，还是要求用户显式选择？建议预选下一 phase，但保留可见 select。
4. 是否允许预览 `open`（其必读集合可能为空）来覆盖真实空态，还是只允许当前 phase 之后的 consumer phase？
5. 错误码是否由共享 service 定义 typed domain errors，再由 server 映射 HTTP；还是只在 server 层解析文本？建议 typed errors，避免中英文文案成为协议。
