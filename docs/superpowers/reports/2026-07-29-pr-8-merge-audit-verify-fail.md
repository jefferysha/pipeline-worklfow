# PR #8 合并审计验证报告（第一轮失败）

> Change：`pr-8-merge-audit`
> 冻结构建：`f4c29f0a0acc82beb3f7e759d4b385b334a4b0c3`
> 对比基线：`4c242b928b61285561f9cdbc63617db899a18a12`
> 结论：失败；保留 PR，取得精确 `verify-fail` receipt 后返回 Build

## 结论

四条独立验证轨与 Codex 原生审查已全部结束。本轮聚合为
**FAIL — Critical 0 / High 0 / Medium 2 / Low 0**：

1. 服务端只在请求出队后启动 10 秒定时器，排队时间不计入请求 deadline；默认四个并发槽
   被慢请求占满时，第五个真实 HTTP 请求约 20 秒才返回，后续合法 key 可接近 70 秒。
2. audit Change 的 MODIFIED requirement 漏带 canonical scenario
   `不接受自定义目标`；OpenSpec 1.6.0 为避免场景丢失拒绝 archive/apply。

Dashboard `design-taste-frontend`、视觉、响应式、可访问性、状态、竞态和性能轨为
C0/H0/M0/L0。失败项都不允许在 Verify 内修复；本报告登记后必须通过确切
`verify-fail` 返回 Build，补红测、最小修复、重新冻结并从零重跑全部轨道。

## 冻结边界、CI 与 GitHub

- local HEAD、远端 PR head、`build_sha`：
  `f4c29f0a0acc82beb3f7e759d4b385b334a4b0c3`。
- base 与 merge-base：
  `4c242b928b61285561f9cdbc63617db899a18a12`。
- 产品提交 `4decb6e59cbfea36786bcef3b732c83ba32f9049` 的 CI run
  `30419488435`：PASS。
- 冻结 head 的 CI run `30419885878`：PASS；Documentation Pages run
  `30419885888`：PASS（build success，deploy 按配置 skipped）。
- 聚合前在线复核：PR #8 仍为 OPEN、非 Draft、MERGEABLE/CLEAN，base/head 未漂移，
  0 reviews、0 issue comments、0 review threads。
- `origin/main...build_sha` 共 327 个唯一路径，A287/M38/D2，+9010/-767。
- Verify handoff bundle aggregate digest：
  `sha256:49fcca50377526808adea55bca46e2455d457d6bb955a5bd3e0d2e822c6b0658`。

## M1：排队等待逃逸每请求 10 秒 deadline

`packages/server/src/serverGetHostTargetPlanRoutes.ts` 的 `schedule()` 只把 item 放入
queue；AbortController 和 timeout 在 `drain()` 取出 item、占用执行槽以后才创建。
所以文档与规格承诺的单请求 10 秒边界只约束 child 执行，不约束队列等待。

独立 API/E2E 轨通过真实 production server 复现默认参数
`maxConcurrent=4 / timeout=10s`：

| 请求 | 结果 | 观测耗时 |
| --- | --- | ---: |
| 前四个不同 canonical key | `503 HOST_TARGET_PLAN_UNAVAILABLE` | 10079–10080ms |
| 第五个不同 canonical key | `503 HOST_TARGET_PLAN_UNAVAILABLE` | 20076ms |

缩短参数的 runtime 复现 `maxConcurrent=1 / timeout=100ms`，三个请求分别在
102/203/305ms 返回。合法 key 空间固定为 25，所以队列不是数学意义上的无限增长；
但四个 stuck child 会让最后一批先等待约 60 秒，再运行自身 10 秒 timer，明显违反
“一个请求有界在 10 秒”的可用性契约。

现有测试只覆盖 active load 的 timeout，不覆盖 queued expiration。Build 必须：

1. 在 enqueue 时建立绝对 deadline，child 只获得剩余预算；
2. 已过期的 queue item 不得再启动 child；
3. 保持 same-key in-flight 共享、success-only cache、resolve/reject 清理与失败后重试；
4. 增加排队超时、过期 child 未启动、槽位释放及随后健康请求恢复的 RED 回归。

Codex 原生审查与两个独立人工轨分别确认同一 Medium；真实 HTTP 证据位于
`/private/tmp/pr8-verify-track2.eSMY3T/http-queue-timeout.stdout.log`。

## M2：delta spec 不能由 OpenSpec archive/apply

第二个全新隔离 clone 使用 OpenSpec CLI 1.6.0：

- `openspec show pr-8-merge-audit --json`：exit 0；
- `openspec validate pr-8-merge-audit --strict --json`：exit 0，1/1 valid；
- `openspec archive pr-8-merge-audit --yes --json`：exit 1，
  `archive_spec_update_failed`；
- CLI 明确报告 `No files were changed`。

失败原因是 MODIFIED requirement `稳定且零副作用的宿主目标目录` 没有保留 canonical
spec 中的 scenario `不接受自定义目标`。虽然 Change 自身 strict validate 通过，
真正 apply 会删除既有场景，因此 OpenSpec 拒绝落盘。这会直接阻断 Ship/Archive。

隔离演练指纹：

| 对象 | before | after |
| --- | --- | --- |
| canonical target spec | `9d1605bed87e4bb8981edd9613b1c61371665268d523d87a60c46c9e4decb1ed` | 同左 |
| delta spec | `d1c595498af3f4232b5efbabb48f551ef6588c67252f2871b755cd64edbaf3de` | 未改 |
| canonical aggregate | `cd12032baa598678b282e184d8fb2c2f17301219f6861418b343bdf1233c3c09` | 同左 |

Build 必须把该 MODIFIED requirement 的完整 canonical scenario 集合带入 delta，并重新执行
show、strict validate 与隔离 archive/apply，证明既有场景无损保留。失败 JSON 位于
`/private/tmp/pr8-verify-track2.eSMY3T/openspec/archive.json`。

## Reviewer / correctness / security / architecture

结论：**FAIL — C0/H0/M1/L0**，M1 为上述排队 deadline。

- 逐项映射并审查 327/327 路径，以及五个 modified requirements 的调用链、测试和文档。
- 校验 246 个 JSON、2 个 JSONL/289 rows、101 对 revision/pre-review companion、
  34 个 transition、当前 8/8 document ledger 与 hash/read receipt。
- 检查固定 argv、Host guard、strict one-document JSON/DTO、错误脱敏、12×2 真值表、
  adapter `--target .`、AbortSignal、有限 cache/in-flight、secret pattern、许可边界、
  兼容性与生成物新鲜度。
- 独立 clone 的 root build、CLI/server/Dashboard dist 重建一致；
  root 322 files / 5614 pass / 14 honest skips；
  Web 61 files / 1098 pass；typecheck、architecture、comments、docs、hygiene、
  hooks、adapters、bundle、skills、golden oracle 全绿。
- Reviewer 轨没有重复认领由其他轨负责的浏览器、GitHub 在线状态和 OpenSpec
  archive/apply。

## E2E / API / OpenSpec

结论：**FAIL — C0/H0/M2/L0**。

通过项：

- `npm ci`、root build、targeted root 400 pass/9 skip、targeted Web 117 pass、
  Web typecheck；
- CLI 12 hosts × setup/update 共 24 个黑盒计划，schema/argv/order/
  `side_effects:none` 全部正确；
- 恶意 host/operation 均非零、stdout 空、稳定 stderr 不回显攻击字符串；
- Darwin built server：catalog 12、24 plans 均 200、8 类非法 query 均 400，
  `/`、`/index.html`、cadence、catalog、plan 的恶意 Host 均 403；
- Linux Node 22 只读 Docker：catalog 12、plans 24、Host 403 矩阵通过；
- Playwright production server：loading/success/empty/error/keyboard 通过；
- comments、architecture、default-workflow freshness、docs、templates、identity、
  hygiene、migration CAS、hooks、adapters、skills、bundle、oracle 全绿；
- `check:npx-package` 串行复跑 39/39。

压力并行运行的真实结果保留而不伪报：

- 首次 Web full：1097 pass、1 个 focus timing failure；单测 61/61，完整串行复跑
  1098/1098。
- root full：5610 pass、14 skip、4 个 timing failures；四项隔离复跑 5/5。
- `check:npx-package` 首次资源压力失败；串行复跑 39/39。

这些 timing failures 可独立通过，未计入产品 finding；M1 已由确定性短时 runtime 与真实
HTTP 单独复现。M2 则由第二个隔离 clone 的真实 archive exit 1 证明。

## Dashboard / design-taste / accessibility / performance

结论：**PASS — C0/H0/M0/L0**。

- production assets：`index-BVZQiOXw.js`、`index-gVNTWc3n.css`。
- 24 个组合全部通过：390/768/769/900/1024/1440 × zh/en × light/dark。
- 0 body/document 横向溢出，0 console warning/error/page error，0 对比度失败，
  0 英文页中文泄漏；12 个宿主完整且顺序正确。
- 390 单列，768/769 两列卡片加后置 detail，900 起稳定 master-detail。
- catalog loading/ready/empty/503/network/decoder/mismatch、plan loading/503/retry、
  unknown 520 redaction、copy success/failure、Setup 慢响应与 Update 快响应竞态全通过。
- 只出现 GET；没有 mutation、Run 或 Execute。安全命令精确为
  `tenon setup --cursor --target .`。
- skip link、detail focus、2px `#2563eb` focus ring、Tab 顺序、Space、
  `aria-pressed`、live status、heading、reduced-motion 全通过。
- 三次 loopback 冷采样：ready 77/78/80ms，DCL 46.9–47.2ms，
  FCP/LCP 88–92ms，CLS 0，最大 Event Timing 40ms，long task 0。
- 证据：`/private/tmp/pr8-verify4-visual-MkseAU/trace.zip`，
  SHA-256 `7bfa72e72e0ae63ac60818d702e281d6647abad64f98ae40df3dd8612fa728b3`。

## Codex CLI

结论：**FAIL — 1 个 P2/Medium**，即 M1。

- 第一条带自定义 prompt 与 `--base` 的调用被参数解析器拒绝，没有开始审查，也不作为证据。
- 正确调用在 detached frozen clone 中执行
  `codex exec -s read-only --ephemeral ... review --base origin/main`，
  session `019fabfa-a45a-77f1-b8df-d400ef89c6ae`。
- Codex 逐层审查后指出 queue wait 不在 timer 内，并建议在 schedule 时建立 deadline。
- 只读 sandbox 没有 `node_modules`，所以 Codex 自身的 Vitest/typecheck 未运行；
  它完成 CLI smoke、docs/hygiene 与源码追踪。依赖测试由其他隔离轨完整执行。
- 本地 log DB/model cache/plugin metadata warning 属于 Codex 环境噪声，不是产品 finding。

## 327 路径的完整 capability 映射

以下编号对应
`git diff --name-only origin/main...f4c29f0a0acc82beb3f7e759d4b385b334a4b0c3`
的稳定排序，范围连续、互斥且合计 327，因此没有未映射路径：

| 编号 | 数量 | 路径类别 | Requirement / 验证责任 |
| --- | ---: | --- | --- |
| 1–2 | 2 | `README.md`、`README.en.md` | 单目标计划、Dashboard、兼容/用户契约 |
| 3–18 | 16 | CONTRACT、TEST-REALITY、ADR、plans/specs/reports、双语 usage | 全部五项 requirement 的设计、现实与用户证据 |
| 19–216 | 198 | 原 `host-target-plan-dashboard` archived Change、79 对 revision/pre-review、27 transitions、spec/design/tasks/applied-spec | 原 feature 的完整七阶段 provenance 与全部五项 requirement |
| 217–279 | 63 | 当前 audit Change、22 对 revision/pre-review、7 transitions、proposal/design/spec/tasks/review | 合并审计、五项 requirement、规则/验证/发布证据 |
| 280 | 1 | canonical `host-target-plan/spec.md` | 五项 requirement 的当前基线；M2 的 apply 目标 |
| 281–288 | 8 | CLI source/test/dist | 稳定目录、单目标 setup/update、输入拒绝、兼容 |
| 289–313 | 25 | Dashboard source/test/dist | Host Plan UI、API decoder、i18n、IA、竞态、视觉/无障碍 |
| 314–323 | 10 | server source/test/dist | 严格只读 API、Host guard、并发/cache/timeout；M1 所在 |
| 324–327 | 4 | docs/hygiene tools 与 tests | 当前主线兼容、文档与仓库发布门禁 |

产品文件还按调用链逐个覆盖：CLI 8/8、server 10/10、Dashboard 25/25、tools 4/4；
治理与文档文件逐个验证 JSON/JSONL、hash、receipt、strict schema 和 capability
provenance。总计 327/327。

## 依赖审计与发布阻断

`npm audit --omit=dev` 为 1 High（vite）+ 1 Moderate（esbuild）；完整 audit 为
5 Moderate + 1 High + 1 Critical。PR #8 没有修改 package manifest 或 lockfile，
main 的 PR #7 验证报告与原 PR #8 归档报告已诚实记录同一基线和“独立 dependency/release
Change 修复，否则不发布”的结论，因此不计为 PR #8 regression。

但本自动化最终包含 GitHub Release：依赖基线仍是硬阻断。合并队列完成后，必须先由独立
release/dependency Change 修复并重跑 audit；如果不能安全修复，就停止在 release 前，
不得发布 tag 或 GitHub Release。

## Repo-zero 与回退计划

聚合后共享 worktree 仍保持冻结边界：

- packages diff：
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`；
- audit Change 外 diff/status：同一空 SHA、无条目；
- canonical specs aggregate：
  `cd12032baa598678b282e184d8fb2c2f17301219f6861418b343bdf1233c3c09`；
- 共享树只保留 `pr-8-merge-audit` 的合法 transition/revision/document 状态；
  所有独立轨均未写 packages 或 canonical specs。

后续顺序：

1. 登记本报告并取得 exact-event `verify-fail` delegated receipt，返回 Build。
2. 先加 M1 排队 deadline 红测并最小修复，再补 M2 完整 canonical scenario。
3. 重跑 focused、root/Web full、build/generated、架构、安全、hygiene、Linux/Darwin、
   API、CLI 24、OpenSpec isolated archive/apply 与 production browser。
4. 重新执行三条独立 pre-Verify review，要求 C/H/M/L 全为 0。
5. 普通提交、非强制推送、等待 exact-head CI 成功，再冻结新 `build_sha`。
6. 新 Verify 从零重跑四轨、Codex、327+ 路径映射、GitHub 与 repo-zero；本轮 PASS
   证据只能作为回归输入，不能复用为新轮次的通过结论。
