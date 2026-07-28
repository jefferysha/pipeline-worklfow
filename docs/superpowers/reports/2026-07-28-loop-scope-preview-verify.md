# Loop 路径作用域预检验证报告

## 结论

FAIL。冻结构建 `8ba6140490291e6668f82dde1bcf7dcc043947d3` 的 Spec/E2E 与视觉轨通过，
Standards 轨发现一个 CI hygiene HIGH，Codex CLI 发现三个可复现的 LOW 契约问题。持续自主模式
不接受偏差；本轮按确切 `verify-fail` 返回 Build，并因治理文档和输入契约变化再回 Spec。

## 四轨结果

| 轨道 | 结论 | 证据与边界 |
| --- | --- | --- |
| Reviewer / Standards | FAIL | 完整审查 108/108 文件。唯一 HIGH：`npm run check:repository-hygiene` 因四份 tracked 治理文档出现禁止的外部参考身份而失败；该命令是 CI 强制门。其余无 finding。 |
| E2E / Spec | PASS | 5 requirements / 18 scenarios 全覆盖；冻结 tree 前后均为 `a12005e840533094a0da891c455135ed59ea2640`；隔离 show/strict/archive/apply 与真实主规格未应用边界通过。 |
| Codex CLI | FAIL | 完整审查 3 commits / 108 files；C0/H0/M0/L3。只读沙箱中的 Vitest 和 comments 因临时文件 `EPERM` 未运行，不计代码失败；typecheck、architecture、strict validate 与 bundle 对账通过。 |
| 视觉审查 | PASS | 冻结 Dashboard 的桌面 zh/light 与 390px en/dark、empty/invalid/loading/success/error/retry、真实 allow/deny/outside、Ctrl/Meta+Enter、Tab/Shift+Tab/Escape/focus、0 overflow 均通过；C0/H0/M0/L0。证据 `/tmp/tenon-loop-scope-qa-final-review.json`。 |

## 必须修复的发现

1. **High · CI hygiene**：tracked proposal/design/plan/tasks 含 repository hygiene 明令禁止的外部
   参考项目身份。仓内只保留不含受限名称的固定上游证据摘要；完整仓库、SHA、URL、release/tag
   回退、许可证和差异映射移到 PR body 与 automation memory。
2. **Low · transport/input budget**：路径预算允许 32768 UTF-8 bytes，但最坏 JSON 转义会令整个
   body 超过公共 64 KiB transport 限制。选择收紧输入路径：拒绝需 JSON 扩张的控制字符与双引号，
   保证全部合法请求不会在业务 parser 前被 transport 拒绝，并补真实 HTTP 边界测试。
3. **Low · client 去重契约**：公开 typed client 必须在自身边界校验、去重保序并冻结路径，
   以同一规范序列发送和绑定响应；不能依赖 Dialog 先去重。
4. **Low · POSIX 路径兼容**：`^[A-Za-z]:` 过宽，误拒绝合法 `a:b` / `C:notes.txt`。
   客户端与服务端只拒绝 `^[A-Za-z]:/` 的 Windows drive absolute 形式，反斜杠仍独立拒绝。

## 已执行验证

| Gate | 结果 |
| --- | --- |
| kernel/server 定向测试 | PASS；293/293 |
| Dashboard 定向测试 | PASS；81/81 |
| `npm run typecheck:web` | PASS |
| `npm run test:web` | PASS；52 files / 973 tests |
| `npm run build` | PASS |
| `npm test` | PASS；317 files / 5,462 passed / 5 skipped |
| `npm run check:architecture` | PASS；621 production files |
| `npm run check:comments` | PASS（Standards 轨可写环境）；Codex 只读沙箱因 `mktemp` 降级 |
| `npm run check:repository-hygiene` | FAIL；本轮 tracked 文档身份规则 |
| server / CLI / SPA 重建对账 | PASS；`/tmp` 产物与冻结 bundle 逐字节一致 |
| OpenSpec 1.6.0 | PASS；show 5/18、change strict、隔离 archive/apply、生成主规格 strict |
| 真实浏览器验收 | PASS；见视觉轨证据 |

完整测试中的 real-Codex/Claude secret 门按环境诚实跳过；它们不覆盖本功能。缺失外部 secret 与代码
失败分开记录。

## 改动文件到规格回读

冻结 diff 的 108 个文件已全部枚举：7 个业务/验证文档、78 个 Change governance 记录、10 个生产
源码、6 个测试和 7 个生成产物。逐文件分别回读以下能力契约：

- kernel explanation / aggregate compatibility → requirement 1、5；
- server parser / trusted registry / protected route / HTTP tests → requirement 2、3；
- Dashboard decoder / client / Dialog / i18n / tests → requirement 4；
- CLI、server 与 SPA bundle → 对应已审源码及生成物一致性；
- Change proposal/design/plan/tasks/ledger/revisions/transitions/report → default workflow 文档与 review 契约。

所有冻结 JSON/JSONL 可解析；九份 ledger 文档 digest/read receipt 无 mismatch。发现来自仓库 hygiene
和三个边界契约，不是遗漏文件。

## Spec isolation

`/tmp/tenon-loop-scope-openspec-final.sfgUAw` 基于最终 delta：show 为 5 requirements / 18 scenarios
（3、7、2、5、1），archive `specsUpdated=true` 且 added=5，生成主规格 strict PASS、SHA-256
`66ce327471566cdf546e07fb5d180eaee943800869641e46e866c5b07a3f3e07`。真实仓库主规格前后均不存在，
未越过 Ship 的唯一应用边界。

## 决策

精确请求 `verify-fail` 并使用当前 automation 的 Change-bound delegated receipt 返回 Build。
治理文档与输入字符契约发生变化，随后以 `requirements-changed` 回 Spec；修复后必须重建 bundle、
重新冻结并再次完成全部四轨，不仅复查本轮 findings。
