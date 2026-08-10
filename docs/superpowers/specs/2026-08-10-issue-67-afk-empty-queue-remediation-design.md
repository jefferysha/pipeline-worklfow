# 设计：AFK empty-ready-queue hermetic fixture

## 问题与约束

Issue #43 的 exact-head CI 只剩 `packages/cli/src/commands/afk.test.ts` 的 empty-ready-queue case。该 case 期望真实 CLI 在无 ready candidate 时返回 exit `0`，并且不调用 Docker；不能把 Docker unavailable、policy/capability failure 或 phase Skill 缺失误判为空队列成功。

约束是 fixture-only：不改变 `cmdAfk` / `runAfkRound` 的生产顺序，不弱化 #43 的 phase Skill enforcement，不读取或安装宿主插件，不引入依赖。

## 证据链

```text
afk run
  -> runAfkRound
     -> enforceProductionLoopWiring (active loop, phase Skill locator)
     -> scanReadyFromFs
     -> empty => exit 0 / candidate => Docker or classified failure
```

原 empty case 直接 `makeDeps`，默认 `doctor.pluginRoot='/plugin'`。W_LOOPS_YAML 的 `_all` default phase slots（build/ship）因此在无宿主 Skill cache 的 Linux runner 上先触发 `skill-bundle/invalid`，尚未到达 empty branch。macOS 本地 Codex cache 使同一夹具偶然通过。

可复现 RED：

```text
HOME=/tmp npx vitest run packages/cli/src/commands/afk.test.ts -t "确实没有 ready candidate 的 empty" --reporter=verbose
=> expected 0, received 1 (line 267)
=> configuration-error: wloop[skill-bundle/invalid], phase "build" tenon-build not found
```

## 方案

采用在 empty case 与其他真实 AFK fixtures 相同的 hermetic 装配：使用 `seedDefaultPhaseSkills(cwd)` 产生的 `.test-plugin` 作为 `doctor.pluginRoot`，并通过 `withEnterAfkSkillAuthority` 注入显式 authority。queue state 仍是 `phase: open, automation: queued`，因此 ready 仍为空；断言继续保证 exit `0`、空队列文案和零 Docker 调用。

拒绝把 wiring guard 移到 scan 后，也拒绝对缺失 Skill 做 fail-open；两者都会改变生产 fail-closed 合同。

## 验证矩阵

| 分支 | 夹具/输入 | 期望 |
| --- | --- | --- |
| empty | `phase=open`, `automation=queued`, hermetic plugin root | exit `0`，输出 empty，零 Docker |
| Docker unavailable | `phase=build`, `automation=queued`, same root | exit `1`，分类为 docker-unavailable |
| Skill/policy failure | existing negative fixtures | non-zero / paused or configuration-error，不能冒充 empty |

## 结果与非目标

本设计只改 `afk.test.ts` 的依赖装配；不改生产逻辑、公共 API、Docker、队列排序或 phase Skill enforcement。修复可由单个 fixture diff 回滚。

```coverage
touches:
L1_api:      waived -> fixture-only; no public API or CLI option changes
L2_data:     waived -> no canonical state/schema/ledger format changes
L3_rules:    filled -> ## 方案
L4_state:    filled -> ## 证据链
L5_errors:   filled -> ## 验证矩阵
L6_security: waived -> no auth, credential, or trust-boundary changes
L7_perf:     waived -> no production runtime path or complexity changes
L8_deps:     filled -> ## 方案 (explicit temporary plugin root)
L10_terms:   filled -> ## 问题与约束
```
