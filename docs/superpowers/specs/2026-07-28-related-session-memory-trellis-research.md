# Tenon `related-session-memory`：Trellis 一手来源调研

> 日期：2026-07-28
> 范围：仅调研 `mindfold-ai/Trellis`；不复制其代码，不改变 Tenon 运行时
> 用途：为 Change `related-session-memory` 的 Explore / Spec 提供上游设计依据

## 1. 上游固定

| 项目 | 固定结果 | 一手来源 |
| --- | --- | --- |
| 仓库 | `mindfold-ai/Trellis`，默认分支 `main` | [GitHub repository API](https://api.github.com/repos/mindfold-ai/Trellis) |
| 默认分支提交 | `12e279a8af00456b1d0d4e3d0f7f59e7b702202e` | [固定 commit](https://github.com/mindfold-ai/Trellis/commit/12e279a8af00456b1d0d4e3d0f7f59e7b702202e) |
| 最新稳定 GitHub Release | `GET /repos/mindfold-ai/Trellis/releases/latest` 返回 HTTP 404，仓库没有可用的 latest Release | [GitHub Releases API](https://api.github.com/repos/mindfold-ai/Trellis/releases/latest) |
| 回退版本 | 最新语义版本 tag `v0.6.9`，解析到同一提交 `12e279a8…202e` | [tag `v0.6.9`](https://github.com/mindfold-ai/Trellis/tree/v0.6.9) |

因此本文所有源码判断都固定在同一个快照：`main@12e279a8` / `v0.6.9@12e279a8`。
GitHub Release 404 与 tag 回退是本轮实际查询结果，不把 tag 误称为 GitHub Release。

## 2. 核心结论

Trellis 的“项目记忆”不是一个存储桶，而是两层用途和共享边界不同的能力：

1. **刻意写入的项目工作日志**：`.trellis/workspace/<developer>/journal-N.md`
   保存跨 session 的完成/未完成工作摘要；当前 task 的需求、设计、研究和状态留在
   `.trellis/tasks/`，长期规范再提升到 `.trellis/spec/`。Trellis 明确要求恢复任务时先读
   task，再把 workspace 当背景，而不是把日志当唯一真相。
   [workspace memory 架构](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/common/bundled-skills/trellis-meta/references/local-architecture/workspace-memory.md#L33-L71)
2. **只读的原始会话回忆**：`trellis mem` 按需读取宿主在用户机器上的持久化会话，
   支持 list/search/context/extract、项目/日期/宿主过滤、上下文窗口预算和任务阶段切片；
   它不自动把原始对话写回 workspace、task 或 spec。
   [session-insight skill](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/common/bundled-skills/trellis-session-insight/SKILL.md#L6-L48)

这一区分对 Tenon 很重要：`related-session-memory` 应是第二层的**显式、只读、项目受限检索入口**，
而不是自动生成或提交一份新的 Change memory，也不应把原始对话提升成规范事实。

## 3. Workspace journal / project memory

- README 把 journals 定义为跨 session 的 project memory；结束工作时记录摘要，后续 session
  可据此恢复背景。[README](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/README.md#L39-L47)
- 日志以 developer 目录隔离，单文件默认约 2,000 行后轮转；identity 文件
  `.trellis/.developer` 是本机且被 gitignore。
  [workspace memory](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/common/bundled-skills/trellis-meta/references/local-architecture/workspace-memory.md#L16-L46)
- “按开发者隔离”是冲突边界，不是保密边界。journal/index 默认可被 `add_session.py`
  写入并按配置自动提交；Trellis 只把 developer pointer 和 runtime pointer 忽略。
  [add_session.py](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/.trellis/scripts/add_session.py#L437-L506)
  [`.trellis/.gitignore`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/.trellis/.gitignore#L1-L19)
- append-only journals 使用 `merge=union` 减少并行 session/worktree 冲突，但 index 不使用该规则，
  因为它会整体重建。[gitattributes template](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/trellis/gitattributes.txt#L1-L9)
- Issue #303 记录过自动提交误带其他并行 task 的真实故障；当前实现改成只 stage 当前 developer
  journal/index 和唯一当前 task，无法唯一确定 task 时不 stage 任一 task。
  [Issue #303](https://github.com/mindfold-ai/Trellis/issues/303)

**对 Tenon 的映射：** Dashboard 搜索结果不应写入 Change、journal、spec 或 git；如未来支持
“保存为笔记”，必须是另一个显式动作和独立契约，不能成为查询副作用。

## 4. Task context 与相关会话

Trellis 采用三种互补关联：

- `.trellis/tasks/<task>/` 保存 PRD、设计、研究、状态，以及分别供 implement/check 使用的
  JSONL context 清单；清单需要引用实际存在的文件，并对过大注入给出警告。
  [task context](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/.trellis/scripts/common/task_context.py#L10-L15)
  [validation](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/.trellis/scripts/common/task_context.py#L173-L252)
- `trellis mem` 默认按当前 cwd 限定项目，只有显式 `--global` 才跨项目；支持日期、平台、数量
  上限。[mem filter](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/commands/mem.ts#L68-L104)
- context 不是无界 dump：默认返回 3 个命中 turn、前后各 1 个 turn，总字符预算 6,000；
  extract 可按 `task.py create` / `task.py start` 边界切分 brainstorm 与 implement。
  [context/extract contract](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/commands/mem.ts#L315-L348)
  [CLI help](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/commands/mem.ts#L482-L518)

Trellis 的 skill 还明确规定：当前 turn、任务文档、git 或源码已经能回答时，不应额外搜索历史；
sub-agent 已收到精选上下文时也不再叠加 mem。
[使用边界](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/common/bundled-skills/trellis-session-insight/SKILL.md#L18-L36)

**对 Tenon 的映射：**

- 搜索必须绑定当前已注册项目 root，Dashboard 不暴露等价于 `--global` 的入口。
- 查询由用户提交触发；空查询不扫描，切换 Change/项目应清除结果。
- API 返回有限结果与有限摘要，保留 session id、宿主、时间、相关性和必要上下文；不返回宿主
  原始文件路径。
- Change 标题/描述可用于建议初始关键词，但不应在打开详情时自动发送查询。
- 命中内容是历史讨论证据，不是 canonical Change state、OpenSpec 或 review receipt。

## 5. 跨平台支持：产品覆盖不等于 memory 覆盖

固定源码的 `AITool` registry 有 21 个配置项；README 的“20 platforms”和在线文档的“17
platforms”存在发布节奏差异，因此 Tenon 不应从营销数字推导会话读取能力。
[源码 registry](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/types/ai-tools.ts#L8-L31)
[官方多平台文档](https://docs.trytrellis.app/advanced/multi-platform)

在 `v0.6.9` 的 memory CLI 中：

| 宿主 | 本地来源 | 固定快照状态 |
| --- | --- | --- |
| Claude Code | `~/.claude/projects/` JSONL | 可 list/search/context/extract |
| Codex | `~/.codex/sessions/` JSONL | 可 list/search/context/extract |
| Pi Agent | 默认或 settings/env 指定的 session root | 可用；项目本地 `sessionDir` 需用当前 cwd/`--cwd` 发现 |
| ZCode | `~/.zcode/cli/db/db.sqlite` | 通过无运行时依赖、只读 SQLite reader 可用 |
| OpenCode 1.2+ | `~/.local/share/opencode/opencode.db` | 当前 adapter 明确降级为空，并由 CLI 显示 unavailable |

来源：
[mem 支持与限制](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/common/bundled-skills/trellis-session-insight/SKILL.md#L12-L17)、
[OpenCode adapter](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/core/src/mem/adapters/opencode.ts#L1-L33)、
[ZCode PR #411](https://github.com/mindfold-ai/Trellis/pull/411)、
[Pi project-local sessions PR #419](https://github.com/mindfold-ai/Trellis/pull/419)。

Windows 的 cwd 归一化曾导致项目内结果错误为空，Issue #300 是直接证据；当前源码对 scoped
lookup 保留 fallback scan 后再执行项目比较。Tenon 应把 Windows 路径、大小写、分隔符和
worktree/root 归属列入契约测试，而不能只覆盖 macOS。
[Issue #300](https://github.com/mindfold-ai/Trellis/issues/300)

## 6. 隐私与共享边界

1. `trellis mem` 是本地、只读、按需能力；官方 skill 明确声明不上传、不远程同步、不修改宿主
   会话存储。[read-only boundary](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/common/bundled-skills/trellis-session-insight/SKILL.md#L77-L81)
2. 默认项目 scope 是隐私边界的一部分；只有显式 `--global` 才读取其他项目。
3. workspace journal 与 task/spec 是 repo artifact，可能进入 git/PR；原始宿主对话是用户目录中的
   本地数据。两者不能因都叫 memory 而互换。
4. 原始会话仍可能含 prompt、错误输出、路径或其他敏感文本。“本地”不等于“可完整展示”。
   Tenon server 应仅返回受预算约束的必要片段，Dashboard 不显示源文件绝对路径，也不把响应写入
   telemetry、Change history 或浏览器持久存储。
5. ZCode 的 reader 明确无写能力；遇到不稳定 WAL snapshot 或结构损坏时失败/降级，而不是读取
   不一致快照。[read-only SQLite boundary](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/core/src/mem/internal/sqlite-readonly.ts#L1-L27)

## 7. 建议进入 Tenon Spec 的差异映射

| Trellis 证据 | Tenon `related-session-memory` 取舍 |
| --- | --- |
| cwd 默认 scope，跨项目需显式 `--global` | API 只接受已注册 project id/root；本功能不提供 global |
| search → context → extract 分层，context 有字符预算 | 首版只做 bounded search results；不返回无界完整对话 |
| task、workspace、spec 三类持久信息分层 | 结果只供阅读，不自动写入 Change/OpenSpec/ledger |
| mem 的宿主支持少于整体平台支持 | API 返回实际 provider availability；OpenCode 等不可用是可解释状态 |
| 本地只读，不 push/sync | server 仅在显式请求时读取；不新增远端、索引服务或写回 |
| Windows cwd 与并行 task 曾出现真实边界缺陷 | 测试覆盖路径归一化、worktree、并行 Change 与项目隔离 |
| 历史对话是 raw material，不是 deliverable | UI 文案标明“历史会话片段”；不把命中表述成已批准决策 |

## 8. 开放问题

1. 首版结果应仅返回 user turn，还是同时返回 assistant turn；后者相关性更强，但敏感面更大。
2. 每次查询的 session 上限、每个摘要字符上限和总响应预算应固定为多少。
3. provider unavailable、无权限/不可读、无结果应是三个不同的 API/UI 状态还是统一空态。
4. worktree cwd 应归并到 canonical project root，还是只匹配同一物理 worktree。
5. 是否允许用户从命中结果继续请求更大上下文；若允许，需要独立 endpoint、二次显式动作和更严格预算。

## 9. 一手来源索引

- [Trellis pinned source `12e279a8`](https://github.com/mindfold-ai/Trellis/tree/12e279a8af00456b1d0d4e3d0f7f59e7b702202e)
- [Trellis README at pinned source](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/README.md)
- [Official multi-platform documentation](https://docs.trytrellis.app/advanced/multi-platform)
- [Issue #300: Windows project-scoped mem lookup](https://github.com/mindfold-ai/Trellis/issues/300)
- [Issue #303: parallel task journal commit contamination](https://github.com/mindfold-ai/Trellis/issues/303)
- [PR #411: ZCode hooks and mem reader](https://github.com/mindfold-ai/Trellis/pull/411)
- [PR #419: project-local Pi session directories](https://github.com/mindfold-ai/Trellis/pull/419)
- [PR #421: synchronized Pi memory guidance](https://github.com/mindfold-ai/Trellis/pull/421)
