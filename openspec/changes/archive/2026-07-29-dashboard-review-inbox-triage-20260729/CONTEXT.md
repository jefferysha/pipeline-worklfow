# 术语

- **待复核 / need**：`ProgressRow.state` 为 `gate` 或 `failed`，当前需要用户作出决定的任务。
- **匹配卡**：满足当前 `deckTab` 的任务卡，保持可操作。
- **上下文卡**：不满足当前非 `all` 筛选、仅保留阶段位置的弱化任务卡；不可聚焦、不可操作、
  不进入无障碍树。
- **画布内部滚动**：Workflow 步骤超过可用宽度时，`data-canvas-scroll` 容器承担的局部横向滚动；
  不等于文档或主区域横向溢出。
- **roving tabindex**：同一 tablist 仅当前 tab 进入普通 Tab 顺序，方向键在同组 tab 间移动焦点和选择。
