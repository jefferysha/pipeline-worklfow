# Workflow decomposition policy — Verify 失败回 Build 报告

## 范围

- Change：`workflow-decomposition-policy`
- Track：`backend`
- 当前 phase：`verify`
- 分支：`codex/workflow-decomposition-policy-20260803`
- 当前冻结 HEAD：`1d6ced61f7106d2d5b7f9a57d1cfaedc3b6f8c0a`
- PR2 精确 head：`0c0ea1dee7a10b5e181f0f89d34c611e0a3d215a`
- `origin/main` 实现前已检查：`a710a99f078b78942b501794b019f8c25be7e764`
- PR2 ancestry：`0c0ea1dee7a10b5e181f0f89d34c611e0a3d215a` 是 `origin/main` 的祖先。

## 结论：FAIL，必须回 Build

此前冻结实现的回归证据是绿的，但独立只读 review 发现两个真实缺陷，不能把测试绿写成整体 PASS：

- 全仓：`364` 个文件通过，`6,347 passed`，`26` 个环境相关用例 honest skipped。
- Dashboard：`90` 个文件通过，`1,651/1,651 passed`。
- 核心 policy/admission/API/AFK 定向矩阵：`19` 个文件通过，`758 passed`，`13` 个 Docker 相关用例 honest skipped。
- 另有 `npm run build`、`npm run typecheck:web` 及架构、注释、OpenSpec、仓库卫生、interaction-contract、默认 workflow freshness、文档和模板检查的既有通过证据。

这些结果只能证明冻结基线上的既有回归没有失败，不能抵消下面的契约/安全问题；本报告的最终结果仍为 **FAIL**。

## 必须回 Build 的 review findings

### A. 缺失授权没有在所有 interaction mode 下失败关闭

`packages/kernel/src/workflow/decomposition-policy-evaluator.ts` 的 `hardAsk` 目前只从 `triggered_ask_when` 识别已有 hard-boundary。一个 `require-review` candidate 可以声明 `triggered_ask_when=['missing-authorization']`、自报 `classification='routine-reversible'`，并带五层 grant 及匹配的普通 exact review receipt；当前路径可能因此得到 `allowed`。

这违反 OpenSpec：缺失授权无论 interaction mode 都必须 hard-block，普通 review 不能替代 hard confirmation。回 Build 必须以 TDD 增加至少 `auto-safe` 与 `require-review` 精确失败用例；无论 `policy.ask_when` 是否配置该条件、candidate 自报何种 classification，都必须拒绝。hard confirmation 仍须精确绑定 authority/action/run/fingerprint，错误绑定继续拒绝，且不得削弱其他 hard-boundary、limits 和五层权限测试。

### B. 默认 createAutomation 缺少安全的公共 authority/binding 端口

PR3 让 loop admission 在缺少 `bindAutomationPolicy` 时正确 fail-closed，但公共 `createAutomation()` 默认 factory 没有显式的强类型 `bindAutomationPolicy` 与 `workflowActionAuthority` 端口。外部 SDK 调用者因此只能替换整个 admission，形成可用性回归。

回 Build 必须做最小兼容修复：在公共 `AutomationDeps` 暴露可选强类型端口并传给默认 `createLoopAdmission`；无端口时保持 fail-closed，并增加零 run、结构化 denial 回归；提供真实 binding/authority ports 时证明默认 admission 可完成安全的 non-bundle loop。不得自动授予权限、伪造 workflow/run/Skill grant，bundle-bound loop 继续要求调用者显式提供 production preparation 并保持 fail-loud。

### C. 非阻塞残余语义

server effective snapshot 的 generic projection 没有 candidate 时显示 unconditional grants。当前 generic snapshot 没有 candidate，保守输出可以接受；但后续 candidate-aware projection 不得把 materialization 宣称为无条件允许。本项不扩大本 Change 的 DTO/API 范围，也不阻塞本轮回 Build。

## 官方恢复动作

本轮必须保留以上失败事实，先由官方 CLI 完成精确 `verify-fail` review request，并基于现有 delegated authority 执行 `acknowledge --delegated`，再执行 `tenon transition workflow-decomposition-policy verify-fail`。回退后应确认：

- phase 进入 `build`；
- `build_sha` 清空；
- `pre_verify_review_result=pending`；
- 四项 Verify task 保持未完成并重新登记。

之后只在 Build 修复上述 A/B、补齐定向与回归证据并提交修复 commit 后重新 `build-complete`；不得在 Verify 中提交产品代码，不进入 PR4/PR5。没有新的 Build freeze 前，本报告不声明 Verify 通过。
