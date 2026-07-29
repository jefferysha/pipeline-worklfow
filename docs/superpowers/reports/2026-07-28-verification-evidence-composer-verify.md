# `verification-evidence-composer` Verify 报告

## 结论

- 冻结 commit：`7c205a258f2a40823865d704b439d6f4a83f413f`
- 冻结 tree：`f63d1f1c5178786d052ff77026676f30884964eb`
- 立项基线 / merge-base：`2d103e330f847e003ff5909097d892f5722cca04`
- Track：`frontend`（共享 kernel/server/Dashboard 纵向切片）
- 结论：**PASS**
- Findings：Critical 0 / High 0 / Medium 0 / Low 0

第三轮 reviewer、E2E 与视觉轨前后复核冻结 commit/tree 完全一致。所有会写构建
产物的验证都在隔离副本执行；截图、日志与 Codex 输出均在仓库外。真实工作树在聚合
前只有 Tenon 正常生成的 Verify 治理记录，没有实现、配置或生成物漂移。

验证期间 `origin/main` 前进到 `15fe619b`。只读
`git merge-tree --write-tree origin/main 7c205a2` 成功生成
`a0a7ff09c53700c3cd93c9b6f800cac15f5d8af7`，证明冻结分支可与最新 main
干净合并；没有为了追逐并发 main 改写已冻结靶。

## 独立 reviewer 轨

独立 reviewer 重新审查 merge-base 到冻结 SHA 的完整 123 个文件、5 条 capability
requirement、调用方、包边界、安全、错误、兼容、测试和生成物。

- Standards：0 finding。
- Spec：0 finding。
- 先前 Tab 焦点泄漏已修复：外层 drawer 在嵌套 modal 存在时让出完整键盘边界，
  内层 `Dialog` 独占正/反向 Tab 与 Escape。
- 先前目录边界 Low 已修复：composer 专用文件移入 `src/verification/`，
  `shared` 只保留稳定公共 Dialog 与文档区集成。
- `git diff --check`、strict OpenSpec、repository hygiene、ledger SHA、治理 JSON、
  生产 HTML/bundle 引用均通过。

Reviewer 前后指纹一致，结论 **PASS**，Critical/High/Medium/Low 均为 0。

## E2E 轨

真实目标：`http://127.0.0.1:18974`，页面标题 `Tenon Dashboard`，API 版本
`1.0.1`，root 与 Change 均精确匹配。

通过路径：

- Verify-only 入口、空态、禁用生成和初始焦点；
- 客户端缺少结果错误，不发请求且保留字段；
- 真实服务端 UTF-8 预算 400，显示 `entries[0].title` 且保留字段；
- 延迟 loading、防重复提交与编辑控件禁用；
- 真实离线网络错误、本地化重试提示与字段保留；
- 受保护 API 的确定性中文 Markdown、免责声明、标题、命令和结果；
- clipboard 成功内容一致，失败时保留只读输出并提示手动复制；
- 未鉴权 POST 返回 `401 Unauthorized`；
- 内层首元素 `Shift+Tab` 回绕末元素，末元素 `Tab` 回绕首元素；
- 单次 Escape 只关闭 composer，外层 TaskDetail 与 `change=` URL 保留，
  焦点返回 `evidence-compose-open`；
- 1440×900 与 390×844，无窄屏横向溢出。

隔离副本：kernel 12/12、server route 4/4、Dashboard API 4/4、
composer + shared Dialog 16/16，`typecheck:web` 通过。证据目录：
`/private/tmp/verification-evidence-composer-e2e-third`。

E2E 前后指纹一致，结论 **PASS**。

## 视觉与可访问性轨

1200、768、320 三个断点的空态、客户端错误、服务端错误、加载、真实成功、
复制与 Escape 后状态均通过。蓝色可见焦点含 2px ring；正/反向焦点困笼、
纵向滚动、层次、间距、对比度均通过。没有 emoji、模板化视觉或窄屏横向溢出。

证据目录：`/private/tmp/verification-evidence-composer-visual-third`。视觉轨前后
指纹一致，结论 **PASS**，Critical/High/Medium/Low 均为 0。

## Codex CLI 轨

Codex CLI 在 `/private/tmp/tenon-codex-review-third.eHPOLT/repo` 的只读隔离副本中
审查完整冻结 diff，并读取规格、实现、测试、生成 bundle 与静态门禁。运行 10 分钟后
仍未形成稳定最终文本，主线按有界执行策略终止；期间没有返回 finding，也没有写入
真实工作区。此轨按 `tenon-verify` 的缺失/异常降级规则记录为 **degraded**，不伪造
独立 PASS。完整全量 reviewer、E2E 与视觉三轨均有效且全零，因此将
`codex_review_result` 置为 `pass`，报告保留降级事实。

## Build 后最新机器证据

- focused nested composer：58/58；
- Dashboard：52 files，975/975；
- full workspace：316 files，5,415 passed，5 honestly skipped；
- `typecheck:web`：通过；
- kernel/CLI/server TypeScript、Dashboard、server bundle、CLI bundle：通过；
- architecture、comment honesty、repository hygiene、docs、identity、npx package：通过；
- hooks：482/482；
- `openspec validate verification-evidence-composer --strict`：通过。

既有 React `act(...)` diagnostics 与 Vite chunk-size warning 是非失败基线输出；没有把
它们描述成新代码通过项或隐藏为零警告。

## OpenSpec 隔离应用演练

隔离副本：`/private/tmp/tenon-openspec-third.quDTJp/repo`。

- `openspec show verification-evidence-composer --json --deltas-only`：读取 5 条增量需求；
- `openspec validate verification-evidence-composer --strict`：通过；
- `openspec archive verification-evidence-composer --yes --json`：成功应用 5 条需求；
- 应用后的目标主规格 `verification-evidence-composer` strict validate：通过；
- 真实 `openspec/specs` digest 前后均为
  `44328f9c948d747c455e279f141d5eeb4d0f9db8571afdbb2de3bcc40aa299eb`。

全库 strict specs 的既有 7 个 capability 基线债务没有被谎报为本 Change 的绿色；
目标 delta 与应用后目标主规格均已严格通过。

## 逐文件规范回读

以下各行覆盖冻结 diff 的每个文件；连续 immutable revision 只按完整、无缺号的系列聚合，
且 reviewer 已逐个解析和比对 digest。

| 改动文件 | 对应规范 | 回读结果 |
| --- | --- | --- |
| `docs/adr/2026-07-28-verification-evidence-composer-explore.md` | 5 条 delta requirement 与方案边界 | 通过 |
| `docs/superpowers/plans/2026-07-28-verification-evidence-composer.md` | 全链路实现、测试与回滚 | 通过 |
| `docs/superpowers/reports/2026-07-28-verification-evidence-composer-verify-fail.md` | 治理兼容与失败证据 | 通过 |
| `docs/superpowers/reports/2026-07-28-verification-evidence-composer-verify-fail-2.md` | 键盘路径与治理兼容 | 通过 |
| `docs/superpowers/specs/2026-07-28-verification-evidence-composer-design.md` | 全部 5 条 requirement | 通过 |
| `docs/superpowers/specs/2026-07-28-verification-evidence-composer-upstream-a-research.md` | 结构化输入与空段省略依据 | 通过 |
| `docs/superpowers/specs/2026-07-28-verification-evidence-composer-upstream-b-research.md` | 闭集、互斥、预算与 canonical serialization 依据 | 通过 |
| `.pipeline-document-locale.json`、`.pipeline-documents.json`、`.pipeline-history.jsonl`、`.pipeline-run/current.json` | 治理兼容 requirement | 通过 |
| `.pipeline-run/pre-verify-review/000000…000032`（33 个文件） | review receipt 与冻结审查记录 | 通过 |
| `.pipeline-run/revisions/000000…000032`（33 个文件） | canonical revision/CAS 兼容 | 通过 |
| `.pipeline-transitions/000001…000011`（11 个文件） | exact-event transition 证据 | 通过 |
| `.pipeline-workflow-governance.json`、`.pipeline-workflow-plan.json`、`.pipeline.yaml` | workflow 投影与治理兼容 | 通过 |
| `REVIEW.md`、`design.md`、`proposal.md`、`tasks.md` | 接受设计、范围、任务与复审证据 | 通过 |
| `specs/verification-evidence-composer/spec.md` | capability 真相源 | 通过 |
| `packages/kernel/src/verification/evidence-composer.ts` | 闭集 DTO、预算、Unicode、确定性 Markdown | 通过 |
| `packages/kernel/src/verification/evidence-composer.test.ts` | kernel 全部场景 | 通过 |
| `packages/kernel/src/verification/index.ts` | 独立公共契约导出 | 通过 |
| `packages/server/src/serverPostVerificationRoutes.ts` | 受保护无状态 compose API | 通过 |
| `packages/server/src/serverPostRoutes.ts`、`packages/server/src/server.test.ts` | router 接线、真 HTTP 与安全错误 | 通过 |
| `packages/dashboard-app/src/api/client.ts`、`verificationEvidenceClient.ts`、`verificationEvidenceDecoders.ts`、`verificationEvidenceTypes.ts`、`verificationEvidenceClient.test.tsx` | API 契约、解码与错误路径 | 通过 |
| `packages/dashboard-app/src/i18n/translations.ts` | 中英文完整可见文案 | 通过 |
| `packages/dashboard-app/src/shared/Dialog.tsx` | modal 语义、焦点困笼与 Escape | 通过 |
| `packages/dashboard-app/src/shared/TaskDetail.tsx`、`TaskDocumentsSection.tsx` | Verify-only 入口与状态集成 | 通过 |
| `packages/dashboard-app/src/progress/useProgressDrawer.ts`、`ProgressView.test.tsx` | 嵌套键盘边界与真实调用方回归 | 通过 |
| `packages/dashboard-app/src/verification/VerificationEvidenceComposer.tsx`、`VerificationEvidenceEntryEditor.tsx`、`VerificationEvidenceComposer.test.tsx` | 空/加载/错/成功/复制/i18n/键盘交互 | 通过 |
| `packages/cli/dist/tenon.mjs`、`packages/server/dist/dashboard.mjs` | 生产 bundle 与治理/API 兼容 | 通过 |
| `packages/dashboard-app/dist/index.html`、`dist/assets/index-B83mjOm8.css`、`index-CJG6YsIV.css`、`index-DV750WXl.js`、`index-DzPykmHj.js` | 生产 Dashboard 生成物与引用增删 | 通过 |

所有上述路径均来自
`git diff --name-only 2d103e330f847e003ff5909097d892f5722cca04...7c205a258f2a40823865d704b439d6f4a83f413f`；
没有未映射的冻结交付文件。

## 剩余风险与回滚

- Codex CLI 轨没有稳定终态；已由全量 reviewer、真实 E2E、视觉轨和隔离门禁覆盖，
  但仍如实保留为 degraded。
- latest main 的两条并发提交不与本功能路径冲突，merge-tree 已证明可干净合并；CI 仍需
  在远端 PR merge ref 上复核。
- 回滚只需移除 formatter/export、POST route/client、Verify-only UI/i18n 与生成 bundle；
  无 schema、数据迁移或已有可信 verification contract 变化。
