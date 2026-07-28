# Trellis 角色化上下文与未发布 v0.7 beta 调研

> 日期：2026-07-28
> 正式基线：`v0.6.9` / `12e279a8af00456b1d0d4e3d0f7f59e7b702202e`
> 未发布研究点：`feat/v0.7-beta` / PR #468 / `5f543960`
> 许可：AGPL-3.0；本报告只提炼抽象设计原则，不复制源码或表达

## 一句话定位

Trellis v0.6.9 通过 `.trellis/spec/`、任务文档、角色化 Skills/Hooks 与 workspace journal 把上下文按角色和任务组织；未发布的 v0.7 beta 进一步研究 path-glob 按需注入、full/ticket/silent 刷新状态、SHA 变化重教和字符预算，但这些实现尚未进入正式版且受 AGPL-3.0 约束。

## 固定版本事实

- 正式 `v0.6.9` 对应提交 [`12e279a8af00456b1d0d4e3d0f7f59e7b702202e`](https://github.com/mindfold-ai/Trellis/commit/12e279a8af00456b1d0d4e3d0f7f59e7b702202e)。
- 正式仓库的项目知识入口是 `.trellis/spec/`，任务上下文位于 `.trellis/tasks/`，个人连续性位于 `.trellis/workspace/`；不同 agent 通过项目级 Skills/配置获得对应角色上下文。
- 未发布研究点是 [`5f543960`](https://github.com/mindfold-ai/Trellis/commit/5f543960)，提交标题直接关联 [PR #468](https://github.com/mindfold-ai/Trellis/pull/468)，包含 52 个文件的大规模 hook/spec-injection 变更，不能当作已发布稳定契约。
- 仓库 [`LICENSE`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/LICENSE) 和 GitHub 仓库元数据均标识 AGPL-3.0。

## v0.6.9 可借鉴的稳定思想

1. 上下文属于明确角色和任务，不把全部知识一次性倾倒给所有消费者。
2. 规范、任务、实现记录与检查记录分开保存；读取顺序由角色职责决定。
3. 项目共享事实与个人 workspace journal 分离，减少不同生命周期的数据互相污染。
4. 对 Tenon 的映射不是复制 Trellis 文件结构，而是让 Host Target Plan DTO 明确 `host.kind`、`operation`、`capabilities` 和有序 `steps`，使 Dashboard 只消费当前目标所需上下文。

## 未发布 v0.7 beta 的研究事实

[`5f543960`](https://github.com/mindfold-ai/Trellis/commit/5f543960) 的提交说明和 diff 固定了以下概念：

- Spec 可声明 path glob，在 Read/Edit/Write 等触发点按路径匹配。
- 注入状态区分首次或内容变化后的 full、窗口内 silent、窗口后的 compact ticket。
- 内容 SHA 变化会重新发送完整上下文，避免旧摘要继续代表新事实。
- 最终审查把预算单位改为字符，默认单 spec 9400、总输出 9500，以适配平台约 10,000 字符上限。
- 该提交还包含大量状态身份、并发、截断和恶意路径修复，说明这些机制并非可直接照搬的小工具。

这些能力对本轮只有原则性启示：计划 DTO 应稳定、有版本、按目标有界、步骤有序，并在边界层严格校验。Host Plan Center 不需要引入 spec injection、会话 ticket、glob、预算状态机或 Trellis 的任何代码。

## 正式版与 beta 对比

| 维度 | v0.6.9 正式版 | PR #468 / `5f543960` | Tenon 本轮处理 |
| --- | --- | --- | --- |
| 上下文组织 | spec/task/workspace + 角色 Skill | path-glob 按需注入 | 借鉴“按宿主/操作给最小上下文” |
| 新鲜度 | 角色按既定入口读取 | SHA 变化重发 full | DTO 固定 `schema_version`，server/frontend 严格 decoder |
| 状态 | 任务和角色流程 | full/ticket/silent | 不引入；UI 只管理 loading/empty/error/ready |
| 预算 | 正式角色上下文 | 9500 字符总预算 | 不复制；P1 计划集合由 `TENON_HOSTS` 天然有界 |
| 发布/许可 | v0.6.9，AGPL-3.0 | 未发布 beta，AGPL-3.0 | clean-room 只借鉴思想，零源码复制 |

## 对 Host Target Plan Center 的启示与警示

- 启示：一个选择只应该加载该宿主、该操作的计划；catalog 与单计划分开，避免把所有步骤塞进每个目标卡。
- 启示：DTO 必须显式版本化，CLI/server/frontend 都拒绝未知结构，防止旧消费者静默误读。
- 警示：不要把未发布 beta 的复杂状态机引入 P1；loading/empty/error/ready 足够表达 Dashboard 生命周期。
- 警示：AGPL-3.0 与未发布状态共同要求 clean-room 边界：只记录公开概念和独立需求，不复制实现、测试、文案或文件结构。

## 开放问题与保守答案

1. 是否实现 path-glob 计划注入？否，超出 Host Plan Center 范围。
2. 是否实现 full/ticket/silent？否，UI 只管理请求状态。
3. 是否需要 9500 字符预算？P1 不需要；12 个已注册宿主与单目标查询天然有界。
4. 如何防止设计污染？ADR 和 PR 明确固定来源、许可、未发布状态与 clean-room 规则；代码审查确认没有 Trellis 来源片段。
