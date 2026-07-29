# Build UI 评修记录

## 评审范围

- 实现：`HostTargetPlanView.tsx`、`HostOperationPlanPanel.tsx`
- 测试：`HostTargetPlanView.test.tsx`
- 运行态：真实 Dashboard `/?view=hostPlan`
- 技能轴：`frontend-design`、`web-design-guidelines`、`design-taste-frontend`

## 第一轮

### 问题

| Severity | 问题 | 用户影响 |
| --- | --- | --- |
| Medium | 第一版紧凑卡片在 1024×768 仍只有 5 个宿主完整可见，未达到规格要求的至少 6 个 | 用户仍需过早滚动，目录扫描收益不足 |

### 修复

- 把名称、CLI flag、kind 与 scope 收敛到同一元数据行。
- 保留完整名称和 flag，不隐藏任何规格要求的信息。
- capabilities 只在已选详情显示，且位于 operation group 之前。

## 第二轮复评

- 1024×768：7 个宿主完整可见；卡片高 80px；无横向溢出；主从区无重叠。
- 1200×870：8 个宿主完整可见；无横向溢出；主从区无重叠。
- 1440×900：8 个宿主完整可见；无横向溢出；主从区无重叠。
- 1920×1080：10 个宿主完整可见；无横向溢出；主从区无重叠。
- 1024px 下 12 个宿主的名称和 CLI flag 均无截断。
- 已选状态同时由 `aria-pressed`、文案和 accent 边界表达；操作继续使用原生 button 与可见 focus ring。
- loading、error、empty、ready、取消旧请求和复制反馈的既有状态实现未被移除。
- 未新增依赖、全局 token、i18n key 或动画。

结论：`frontend-design`、`web-design-guidelines` 与 `design-taste-frontend` 第二轮均无 Critical、High 或 Medium 问题。

## pre-Verify 全量审查

### 文件到规格覆盖

| 文件 | 覆盖 |
| --- | --- |
| `HostTargetPlanView.tsx` | 紧凑目录、原始顺序、名称/flag/kind/scope、选择状态、请求取消 |
| `HostOperationPlanPanel.tsx` | 已选上下文、完整 capabilities、上下文 → 操作 → 请求状态顺序 |
| `HostTargetPlanView.test.tsx` | 目录与详情职责、无副作用选择、中英文、loading/error/empty/ready、复制与取消 |
| `packages/dashboard-app/dist/*` | 与最终源码一致的可发布 Dashboard 产物 |
| Change proposal/design/spec/plan/ADR/research | 范围、非目标、方案取舍、量化验收和回滚依据 |

### Standards 轴

- React state ownership、AbortController 生命周期和 API 调用边界未改变。
- 使用原生 button、`aria-pressed` 与既有 focus ring；没有 unchecked cast、模块级可变状态或新依赖。
- 最终 `typecheck:web`、1099 项 web tests、root build、comment honesty、architecture 和 `git diff --check` 全部通过。

### Spec 轴

- 目录保留所有 required identity fields，并在 1024px 实测无名称截断。
- 选择宿主不触发 `loadPlan`；完整 capabilities 在 operation group 前出现。
- 目标切换继续取消请求、清除旧计划；错误、空态、重试和复制反馈测试保持通过。
- 真实运行态四个目标视口无横向溢出或重叠，1024×768 完整可见 7 个宿主。

结论：全量 Standards + Spec 审查无 Critical、High 或 Medium finding；可冻结进入 Verify。
