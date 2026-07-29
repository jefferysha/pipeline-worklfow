# 任务

## 立项

- [x] 建立独立 worktree、分支与 backend/full Change。
- [x] 记录问题、边界、风险和七阶段任务。
- [x] 登记 Open 文档并通过 phase check。

## 调研

- [x] 用首次 `document record` 和真实 transcript 建立可失败复现。 (explore)
- [x] 排查 shell program、transcript 可见性、session/turn/tool 绑定并冻结根因。 (explore)
- [x] 审阅现有 receipt 安全约束、测试覆盖和兼容边界。 (explore)

## 规格

- [x] 编写 current-turn receipt delta spec 与验收场景。 (spec)
- [x] 固定实现设计、回滚策略、测试矩阵和文档 ledger。 (spec)
- [x] 将 Verify 发现的完整信封、精确 session、损坏 transcript 和符号链接边界写入规格。 (spec)

## 实现

- [x] 加入真实 custom ABI sibling-worktree 的失败回归测试。 (build)
- [x] 结构化解码 `cmd`/`workdir` 并复用可信 sibling 校验。 (build)
- [x] 补充缺 workdir/跨仓/动态值/失败 output 等拒绝路径。 (build)
- [x] 修复 Verify 发现的伪 wrapper 与相对 workdir 信任边界，并恢复旧 ABI 负向覆盖。 (build)
- [x] 运行定向测试、hook 集成、bundle 与静态门禁。 (build)
- [x] 以红灯测试固定完整 result wrapper、nested 非零 exit 与 JSON 数组选项兼容。 (build)
- [x] 只接受 `text(result)` 并忽略 JSON 非信任选项，更新根 Skill 调用指导。 (build)
- [x] 重新运行定向测试、hook 集成、bundle、全仓与静态门禁。 (build)
- [x] 以红灯固定并实现完整结果信封与 typed legacy result。 (build)
- [x] 以红灯固定 `payload.id`、malformed/I/O 失败关闭与非 symlink workdir。 (build)
- [x] 重跑全部定向、hook、bundle、构建、全仓和静态门禁。 (build)
- [x] 以红灯固定调用/output ABI 同型与完整未标型对象拒绝。 (build)
- [x] 以红灯固定枚举阶段失败关闭与相同祖先 symlink 别名拒绝。 (build)
- [x] 重跑第八轮全部定向、hook、bundle、构建、全仓和静态门禁。 (build)

## 验证

- [ ] 运行定向测试、typecheck、npm test 及受影响 hook/bundle 门禁。 (verify)
- [ ] 在全新 Change 中验证首次同轮登记与 phase 推进。 (verify)
- [ ] 完成 Codex、测试和安全三轨审查并处理发现。 (verify)

## 交付

- [ ] 提交、推送并创建带证据的非草稿 PR。 (ship)
- [ ] 检查远端 PR、标签与 CI，修复可归因失败。 (ship)

## 归档

- [ ] 应用 spec、归档 Change 并记录最终状态。 (archive)
