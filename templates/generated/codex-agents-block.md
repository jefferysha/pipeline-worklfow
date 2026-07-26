<!-- PIPELINE:CODEX:START -->
## Tenon Workflow（Codex 静态层）

7-phase 流水线：open → explore → spec ⇄ build ⇄ verify → ship → archive。状态操作一律走
`tenon status` / `tenon get` / `tenon set` /
`tenon transition` / `tenon check`，勿手改 canonical state 或
`.pipeline.yaml` 投影。

正常开发对话默认走 default workflow：先调用 `tenon:tenon`，由入口 Skill 创建或恢复 Change、
初始化 OpenSpec 并分派当前 phase Skill；Todo 的一级项必须是七个 pipeline phase，任务来自该 Change 的
`tasks.md`，不得先生成脱离 phase 的通用 Todo。
`tasks.md` 出口检查只计算截至当前 phase 的任务；未来 phase 必须保留在 Todo 中但不得提前阻塞。
若 build 发现 proposal/design 的需求语义已变化，必须以 `requirements-changed` 回退 spec，重新登记、
读取并复核修订证据，禁止在 build 中覆盖旧 SHA 或绕过 spec review。

离开 review phase（explore / spec / verify）须对**确切 transition event**取得人类显式确认；先运行
`tenon review request <change> --event <event>`，再由用户确认触发
`tenon review acknowledge <change>`。档 A/B 的普通对话中，用户下一条明确回复“确认继续”或
“继续执行”会写入该 receipt；档 C 必须保留确认事实并显式 acknowledge，不能删除 marker 绕过
review-gate。verify-fail 与 verify-pass 的确认不可互用。
<!-- PIPELINE:CODEX:END -->
