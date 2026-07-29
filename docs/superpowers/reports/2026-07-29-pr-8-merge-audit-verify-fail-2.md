# PR #8 合并审计验证报告（第二轮失败）

> Change：`pr-8-merge-audit`
> 冻结构建：`dac0daa66ca5f2ad38a5e4fb9cf774d40bf9b224`
> 对比基线：`4c242b928b61285561f9cdbc63617db899a18a12`
> 结论：失败；保留 PR，取得精确 `verify-fail` receipt 后返回 Build

## 聚合结论

四条独立验证轨与只读 Codex CLI 审查已全部结束。本轮聚合为
**FAIL — Critical 0 / High 0 / Medium 2 / Low 0**：

1. 已归档 `host-target-plan-dashboard` 的 design 文档在归档后被修改，但归档
   document ledger 与五条历史 read receipt 仍绑定旧 SHA；10 条 ledger 记录只有
   9 条可按当前树复验。
2. 当前 `REVIEW.md` 把前一提交 `b179309e...` 的 362 路径映射和 CI 称为当前
   frozen head 的完整证据；实际 frozen head `dac0daa6...` 有 364 路径。

两项都是治理与验证证据缺陷，不是产品运行时缺陷。产品、API、OpenSpec、CLI、
Dashboard、架构、安全、可访问性和性能验证均为 C0/H0/M0/L0。Verify 内不得修复；
本报告登记后必须通过确切 `verify-fail` 回到 Build，使用受支持的 Tenon 文档治理
流程修复归档证据，并把当前审查陈述绑定到不可变 base/head 快照。

## 冻结边界与在线状态

- local HEAD、远端 PR head、`build_sha`：
  `dac0daa66ca5f2ad38a5e4fb9cf774d40bf9b224`。
- base 与 merge-base：
  `4c242b928b61285561f9cdbc63617db899a18a12`。
- `BASE...HEAD` 精确为 364 个唯一路径。
- frozen head 的 GitHub Actions：
  - CI run `30425722325`：success；
  - Documentation Pages run `30425722321`：build success，PR-only deploy
    按条件 skipped。
- PR #8 在线复核为 OPEN、非 Draft、mergeable；base/head 精确匹配。
- 所有验证轨结束后共享 HEAD 未变，产品 worktree diff 为
  `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。

## M1：归档文档 ledger 与当前树 SHA 漂移

`openspec/changes/archive/2026-07-28-host-target-plan-dashboard/.pipeline-documents.json`
登记 `docs/superpowers/specs/host-target-plan-dashboard-design.md` 的 SHA-256 为：

```text
68752a39535e42f1ccc18a15edc7f790aa4964d73976e7a72abdd251a9686cf1
```

当前文件实际 SHA-256 为：

```text
220c3a3b1be0082c72aa994c2ec27cc403a7b6d1f99aa837c2de34b0b086126f
```

该 ledger 记录还带有五条绑定旧 SHA 的历史 read receipt。Git 历史显示后续提交
`fd777023` 修改了 adapter 命令说明，但没有留下可复验的归档文档迁移证据。只读
Codex 审查因此只能验证 10 条归档 ledger 记录中的 9 条。

Build 必须通过 Tenon 支持的文档治理/迁移机制解决该漂移，保留不可变归档证据或
显式迁移记录；禁止手工改 `.pipeline-documents.json`、历史 receipt、canonical state
或 `.pipeline.yaml`。修复后需重新验证全部 ledger SHA、read receipt、revision、
pre-review companion 与 transition 链。

## M2：362 路径与旧 exact-head CI 陈述不再对应 frozen head

`openspec/changes/pr-8-merge-audit/REVIEW.md` 第 218、239 行声称全部 362 个
“current paths”已映射，第 241–243 行把 run `30425286953` 称为 exact-head CI，
但该 run 与 362 路径都绑定前一提交
`b179309e62b414b6fb622daa9c1b4c7cfc77f650`。

最终冻结提交 `dac0daa6...` 又增加两条治理路径：

- `.pipeline-run/pre-verify-review/000036-d3c7e2d7-cc9e-4d33-b24b-8f50722c79da.json`
- `.pipeline-run/revisions/000036-d3c7e2d7-cc9e-4d33-b24b-8f50722c79da.json`

因此 frozen diff 实际为 364 路径。规则审查轨虽独立覆盖 364/364 路径，但当前
`REVIEW.md` 没有准确记录这个事实。Build 必须把证据改为明确绑定 exact base、
exact head、路径数量与不可变清单指纹；不得再使用会随治理提交漂移的“current
paths”表述。随后重新执行 pre-Verify review、提交推送、等待新 exact-head CI，
再冻结新 `build_sha`。

## Reviewer / correctness / architecture / security

结论：**FAIL — C0/H0/M1/L0**；唯一 finding 为 M2，产品子集为全 0。

- 独立覆盖 364/364 路径：docs 19、归档 Change/governance 198、当前 audit
  Change/governance 99、canonical spec 1、CLI 8、Dashboard 25、server 10、
  docs/hygiene tools 4。
- 282 个 JSON、2 个 JSONL/330 rows、116 对 revision/pre-review companion、
  40 个 transitions 与当前 9 条 ledger 记录通过结构校验。
- 两次 build 的 929 个生成文件字节稳定；root 322 files / 5616 pass /
  14 honest skips；Web 61 files / 1098 pass；typecheck、architecture、
  comments、docs、hygiene、identity、templates、workflow freshness、
  migration CAS、hooks 482、adapters 272、bundle 31、npm package 39、
  golden oracle 均通过。
- OpenSpec Change strict valid；独立 archive 应用 5 个 MODIFIED requirements，
  最终 30 scenarios，canonical 22 scenarios 零丢失。

## API / CLI / OpenSpec / production browser

结论：**PASS — C0/H0/M0/L0**。

- isolated clone、`npm ci --ignore-scripts --prefer-offline`、root build 和 tracked
  CLI/server/Dashboard 生成内容一致。
- OpenSpec 1.6.0 strict Change/spec PASS；canonical 5 requirements/22 scenarios，
  delta 5/30；独立 archive exit 0、modified 5，应用后 strict PASS 5/30。
- built CLI catalog 12；12 hosts × setup/update = 24/24；hostile host/operation
  均非零、stdout 空、稳定错误且不回显输入。
- production server：catalog 12、plans 24、invalid query 9、Host guard 5、
  mutation rejection 14 全部通过；isolated HOME 前后内容指纹一致。
- 默认 4 槽/10 秒真实 HTTP：五个请求都约 10.01 秒返回 503，runner 只启动
  4 次、peak 4；过期第五个 child 未启动，失败后 retry/cache 恢复正常。
- focused server 79/79，DTO/redaction 31/31。
- exact production browser 覆盖 loading、ready/copy、503/retry、390px
  keyboard/focus、零 overflow、仅 GET、零 unexpected console/page error。
- 浏览器证据：`/private/tmp/pr8-verify2.MebbCJ/browser/`，
  JSON SHA-256 `1cf6cce2...`。

## Dashboard / design-taste / accessibility / performance

结论：**PASS — C0/H0/M0/L0**。`tenon:design-taste-frontend` 已明确覆盖
Dashboard。

- 24/24：390/768/769/900/1024/1440 × zh/en × light/dark；
- loading、empty、catalog/plan 503、network、decoder、unknown、mismatch、
  retry、copy success/failure、setup/update 竞态全部通过；
- skip-link、main/detail focus、Tab/Space/Enter、ARIA、2px focus ring、
  reduced-motion 六宽度全部通过；
- 0 overflow、0 语言串漏、0 contrast failure、0 unexpected console/page error、
  0 non-GET；
- 三次冷启动 ready 75–77ms、CLS 0、long task 0；
- trace：
  `/private/tmp/pr8-verify4-dashboard-UyG9tE/trace.zip`，
  SHA-256
  `e27ca6d7f29bac3458c07f39c268a2422ed1296fb2a3c927531ef0e3921630e0`。

## Codex CLI

结论：**FAIL — C0/H0/M1/L1**；聚合时 M2 采用规则审查轨的更高 Medium 分级，
因此最终为 M2 而非 Low。

- isolated read-only clone 精确固定 base/head，工作树结束时仍干净；
- 独立覆盖 364 路径，并核验 282 JSON、2 JSONL/330 rows、revision/companion/
  transition 链、canonical/delta 场景、源码、测试、生成物、文档与治理证据；
- 未发现 secret、冲突标记、依赖 manifest/lock 变更或产品 correctness/security
  finding；
- 唯一新增发现为归档 design ledger SHA 漂移；同时独立确认 362/364 与旧
  exact-head CI 陈述过期。

## 依赖与发布阻断

本 PR 不修改 package manifest 或 lockfile。现有 production audit 为一项 High 与
一项 Moderate；完整依赖树为一项 Critical、一项 High、五项 Moderate，均为 base
既有风险，不计为 PR #8 回归。

但自动化最终包含 tag 与 GitHub Release，因此依赖风险仍是正式发布硬阻断。合并队列
完成后必须由独立 dependency/release Change 清零或安全处置并重跑 audit；若无法通过，
必须停止在 release 前，不得创建 tag 或 GitHub Release。

## 回退与重验顺序

1. 登记本报告并取得 exact-event `verify-fail` delegated receipt，返回 Build。
2. 使用受支持的 Tenon 文档治理流程修复归档 design ledger 漂移，禁止手改 canonical
   state、receipt 或 `.pipeline.yaml`。
3. 把 `REVIEW.md` 的范围证据绑定到 exact base/head、路径数量与不可变指纹，并记录
   frozen-head GitHub CI。
4. 从零重跑三条 pre-Verify review，要求 C/H/M/L 全为 0。
5. 提交、非强制推送、等待新 exact-head CI success，再冻结新 build SHA。
6. 新 Verify 从零重跑四轨和 Codex；本轮通过项只能作为回归输入，不能冒充新轮次
   的通过结论。
