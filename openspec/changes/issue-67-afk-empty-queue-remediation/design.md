# 设计：AFK 空就绪队列夹具隔离

## 已验证事实

- 这是既有项目的 P0 defect remediation；起点固定为 #43 frozen head `2ce9762766256b8ab6bb78bca25d53181475cda7`。
- `cmdAfk('run')` 调用 `runAfkRound`，后者先执行 `enforceProductionLoopWiring`，再扫描 ready 队列。因此 empty candidate 也必须先通过 active-loop wiring；这不是把 empty 当成 Docker 成功。
- W_LOOPS_YAML 的 `_all` bundle 会解析 default workflow 的 `build` / `ship` phase slots。生产 locator 的首个根来自 `deps.doctor.pluginRoot`，随后才查宿主 Codex roots。
- empty fixture 原来直接调用 `makeDeps`，使用默认 `doctor.pluginRoot='/plugin'`，没有 `seedDefaultPhaseSkills` 返回的临时 `.test-plugin`，也没有统一的 `withEnterAfkSkillAuthority` helper。
- 在宿主 Skill cache 存在时，原 fixture 本地通过；用 `HOME=/tmp` 隔离宿主安装面可稳定复现 RED：
  `HOME=/tmp npx vitest run packages/cli/src/commands/afk.test.ts -t "确实没有 ready candidate 的 empty" --reporter=verbose` 在 line 267 取得 exit `1`，而非期望 `0`。
- 同一 RED 的结构化诊断为 `configuration-error`：`active loop wiring 无法执行`，`wloop[skill-bundle/invalid]`，`phase "build"` 的 `tenon-build` 在当前安装面不存在。该错误发生在 queue scan 之前，证明是 ambient host 依赖而非 empty 语义或 Docker 探针。

## 决策

仅修正测试夹具：empty case 通过 `withEnterAfkSkillAuthority(makeDeps({ cwd, doctor: { pluginRoot }, states: ... }))` 注入同一临时插件根，并保留真实 wiring/locator/queue 分支。生产 `afk.ts`、`afk-executor.ts`、fail-closed 顺序和 exit-code 合同不改。

这样 empty path 在没有 ready candidate 时仍返回 exit `0`；Docker unavailable、policy/capability failure 仍分别保持非零失败，不被空队列断言吞掉。

## 备选方案

1. 把 queue scan 移到 loop wiring 之前：拒绝。它会改变既有 fail-closed 顺序，让未接线的 active loop 在空队列时被静默绕过。
2. 让 resolver 或 locator 对缺失 Skill 自动放行：拒绝。会削弱 #43 phase Skill enforcement，并让真实生产路径依赖 host fallback。
3. 只给 empty fixture 注入 `.test-plugin` 与 authority helper：采用。范围最小、可回滚，且与同 describe 的 Docker-unavailable fixture 共享同一 hermetic 边界。

## 假设与决策日志

- 假设 A（已证实）：Linux CI 没有本机 Codex Skill cache，直接 `makeDeps` 会在 wiring guard 失败；macOS 宿主 cache 掩盖该缺口。
- 假设 B（保留）：empty 是 `phase != build` 的真实空队列，必须不触碰 Docker；现有断言继续验证输出文案与无 docker call。
- 决策：不新增生产分支，不改变 `workflow-skill-enforcement` 的能力边界，只让测试明确提供其已声明的 phase Skill 内容。

```coverage
touches:                              # no auth / production API surface
L1_api:      waived -> fixture-only; no public API or CLI option changes
L2_data:     waived -> no canonical state/schema/ledger format changes
L3_rules:    filled -> ## 决策         # empty / wiring / Docker classification
L4_state:    filled -> ## 已验证事实   # run wiring-before-scan lifecycle
L5_errors:   filled -> ## 已验证事实   # RED classification and non-empty failures
L6_security: waived -> no auth, credential, or trust-boundary changes
L7_perf:      waived -> no production runtime path or complexity changes
L8_deps:     filled -> ## 决策          # explicit temporary plugin root
L10_terms:    filled -> ## 假设与决策日志
```
