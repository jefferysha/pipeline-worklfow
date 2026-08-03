# 最终主干统一审查 repo-zero Verify 失败报告（2026-08-03）

## 冻结身份

- Git HEAD / Tenon `build_sha`：`f64ad1e161978c203aea9a475f72378e0f9cf563`
- 基线：`main@7c1ed69516e042205155e134b25f59f9ed927644`

## 聚合结论

Verify：**FAIL — 工具执行边界失败，未形成产品 finding**。

验证命令已创建 detached worktree，但后续 `npm ci`、`npm run build` 和 receipt
测试仍在真实验证 worktree 执行。构建后的 tracked 实现字节与冻结提交一致，测试也
通过，但 Verify 的 repo-zero-output barrier 禁止验证期间在真实工作树运行会重写
tracked distribution 的命令；瞬时写入不能靠最终 diff 为零追认为有效证据。

## 处理要求

1. 本轮证据作废并通过官方 `verify-fail` 回退 Build。
2. 不修改产品实现；重新提交治理证据并冻结替换 SHA。
3. 后续安装、构建、测试和 OpenSpec apply/archive 演练必须在显式 `cd` 到的 detached
   worktree 中执行，并在开始/结束验证真实工作树指纹一致。

本报告不改变上一轮安全修复结论：receipt 150/150、root 5913、独立 Codex 安全
复核 PASS；这些结果仍将在替换 SHA 上重新核验。
