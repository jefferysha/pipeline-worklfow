# 最终主干统一审查 Verify 失败报告（2026-08-03）

## 冻结身份

- Git HEAD / Tenon `build_sha`：`f503932211225a0bd3d410b08e428290cfc110b8`
- 基线：`main@7c1ed69516e042205155e134b25f59f9ed927644`
- 验证期间真实工作树只包含 Tenon phase 投影与本报告，不含实现漂移。

## 聚合结论

Verify：**FAIL — C0 / H0 / M1 / L0**。

独立完整 reviewer、生产 Dashboard 浏览器轨、隔离构建与 receipt 回归均通过，
但 Codex 精确 diff 安全轨发现重复 invocation identity 检查仍位于事件时间新鲜度
过滤之后。一个同 turn、同 `call_id`、但时间戳早于当前 phase 或缺失/非法的调用会
先被忽略；后续同 id 调用加唯一 completion 仍可能被接受。重复身份存在歧义时必须
fail closed，因此当前 SHA 不得交付。

## 已通过的冻结证据

- 隔离 worktree 在 `f5039322` 上完成 `npm ci`（0 vulnerabilities）、完整
  `npm run build` 和 receipt 138/138；构建后 tracked diff 为零。
- OpenSpec `show` 与 strict validate 通过；隔离 archive/apply 演练成功，演练后
  37/37 remaining spec/change strict validation 通过。真实主规格前后 digest 均为
  `d9031573e290b51940067d81ae6a7a8597fd5bd7c9b41e541df8d65107ddb385`。
- 最终 main Dashboard 浏览器验收通过 24 场景、101/101 断言、17 张截图，
  C0/H0/M0/L0；意外 console/page/request/HTTP 错误均为零。证据位于
  `/tmp/pr20-main-browser-qa-Z0y9nS/REPORT.md`。
- 独立统一 reviewer 返回 C0/H0/M0/L0，但该结果不能覆盖 Codex 安全轨 finding。

## 回退要求

1. 在 exact 与 fallback 路径分别增加 stale/missing timestamp 的同 turn 重复
   invocation RED，且测试必须依赖 invocation tracking，而不是仅依赖输出扫描。
2. 对已匹配 session/turn 的 invocation identity 先做唯一性检查，再应用当前 phase
   的事件新鲜度过滤；其它旧事件仍不得满足 receipt。
3. 重跑 focused/full receipt、构建、全量门禁与独立审查，提交并冻结新 SHA 后从零
   进入 Verify。

Codex 原始输出：`/tmp/f5039322-codex-review.txt`。
