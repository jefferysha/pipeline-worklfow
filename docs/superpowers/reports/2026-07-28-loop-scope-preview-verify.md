# Loop 路径作用域预检验证报告

## 结论

FAIL。冻结构建 `0809a5fadc430e20919409c99a776ea1d838bc05` 的 Spec / E2E 与真实浏览器轨通过；
Standards 和独立 Codex CLI 审查发现两项 Medium、一项 Low。汇总为
Critical 0 / High 0 / Medium 2 / Low 1。持续自主模式不接受偏差，本轮按确切
`verify-fail` 返回 Build。

## 冻结坐标与零输出边界

- base / merge-base：`2394ac71efc87193350d476266a3219c320bb5b1`
- build SHA：`0809a5fadc430e20919409c99a776ea1d838bc05`
- 所有写测试、构建、浏览器证据和 OpenSpec archive/apply 均在精确 `git archive`
  的仓库外隔离目录执行。
- 共享树实现 fingerprint 前后均为
  `d4627b5279aae8972c6ed1718c215b9d33e46ffd510c630bfaeca0eca7b78510`；
  Verify 期间只有 Tenon 当前 phase 的治理文件变化。

## 四轨结果

| 轨道 | 结论 | 证据与边界 |
| --- | --- | --- |
| Reviewer / Standards | FAIL · M1 | 完整审查 175 个 changed files；Node 22 clean build、全仓测试、静态门禁和 tracked bundle freshness 通过。发现响应闭集 decoder 可接受数组伪装的枚举。 |
| E2E / Spec | PASS | 175/175 文件映射，5 requirements / 21 scenarios 对应完整。Root 5462 pass / 5 条件跳过，Web 1004/1004；OpenSpec show/strict/archive/apply 隔离演练通过，真实主规格 digest 未改变。 |
| Codex CLI | FAIL · M1/L1 | 只读审查完整冻结 diff；发现重新提交期间仍显示旧成功结果，以及非 2xx body-read abort 身份丢失。 |
| 视觉审查 | PASS | 从冻结 commit 启动并确认正确 Tenon Dashboard 与资产哈希；双语、成功/拒绝、错误/重试、abort、dirty/save、键盘、焦点、375/768/1440 和 light/dark 矩阵通过。 |

## 必须修复的发现

1. **Medium · 闭集 decoder 接受数组伪装的枚举**

   `decodeLoopScopePreview` 用 `String(value.loop_status)` 和
   `String(value.autonomy_level)` 做枚举判断，却未要求原值为 string。
   `["active"]` / `["L3"]` 会通过闭集检查并原样返回，随后严格派生比较又把它们当作
   非 active-L3，可将畸形响应显示为 simulation。

   修复要求：对两个字段先做严格 string 类型检查，再检查枚举；补 array、object、number
   负测以及派生一致性负测。

2. **Medium · 重新预检时旧成功结果仍可见**

   `LoopScopePreview.submit()` 开始新请求时只设置 loading 并清除 error，没有清除上次
   `result`。在 fresh registry read 等待期间，用户仍能看到过时的 allow/block 结果，
   与预检不是 permit、每次 fresh 读取的安全表达冲突。

   修复要求：每次提交开始时清除旧 result，补“成功后重新提交、pending 期间旧摘要不可见”
   的组件测试。

3. **Low · 非 2xx body-read abort 身份丢失**

   client 的非 2xx 分支捕获 `readJson()` 所有失败后继续按 HTTP status 抛出领域错误，
   其中包括 `AbortError`。2xx 分支已保留取消身份，两条路径行为不一致。

   修复要求：非 2xx body-read 也原样抛出 `AbortError`，补 headers 已返回但错误响应体读取
   被取消的测试。

## 通过的验证

- Node `v22.23.1` / npm `11.16.0`，clean `npm ci` 与 `npm run build` 通过。
- Dashboard JS `index-D_2MYC93.js`
  SHA-256 `005523716de320fc5dea933e29fd6c80eb2eb75f82bb3812d3b278a200eb8c76`；
  CSS `index-EnliBiGT.css`
  SHA-256 `c04ba7a1885866622f632f7ea09d60fd0947b0147c988668566813afadc646fc`；
  server bundle SHA-256
  `be57d276671203669606ec09cc963ab69e3e3e6c0d17b546c2bf4b2e3abe6b60`。
  Dashboard、server、CLI tracked bundles 与 clean rebuild 逐字节一致。
- `npm test`：317 files，5462 passed，5 honest skipped。
- `npm run test:web`：56 files，1004 passed。
- kernel/server 定向测试 293/293；client/UI 定向测试 54/54。
- repository hygiene、architecture（622 production files）、comments、default-workflow
  freshness、bundle 31/31、`git diff --check` 与 secret scan 通过。
- 5 requirements / 21 scenarios 分布为 `[3, 9, 2, 6, 1]`；隔离 archive/apply
  `specsUpdated=true`，应用后的新主规格 strict validate 通过，真实主规格未变化。
- 浏览器覆盖 goal-only dirty、allow/deny dirty 双语阻断、save 500、save success +
  reload、全部/部分拒绝、403/409/500、200 empty/non-JSON、retry、body-read abort、
  Ctrl/Cmd+Enter、Tab/Shift+Tab/Escape、焦点返回及 375/768/1440。
- placeholder 对比度 light `7.75:1`、dark `8.63:1`。

## 已知基线与剩余风险

- clean install 报告 7 个既有依赖漏洞；本 Change 未修改 package manifest 或 lockfile，
  不计为新增 finding。
- 两条全量测试首次运行分别出现无关 tap JSON EOF 和 Web 异步等待抖动；隔离复跑与随后
  完整复跑均通过，记录为高负载 flake 风险。
- 5 个条件跳过来自未开启真实 Codex 门和缺少外部 Claude OAuth secret；与代码失败分开记录。
- 无 `openat` 平台仍沿用项目既有同-principal-writer 信任边界；预检不是 permit，真实运行继续
  fresh 执行生产约束 gate。

## 决策

精确请求 `verify-fail`，使用当前 Change 与 host session 绑定的 delegated receipt 返回 Build。
以测试先行修复两项 Medium 与一项 Low，重建 Dashboard bundle，重新冻结并再次执行全部四轨；
不得只复查本次 finding。
