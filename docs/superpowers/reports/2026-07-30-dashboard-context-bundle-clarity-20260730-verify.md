# Dashboard Context Bundle 最终 Verify 报告

## 固定靶与结论

- Change：`dashboard-context-bundle-clarity-20260730`
- Track：`frontend`
- Build SHA：`b5750f0812eb15f99bfc1a2b635c55e5ab232f7f`
- 比较基线：`0a05e565`
- 结论：**PASS**
- 聚合：CRITICAL 0、HIGH 0、MEDIUM 0、LOW 2

第四轮 Reviewer、E2E、Codex CLI 与 Visual/accessibility 全部读取同一冻结提交；真实 worktree
未发生实现、配置或生成资产漂移。前三轮 Verify 分别发现并修复了 transform duration/取景、
静态 loading 与空态/表单属性，以及 `1001 / 1000` 被舍入为 100% 的边界缺陷。

## 四轨结果

| 轨道 | 结果 | 新鲜证据 |
| --- | --- | --- |
| Reviewer | PASS，C0/H0/M0/L2 | 隔离副本 `/tmp/dashboard-context-review-b575.mUufHW/repo`；完整区间、caller/hook/API/decoder、状态/错误/安全、a11y、i18n、两项 capability、tests、dist 与 Tenon 链全量复核。定向 57/57、Dashboard 1229/1229、typecheck、OpenSpec strict、静态门禁和可复现 `build:web` 均通过。 |
| E2E | PASS | 隔离副本 `/tmp/context-bundle-verify-b575.w6yPC6`；Context Bundle 19/19，`1001/1000` 专项 1/1，Dashboard 1229/1229，API/security 42/42，根测试 5781 passed/14 skipped，build/typecheck 与真实 macOS 501 均通过。 |
| Codex CLI | PASS | clean detached clone `/tmp/context-bundle-codex-4.LGjmfN/repo`，`codex exec --sandbox read-only --ephemeral review --base 0a05e565`；没有 actionable correctness regression。原始输出：`/tmp/dashboard-context-bundle-codex-review-4-clean.txt`。只读 sandbox 拒绝其两个临时 here-doc 诊断，不影响已完成的只读 diff 审查。 |
| Visual / accessibility | PASS，C0/H0/M0/L2 | 复用完整桌面矩阵并新增 `b575` 1-byte overrun 截图；精确文字、ARIA、视觉钳制、主题、键盘、状态、reduced-motion、overflow 与 console 均通过。 |

## 关键行为回归

- `usedBytes=1001`、`maxBytes=1000` 显示「已使用 101%」，明确不显示「已使用 100%」。
- 精确值为 `1,001 / 1,000 bytes`，恢复信息为「超出 1 bytes」。
- `progressbar` 的 `aria-valuetext` 为 `1,001 / 1,000 bytes，已使用 101%`，
  `aria-valuenow=1000`、`aria-valuemax=1000`，视觉 fill 保持 `scaleX(1)`。
- 1440×900 根级横向溢出为 0，console warning/error 为 0。
- 生产资产为 `packages/dashboard-app/dist/assets/index-Dgcil20F.js`；
  隔离 `build:web` 后 tracked dist 零差异。
- 截图：
  `/tmp/dashboard-context-bundle-clarity-1-byte-overrun-b575-1440x900.png`，
  SHA-256 `abb00629c71e6169eba00bd7873018cc19f954f1ba6ffda47382a066b9e3a98f`。

## 完整测试与静态门禁

| 命令 / 检查 | 结果 |
| --- | --- |
| `npm run test:web` | 69 files，1229/1229，exit 0 |
| `npm run build` | exit 0；Dashboard 2038 modules |
| `npm run typecheck:web` | exit 0 |
| Context Bundle 定向测试 | 19/19，exit 0 |
| API/security 定向测试 | 4 files，42/42，exit 0 |
| `npm test` | 327 files，5781 passed、14 skipped，exit 0 |
| `npm run check:architecture` | PASS，671 production files |
| `npm run check:comments` | PASS |
| `npm run check:repository-hygiene` | PASS |
| `npx openspec validate dashboard-context-bundle-clarity-20260730 --strict --json` | 1/1 PASS |
| `git diff --check` | PASS |
| 真实只读 HTTP | macOS 预期 `501 CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE`，无 path 泄露 |

E2E 的两个附加源码审计脚本曾因脚本自身正则/引号错误退出 1；修正后同一检查 exit 0，
产品测试与构建没有失败。14 个根测试为仓库条件性 skip；`npm ci` 仍报告既有 7 项依赖漏洞，
Vite 仍报告既有大 chunk warning，均非本 Change 引入。

## 电脑端浏览器证据

验收目标为本 worktree 的真实生产 Dashboard
`http://127.0.0.1:18865/?view=progress&root=...&change=dashboard-context-bundle-clarity-20260730`。
页面使用最终资产 `index-Dgcil20F.js`。

- 1024×768、1200×870、1440×900、1920×1080：导航、抽屉、控制、容量摘要和输入行可操作，
  根级横向溢出为 0。
- Light、Dark、System：success/warning/focus/表面 token 语义一致。
- success、loading、policy-empty、budget-error、稳定 501、disabled/retry：文字与对应 semantic
  role 完整；loading 为静态 skeleton。
- target → budget → submit 的键盘顺序与 Enter 提交保持不变。
- normal motion 为 200ms transform-only；reduced motion 为 0s/none。
- 本 Change 未运行或声称手机端验收。

## 逐文件 spec 回读

`git diff --name-only 0a05e565...b5750f08` 共 115 个文件，按下列互斥范围逐项回读并勾选；
每个路径都命中一行，未发现未映射文件。

| 文件范围 | 命中的 capability / contract | 结论 |
| --- | --- | --- |
| `packages/dashboard-app/src/progress/ContextBundlePreview.tsx` | `context-bundle-budget-preview` | 请求、竞态、empty/error/retry 与表单顺序符合主规格和 delta。 |
| `packages/dashboard-app/src/progress/ContextBundlePreviewParts.tsx` | `context-bundle-budget-preview` + `dashboard-ui-ux-system` | 容量、ARIA、Lucide、静态 loading、transform-only motion、桌面层级符合规格；1-byte overrun 已闭环。 |
| `packages/dashboard-app/src/progress/ContextBundlePreview.test.tsx` | 两项 capability | success/empty/loading/error、键盘、i18n、motion 与 overrun 断言完整。 |
| `packages/dashboard-app/src/i18n/translations.ts` | `context-bundle-budget-preview` | 中英文键结构对称；保留一项英文单数 Low。 |
| `packages/dashboard-app/dist/index.html`、`dist/assets/index-ClhPblSB.js`、`index-Dgcil20F.js`、`index-bvENxFTR.css`、`index-DWdJVi20.css` | 两项 capability / release asset contract | 最终 HTML 引用一致，隔离重建零差异。 |
| `openspec/changes/.../specs/context-bundle-budget-preview/spec.md` | `openspec/specs/context-bundle-budget-preview/spec.md` | modified requirement 与主规格边界兼容，隔离应用后 strict 通过。 |
| `openspec/changes/.../specs/dashboard-ui-ux-system/spec.md` | `openspec/specs/dashboard-ui-ux-system/spec.md` | added desktop hierarchy requirement 与现有 UI system 兼容，隔离应用后 strict 通过。 |
| proposal、design、plan、ADR、tasks、REVIEW、3 份 verify-fail 报告 | 两项 capability + Change 治理契约 | 范围、设计、失败闭环和验收结论一致。 |
| `.pipeline-document-locale.json`、`.pipeline-documents.json`、`.pipeline-history.jsonl`、`.pipeline-run/current.json`、`.pipeline.yaml`、workflow governance/plan | Tenon canonical governance / document evidence contract | 10/10 ledger digest 匹配，JSON/JSONL 可解析，只由 Tenon CLI 产生。 |
| `.pipeline-run/pre-verify-review/000000..000037` 与 `.pipeline-run/revisions/000000..000037` | Tenon immutable revision contract | 38 对 immutable receipt/revision 顺序连续、同源。 |
| `.pipeline-transitions/000001..000011` | Tenon transition contract | transition 连续，三次 Verify fail 均有 exact-event receipt。 |

## OpenSpec 隔离应用演练

- OpenSpec CLI：`1.6.0`。
- 真实 `show --deltas-only` 与 Change strict validate：exit 0。
- 隔离副本：`/tmp/context-bundle-openspec-4.pNU5Ne/repo`，detached
  `b5750f0812eb15f99bfc1a2b635c55e5ab232f7f`。
- 隔离 `openspec archive dashboard-context-bundle-clarity-20260730 --yes --json`：exit 0。
- 应用后的 `context-bundle-budget-preview` 与 `dashboard-ui-ux-system` 分别 strict validate：exit 0。
- 隔离应用后主规格摘要：
  `8768099b5bb8773794d3cf5ad5198ea3aceaa502eeb8f4b1078bc632ee0ae389`、
  `ef8be0955b209208458e38e578f1dcc40493132f0a9a3fd9744dfe50dcb46f2f`。
- 真实 28 份主规格聚合摘要前后均为
  `9a8b2edc978f4d3e53bffa938de6ccf997f5391b10eafbeea1046de45bbc98bd`，
  Verify 未写真实 `openspec/specs`。

## 剩余低风险

1. 英文 1-byte overrun 会显示 `1 bytes over`，同类 remaining 也没有 singular 分支。数值、
   状态和可访问值均正确；后续可统一引入 count-aware i18n。
2. server 上限为 64 项时简单列表会形成有界长抽屉滚动；无横向溢出且当前数据量有上限，
   本批不扩大 API 或引入 virtualization/content-visibility。

两项均为 Low，不阻断本批 Ship；回滚时可整体回退本 Change 的前端源码、翻译与生成资产。
