# 设计：Dashboard Progress 待复核桌面分诊

## 初始假设

- 独立 Inbox 已退役；Progress 是唯一在制操作面，不恢复第二套列表。
- `deckMatch` 继续拥有唯一分类规则；视图只投影匹配与上下文状态。
- 非匹配卡保留位置但必须 `disabled`、`aria-hidden=true`，不能打开抽屉或进入 Tab 顺序。
- 状态 tablist 使用 roving tabindex、Arrow/Home/End，并显示 polite 筛选摘要。
- 动效继续复用现有 GSAP 墨线，reduced-motion 直接落终态；不增加循环或装饰动画。

## 风险

- `disabled` 若不与 `dimmed` 同源，视觉与交互会再次漂移。
- `aria-hidden` 只能用于已禁用、不可聚焦的上下文按钮，否则会制造隐藏焦点。
- 局部画布横向滚动必须保留，但文档和主区域不得产生横向溢出。

## 待验证问题

- 已回答：真实基线在四个桌面宽度均无文档级溢出，待复核卡均在首屏。
- 已回答：不匹配卡目前只有透明度变化，仍可聚焦、可点击且进入无障碍树。
- 已回答：保持 `all` 默认，不因有待复核任务自动改变用户当前工作面。
- Spec 需明确 loading/error/empty/filtered-zero 与中英文验证矩阵。
