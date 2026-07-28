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

## 第二轮复评（首个 Build baseline）

- 375px 中英文下 HookRows 与旁路词表单均限制在父卡可用宽度，输入与保存按钮纵排，无横向溢出。
- 1440px 桌面下控件保持单行，提示、操作与状态层级不抢 Hook 主列表。
- 无 critical / high / medium 遗留。

## Verify 反馈修复轮

首轮 Verify 的 agent reviewer、Codex review 与 visual review 汇总出 5 个 MEDIUM：

| 严重度 | 问题 | 修复 |
| --- | --- | --- |
| MEDIUM | shell 行扫描会接受嵌套、重复或截断的 `prompt_skip_keyword` | 改为纯 Bash 顶层 canonical 结构解析；异常配置安全回退 `no-tenon` |
| MEDIUM | `/api/hooks` 加载失败仍显示为 loading | UserPromptSubmit 行显示 `role=alert`，其他行保持 `—` |
| MEDIUM | 持久化空值重载后没有明确 disabled 状态 | `promptSkipKeyword === ''` 时始终显示禁用状态 |
| MEDIUM | 切换项目 root 时，旧 root 的迟到保存可覆盖新 root 状态 | 用 root generation 隔离迟到 success / error / finally |
| MEDIUM | 11px 成功状态使用 `text-green`，对比度不足 | 改用 `text-green-d`；实测 `rgb(21, 128, 61)` 对 `rgb(248, 250, 252)` 为 4.79:1 |

修复遵循红绿重构：Dashboard 新增加载错误、初始禁用、迟到成功和迟到失败用例；hooks 新增嵌套、
重复和截断配置用例。红态分别为 4 个与 3 个预期失败，修复后定向用例全绿。

## 第三轮复评（Verify 回退后的 Build）

- 当前服务来自 bfb9 worktree，页面标题为 `Tenon Dashboard`，URL root 精确指向该 worktree。
- 真实浏览器覆盖 Enter 保存、非法值 alert、注入 500、重试成功、禁用保存后重载、恢复默认值。
- 键盘顺序为 switch → textbox → submit；375px 中英文与 1440px 中文均无页面横向溢出。
- 新标签页复核 console 0 error / 0 warning；所有目标 API 请求为 200。
- 无 critical / high / medium 遗留。

## 冻结前全量收敛复审

独立 Reviewer 在首次修复后仍发现 2 个 MEDIUM，并在 Build 内闭环：

| 严重度 | 问题 | 修复 |
| --- | --- | --- |
| MEDIUM | matrix 末项 trailing comma 或 key 后附加 token 仍可能被 Bash 行解析器接受 | 用独立的“逗号后必须还有下一项”状态，并把提取后的 key 重构成完整 canonical 行做精确比较；补两条反例 |
| MEDIUM | Hook 配置 loading 文案硬编码中文 | 增加 `hk_config_loading` 中英文键，英文 pending GET 用例断言 4 个节点均无中文泄漏 |

修复后重新执行 Hook 全量、Dashboard 50 文件 / 971 用例、typecheck、生产 build、架构检查与
Oracle 双跑，均通过。全仓 `npm test` 首轮因资源竞争出现 2 个未改动 CLI 时序失败；精确复跑
相关 2 文件 / 27 用例全部通过，波动将在最终 Verify 报告中保留。Reviewer 重新覆盖完整 diff，
结论为无 critical / high / medium。

结论：SHIP。视觉 baseline 不存在，因此像素回归项为 INCONCLUSIVE；功能、响应式、键盘、错误恢复与
WCAG AA 对比度验收通过。
