# 评审记录

## 评审范围

- 中文优先的开源 README 与 VitePress 文档站；
- Document Presentation Registry、默认 OpenSpec 骨架、项目规格骨架；
- Change 固定文档语言、显式英文兼容和历史文件不改写；
- Loop 受管镜像、phase handoff、Dashboard 语言边界；
- GitHub Pages、内容白名单、双语对应、搜索语料、子路径和发行包检查。

## Build 自审

实现遵守现有包边界：模板 schema、catalog 和纯 renderer 位于 kernel；CLI 只负责参数、路径与写盘编排；
Dashboard 只展示语言边界说明；文档站是独立静态 workspace，不依赖本地 API、token 或 agent session。
状态仍通过现有 repository 和 codec 持久化，没有新增旁路状态文件，也没有修改 simple/custom 的文档契约。

Build 期间发现最初规格只覆盖十类治理文档，无法满足“插件生成的所有人读 Markdown 默认中文”的要求。
已通过 `requirements-changed` 正式返回 Spec，补充项目规格骨架、Loop 受管镜像和 handoff，再经 Spec
证据与 review 后重新进入 Build，没有在 Build 阶段伪造旧文档摘要。

## 浏览器验收

使用真实 Chromium 验收最终站点结构：

- 30 个公开路由在桌面与 375 像素移动视口均返回成功；
- 每页只有一个 H1，无文档级水平溢出、空链接、缺图或 console error；
- 中文根 locale 与 `/en/` 英文 locale 的导航、侧栏、`html lang` 和相同 slug 切换正确；
- 本地搜索可以命中文档语言、安装、更新、review gate、`verify-fail`、默认端口和配置键；
- 键盘首个 Tab 到达跳过导航，Enter 将焦点送到主内容；
- 浅色与深色主题的 axe 自动检查均为零 violation；
- 本地预览观测到 LCP 92 ms、CLS 0、INP 24 ms；这些只代表本机静态预览，不外推为公网 SLA。

验收中发现并修复了四个问题：logo 重复拼接 base 导致 404、首页重复 H1、英文 locale 继承中文导航、
浅色与深色主题对比度不足。修复后重新验收通过。

## 自动化验证

- kernel、CLI 和 Dashboard 全量测试通过；
- setup、update、托管 runtime、bundle、hook、adapter、skill inventory 和 oracle 通过；
- 文档同步、孤儿页、双语对应、内部链接、公开内容白名单、30 路由、固定搜索语料、
  `/pipeline-worklfow/` base 与静态 artifact 审计通过；
- 真实临时项目验证默认 Change、十类治理结构、项目规格骨架和 handoff 均使用中文；
  显式 `--document-locale en` 仍生成结构等价英文。

## 剩余边界

- Dashboard UI 语言与治理文档语言是两个独立 authority，不做隐式同步；
- setup/update 不翻译已有 Change 或 Archive，避免破坏 digest、read receipt 和历史字节；
- GitHub Pages 公网地址只有在 `main` 推送后的 Actions 部署成功并可访问时才可宣称上线。

## 第二轮独立评审

修复后基线的机器门禁全部通过，但四条独立 Verify 轨道继续发现真实缺口，因此结论为 **FAIL**：

- OpenSpec delta/main 结构不能通过官方严格校验和 apply；
- Registry、catalog、renderer 与 schema 尚未形成单一结构真相源；
- 两个 scaffold 入口仍有仓库边界与 symlink 风险；
- artifact audit、breadcrumb、中文可访问标签、对应语言 fragment 和首页 landmark 不完整；
- custom workflow label、历史 locale 推断、Loop 历史内容保护和显式英文 Skill 指令仍有漂移。

已通过的部分包括 30/30 路由、中文真实搜索、移动/桌面明暗主题、对比度、键盘焦点、全量测试与所有
现有分发门禁。通过项不能抵消阻断项；完整发现和命令证据见 verification report。

## 第三轮 Build 设计评修复

本轮按 `frontend-design`、`web-design-guidelines` 与 `design-taste-frontend` 对真实 HTTP 预览执行
“评 → 修 → 复评”，没有只做静态代码审查。

第一轮发现：

- **High**：中文首页的可访问名称 MutationObserver 重复写入同一个 H1 属性，形成自触发循环；
  桌面路由可加载，但移动首页会让浏览器主线程持续忙碌。
- **High**：仅在 click capture 中改写语言链接的 DOM `href`，无法覆盖 VitePress router 保存的原始
  fragment；中文锚点会被带到英文页面。
- **Medium**：VitePress 的主导航、移动导航、代码复制和 heading permalink 仍暴露英文可访问名称。
- **Medium**：首页缺少显式 `main` landmark，文档页没有可见 breadcrumb。
- **Medium**：公开内容没有独立发布说明入口，artifact audit 和重复同步检查不足以形成闭集。

修复：

- 只有 H1 可访问名称发生变化时才写属性，消除 MutationObserver 自触发；
- 在交互前持续清理所有跨 locale 链接的 fragment，并保留 click capture 的安全导航兜底；
- 中文 locale 将 VitePress 内建英文 ARIA/title 映射为中文，英文 locale 保持原文；
- 首页使用单一 `main`，文档页加入本地化 breadcrumb；
- 增加中英文发布说明，公开站点扩展为 16 个双语页面、32 个唯一路由；
- 增加重复同步 SHA-256、Pages workflow 结构与构建产物闭集检查。

第二轮真实 Chromium 复评：

- 32 个路由在 1280×800 与 320×844 两种视口各检查一次，共 64 次，全部 HTTP、locale、
  单一 main/H1、breadcrumb、横向溢出与中文 ARIA 检查通过；
- 中文锚点切换英文后 fragment 被清除，本地中文搜索返回结果，键盘首焦点为“跳到正文”；
- 两种视口控制台均无 error/warning，并生成桌面与移动全页截图进行视觉检查；
- 信息层级、按钮、卡片、正文节奏、移动表格滚动和明暗主题保持一致。

复评结论：本轮 UI 与可访问性问题已无 high/critical；剩余样式仅属于可选的审美微调，不阻断 Verify。
