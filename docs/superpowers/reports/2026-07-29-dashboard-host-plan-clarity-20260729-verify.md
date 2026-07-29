# dashboard-host-plan-clarity-20260729 Verify 报告

## 冻结基线与范围

- Change：`dashboard-host-plan-clarity-20260729`
- Track：`frontend`
- Build SHA：`9f031517e4d14f98bb39217ea7ef8ba805a95bf3`
- Tree：`79ef9fdf258c19f751b2812d1216c217c1e6b4a9`
- 目标：1024–1920px 电脑端 Host Plan；未执行手机端设计、截图或验收。
- 运行态：`http://127.0.0.1:18845/?view=hostPlan`，Codex 内置 Chromium。

Verify 前后，冻结源码、测试、文档与 `packages/dashboard-app/dist` 相对 Build SHA 均无漂移；工作区仅包含 Tenon 自身在 Verify 阶段生成的 canonical control/evidence 记录。

## 机器验证

| 命令 | 结果 |
| --- | --- |
| `npm run test:web -- --run packages/dashboard-app/src/hostPlan/HostTargetPlanView.test.tsx` | PASS，19/19 |
| `npm run typecheck:web` | PASS |
| `npm run test:web` | PASS，61 files / 1099 tests |
| `npm run build` | PASS；Dashboard、server、CLI bundle 均生成成功 |
| `npm run check:comments` | PASS |
| `npm run check:architecture` | PASS，648 production files |
| `git diff --check` | PASS |

Vite 保留既有的 500KB chunk warning；冻结 JS 从 851,512 增至 852,276 bytes，未发现本批次性能回归。仓库无独立 lint 或独立 E2E npm script，因此没有声称运行不存在的命令。

## TDD 证据

- 红：新增“目录不重复 capabilities、已选详情完整展示上下文”测试后，测试按预期在目录仍包含 `原生 marketplace` 时失败。
- 绿：移动 capabilities 并添加已选宿主上下文后，定向 19 项全部通过。
- 重构：首版 1024×768 只有 5 项完整可见；把元数据收敛为单行后复测为 7 项，最终卡片高 80px。

## 真实浏览器验收

### 四档电脑端

| 视口 | 完整可见宿主 | 单项高度 | 横向溢出 | 目录/详情重叠 | 名称截断 |
| --- | ---: | ---: | --- | --- | --- |
| 1024×768 | 7（独立视觉轨保守计 6） | 80px | 无 | 无 | 无 |
| 1200×870 | 8（独立视觉轨保守计 7） | 80px | 无 | 无 | 无 |
| 1440×900 | 8 | 80px | 无 | 无 | 无 |
| 1920×1080 | 10 | 80px | 无 | 无 | 无 |

1024×768 明显高于基线 4 项并满足“至少 6 项”。已选详情在 operation group 之前展示 CLI flag、kind、scope 和全部 capability；选择宿主不会发出计划请求或执行命令。

### 状态与交互

- Success：真实 Codex Setup API 返回 200；展示 `tenon setup --codex`、7 个步骤和只读 notice。
- Loading：真实 Cursor 计划请求施加网络延迟后，页面显示“正在加载 Cursor 的 Setup 计划…”。
- Error/恢复：仅阻断 Gemini 计划请求，页面显示网络错误与“重试 Setup 计划”；恢复后重试成功。
- Empty/恢复：在 1440×900 将真实 `/api/host-targets` 响应替换为零目标 DTO，浏览器显示“没有可用的宿主目标。”和“重试宿主目录”；撤销拦截并重试后恢复 12 个宿主。
- Stale response：GitHub Copilot loading 时切换到 Pi，旧计划未覆盖当前选择。
- Keyboard：Space 选择 Claude，Enter 触发 Setup；原生按钮、`aria-pressed`、状态公告和可见 2px focus ring 均有效。
- Theme：Light、Dark 与当前系统 Light 均清晰；System 沿用 `matchMedia` 解析。
- Reduced motion：真实媒体模拟下 `prefers-reduced-motion=true`，页面无活动动画，通用 transition 退化为 `none`。
- Console：warning/error 为 `[]`。
- Copy：复制成功/同步与异步失败均由相邻组件测试验证；没有真实执行入口。

主要证据：

- `/tmp/host-plan-verify-e2e.json`
- `/tmp/host-plan-verify-viewport-metrics.json`
- `/tmp/host-plan-verify-1440-codex-setup-ready.png`
- `/tmp/host-plan-verify-1440-loading.png`
- `/tmp/host-plan-verify-1440-error.png`
- `/tmp/host-plan-verify-1440-error-recovered.png`
- `/tmp/host-plan-verify-1440-strict-catalog-empty.png`
- `/tmp/host-plan-verify-1440-strict-catalog-recovered.png`
- `/tmp/host-plan-verify-strict-empty.json`
- `/tmp/dashboard-host-plan-audit-1024-selected.png`
- `/tmp/dashboard-host-plan-audit-1024-focus.png`
- `/tmp/dashboard-host-plan-audit-1440-dark.png`
- `/tmp/dashboard-host-plan-audit-1440-reduced-motion.png`
- `/tmp/dashboard-host-plan-audit-1440-plan-full.png`

## 四轨聚合

| 轨道 | 结论 | Findings |
| --- | --- | --- |
| 独立 Reviewer | PASS | Critical 0 / High 0 / Medium 0 / Low 0；secrets 扫描无命中；临时构建与 tracked dist 逐字节一致 |
| E2E / Browser | PASS | 无 actionable finding；主路径、loading、error/recovery、stale response、键盘与四视口通过 |
| Codex CLI | PASS | Standards 0；Spec 1 个 Low：缺少“详情上下文 → operation group”显式 DOM 顺序回归断言，运行态与实现顺序正确 |
| 独立视觉 | PASS | Critical 0 / High 0 / Medium 0；无溢出、截断、emoji、console 错误或反模板问题 |

Codex CLI 首次完整 diff 输入因 minified dist 与 canonical snapshots 超过 1,048,576 字符上限而失败；随后审查全部人写源码、测试、spec/design/plan 与 `dist/index.html`，生成文件由独立临时构建逐字节比对补齐。Codex 沙箱内全量 web test 的 server integration 因 `listen EPERM 127.0.0.1` 降级，但主工作区同一冻结版本的全量 1099 tests 已通过。

唯一 Low 不阻塞本轮：现有测试已验证上下文内容、operation group 和运行态顺序，后续可补一条精确 DOM 相邻顺序断言；本轮不为非阻塞 Low 改动冻结实现。

## 逐文件 spec 回读

| 冻结提交文件 | 回读 capability/spec | 结论 |
| --- | --- | --- |
| `packages/dashboard-app/src/hostPlan/HostTargetPlanView.tsx` | `openspec/specs/host-target-plan/spec.md` + delta | 匹配 |
| `packages/dashboard-app/src/hostPlan/HostOperationPlanPanel.tsx` | `openspec/specs/host-target-plan/spec.md` + delta | 匹配 |
| `packages/dashboard-app/src/hostPlan/HostTargetPlanView.test.tsx` | `openspec/specs/host-target-plan/spec.md` + delta | 匹配 |
| `packages/dashboard-app/dist/index.html`、新增 `index-MvCmcdmH.js` / `index-CvvmwxOJ.css`、删除旧 hashed assets | `host-target-plan` 与前端 tracked dist 规则 | 匹配；临时构建逐字节一致 |
| `proposal.md`、`design.md`、`specs/host-target-plan/spec.md`、`tasks.md`、`REVIEW.md` | `document-evidence-contract`、`host-target-plan` | digest、producer、内容匹配 |
| `docs/adr/...explore.md`、`docs/research/...audit.md`、`docs/superpowers/plans/...md`、`docs/superpowers/specs/...design.md` | `host-target-plan`、`document-evidence-contract` | 匹配 |
| `.pipeline-document-locale.json`、`.pipeline-documents.json`、`.pipeline-history.jsonl`、`.pipeline.yaml`、`.pipeline-workflow-governance.json`、`.pipeline-workflow-plan.json`、`.pipeline-run/current.json` | `document-evidence-contract`、`workspace-verification-integrity` | JSON/JSONL 可解析，登记 SHA 全匹配 |
| `pre-verify-review/000000…000012`、`revisions/000000…000012`、`transitions/000001…000003` | `document-evidence-contract`、`workspace-verification-integrity` | 全部逐文件解析；revision/transition 链一致 |

## OpenSpec 隔离应用演练

- CLI：OpenSpec `1.6.0`
- `openspec show dashboard-host-plan-clarity-20260729 --json --deltas-only`：PASS，1 个 `host-target-plan` ADDED delta。
- `openspec validate dashboard-host-plan-clarity-20260729 --strict`：PASS。
- 隔离副本：`/tmp/tenon-host-plan-verify.S0mWnq`
- 副本 `openspec archive ... --yes --json`：PASS，added=1、specsUpdated=true。
- 副本 `openspec validate host-target-plan --strict`：PASS。
- 真实主 spec digest 前后均为 `9d1605bed87e4bb8981edd9613b1c61371665268d523d87a60c46c9e4decb1ed`，未被 Verify 修改。

## 结论与残余风险

结论：PASS。四轨均无 Critical、High 或 Medium finding，冻结实现满足 delta spec，可进入 Ship。

残余风险：

- Vite 单 chunk warning 为既存问题，本批次未引入代码分割。
- 开放 PR 的全局 token 后续变化可能改变视觉细节，但当前冻结版本在四档电脑端、Light/Dark/System 与 reduced-motion 下通过。
- Codex CLI 的 1 条 Low 仅是测试精度机会，不是运行缺陷。
