# validate-clean-install-and-plugin-runtime-purpose 验证报告

## 结论

- 冻结基线：`workspace:sha256:6688d4aec0c3d469713ab07c483ffa6c5f3031d97fcea5c9222f086b0ca81349`
- Reviewer 官方复审基线：与冻结基线一致。
- Standards：C0 / H0 / M0 / L0。
- Spec：C0 / H0 / M0 / L0。
- 本地候选、发布包、运行时恢复、OpenSpec Purpose-only 与相关严格校验均通过。
- 候选推送后，真实公网 exact-ref Marketplace 安装、重复安装和新 Codex 进程发现全部通过。

## 冻结候选验证

| 验证 | 结果 |
| --- | --- |
| `npm run build` | PASS；TypeScript、Dashboard、server bundle、CLI bundle 全部成功 |
| `npm test -- --reporter=dot` | PASS；315/315 files，5399 passed，5 个有明确环境原因的 skip |
| `npm run test:web -- --reporter=dot` | PASS；50/50 files，963/963 tests |
| `npm run test:clean-install` | PASS；local release `sha256-b1726672de7c3f3e9a1600d6dec363f148b209e5a3c1b4fdfd6412234747ea5c`，重复安装 PID `74875`，hook trust 如实为 `untrusted` |
| public exact-ref clean install | PASS；ref `776027084caca02adce7bed018689f2d94881489`，release `sha256-b1726672de7c3f3e9a1600d6dec363f148b209e5a3c1b4fdfd6412234747ea5c`，隔离端口 `61691`，重复安装 PID `16113` |
| release coordinator + real release store | PASS；57/57，包含四个真实跨进程补偿崩溃阶段 |
| `packages/cli/src/tap.integration.test.ts` | PASS；并行全量中的一次 SIGINT 资源竞争失败，独立复跑 7/7，随后串行核心全量未复现 |
| comments / architecture / identity / hygiene | PASS；architecture 扫描 614 个生产文件，5 个仅尺寸例外 |
| npx/bootstrap acceptance | PASS；35/35，含 exact immutable ref、非 2xx 诊断、PID 严格解析与进程组清理 |
| docs / document templates | PASS；39 个 canonical Markdown；模板 8/8 |
| hooks / adapters / Skill inventory | PASS；482/482、272/272、65 个路径引用、62 个 Skill |
| migration CAS / N-1 bundle | PASS；13/13、31/31 |
| golden oracle | PASS；5 组 fixture，0 处不一致；仅报告已登记的产品演进差异 |
| `git diff --check` | PASS |

## Reviewer 聚合

独立 Reviewer 在同一冻结候选上重新执行 Standards 与 Spec 双轴全量复审，并确认：

- `activating-runtime` 旧 WAL 缺 pre-activation proof 或 port 时，在
  recover/inspect/adopt/start/stop/activate 前失败关闭；
- `recoverActivation=not-started` 与 `recoverActivation=activated` 两支 fixture 均为零副作用；
- `crash-stopping-candidate` 只由 transaction-owned candidate stop 注入，四种崩溃模式均在恢复前
  核对 exact WAL phase、Dashboard identity 与 runtime selection；
- Release 文档与 workflow 均绑定 exact checkout commit，并把同一个不可变 `--ref` 传给
  Marketplace bootstrap；
- 未发现新增 Critical、High、Medium 或 Low finding。

Codex 审查轨由当前 Codex 主流程与独立 Reviewer共同覆盖完整冻结工作区；结论为 PASS。API/CLI
E2E 轨由真实 release-store、clean-install、bootstrap、hooks、adapter 与 oracle 验收覆盖；结论为
PASS。

## 逐文件规格回读

下表逐项覆盖实现、配置、生成发行物与用户文档；Change 自身 proposal/design/tasks、ledger 和本报告
属于治理证据，不作为产品实现文件重复列入。

| 改动文件 | 对照 capability | 已回读并比对 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | `plugin-distribution` | ☑ |
| `.github/workflows/release.yml` | `plugin-distribution` | ☑ |
| `docs/usage/installation.md` | `plugin-distribution` | ☑ |
| `docs/usage/zh-CN/installation.md` | `plugin-distribution` | ☑ |
| `install.sh` | `plugin-distribution` | ☑ |
| `openspec/specs/plugin-runtime/spec.md` | `plugin-runtime` | ☑ |
| `package.json` | `plugin-distribution` | ☑ |
| `packages/cli/dist/tenon.mjs` | `plugin-distribution`, `plugin-runtime` | ☑ |
| `packages/cli/src/commands/dashboard-health.test.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/commands/dashboard-health.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/commands/dashboard-process.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/commands/dashboard-restore.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/commands/dashboard.test.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/commands/dashboard.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/commands/managed-dashboard-identity.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/commands/managed-release-journal-coordinator.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/commands/release-compensation.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/commands/release-coordinator-contract.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/commands/release-coordinator.test.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/commands/release-coordinator.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/commands/release-dashboard-coordinator.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/commands/released-dashboard-starter.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/commands/setup-managed-runtime.ts` | `plugin-distribution`, `plugin-runtime` | ☑ |
| `packages/cli/src/commands/setup.test.ts` | `plugin-distribution`, `plugin-runtime` | ☑ |
| `packages/cli/src/commands/update.test.ts` | `plugin-distribution`, `plugin-runtime` | ☑ |
| `packages/cli/src/commands/update.ts` | `plugin-distribution`, `plugin-runtime` | ☑ |
| `packages/cli/src/runtime/installer.ts` | `plugin-distribution`, `plugin-runtime` | ☑ |
| `packages/cli/src/runtime/managed-release-journal.test.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/runtime/managed-release-journal.ts` | `plugin-distribution` | ☑ |
| `packages/cli/src/runtime/release-store.integration.test.ts` | `plugin-distribution`, `plugin-runtime` | ☑ |
| `packages/kernel/src/state/lock.test.ts` | `plugin-distribution` | ☑ |
| `packages/kernel/src/state/lock.ts` | `plugin-distribution` | ☑ |
| `packages/server/dist/dashboard.mjs` | `plugin-distribution` | ☑ |
| `tools/clean-codex-install-acceptance.mjs` | `plugin-distribution` | ☑ |
| `tools/clean-codex-install-acceptance.node-test.mjs` | `plugin-distribution` | ☑ |
| `tools/install-bootstrap.node-test.mjs` | `plugin-distribution` | ☑ |

## OpenSpec 与 Purpose-only 证据

- `openspec validate validate-clean-install-and-plugin-runtime-purpose --strict`：PASS。
- `openspec validate plugin-runtime --strict`：PASS。
- `openspec validate plugin-distribution --strict`：PASS。
- `plugin-runtime` 从 `## Requirements` 起的基线与当前内容逐字一致。
- requirements-tail SHA-256 前后均为
  `6334e35ef63c7c58a7dd70f4e9c01be44650c622beaab0a23e8620413bff1e5c`。
- 主规格唯一变化是在标题与 `## Requirements` 之间新增准确 `## Purpose`。

## 隔离归档演练

在仓库外
`/var/folders/1c/hyn3mfvd12ngm6sgy28_s5gm0000gn/T/tenon-openspec-archive-rehearsal.5QJGmF`
复制完整 `openspec/` 后执行：

```text
openspec archive validate-clean-install-and-plugin-runtime-purpose --yes
openspec validate plugin-runtime --strict
openspec validate plugin-distribution --strict
```

归档成功，delta 仅向 `plugin-distribution` 增加 1 条 requirement；归档后的
`plugin-runtime` 与 `plugin-distribution` 均 strict PASS。额外运行 `openspec validate --all
--strict` 得到 11 passed / 12 failed；失败项均为本 Change 范围外的既有 Change/基线债务，因此
不把它们记作本 Change 通过，也不扩大本次修复范围。

## 公网验收与剩余边界

- 远端当前 `main` 为 `d1aaea5237642a264dfeec066944bd329a224ce0`。以该 commit 运行新增
  exact-ref 公网验收时，旧 `install.sh` 以 `unsupported argument --ref` 非零退出；这证明本地候选
  尚未进入公开安装面，不能把本地 PASS 冒充为公网 PASS。
- 另对用户可复制的现有公开命令
  `curl .../main/install.sh | bash -s -- --codex` 做了隔离真实安装。Marketplace 与插件安装成功，
  但远端旧 runtime 忽略隔离 Dashboard 端口并尝试占用 `18765`；该端口已有用户拥有的健康 Tenon
  listener，因此候选安全退出、未停止或覆盖未知进程。现场结果为 FAIL，恰好复现本 Change 已在
  本地候选修复的端口/所有权问题。
- 用户授权提交并推送后，候选 `776027084caca02adce7bed018689f2d94881489` 已进入远端。执行
  `node tools/clean-codex-install-acceptance.mjs --mode public --public-ref
  776027084caca02adce7bed018689f2d94881489` 得到 PASS：raw `install.sh` 与 Marketplace 使用同一
  immutable ref，runtime、doctor、Dashboard API/HTML、新 Codex app-server 插件/Skill/hooks 发现
  及重复安装全部通过，临时 listener 已按精确 ownership 清理。
- Release workflow 已强制从当前 checkout 导出精确 commit、下载同一 commit 的 `install.sh`，并传递
  同一 `--ref`；本轮已在该 commit 可下载后形成真实外部 PASS。
- 新安装后仍需用户在新 Codex 会话中通过 `/hooks` 信任 Tenon hook；自动验收刻意不绕过此人工安全门。
