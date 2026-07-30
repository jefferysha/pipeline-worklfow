# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Projects 电脑端检索与状态聚焦

Projects MUST 在 1024–1920px 电脑端提供按项目 basename 或完整 root 的本地检索，以及
`all`、`attention`、`running`、`unreachable` 四种状态聚焦。状态 badge MUST 基于完整项目集合，
结果摘要 MUST 基于查询与状态共同筛选后的集合，并以可访问 live status 明确显示当前结果数与总数。

#### Scenario: 检索同名 worktree

- **WHEN** 用户输入项目 basename 或完整 root 的任意大小写片段，且多个 worktree 具有相同 basename
- **THEN** Projects 使用去除首尾空白且不区分大小写的 basename/root 匹配
- **AND** 每个结果继续显示并暴露完整 root 身份，不会因同名项目复用错误 key、DOM id 或状态

#### Scenario: 状态聚焦与全局计数

- **WHEN** 用户选择 `attention`、`running` 或 `unreachable`
- **THEN** 结果分别满足 `ok && need > 0`、`ok && running > 0` 或 `!ok`
- **AND** 四个 badge 的计数仍来自完整项目集合，不随查询或当前聚焦条件改变
- **AND** live summary 报告当前显示数量与完整项目总数

#### Scenario: 保留默认分区并揭示不可达结果

- **WHEN** 当前状态为 `all` 且查询为空
- **THEN** Projects 保留既有“需要你动手 / 其余 / 读不到”分区和不可达折叠语义
- **WHEN** 查询匹配不可达项目或当前状态为 `unreachable`
- **THEN** 匹配的不可达只读行直接可见并继续提供 `aria-disabled` 语义

#### Scenario: 键盘选择状态

- **WHEN** 焦点位于任一状态 tab 且用户按 ArrowLeft、ArrowRight、Home 或 End
- **THEN** 焦点和选中状态按 roving tab 模型同步移动
- **AND** 每次只有选中 tab 可通过常规 Tab 顺序到达

#### Scenario: 清除查询与零结果恢复

- **WHEN** 搜索框有内容且用户按 Escape
- **THEN** 仅清空查询并保留当前状态 tab
- **WHEN** 查询与状态共同产生零结果且用户执行清除条件
- **THEN** 查询恢复为空、状态恢复为 `all`，焦点回到搜索框
- **AND** 空态以文字说明原因，不只依靠颜色表达

#### Scenario: 高频筛选与 reduced motion

- **WHEN** 用户连续输入查询或切换状态 tab
- **THEN** Projects 只执行当前项目集合的 O(n) 本地派生，不发起网络请求
- **AND** 不按每次查询或状态变化重播 GSAP 列表入场
- **AND** `prefers-reduced-motion: reduce` 下既有集合级动画继续直接呈现终态

#### Scenario: 四档电脑端兼容性

- **WHEN** 用户在 1024×768、1200×870、1440×900 或 1920×1080 查看 Projects
- **THEN** 搜索、状态 tabs、结果摘要、项目身份和恢复操作均可见且可操作
- **AND** 页面没有横向文档溢出
- **AND** 本 Change 不新增手机端布局、触控目标或验收要求
