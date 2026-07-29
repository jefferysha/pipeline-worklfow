# Trellis 角色化上下文与未发布 v0.7 beta 调研

> 日期：2026-07-28
> 正式基线：`v0.6.9` / `12e279a8af00456b1d0d4e3d0f7f59e7b702202e`
> 未发布研究点：`feat/v0.7-beta` / PR #468 / `5f543960`
> 许可：AGPL-3.0
> 证据形式：只保留固定 URL、SHA 和独立事实摘要，不收录上游源码、测试、文案或文件结构

## 结论

Trellis v0.6.9 的稳定启示是按角色、任务和生命周期组织上下文，而不是向所有消费者一次性提供全部材料。
未发布的 v0.7 beta 进一步研究按路径选择、内容新鲜度、刷新状态和字符预算。

Tenon 本轮只借鉴“按目标提供最小、版本化上下文”这一抽象原则：Dashboard 先读取 catalog，再只请求当前
host + operation 的 plan。P1 不引入上游的 glob、注入、ticket、预算或会话状态机。

## 固定一手证据

- 正式版本提交：
  [`12e279a8af00456b1d0d4e3d0f7f59e7b702202e`](https://github.com/mindfold-ai/Trellis/commit/12e279a8af00456b1d0d4e3d0f7f59e7b702202e)
- 未发布研究提交：
  [`5f543960`](https://github.com/mindfold-ai/Trellis/commit/5f543960)
- 未发布 PR：
  [`mindfold-ai/Trellis#468`](https://github.com/mindfold-ai/Trellis/pull/468)
- 正式提交许可证：
  [`LICENSE@12e279a8`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/LICENSE)

## 可确认事实

### v0.6.9 正式版

- 正式 `main` 与 v0.6.9 固定在 `12e279a8`。
- 项目规范、任务材料和个人 workspace 记录采用不同生命周期。
- 不同 agent 通过角色化入口读取对应职责所需的上下文。

### PR #468 / `5f543960`

- 该分支未进入正式发布，不能作为稳定兼容契约。
- 研究点包括 path-glob 选择、full/ticket/silent 刷新状态、内容 SHA 变化后的重新发送，以及字符预算。
- 最终预算口径包含约 9500 字符的总输出上限。
- 变更还处理状态身份、并发、截断和恶意路径，说明它是复杂治理机制，而非可直接移植的小工具。

## 正式版与 beta 差异矩阵

| 维度 | v0.6.9 正式版 | PR #468 / `5f543960` | Tenon P1 |
| --- | --- | --- | --- |
| 上下文组织 | 角色、spec、task、workspace 分工 | 增加 path-glob 按需选择 | catalog → 单 host/operation plan |
| 新鲜度 | 由角色入口按流程读取 | SHA 变化触发完整刷新 | 固定 `schema_version` + 严格 decoder |
| 状态 | 任务与角色流程 | full/ticket/silent | 仅 loading/empty/error/ready |
| 预算 | 正式角色上下文 | 约 9500 字符总预算 | 12 个目标且单计划请求，天然有界 |
| 发布与许可 | v0.6.9，AGPL-3.0 | 未发布，AGPL-3.0 | clean-room 只借鉴抽象思想 |

## 选择理由

1. **采用按目标加载**：选择 host 和 operation 后只读取该计划，避免把全部宿主步骤塞进每张卡。
2. **采用版本与新鲜度边界**：CLI、server、frontend 对同一 `host-target-plan/v1` 做校验，未知结构失败关闭。
3. **不采用复杂注入状态机**：本轮是只读计划 UI，请求生命周期已可由四类页面状态完整表达。
4. **不采用字符预算机制**：目标集合固定有界，单目标计划规模为常数，不需要引入额外持久化状态。

## 许可边界

- 正式版和未发布分支均受 AGPL-3.0 约束。
- 本 Change 不复制任何 Trellis 源码、测试、文案、状态机或文件结构。
- 固定 URL/SHA 只用于证明研究范围与发布状态；Tenon 的 DTO、UI 状态、测试和命名均独立设计。
- 若未来需要 path-aware context，应从 Tenon 自身需求重新规格化，而不能从该未发布分支移植实现。

## 对 P1 的最终映射

- catalog 与单计划分离。
- 每次只请求一个已注册宿主和一个操作。
- DTO 显式版本化并保持有界。
- UI 只处理读取生命周期，不维护注入或会话预算状态。
- AGPL 实现细节全部留在范围外。
