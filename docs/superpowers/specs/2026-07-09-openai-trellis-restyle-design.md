# Dashboard 视觉重塑 · OpenAI 配色 × Trellis 布局（2026-07-09 定稿）

> 本文档**整体取代** `2026-07-09-dashboard-redesign-design.md` 的视觉部分（D1-D7、token 表、动效词汇）。
> 该旧 spec 的 G17/G18 功能语义（分组看板、注册闭环、workflowModel 混合模型）**继续有效**——本轮只换皮+交互深化，不动数据/状态层架构。
> **视觉真相源：`design-demos/v4-openai-trellis.html`**（已过用户双主题验收）。实现与 spec 冲突时以 v4 文件为准。

## 0. 决策链（为什么长这样）

1. 用户否决 iteration-38 交付的「工票车间」语言（白纸双色/全 mono/票根虚线）：「不是 ui 不满意，是功能点的交互不满意，有点太简单了」→ 随后「我想要的是这种风格的 ui」（Trellis 参考图）。
2. impeccable critique 双代理评审 20/40：六视图全是单层列表，38 字段渲染 6 个，5×P0 + 6×P1（快照 `.impeccable/critique/2026-07-09T07-42-21Z__packages-dashboard-app-src.md`）。交互深化内容并入本轮。
3. huashu-design 三版并行（v1 Trellis 忠实/v2 Linear/v3 Stripe）→ 用户拍板「v1 布局 + OpenAI 配色」→ v4 合成 → 修正「主按钮不要全黑」→ **v4 定稿**。
4. OpenAI 2025 品牌事实（已 WebSearch 核实）：Cod Gray×白单色骨架、灰/蓝扩展、蓝色 emotive point 签名、OpenAI Sans（以 system-ui 近似，零外部字体）。

## 1. Token 体系（styles.ts 全量替换的目标值）

### 浅色（默认）
```
--bg:#f7f7f5  --card:#ffffff  --fill:#f2f2ef  --fill-2:#ececea
--border:#e4e4e0  --border-2:#d2d2cc
--text:#0d0d0d  --text-2:#40403c  --text-3:#6a6a62
--accent:#0b6cff  --accent-d:#0a5ce0  --accent-t:#eaf2ff  --accent-b:#c5daff
--green:#1f9d51  --green-d:#187339  --green-t:#e9f6ee  --green-b:#c8e8d2
--red:#d92d20   --red-d:#b42318   --red-t:#fdf0ee   --red-b:#f3cfc9
--ink:#0d0d0d   --ink-fg:#ffffff  --ink-hover:#2e2e2c        （近黑：brand 块/深色元素，不再用于主按钮）
--btn-bg:#0b6cff --btn-fg:#ffffff --btn-hover:#0a5ce0        （主按钮=签名蓝实底，用户定稿）
--code-bg:#f6f6f4 --code-border:#e4e4e0
--shadow:0 1px 2px rgba(0,0,0,.04)  --shadow-2:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04)
--ring:rgba(11,108,255,.13)
--radius:12px --radius-sm:8px（沿用现值可微调对齐 v4）
```

### 深色（`@media prefers-color-scheme: dark` + `[data-theme]` 双向覆盖，机制沿用现状）
```
--bg:#0d0d0d --card:#171717 --fill:#1e1e1d --fill-2:#262624
--border:#262626 --border-2:#3a3a37
--text:#f2f2f0 --text-2:#c9c9c4 --text-3:#94948d
--accent:#4d94ff --accent-d:#7fb2ff --accent-t:rgba(77,148,255,.13) --accent-b:rgba(77,148,255,.38)
--green:#3fb950 --green-d:#55c368 --green-t:rgba(63,185,80,.13) --green-b:rgba(63,185,80,.35)
--red:#e5534b --red-d:#f2867e --red-t:rgba(229,83,75,.14) --red-b:rgba(229,83,75,.40)
--ink:#f2f2f2 --ink-fg:#0d0d0d --ink-hover:#d8d8d5
--btn-bg:#2b7fff --btn-fg:#ffffff --btn-hover:#4d94ff
--code-bg:#111110 --code-border:#2a2a28
```

### 色彩语义纪律
- **蓝 accent**：激活/选中（阶段卡、tab、选中行蓝 tint+蓝描边）、链接、聚焦环、关键计数、日志/连接线等结构性强调。
- **主按钮**：蓝实底白字（保存/放行/注册等每屏 ≤1 个）；次按钮 ghost（透明底+border）；文字钮蓝字。
- **绿**：仅语义（pass/已加载/成功 toast）小面积 tint 徽章，不再承担任何结构性角色。
- **红**：仅语义（fail/复核门/回退/预警/销毁）。「等你复核」徽章 = `--red-t` 底 `--red-d` 字（退役朱红实底）。回退/删除按钮 = ghost 红字红边。
- **紫全线退役**；track 徽章中性灰（fill 底 text-2 字）。
- mono 仅用于：change 名、step id、路径、sha、JSON、字段名。其余一律 sans。

## 2. 组件语言（v4 已呈现的词汇，全 dashboard 统一）

| 组件 | 规格 |
|---|---|
| 卡片区块 | `--card` 底 + `--border` 1px + radius 12 + `--shadow`；区块头=图标+标题+右侧 meta/动作 |
| 状态 chips | 圆角 6，`*-t` 底 `*-d` 字，可带 ✓/✕ 小图标（内联 SVG，禁 emoji） |
| 证据 chips | mono 11px，边框式（`--border`），语义值染色；路径 chip 带 ⧉ 拷贝钮 |
| 编号阶段卡 | 圆数字标（fill 底），激活=蓝描边+`--accent-t` 底+右上蓝 ✓ 角标；卡间虚线连接线（蓝），复核门段红+菱形节点 |
| 表单输入 | `--fill` 底、无边框、focus 蓝 ring（`--ring` 3px）；**所有文本输入必须有可见焦点样式**（评审 P1-9） |
| 对话框 | 统一 `<Dialog>` 组件：Esc 关、autoFocus 首控件、焦点困笼、关闭归位、backdrop 点击关（评审 P0-5/P1-9） |
| 快捷转换钮 | 前进=ghost 蓝字蓝边小钮「→ step」；回退=ghost 红字红边「↩ step」 |
| toast | 底部居中，成功中性深底白字/错误红底；error 用 `role="alert"` |
| 图标 | 统一内联 SVG 线条图标（v4 的 `<use href="#i-*">` sprite 模式），1.5px 描边 |

动效纪律沿用（150-250ms、只传状态、prefers-reduced-motion 全豁免），GSAP 既有 motion.ts 词汇保留但配色跟随新 token（盖章→蓝勾角标语言）。

## 3. 布局骨架（v1/Trellis 信息架构）

- **顶栏**：brand 块（近黑）+ 一级导航（收件箱[徽标数]/看板/工作台/设置）+ 右侧项目切换器（含「◈ 全部项目」聚合项，G19③ 收编）+ 主题切换。
- **视图容器**：面包屑小字 + 大标题行（+右侧状态 chips 与主/次按钮）→ 内容区。
- **收件箱/工作台类视图**：主列 + 右侧摘要栏（sticky）双列；窄屏右栏下沉。
- 右栏摘要卡词汇：图标行+右侧计数（蓝）、文件/产物列表+状态徽章、代码预览块+拷贝钮、项目在制清单。

## 4. 逐视图定义（含评审 P0/P1 交互深化的合并）

### 4.1 收件箱（默认视图）
- 工票行：名字/track/wf/相位/「等你复核」红 tint 徽章/项目·时间（>24h 追加「已等 N 天」红 tint chip）/行尾快捷钮。
- **行内证据 chips 行**（P0-1）：按当前 gate 相关字段渲染非空值（verify 门=verify_result/agent_review/codex_review/report/build_sha；explore/spec 门=design_doc/plan）；语义染色；路径可拷贝。
- **行可点开「change 详情」卡**（P0-1/P0-2 共用，v4 形态=主列内详情卡片区，非抽屉）：「为什么在等你」一句话 + 证据格 + 产物 + 语境 + 最近历史 3 行（`GET history` 若无端点则先渲染 snapshot 可得字段，历史尾巴登记为后续项）+ 底部「↩ 打回」ghost 红 +「→ 放行」蓝实底。
- 选中行=蓝 tint+蓝描边。键盘：j/k 移动、Enter 开详情、Esc 关（评审 P2-12 首期只做这三键）。
- 聚合语境（③）：「全部项目」时不过滤 root，行尾已带项目名。

### 4.2 看板
- 分组机制/拖拽/回退确认沿用；组头与列头换新 token；卡片=card 词汇，gate 卡红描边。
- **卡片可点开同一详情卡**（P0-2，渲染于看板下方或滚动至详情区；ARIA role=button 兑现）。
- **拖拽前示**（P1-11）：dragStart 按 legalTargets 高亮合法列（蓝 ring）/非法列降透明；非法 drop shake+toast 一句解释。
- 聚合模式：组键 root:wf，组名「项目 · workflow」前缀（demo B 形态）。
- archive 列：折叠计数点击展开只读名单（④A）。
- 相位显示维持 mono step id（⑥A，v4 已体现）。

### 4.3 workflow 编辑器
- 列表页工票行补：step 数/复核门数/引用该 wf 的 change 数（评审 P2-14）。
- 编辑页顶部=编号阶段卡横排（复核门标记），保留画布（xyflow）作为结构编辑器主体，配色换 token。
- 脏状态守卫（P1-8）：dirty 位（浅比较）→ 标题「未保存」chip、返回确认 Dialog、保存钮 dirty 才实底。
- 保存成功失效缓存已修（0a7204d）。
- 右栏摘要卡：阶段/复核门/skills 计数 + 生成配置预览（JSON+复制）。

### 4.4 AFK 工作台
- 双栏保留；running 卡日志 **2.5s 轮询 + 跟随尾部开关 + 手动刷新钮**（P0-3）；卡带项目徽章、按 currentRoot 语境过滤（聚合时显全部+root 徽章）；详情区补「查看 change →」跳转；挂队改 datalist（snapshot 现成 change 清单）+ 空名禁用态。
- 取消运行中任务走 Dialog 确认（风险对齐，评审 #4 一致性）。

### 4.5 Loop 治理
- 行+展开保留；展开区补：预算条（spent/max+剩余，预警红）、就绪分构成行（✓/✗ 明细）、熔断态解释+「查看预算」入口（P1-6）。
- **升档走 Dialog 确认**（列出就绪分带/预算语境）；降档不确认（低风险）。

### 4.6 设置
- 皮换新 token；穿梭框补真实样式（`.modal/.split` 现无 CSS，评审 P1-10 后半）+ 条目点击即移动；相位轴/矩阵沿用结构。

### 4.7 壳层
- 统一 `<Dialog>` 落地并替换全部 7 处 backdrop（含注册对话框陷阱修复：补取消钮/Esc/焦点管理，P0-5）。
- 项目菜单补「注销当前项目…」（Dialog 确认，P2-13）。
- 断线横幅：SSE onerror → 顶部红 tint 横幅+「重连」钮；「离线（轮询）」文案改真相（P2-13）。
- NewChangeDialog：`<form>`+autoFocus+Enter 提交（P3-16）。

## 5. 非目标（YAGNI 边界，登记不做）
- 撤销/重做、批量操作、看板泳道、归档独立视图/搜索、升降档历史、跨项目合并同名 workflow 列集（语义不可行）、i18n 全量清扫（仅顺手迁移本轮触碰的硬编码文案）、AFK 日志 SSE 化（轮询够用，登记 G 项待评估）。
- change 详情的历史尾巴依赖 history 读端点——若本轮不加端点则详情先不含历史区（登记后续）。

## 6. 验收标准（对齐评审的挑衅性问题 1）
- **用户不离开 dashboard 完成一次有理有据的 verify 放行**：真机脚本走「收件箱见 gate 行 → 读证据 chips → 开详情核对 → 点放行 → 盖确认 → 行消失」全链。
- 双主题截图逐视图核对；键盘 j/k/Enter/Esc 真机可用；注册对话框 Esc 可逃逸。
- 八门+九门全绿；`npm run test:web` 意图迁移后全绿。
