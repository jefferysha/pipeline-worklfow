# Loop 路径作用域预检验证报告

## 结论

FAIL。冻结构建 `ae686fc8058e3d28d553028d320c02442ead1ffd` 的 Standards、
Spec/E2E 与视觉轨均通过；独立 Codex 轨发现一个可复现的 LOW 客户端错误归一化缺口。
持续自主模式不接受偏差，本轮按确切 `verify-fail` 返回 Build。

## 四轨结果

| 轨道 | 结论 | 证据与边界 |
| --- | --- | --- |
| Reviewer / Standards | PASS | 冻结隔离 clone 完整审查 144 个文件；C0/H0/M0/L0。server/HTTP 286、Web 974、kernel 7、hygiene、typecheck、architecture、comments、diff-check 与生成物 freshness 全部通过。报告 `/tmp/loop-scope-verify-frozen-standards.md`。 |
| E2E / Spec | PASS | 5 requirements / 21 scenarios 全映射；kernel/server 293、Dashboard 11；commit-derived 隔离目录的 strict/archive/post-archive strict 全部通过，真实主规格未改变。报告 `/tmp/loop-scope-verify-frozen-spec.md`。 |
| Codex CLI | FAIL | C0/H0/M0/L1。2xx 空体或非 JSON 会从 public typed client 泄漏 JSON parser `SyntaxError`，未归一化为稳定 `response` 错误。报告 `/tmp/loop-scope-verify-frozen-codex.md`。其只读沙箱阻断的临时文件测试由其他可写轨覆盖。 |
| 视觉审查 | PASS | 从目标 commit 直接导出的 Dashboard/server bundle 通过 SHA 对账；空/非法/加载/成功/409 重试、Unicode、键盘焦点、zh/en、light/dark、390px 均通过，C0/H0/M0/L0。报告 `/tmp/loop-scope-verify-frozen-visual.md`。 |

## 必须修复的发现

1. **Low · 成功响应错误归一化**：`postLoopScopePreview` 在 `response.ok` 分支直接
   `await readJson(response)`。2xx 空体或 malformed JSON 会绕过 `LoopScopePreviewError`
   契约并泄漏原始 `SyntaxError`。必须用测试先复现，并把所有成功体 JSON 解析失败稳定映射为
   `LoopScopePreviewError('response', status)`；同时保留现有 malformed DTO、请求绑定与 abort 行为。

## 冻结证据

- Standards 报告 SHA-256：`53b0faffc7f1aa2232f82e5176031835e42a5d1dacf5645ad020044a38dffea3`。
- Spec/E2E 报告 SHA-256：`21506fa96a5301171d52c88fb62780ed2ed0779c1e85875d99bb23bd671ecabd`。
- Visual 报告 SHA-256：`054a1c9b4fd7e5e31e8f73f251359e9a2d8565ae3de0c83e075234f978219e26`。
- 视觉轨实际加载 `index-DOVtra-l.js` 与 commit blob SHA-256 相同；server bundle 同样对账。
- 浏览器 fixture、临时服务和隔离 OpenSpec 环境均位于 `/tmp`，共享工作树状态前后不变。

## 决策

精确请求 `verify-fail`，使用当前 Change 绑定的 delegated receipt 返回 Build。修复后重建
Dashboard bundle，重新冻结并再次执行全部四轨；不能仅复查该 LOW。
