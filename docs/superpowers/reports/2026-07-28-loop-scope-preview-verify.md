# Loop 路径作用域预检验证报告

## 结论

FAIL。冻结构建 `d632ad7442b085637ae5247e8706ed43cb9e3c0e` 的完整四轨验证汇总为
Critical 0 / High 0 / Medium 1 / Low 0。Reviewer、Spec/E2E 与独立 Codex CLI
共同确认 Loop 身份切换时存在结果串线；视觉轨的既有矩阵通过，但未覆盖该身份切换。
持续自主模式不接受偏差，本轮按确切 `verify-fail` 返回 Build。

## 冻结坐标与零输出边界

- base / merge-base：`2394ac71efc87193350d476266a3219c320bb5b1`
- build SHA：`d632ad7442b085637ae5247e8706ed43cb9e3c0e`
- tree：`0ddc71539e99d8c3c62145641c700b505efe1734`
- 所有写测试、构建、浏览器证据和 OpenSpec archive/apply 均在精确 `git archive`
  的仓库外隔离目录执行；共享实现树保持冻结。

## 四轨结果

| 轨道 | 结论 | 证据与边界 |
| --- | --- | --- |
| Reviewer / Standards | FAIL · M1 | 完整审查 191/191 changed files、3470/3470 blobs、全量源码/治理/生成物和门禁；独立 SSR rerender 证明 completed 与 in-flight 两类结果均可跨 Loop 串线。 |
| E2E / Spec | FAIL · M1 | 191/191 文件映射、5 requirements / 21 scenarios、OpenSpec 隔离演练与既有测试通过；新增临时安全回归 2/2 按预期失败，确认违反 R4 身份绑定。 |
| Codex CLI | FAIL · M1 | 只读审查完整冻结 diff，独立定位同一 row-switch 代际失效缺口。它同时提示最终 PASS 报告尚未生成；该项是 Verify 本阶段先审查、后生成报告的规定时序，不计 finding。 |
| 视觉审查 | PASS | 冻结 Dashboard 身份/资产、重提 pending、2xx/非 2xx abort、dirty/save、双语、错误/重试、键盘、焦点、响应式与对比度矩阵通过；未覆盖 Loop row 切换。 |

## 必须修复的发现

### Medium · Loop 身份切换未使预检代际失效

`LoopCard` 在同一组件树内切换 `loops.selected`，`LoopAdvancedFields` 随后只更新
`LoopScopePreview` 的 `root` / `loopId` props，没有 key。组件内部的 open、raw、busy、
result、error、request generation 和 AbortController 因而保留；唯一 cleanup effect 只在
unmount 时取消。结果有两条确定性失败路径：

1. Loop A 已成功后切换到 Loop B，A 的 summary/items 仍显示在 B 的 Dialog 标题下。
2. Loop A 请求在途时切换到 Loop B，A 的迟到响应仍通过 request generation 检查并发布到 B。

这违反 R4 对成功响应绑定当前 Loop/请求、串线响应不得渲染的要求。预检不是执行许可且真实 gate
仍会 fresh 重检，因此定级 Medium，而不是 High。

修复要求：`root` 或 `loopId` 改变时必须使请求代际失效、取消当前 controller 并清空或关闭
全部 Dialog 状态；补已完成与在途两条身份切换回归，重建受跟踪 Web bundle 后重新冻结并重跑四轨。

## 通过的验证

- Node `v22.23.1` / npm `11.16.0`，clean `npm ci` 与 `npm run build` 通过。
- Dashboard JS `index-CNYyyV41.js`
  SHA-256 `bcd2bfd3787305a8d04aa7d780a46d88bb2c7fb7e5c0c688fac69f60396e4273`；
  CSS `index-EnliBiGT.css`
  SHA-256 `c04ba7a1885866622f632f7ea09d60fd0947b0147c988668566813afadc646fc`；
  server SHA-256
  `be57d276671203669606ec09cc963ab69e3e3e6c0d17b546c2bf4b2e3abe6b60`。
  Dashboard、server、CLI 与 clean rebuild 逐字节一致。
- Root：317/317 files，5462 passed，5 honest skipped。
- Web：56/56 files，1006/1006；focused server 286/286，client/UI 56/56。
- repository hygiene、architecture（622 production files）、comments、default-workflow
  freshness、bundle 31/31、hooks 482/482、adapters 272/272、skills、oracle、identity、
  docs、templates、migration 与 `git diff --check` 通过。
- OpenSpec 5 requirements / 21 scenarios；隔离 show/strict/archive/apply 成功，真实
  `openspec/specs` digest 未变化。
- 浏览器覆盖重提 stale 清除、2xx/500 headers/body abort、goal-only dirty、allow/deny
  dirty 双语阻断、save 500、save success + reload、成功/全部与部分拒绝、403/409/500、
  200 empty/non-JSON、retry、Ctrl/Cmd+Enter、Tab/Shift+Tab/Escape、焦点返回、
  375/768/1440、light/dark；placeholder 对比度 light `7.75:1`、dark `8.63:1`。

## 已知基线与剩余风险

- clean install 报告 7 个既有依赖漏洞；本 Change 未修改 package manifest 或 lockfile。
- 高负载 Web 首轮出现一个既有 ProgressView GSAP 时序失败；隔离与完整复跑均通过。
- 5 个条件跳过来自未开启真实 Codex 门和缺少外部 Claude OAuth secret，与代码失败分开记录。
- 无 `openat` 平台仍沿用项目既有同-principal-writer 信任边界；预检不是 permit。

## 决策

精确请求 `verify-fail`，使用当前 Change 与 host session 绑定的 delegated receipt 返回 Build。
以测试先行补齐 completed 与 in-flight Loop identity 两条回归，修复后重新执行全量 Build 收敛和
冻结四轨；不得只复查本次 finding。
