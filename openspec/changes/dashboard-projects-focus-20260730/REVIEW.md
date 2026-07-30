# Projects 桌面聚焦 UI 评修记录

## 评审范围

- 运行目标：`Tenon Dashboard`，`http://127.0.0.1:18831/?view=projects`
- 身份：`/Users/a1234/.codex/worktrees/b632/pipeline-worklfow`；
  Change `dashboard-projects-focus-20260730` 在 Progress 详情中显示为 Build。
- 规范：`frontend-design`、`web-design-guidelines`、`design-taste-frontend`
- 桌面视口：1024×768、1200×870、1440×900、1920×1080；不含手机端。

## 第一轮发现与修复

| 严重度 | 发现 | 用户影响 | 修复 |
| --- | --- | --- | --- |
| MEDIUM | PageHeader 底线与聚焦工具栏上边线形成相邻双分隔线 | 搜索控制与页面标题之间出现无意义空带，削弱层级 | 工具栏只保留下边线，页面头与控制区由单一分隔关系组织 |
| MEDIUM | `type=search` 的浏览器原生清除图标与 Lucide 清除按钮同时显示 | 同一动作出现两个 X，键鼠用户无法判断差异 | 改为原生 text input + `role=searchbox`，保留唯一、具名的清除按钮 |
| LOW | 零结果时工具栏与空态同时出现“清除条件” | 同一视区重复主动作 | 零结果时只保留空态主按钮；有结果时工具栏保留快捷清除 |

## 第二轮复评

- 信息层级：搜索、状态 tabs、当前结果和项目列表按任务顺序排列；工具栏不覆盖 PageHeader 或项目身份。
- 视觉系统：只使用既有 card/fill/border/accent/text/button token 与 Lucide；无新增品牌色、渐变或装饰动画。
- 状态：成功结果、零结果、不可达只读、加载、离线与恢复均有文字和语义 role。
- 键盘：searchbox、唯一清除按钮和 roving tabs 可达；ArrowLeft/Right/Home/End 同步选中与焦点；
  Escape 只清查询；清除全部条件后焦点返回 searchbox。
- 主题与布局：System/Light/Dark 角色一致；四档电脑端 `scrollWidth === clientWidth`，
  搜索与 tabs 同行且项目身份、相位和健康摘要未被挤压。
- 动效：筛选不改变完整 rows 指纹，不重播集合级 GSAP；reduced-motion 测试确认直接 `gsap.set`
  终态，未调用 `fromTo`。

复评结论：无剩余 CRITICAL、HIGH 或 MEDIUM 问题。LOW 重复动作已一并消除。
