# Prompt Routing Bypass UI 评修记录

## 第一轮：frontend-design / web-design-guidelines / design-taste-frontend

运行目标：当前 worktree 构建的 `Tenon Dashboard`，Workbench → default workflow →
UserPromptSubmit。

### 问题清单

| 严重度 | 问题 | 用户影响 | 处置 |
| --- | --- | --- | --- |
| MEDIUM | 375px 窄屏英文文案使 HookRows 按内容宽度撑到视口外 | 英文用户需要横向滚动才能完整看到保存按钮 | 在移动断点令 HookRows `w-full`，并将开关/说明纵排以使用父卡可用宽度 |
| LOW | 首次构建有 Vite 单 chunk 大于 500kB 警告 | 本切片未新增重依赖，首屏功能可用；属于既有 bundle 优化项 | 记录，不扩大本 Change |

第一轮已验证：

- 标题为 `Tenon Dashboard`，URL 精确绑定当前 bfb9 worktree 项目根。
- 默认值、Enter 保存、非法输入 alert、保存失败保留草稿、重试成功、关闭后空值保存均真实可操作。
- switch → textbox → submit button 的 Tab 顺序正确；label/role/status/alert 可由 accessibility tree 读取。
- 中文 1200px 与 375px 状态层级清楚；console 0 error / 0 warning，真实 Hook API 请求 200。

## 第二轮复评

- 375px 中英文下 HookRows 与旁路词表单均限制在父卡可用宽度，输入与保存按钮纵排，无横向溢出。
- 1440px 桌面下控件保持单行，提示、操作与状态层级不抢 Hook 主列表。
- 无 critical / high / medium 遗留。

结论：SHIP。视觉 baseline 不存在，因此像素回归项为 INCONCLUSIVE；功能、响应式、键盘与错误恢复验收通过。
