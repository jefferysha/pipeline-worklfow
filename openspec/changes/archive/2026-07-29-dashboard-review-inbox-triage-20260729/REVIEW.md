# Build 视觉与交互评修记录

Change: `dashboard-review-inbox-triage-20260729`

## 第一轮评估

以 `frontend-design`、`web-design-guidelines` 与 `design-taste-frontend` 对基线实现和
1024–1920px 真实 Dashboard 进行评估。

| 严重度 | 问题 | 用户影响 | 修复 |
| --- | --- | --- | --- |
| MEDIUM | 非匹配卡只降至 30% 透明度，仍可点击、聚焦和被读屏读取 | 视觉筛选与实际操作集合不一致，可能打开错误任务 | 让同一个 `dimmed` 同时驱动透明度、`disabled` 与 `aria-hidden`，并取消禁用态 hover 位移 |
| MEDIUM | 状态 tab 全部进入普通 Tab 顺序且无方向键模型 | 键盘用户需要逐项 Tab，行为不符合 tablist 预期 | 增加 roving `tabIndex` 与 ArrowLeft/Right/Home/End |
| MEDIUM | 选中筛选后只有计数胶囊变化，无匹配/上下文解释 | 零匹配容易被误解为空态或加载 | 增加可见、双语、`aria-live=polite` 的筛选摘要 |

未发现 CRITICAL/HIGH。改动复用既有 token、图标、组件层级与动效边界，没有新增装饰性动画。

## 修复后复评

- 1024×768、1200×870、1440×900、1920×1080 均无 document/main 横向溢出；七阶段画布保留自身横向滚动。
- “等你动手”下只有匹配卡可交互；3 个上下文卡均为 `data-dim=true`、`disabled`、`aria-hidden=true`。
- “运行中”零匹配明确显示“匹配 0 个 · 上下文 4 个”，没有伪装为空态。
- 键盘 `ArrowRight` 从“等你动手”移动到“运行中”，焦点、选中态与 roving `tabIndex` 同步。
- 匹配卡仍可打开详情，Escape 关闭后焦点回到原卡。
- Light、Dark、System 与 `prefers-reduced-motion: reduce` 下反馈保持可读；reduce 下任务卡 `transform: none`。
- 禁用卡视觉仍保留 Workflow 阶段语境，但交互层级明确；筛选摘要与 tablist 形成紧凑、克制的分诊层。

复评结论：CRITICAL/HIGH/MEDIUM 均为 0；LOW 无待处理项。

## Verify 返工与第二轮 Build 复评

首轮 Verify 的 Codex CLI 轨发现一个 MEDIUM：workflow 下拉会缩小画布范围，但新增摘要继续使用
全项目 `deckCounts/rowCount`，组合筛选时可能播报当前画布中不存在的任务。

- 红：新增 `release-train + 运行中` 组合测试，期望“匹配 0 个 · 上下文 1 个”，实际为
  “匹配 1 个 · 上下文 5 个”。
- 绿：页签徽标继续使用全项目 `deckCounts`；新增 `filterSummary` 单独从 `effectiveWf` 范围计算，
  保持既有徽标契约并让 live summary 与当前画布一致。
- 复评：组合测试通过；三份 Progress 定向测试 84/84、前端全量 1205/1205、全仓 build、
  comments、architecture、repository hygiene 与 `git diff --check` 全部通过。

第二轮 Build 复评结论：CRITICAL/HIGH/MEDIUM 均为 0。仍保留首轮 Reviewer 提出的 LOW：
禁用上下文卡会以低透明度显示“打开 / Open”，但卡片不可点击、不可聚焦、不进入无障碍树且无
hover 位移；它不影响当前分诊正确性，留给后续连贯文案批次评估。
