# Prompt Routing Bypass 第三轮验证报告

## 结论

**FAIL，返回 Build 修复。**

冻结基线为 `3af26e87e8db463954e822be14fa388aed71bb51`，相对
`origin/main@2d103e330f847e003ff5909097d892f5722cca04` 共审查 128 个变更文件。四轨全部完成：
E2E 与视觉轨 PASS；Reviewer 轨发现 1 个 MEDIUM；Codex 轨发现 1 个 HIGH、2 个 MEDIUM
和 1 个 LOW。聚合去重后为 **1 HIGH、3 MEDIUM、2 LOW**，不得带偏差进入 Ship。

## 冻结与零输出屏障

- `tenon get prompt-routing-bypass build_sha`
  → `3af26e87e8db463954e822be14fa388aed71bb51`。
- 四轨均从该 Git 对象或 `git archive` 隔离副本读取；真实工作区没有实现、配置或生成物漂移。
- 主线与各轨并发产生的差异只涉及受管 `.pipeline-documents.json` read receipt；HEAD、index、
  冻结 tree、产品内容与真实 main spec 摘要未变。
- 浏览器截图、测试日志、构建产物与 OpenSpec archive 演练均写入 `/tmp`。

## 聚合 findings

### HIGH

1. `hooks/prompt-intent.sh:10-98` 只检查 `.pipeline/hooks.json` 可读，随后执行无界逐行读取。
   项目可控的 symlink、FIFO 或超大文件可能让每次 UserPromptSubmit 的 `router`/`breadcrumb`
   阻塞。修复必须拒绝 symlink/非普通文件并在解析前实施严格字节上限，补 symlink、FIFO、
   oversized 回归。

### MEDIUM

1. 英文 Dashboard 的读取/保存失败仍可能显示中文底层错误。
   `governanceClient.ts:115-119`、`transport.ts:22-23` 与 server 中文 `error` 会被
   `HookTimeline.tsx:165-167` 拼入英文 alert。修复应使用稳定错误 code 或前端 locale 映射，
   并覆盖英文 GET、POST、network、malformed-response 路径，断言无中文泄漏。
2. `packages/server/src/hooksConfig.ts:193-226` 的两个 writer 都是无锁 read-modify-rename。
   两个 server 进程可从同一旧快照写回，丢失 keyword 或 matrix 更新。原子 rename 只保证单次
   可见性，不保证字段互保；需使用项目现有锁/CAS 契约并补跨进程竞争测试。
3. `hooks/prompt-intent.sh:8-104` 新增约 100 行 JSON/matrix codec，与 server canonical
   validator 重复，违反 Hook 应保持 thin shim 的项目规则。修复应建立单一 codec/派生契约，
   保留 Bash 热路径零 Node/Python 与损坏配置 fail-safe 行为，并用生成/一致性门禁防漂移。

### LOW

1. `prompt-intent.sh` 对带逗号与末项的 matrix entry 重复实现提取、校验、duplicate detection；
   在解决单一 codec 时一并消除。
2. `REVIEW.md` 同时记录最新 hooks `495/0` 与旧 `494/494`，证据计数不一致；修订为按轮次明确
   的红/绿结果。

## Reviewer Agent

结论：FAIL。

- 全量覆盖 128 个文件；历史 clear→type→Enter、locale pending POST、canonical parity、
  路径提示、加载/保存/禁用/root race/contrast 等 finding 均保持关闭。
- 新发现英文错误态 i18n MEDIUM 与 REVIEW 计数 LOW。
- `git diff --check`、83 个治理 JSON、37 个 revision/pre-review 与文档 digest 均一致。

## Codex CLI

结论：FAIL。

- 以 read-only、完整 `origin/main...3af26e87` 范围审查全部产品、测试、文档、生成物和治理证据。
- 发现无界项目文件读取 HIGH、跨进程丢更新 MEDIUM、重复 codec MEDIUM、重复分支 LOW。
- 只读检查通过：diff check、三份 Bash syntax、web typecheck、生成 JavaScript syntax、治理链路。

## E2E

结论：PASS。

- 隔离副本 `/tmp/tenon-prb-verify2.MtqXaH`：`npm run build` PASS；server 301/301；
  HookTimeline 18/18；hooks 495/495。
- Chrome 验证 `Tenon Dashboard`、精确隔离 root、默认/保存/非法零 POST/禁用、GET/POST
  错误恢复、busy、pending POST 切换语言、clear→type→Enter、375px 移动端均通过。
- duplicate matrix key 在 API 与 router 均回退默认；custom/disabled token 边界与
  confirm/review `rc=2` 通过。
- 日志 `/tmp/prb-verify2-{build,server-tests,ui-tests,hooks-tests,openspec-show,openspec-strict,openspec-archive}.log`；
  截图 `/tmp/prb-verify2-{desktop,locale-pending,clear-enter,mobile}.png`。

## 视觉轨

结论：PASS，无 severity finding。

- 冻结副本 `/tmp/tenon-verify-3af26e87.uCsnjl/repo`，title/root/bundle 均匹配固定提交。
- 覆盖 zh/en、1440/375、loading/ready/invalid/load error/save error/busy/success/disabled、
  Tab 焦点、reduced-motion、对比度与移动端溢出；pageerror=0。
- 截图 `/tmp/tenon-frozen-3af26e87-*`。

## OpenSpec 隔离应用演练

- `openspec show prompt-routing-bypass --json --deltas-only`：PASS。
- `openspec validate prompt-routing-bypass --strict`：PASS。
- `git archive 3af26e87...` 到 `/tmp/tenon-prb-verify3.rJZ5e8` 后运行
  `openspec archive prompt-routing-bypass --yes --json`：PASS。
- 隔离后的 `openspec validate prompt-routing-bypass --type spec --strict`：PASS。
- 真实 `openspec/specs/**/spec.md` 聚合摘要前后均为
  `44328f9c948d747c455e279f141d5eeb4d0f9db8571afdbb2de3bcc40aa299eb`。

## 逐文件规格回读

128 个冻结变更文件均按类型回读：

- Hook 与测试 → delta `prompt-routing-bypass` + `normal-chat-routing`；
- server/API/config 与测试 → delta + `live-dashboard-project-anchor`；
- Dashboard/API/i18n/组件/生成资产 → delta + `live-dashboard-project-anchor`；
- OpenSpec、计划、报告、ledger 与 transition → delta + `document-evidence-contract`。

四类均完成规格比对；本轮失败来自安全、并发、架构与 i18n 门禁，不是未覆盖文件。

## 修复出口

回到 Build 后一次性修复上述 1 HIGH、3 MEDIUM、2 LOW，补齐先失败测试并重新生成资产；
重跑完整 Build 门禁、浏览器验收和全量 pre-Verify review，提交新冻结 SHA 后重新执行四轨 Verify。
