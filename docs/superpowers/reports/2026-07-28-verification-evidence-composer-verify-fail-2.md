# `verification-evidence-composer` 第二轮 Verify 失败报告

## 结论

- 冻结 commit：`41481abfd7519f7f58bf8bdce3cf3d3586616621`
- 冻结 tree：`e79b76443fc52dab97d5f11b863d3149f9f9743e`
- 基线 / merge-base：`2d103e330f847e003ff5909097d892f5722cca04`
- Track：`frontend`（共享 kernel/server/Dashboard 纵向切片）
- 结论：**FAIL**
- 决策：登记精确 `verify-fail` 并返回 Build。用集成回归先复现嵌套 dialog 的正向
  Tab 泄漏，再修复外层 drawer 对嵌套 modal 的键盘事件处理，重新冻结并重跑四轨。

四条验证轨均针对冻结 commit。独立 reviewer、E2E 与视觉轨复核前后 commit/tree
完全一致，未写入产品工作区或 Tenon state；当前工作树中的治理变化来自正常 Verify
状态、文档证据和 immutable revision 记录。

## OpenSpec 应用演练

隔离副本中执行以下检查，未修改真实主规格：

- `openspec show verification-evidence-composer --json --deltas-only`：读取 5 条增量需求。
- `openspec validate verification-evidence-composer --strict`：通过。
- 隔离 archive/apply：5 条新增需求成功应用；目标主规格
  `verification-evidence-composer` 严格校验通过。
- 真实工作区 `openspec/specs` 前后 digest 相同。

全量 `openspec validate --specs --strict` 仍报告 7 个与本 Change 无关的既有 capability
基线债务；本轮没有把它们计为目标规格失败，也没有把全库规格谎报为绿色。

## 独立 reviewer 轨

独立 reviewer 覆盖 `origin/main...41481ab` 的全部 108 个文件。五条 capability
requirement 的实现、边界、安全与回滚检查没有 Critical、High 或 Medium finding。

存在一个不阻断 correctness 的 Low：两个仅服务 verification composer 的组件位于
`packages/dashboard-app/src/shared/`，而前端规则要求单功能组件优先放在局部功能目录。
返工时一并移入 progress 局部目录，避免把尚未跨域稳定的组件误标为 shared。

## E2E 与真实浏览器轨

真实目标为 `http://127.0.0.1:18974`，标题 `Tenon Dashboard`，API 版本 `1.0.1`。
以下路径通过：

- Verify-only 入口、空态、初始焦点和禁用生成；
- 客户端缺失结果错误，且保留输入；
- 真实 HTTP 400 UTF-8 预算错误与字段路径；
- 400 ms 延迟下 loading、防重复提交和控件禁用；
- 真实网络断开错误、本地化重试提示和输入保留；
- 受保护 API 成功、确定性中文 Markdown 和草稿免责声明；
- 剪贴板成功与失败后的手动复制提示；
- 单次 Escape 只关闭 composer、保留外层 TaskDetail 并归还焦点；
- 未鉴权 POST 返回 `401 Unauthorized`；
- kernel 12/12、server route 4/4、Dashboard API/组件 10/10，
  `typecheck:web` 通过。

唯一产品失败稳定复现两次：

1. 从内层第一个控件按 `Shift+Tab`，可正确回绕到内层最后一个“关闭”按钮；
2. 从该按钮按 `Tab`，焦点越过内层 dialog，进入外层 TaskDetail 的“关闭详情”；
3. 此时 `insideNested=false`，违反规格对 Tab/Shift+Tab 均不得逃逸的要求。

E2E 证据位于 `/private/tmp/verification-evidence-composer-e2e-final`。

## 视觉与可访问性轨

1200px、768px 与 320px 的身份、空/错/加载/成功/复制状态、层次、间距和窄屏横向
溢出均通过；单 Escape 回归也通过。视觉轨独立复现同一个 **Medium** Tab 焦点泄漏，
没有其他 Critical、High、Medium 或 Low finding。

视觉证据位于 `/private/tmp/verification-evidence-composer-visual-final`。

## Codex CLI 轨

Codex CLI 在隔离只读副本审查完整冻结 diff。其执行环境没有可复用依赖，并因本机代理
沙箱 `EPERM 127.0.0.1:7897` 无法按需访问 npm registry；该环境限制不归类为产品失败，
也不覆盖真实 E2E 已确定的 FAIL。若该轨未在本轮形成稳定最终文本，按 Verify skill
降级记录为未收束，不伪造 PASS。

## 已有机器门禁

- focused kernel formatter：12/12 通过；
- focused protected HTTP route：4 通过，275 条有意过滤；
- composer 与集成 Escape 回归：57/57 通过；
- Dashboard typecheck 和 suite：52 files，974/974 通过；
- full workspace suite：316 files，5,415 通过，5 条如实 skipped；
- kernel/CLI/server TypeScript、Dashboard、server bundle、CLI bundle：通过；
- architecture、comment honesty、repository hygiene、docs、product identity、
  npx package：通过；
- hooks：482/482 通过。

这些结果不能覆盖真实浏览器对正向 Tab 焦点困笼的失败。

## 返工后必须重验

1. 先补真实嵌套 TaskDetail + composer 的正向 Tab 回绕失败测试。
2. 外层 progress drawer 在嵌套 modal 存在时不得处理 Tab 或 Escape。
3. 将 composer 专用组件从 `shared` 移入局部功能目录并保持公共 `Dialog` 边界不变。
4. 重跑定向测试、typecheck、frontend suite、生产构建与受影响的全仓门禁。
5. 以新 commit/tree 冻结并重跑 reviewer、Codex CLI、E2E 和视觉四轨。
