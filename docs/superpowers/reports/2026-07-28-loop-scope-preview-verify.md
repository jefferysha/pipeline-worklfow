# Loop 路径作用域预检验证报告

## 结论

FAIL。冻结构建 `1efe6b9c3f8fccbdc12508ca78195eb4de3c5732` 的 E2E / Spec 轨通过；
Reviewer、独立 Codex 与视觉轨确认两项 Medium 交互缺口。汇总为
Critical 0 / High 0 / Medium 2 / Low 0。持续自主模式不接受偏差，本轮按确切
`verify-fail` 返回 Build。

## 冻结坐标与零输出边界

- base / merge-base：`2394ac71efc87193350d476266a3219c320bb5b1`
- build SHA：`1efe6b9c3f8fccbdc12508ca78195eb4de3c5732`
- 所有写测试、构建、浏览器截图、日志和 OpenSpec archive/apply 均在精确
  `git archive` 的仓库外隔离目录执行。
- 共享树实现 fingerprint 前后均为
  `567915018e1d9dc8273e091e093be49ab1d51e9ea14719afbb9455529f1e2e0e`；
  Verify 期间只有 Tenon 当前 phase 的治理文件变化。

## 四轨结果

| 轨道 | 结论 | 证据与边界 |
| --- | --- | --- |
| Reviewer / Standards | FAIL · M1 | 完整审查 162 个 changed files、5 requirements / 21 scenarios、生产调用方、API/安全/持久化和生成物。Node 22.23.1 clean build 可复现；全仓测试与静态门禁通过。发现未保存 allowlist/denylist 草稿与 persisted preview 歧义。 |
| E2E / Spec | PASS | Node 22 clean archive 中 kernel/server 293/293、Dashboard focused 84/84、`test:web` 1001/1001、`npm run test:all` 为 5462 pass / 5 条件跳过及 Web 1001 pass。OpenSpec show/strict/archive/apply/main strict 通过，真实主规格 digest 未改变。 |
| Codex CLI | FAIL · M1 | 只读审查完整冻结 diff；C0/H0/M1/L0。独立确认预检入口只绑定 persisted `row`，但邻接 UI 展示可编辑 `draft`，且缺少 dirty-policy 分支测试。 |
| 视觉审查 | FAIL · M1/M2 | 从冻结 commit 启动正确 Tenon Dashboard，完整成功、失败、重试、abort、双语、键盘、焦点和响应式矩阵通过。真实浏览器确认 persisted-policy 歧义，并测得 placeholder 对比度不足。 |

## 必须修复的发现

1. **Medium · 未保存策略草稿与预检策略不一致**

   `LoopAdvancedFields` 展示并编辑本地 `draft.allowlist` / `draft.denylist`，但预检只接收
   persisted `row.root` / `row.id`，后端每次 fresh 读取落盘 registry。用户尚未保存策略时，
   屏幕显示新规则，紧邻入口却解释旧规则，且 Dialog 未说明 snapshot 来源。真实浏览器中，
   草稿新增 `assets/**` 后预检 `assets/logo.svg` 仍返回 `path-outside-allowlist`。

   修复要求：只在 allowlist/denylist 与 persisted row 不同时阻止预检，提供 zh/en
   “保存策略后预检”提示；其他字段 dirty 不应无故阻断。保存并回读新 registry 后再启用。
   补 LoopCard / LoopAdvancedFields 集成测试和浏览器回归。

2. **Medium · 路径输入 placeholder 对比度不足**

   真实渲染采样为 light `3.17:1`、dark `4.47:1`，均低于小字号文本所需的 `4.5:1`。
   修复要求：改用现有设计 token 中能在 light/dark 同时达到至少 `4.5:1` 的颜色，保留
   disabled、focus 和正文层级；以浏览器计算色值重新测量并补稳定的样式断言。

## 通过的验证

- Node `v22.23.1` / npm `11.16.0`，clean `npm ci` 与 `npm run build` 通过。
- Dashboard JS `index-BRmVoj8T.js`
  SHA-256 `d32c2a17281529f0eb4569bf332ea239f32e75c50729c7faf9d2e45d721506ff`；
  CSS `index-VsTXew-P.css`
  SHA-256 `ec4ad442bf251ed97488a25ed2ad6792d9857dfcfd488f6d1553a1dd42196b05`；
  Dashboard、server、CLI tracked bundles 与 clean rebuild 逐字节一致。
- `npm test`：317 files，5462 passed，5 honest skipped。
- `npm run test:web`：56 files，1001 passed。
- repository hygiene、architecture、comments、default-workflow freshness、bundle smoke
  31/31、`git diff --check` 与 secret scan 通过。
- 5 requirements / 21 scenarios 分布为 `[3, 9, 2, 6, 1]`，隔离 archive/apply
  `specsUpdated=true`、新增 5 requirements；应用后主规格 strict validate 通过。
- 浏览器主矩阵覆盖 entry/open-close、empty、8 类 invalid、loading、allow+deny、
  403/409/500、200 empty/non-JSON、retry、body-read abort 后 clean reopen、zh/en、
  light/dark、Ctrl/Cmd+Enter、Tab/Shift+Tab/Escape、焦点返回及 1440/768/390。

## 已知基线与剩余风险

- clean install 报告 7 个既有依赖漏洞（5 moderate、1 high、1 critical）；本 Change 未修改
  package manifest 或 lockfile，不计为新增 finding。
- 首轮高负载测试出现一个 5 秒 timeout 和两个 Docker/Sandcastle 瞬态失败；定向复跑及随后
  完整 `test:all` 均通过，记录为基线 flake 风险。
- 5 个条件跳过分别来自未开启真实 Codex 门和缺少外部 Claude OAuth secret；与代码失败分开记录。
- 无 `openat` 平台仍沿用项目既有同-principal-writer 信任边界；预检不是 permit，真实运行继续
  fresh 执行生产约束 gate。

## 决策

精确请求 `verify-fail`，使用当前 Change 与 host session 绑定的 delegated receipt 返回 Build。
以测试先行修复两项 Medium，重建 Dashboard bundle，重新冻结并再次执行全部四轨；不得只复查
这两项 finding。
