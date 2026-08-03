# Dashboard Onboarding 命令反馈设计

## 问题与用户结果

首次打开 Dashboard 的用户必须回到终端执行 `tenon init` 和 `tenon doctor`。当前 1024–1920px production 基线中，两条命令、复制按钮、主题与 reduced-motion 均可用，页面也没有根级水平溢出；但 Clipboard API 缺失时，键盘激活复制按钮后仍显示“复制”，页面没有任何可见或可访问反馈。用户无法判断动作是否生效。

本批次的用户结果是：每一次复制都得到明确的进行中、成功或失败结果；失败时命令仍完整可见并可手动选择，焦点留在原操作上，不把本地浏览器能力问题伪装成服务器或 Tenon 错误。

## 基线证据

- 真实 production Dashboard：`http://127.0.0.1:18855/`，标题 `Tenon Dashboard`，隔离空 state root。
- 1024×768、1200×870、1440×900、1920×1080 下卡片宽度均为 620px，高约 338px；两条命令与两个复制按钮均可见，`scrollWidth === innerWidth`。
- Light、Dark、System 均使用既有 token；reduced-motion 下复制按钮 transition duration 为 `0s`。
- Clipboard API 缺失基线：Enter 激活后焦点仍在复制按钮，但按钮仍为“复制”，可见 `role=status` 数为 0，卡片没有失败文案。

## 候选方案

| 方案 | 优点 | 代价与风险 |
| --- | --- | --- |
| A. CmdRow 内部四态状态机（采用） | 与每条命令一一对应；复用 Host Plan 的同步/异步错误收敛模式；不引入共享层或依赖 | Onboarding 内保留少量局部状态与 timer |
| B. 抽取全局 `useClipboard` / shared 组件 | 可推动其他复制入口统一 | 当前只有单一功能域形成稳定需求；会扩大开放 PR 的 shared 重叠与验证面 |
| C. 预先查询 Permissions API | 可能提前说明权限 | 浏览器支持与权限状态不一致；查询成功仍不能替代真实写入结果，容易制造假确定性 |

## 决策

采用方案 A。`CmdRow` 拥有 `idle → pending → success | error → idle` 状态，实际写入通过可注入的 `copyText` 函数完成。实现使用 `Promise.resolve().then(...)` 同时捕获 Clipboard API 缺失、同步抛错和异步拒绝。成功与失败都由同一个可见 `role=status` 宣读；失败文案明确保留命令、让用户手动选择，不自动重试、不请求权限。

桌面视觉层级只在本功能域内调整：命令步骤成为带边界的独立卡片；1024px 保持纵向顺序，1200px 以上使用两列，减少空白并强化“两个连续步骤”的并列结构。既有小屏单列契约保留但不进入本批次设计或验收。

## 关键业务规则

- 每条命令的反馈互相独立；复制第一条不会改变第二条状态。
- 新复制开始时取消上一条 timer，并立即进入 pending。
- pending 时按钮以 `aria-disabled` 表达不可用并由状态机拦截重复动作，防止并发写入且不让原生
  `disabled` 把键盘焦点移出当前操作。
- success 与 error 都包含文字、图标/形态和语义 role，不只依赖颜色。
- error 不隐藏或改写命令，不自动重试，不调用 API。
- 组件卸载或新动作发生后，迟到的 Promise 不得更新状态或创建 timer。
- 中英文 key 成对维护；命令字面值不翻译。

## 状态机

```text
idle --copy--> pending --resolve--> success --2s--> idle
                       \--reject---> error   --4s--> idle
pending --copy--> (disabled; no second request)
any --unmount--> cleanup; ignore late completion
```

失败反馈保留更长时间，因为它包含恢复动作说明；reduced-motion 只取消 transition，不改变状态时序或信息。

## 组件与边界

- `shell/Onboarding.tsx`：`CmdRow` 局部状态、clipboard 适配、桌面步骤布局。
- `shell/Onboarding.test.tsx`：缺失 API、同步抛错、异步拒绝、pending disabled、迟到结果、timer 清理、独立行状态。
- `i18n/translations.ts`：pending/error 成对文案。
- 不新增 API/model/state/shared 依赖，不改变 `App → shell` 依赖方向。

## 可访问性与视觉

- 按钮保持稳定 accessible name；pending 使用 `disabled` 与可见文案。
- 状态容器使用 `role=status`、`aria-live=polite`、`aria-atomic=true`。
- success 使用 `green-*`，error 使用 `red-*` 语义 token；两者都有 Lucide 图标和文字。
- 失败后按钮焦点保持，命令仍是可选择的 `<code>` 内容。
- 只使用现有 `transition-colors` 与 `motion-reduce:transition-none`；不新增 GSAP 或装饰动画。

## Assumptions / Decision Log

- 用户持续授权允许以保守默认完成低风险 Explore 取舍；未把该选择描述为用户逐项确认。
- 本地 `HostPlanPreview` 已证明无需第三方 clipboard 库即可收敛同步/异步失败，因此 `search-first` 结论是复用本仓模式。
- `openspec-explore` 证明本批次修改既有 `dashboard-ui-ux-system`，不创建重复 capability。
- `grill-with-docs` 红队结论：Clipboard API 能力是浏览器事实而非服务器事实；错误文案不得暗示 Tenon 失败，也不得声称已经选中命令。

## 风险与回滚

- 风险：timer 竞争导致陈旧状态覆盖。通过 generation/mounted 防护与测试收敛。
- 风险：两列布局在 1024px 过窄。仅在 1100px 以上启用两列，四个桌面视口真实复核。
- 回滚：恢复 Onboarding 局部组件、测试、i18n 与 dist；无数据迁移、API 或持久化影响。

## 术语

- **复制结果**：浏览器对单次 `writeText` 的 pending/success/error 结果。
- **手动恢复**：命令保持可见，用户使用浏览器原生选择与复制；不代表应用已代为选中。
- **迟到完成**：组件卸载或新 copy generation 后才 resolve/reject 的旧 Promise。

```coverage
touches:
L1_api:      waived -> 仅调用浏览器 Clipboard.writeText，不新增或修改 Tenon HTTP/API 契约
L2_data:     waived -> 四态仅为组件内短暂 UI 状态，不进入 model、store 或持久化
L3_rules:    filled -> #关键业务规则
L4_state:    filled -> #状态机
L5_errors:   filled -> #关键业务规则
L6_security: waived -> 不读取剪贴板、不查询权限、不访问 secrets 或真实用户数据，只写入仓库固定命令
L7_perf:     filled -> #状态机
L8_deps:     filled -> #组件与边界
L10_terms:   filled -> #术语
```
