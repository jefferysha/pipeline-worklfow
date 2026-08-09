# Verify Fail：Codex host output-budget 回执兼容

## 结论

冻结候选的 Review attempt 2 三轨均已通过，但 Verify 文档登记暴露出一个确定性的宿主兼容阻塞，
因此本轮不能以 `verify-pass` 离开：当前已安装的 Tenon `v1.0.1` 中
`tenon-verify/SKILL.md` 为 21,777 bytes；Codex Desktop 默认 transcript 输出预算会截断完整 `cat`
结果，而现有 transcript parser 又拒绝携带宿主 `// @exec: {"max_output_tokens":...}` 预算 pragma。
结果是合法的完整 Skill 读取无法生成 tasks producer 的 exact host confirmation。

## 已确认事实

- Review attempt `6a456fc7-469c-4d97-813c-80a6a659bac7` 已完成，`standards/spec/e2e` 均为 pass。
- `verification-report` 已由 `verification-before-completion` 成功登记。
- `tasks` 仍为 stale；`document record ... --producer tenon-verify` 失败并返回：
  `current StepVisit lacks exact host confirmation for document producer 'tenon-verify'`。
- 使用外层 `max_output_tokens` 后，host transcript 包含完整 21,777-byte stdout；当前 parser 仅因 pragma
  存在而拒绝。最终 stdout 仍会由 `outputMatchesTrustedSkillReads` 与可信 Skill 文件逐字节比较，
  因此接受安全正整数预算不会降低 fail-closed 完整性证明；任何截断仍会被 byte comparison 拒绝。

## 处理决定

- 通过官方 `tenon review-budget set ... --max-attempts 3` 将本 Change 的 Verify 上限从 2 审计化调整为
  有限的 3；已用 2 次，最多只剩 1 次，不允许无限 Review。
- 以 `verify-fail` 回到 Build，增加安全 pragma 的兼容解析和完整/截断两侧测试，重新生成受控 dist。
- 新冻结候选只运行最后一次 3/3 Review；若失败则按预算硬停止，不再自动扩容。

## 未完成项

- 尚未进入 Ship，未创建或合并 PR，未发布 `v1.0.2`。
- 在正式 `v1.0.2` Release 与公网验收通过前，不卸载或改写当前真实插件/runtime。
