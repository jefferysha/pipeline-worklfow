# Loop 路径作用域预检验证报告

## 结论

FAIL。冻结构建 `7e109e59b14fe836bcf774c2cc3f36ce7d0a1a6d` 的真实 Dashboard
视觉验收通过，但独立标准审查与 Codex 复现确认 Loop registry 子路径读取未绑定可信 inode；
E2E/规格轨也没有完成隔离 OpenSpec 应用演练。本轮不接受偏差，按持续自主模式回到 Build 修复。

## 四轨结果

| 轨道 | 结论 | 证据与边界 |
| --- | --- | --- |
| Reviewer / Standards | FAIL | 完整审查冻结差异；kernel/server 291/291、Dashboard 80/80 通过。发现 `.pipeline` / `loops.yaml` symlink 与子路径 TOCTOU 信任缺口、规格缺少 403/500 错误场景、客户端未绑定响应与请求。 |
| E2E / Spec | FAIL | 读取完整 delta spec、plan、tasks；导出 3,637 行冻结 diff（SHA-256 `6b233af110bef5c7b70d4fe6749c32a907d42807c62ff2fac52e4c6ca6cff804`），逐段审阅 2,046 行非生成源码。隔离测试与 OpenSpec archive/apply 演练未完成，不能签 PASS。证据目录 `/tmp/tenon-verify-track2.gEqHQK`。 |
| Codex CLI | FAIL | 完成完整差异、调用链、安全边界与生成物审查；真实脚本证明外部 `.pipeline` symlink 会被读取，decoder 也接受 101 项和矛盾的 L2/L3 enforcement 响应。隔离全量测试受 `listen EPERM 127.0.0.1` 影响；审查进程汇总阶段未正常退出，按降级失败记录。 |
| 视觉审查 | PASS | 真实 `Tenon Dashboard`，桌面 zh/light 与 390px en/dark；覆盖空、非法、加载、成功、错误重试、Ctrl/Meta+Enter、Tab/Shift+Tab、Escape/焦点恢复，无溢出或 page error。证据 `/tmp/tenon-loop-scope-qa.WZoW35/qa-results.json`。 |

## 必须修复的发现

1. **Medium · 安全/正确性**：`POST /api/loops/scope-preview` 只在 pathname 读取前后复核项目
   root，随后 `loadRegistry(root, nodeLoopIoStrict)` 会跟随 `.pipeline` 或 `loops.yaml` symlink，
   且子路径存在 TOCTOU 窗口。必须使用绑定文件描述符的只读 registry 读取并覆盖目录 symlink、
   文件 symlink、子项换位测试；失信统一 fail-closed。
2. **Low · 契约**：设计与 delta spec 必须补充已实现的
   `LOOP_SCOPE_ROOT_UNTRUSTED`（403）和 `LOOP_SCOPE_REGISTRY_READ_FAILED`（500）场景。
3. **Low · 客户端响应绑定**：解码后必须验证 `loop_id`、路径顺序/集合、最多 100 项及
   `enforced_for_unattended_merge === (active && L3)`，拒绝与请求或派生事实矛盾的响应。
4. **Low · 计划命令**：`npm test -w @tenon/server` 在该 workspace 没有 `test` script，
   计划应改为根级 `vitest run <paths>`。
5. **验证完整性**：下一轮必须重新全量审查新冻结差异，并在隔离副本完成 OpenSpec
   show、strict validate、archive/apply 演练及前后 fingerprint 对比。

## 已执行的构建与测试

| Gate | 结果 |
| --- | --- |
| kernel/server 定向测试 | PASS；291/291 |
| Dashboard 定向测试 | PASS；80/80 |
| `npm run typecheck:web` | PASS |
| `npm run test:web` | PASS；52 files / 972 tests |
| `npm run build` | PASS |
| `npm test` | PASS；317 files / 5,459 passed / 5 skipped |
| 真实浏览器验收 | PASS；见视觉轨证据 |
| Codex 隔离全量测试 | INCONCLUSIVE；网络监听被沙箱 `EPERM` 阻断，不作为代码失败 |
| E2E 轨隔离 OpenSpec 演练 | NOT RUN；因此本轮 FAIL |

完整测试中的 real-Codex/Claude secret 门按环境诚实跳过；它们不覆盖本功能。缺失外部 secret 与代码
失败分开记录。

## 改动文件到规格回读

下表逐项覆盖冻结构建相对 `origin/main` 的交付文件；Change 自身的 revision、transition 与
projection 文件归入同一治理证据契约，生成 bundle 归入相应已审源码契约。

| 改动文件 | 对应规范 | 已回读 |
| --- | --- | --- |
| `docs/adr/2026-07-28-loop-scope-preview-explore.md` | Change 设计证据 | 是 |
| `docs/superpowers/plans/2026-07-28-loop-scope-preview.md` | Change 实施计划 | 是 |
| `docs/superpowers/specs/2026-07-28-loop-scope-preview-design.md` | Change 设计契约 | 是 |
| `openspec/changes/loop-scope-preview/**` | `openspec/changes/loop-scope-preview/specs/loop-scope-preview/spec.md` | 是 |
| `packages/kernel/src/loops/automation-policy.ts` | delta spec：逐路径解释与 aggregate 兼容 | 是 |
| `packages/kernel/src/loops/automation-policy.test.ts` | 同上 | 是 |
| `packages/kernel/src/loops/index.ts` | 同上；公开共享契约 | 是 |
| `packages/server/src/loopScopePreview.ts` | delta spec：请求、响应与可信 root | 是 |
| `packages/server/src/loopScopePreview.test.ts` | 同上 | 是 |
| `packages/server/src/serverPostOperationsRoutes.ts` | delta spec：受保护 API 与稳定错误 | 是 |
| `packages/server/src/server.test.ts` | 同上 | 是 |
| `packages/dashboard-app/src/api/client.ts` | delta spec：typed client 与错误分类 | 是 |
| `packages/dashboard-app/src/api/loopScopePreview.ts` | 同上 | 是 |
| `packages/dashboard-app/src/api/loopScopePreview.test.tsx` | 同上 | 是 |
| `packages/dashboard-app/src/workbench/LoopScopePreview.tsx` | delta spec：完整 Dashboard 状态闭环 | 是 |
| `packages/dashboard-app/src/workbench/LoopScopePreview.test.tsx` | 同上 | 是 |
| `packages/dashboard-app/src/workbench/LoopAdvancedFields.tsx` | delta spec：可发现入口 | 是 |
| `packages/dashboard-app/src/workbench/WorkbenchHeader.tsx` | 同上 | 是 |
| `packages/dashboard-app/src/workbench/WorkbenchView.test.tsx` | 同上 | 是 |
| `packages/dashboard-app/src/i18n/translations.ts` | delta spec：中英文 i18n | 是 |
| `packages/cli/dist/tenon.mjs` | 已审 kernel/CLI 源码的生成 bundle | 是 |
| `packages/server/dist/dashboard.mjs` | 已审 server/kernel 源码的生成 bundle | 是 |
| `packages/dashboard-app/dist/**` | 已审 Dashboard 源码的生成 bundle | 是 |

## Spec isolation

冻结真实仓库未应用 delta spec；该边界保持正确。E2E 轨仅成功导出隔离副本，未完成官方
`openspec show`、`openspec validate --strict`、archive/apply 和主规格 digest 前后对比，因此
本轮不得 `verify-pass`。下一轮修复后必须在 Ship 之前完整补齐。

## 决策

持续自主授权采用安全默认值：不接受偏差，精确请求并 delegated acknowledge `verify-fail`，
返回 Build；涉及稳定错误契约与信任模型的文档修订使用 `requirements-changed` 返回 Spec 重新冻结。
