# Verify 报告：update-wal-desired-identity-20260803

## 结论

冻结候选 `918014292e5011d632fc293a1bff0405de8542c4` 验证失败，必须回到 Build 修复后重新冻结并全量复核。

严重度聚合：Critical 0 / High 1 / Medium 1 / Low 0。

## 冻结范围

- 基线：`origin/main` `dc53843e61f812938f13c684a41ffe1d935e48bf`
- 候选：`918014292e5011d632fc293a1bff0405de8542c4`
- 受影响 capability：`plugin-runtime`
- 61 个变更文件已按完整 diff 复核；实现、测试、release bundle 映射到 `openspec/changes/update-wal-desired-identity-20260803/specs/plugin-runtime/spec.md`，其余 Change/ADR/plan/canonical revision 文件为同一 capability 的治理证据。

## 三轨结果

### 统一代码复核

PASS，Critical/High/Medium/Low 为 0/0/0/0。聚焦测试 15/15、TypeScript、OpenSpec 37/37、architecture、`git diff --check` 与 bundle 字节一致性均通过；冻结 SHA 与实现指纹前后不变。

### 隔离 E2E / API 轨

PASS。使用 `/tmp/tenon-verify-91801429-track2/repo` 的 detached clone；聚焦测试 15/15、TypeScript、bundle freshness、隔离 CLI `--help` 均通过。pending/completed recovery、通用 byte-exact 默认、所有已覆盖的身份字段负向边界均通过；真实工作树未写入。

### Codex 独立复核

FAIL：

1. High：native desired decoder 接受任意字符串形式的嵌套 `marketplace.head`，而生产者只会生成 `null` 或 40 位小写 Git OID；该字段随后被 comparator 忽略，使非 canonical、语义损坏的 HEAD 也可跨过 pending/completed desired identity 门。必须把该字段限制为生产者的 canonical domain，并增加负向回归。
2. Medium：当前 command test 使用手写 comparator 与占位字符串，没有覆盖 `desiredNativeHostPostcondition → runManagedHostCommand → createManagedHostStepRunner` 的真实接线、durable journal reload/process restart。必须增加真实接线恢复回归，确保移除 comparator forwarding 会红。

Codex 轨同时确认：目标 HEAD、root/source/sourceType、pluginRoot/pluginVersion 仍精确比较，未知/扩展键与结构类型被拒绝；CLI 105 files / 1698 passed / 7 条明确环境 skip，bundle 新鲜。

## 归档隔离演练

在 `/tmp/tenon-archive-rehearsal.ATtWbj/repo` 对冻结候选运行 strict validate 与真实 archive。validate 通过，但 archive 正确 fail closed：`MODIFIED` requirement 未保留主规范已有的“进程在宿主 mutation 返回后崩溃”和“旧 WAL 无法证明安全重试”两个场景。真实 `openspec/specs` 未被修改。修复时必须补齐完整 requirement，不改变既有语义，然后重新演练。

## 已通过但不能抵消失败的证据

- 初始红测：缺少 comparator 实现时 `isEquivalentDesired is not a function`。
- 聚焦回归：54/54。
- 全仓：332 files / 5956 passed / 26 条明确环境 skip。
- Build、TypeScript、OpenSpec 37/37、architecture、comments、hygiene、isolated bundle smoke 27/27 均通过。
- 真实 pending WAL 恢复成功且 mutation 未重放；journal 清空；managed runtime revision 14 与 Dashboard `127.0.0.1:18765` 健康。
- Doctor 为 16 green / 3 yellow / 0 red；黄色仅为可选 Docker/image/Claude AFK 环境。

## 决策

按持续自主授权采用保守默认：拒绝接受偏差，走 `verify-fail` 回 Build；先补全 delta requirement，再修复 canonical HEAD 校验与真实接线回归，随后重新运行完整冻结验证与隔离归档演练。
