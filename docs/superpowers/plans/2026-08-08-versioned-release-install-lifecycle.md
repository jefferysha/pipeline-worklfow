---
change: versioned-release-install-lifecycle-20260808
design-doc: docs/superpowers/specs/2026-08-08-versioned-release-install-lifecycle-design.md
---

# 版本化发布、安装与更新实施计划

## 目标与非目标

把 Tenon 的公开安装、Codex 更新、managed runtime 和 Dashboard 身份统一到不可变稳定 SemVer Release，发布下一版本并用公众一行命令真实卸载重装。复用现有 release workflow、host CLI、managed-release WAL 与 Dashboard coordinator；不新增包管理器，不直接写 Codex cache，不删除项目或用户数据。

原型决策：不插入一次性 prototype。release resolver、host command、desired-state、runtime installer 和 Dashboard starter 都已有可注入边界，可用失败优先的单元/集成测试直接验证真实状态机；一次性实现不会降低关键未知。

## 子阶段 1：Tracer bullet 打通稳定 Release 到 managed runtime

先写失败测试，让一个注入的 `v1.0.2` stable Release 从 resolver 进入 `tenon update --codex`，冻结 tag/commit，经过 Codex plugin/marketplace 重绑定 WAL，最终由 inventory/version/root/asset 证明候选并激活 managed runtime。最初使用 fake host 与最小候选目录，但贯穿 resolver、命令计划、desired-state、coordinator 和 runtime selection，不按层横向堆积。

1. 在 `packages/cli/src/commands/stable-release.ts`（新文件）定义严格稳定 SemVer/Release DTO、版本比较、latest resolver 接口与生产 GitHub HTTPS 实现；通过 `SetupEnv` 或显式依赖注入超时和响应读取。
2. 在 `packages/cli/src/commands/stable-release.test.ts` 先覆盖 success、draft、prerelease、非法 tag、repo/schema 漂移、timeout/network、peeled commit 不匹配、同版、升级和降级拒绝。
3. 扩展 `plugin-host.ts`、`update.ts`、`managed-host-observation.ts`、`managed-host-desired-identity.ts` 与 `managed-host-command.ts`，让 Codex update plan 使用冻结目标，并为 plugin absent、marketplace absent、目标 tag commit、plugin target version 建模 desired-state。
4. 扩展 `update.test.ts`、`managed-host-observation.test.ts`、`managed-host-command.test.ts` 和 `release-store.integration.test.ts`，覆盖完整纵向成功链路及每一步中断恢复，断言不会调用 `refs/heads/main`。

验证：`npm test -- --run packages/cli/src/commands/stable-release.test.ts packages/cli/src/commands/update.test.ts packages/cli/src/commands/managed-host-observation.test.ts packages/cli/src/commands/managed-host-command.test.ts`。

回滚：删除 resolver 注入并恢复旧命令计划即可回到现状；在测试全绿前不运行真实宿主 mutation。

**此处建议 /clear**

## 子阶段 2：固定版本 setup、安装器与只读计划

1. 让 `nativeInstallPlan` 接受当前已发布插件版本并生成 `--ref vX.Y.Z`；从 `CliDeps.pluginVersion` 或候选 manifest 注入，不在业务代码复制常量。
2. 修改 `install.sh`：默认 ref 为当前稳定标签，只允许完整稳定 SemVer（Codex），禁止 `main`/commit/prerelease 作为正式默认；保留可测试 dry-run，确保只运行预构建 bundle。
3. 调整 `setupHost.ts`、`host-plugin-convergence.ts`、`host-target-plan.ts` 及调用方，使 setup/update 的 host steps 和 notice 诚实展示版本解析/重绑定且无 `main`。
4. 先更新 `tools/install-bootstrap.node-test.mjs`、`host-target-plan.test.ts`、`setup.test.ts`、`program.test.ts`，覆盖干净安装、重复安装、旧 local/main marketplace 收敛、CLI 缺失与零源码构建。

验证：`node --test tools/install-bootstrap.node-test.mjs && npm test -- --run packages/cli/src/commands/setup.test.ts packages/cli/src/commands/host-target-plan.test.ts packages/cli/src/program.test.ts`。

回滚：保留旧已发布 tag 可重新安装；不重写任何已有 tag。

**此处建议 /clear**

## 子阶段 3：Dashboard 启动/打开策略与诊断

1. 为 setup 环境增加可注入的交互/CI 判定或显式 browser policy，默认只在交互式首次 setup 打开；`update.ts` 手动与 auto 路径都传 `openBrowser=false`。
2. 在 Dashboard readiness 成功但不打开时输出已验证 URL 与 `tenon dashboard --open`；browser opener 失败保持 runtime 成功并给出同一恢复路径。
3. 更新 `setup.test.ts`、`update.test.ts`、`release-coordinator.test.ts` 和 Dashboard starter 测试，覆盖交互 setup、curl/CI、手动 update、auto update、open failure、非受管端口与现有 managed Dashboard。

验证：`npm test -- --run packages/cli/src/commands/setup.test.ts packages/cli/src/commands/update.test.ts packages/cli/src/commands/release-coordinator.test.ts packages/cli/src/commands/dashboard.test.ts`。

回滚：browser policy 只影响打开动作，不影响 managed Dashboard readiness 或 selection。

**此处建议 /clear**

## 子阶段 4：版本 1.0.2、公开文档与发布门禁

1. 将根、workspaces、Codex/Claude/Marketplace manifests、lockfile、docs site、npx bootstrap 和生成 identity 的现行版本同步到 `1.0.2`，运行项目既有版本生成/同步脚本。
2. 把 README、中文/英文 installation、quickstart、CLI reference、release notes 与 docs checks 中的官方命令统一为 `v1.0.2/install.sh`，说明不源码编译及 Dashboard 策略。
3. 强化 `tools/product-identity.node-test.mjs`、release workflow checks 和 docs content checks，拒绝现行公开面中的 `main/install.sh`、`--ref main` 与版本漂移，同时允许历史/归档事实。
4. 运行 build 并提交所有受控 `dist` 资产，验证 source 与生成产物无 diff。

验证：`npm run check:identity && npm run check:release-workflows && npm run check:docs && npm run build && git diff --exit-code -- packages/cli/dist/tenon.mjs packages/server/dist/dashboard.mjs packages/dashboard-app/dist`。

回滚：在 tag 创建前可回退版本提交；tag/Release 一旦发布不可移动，只能发布更高修复版本。

**此处建议 /clear**

## 子阶段 5：完整验证、合并、版本发布和真实重装

1. 运行定向测试、`npm test`、`npm run test:web`、build、bundle、skills、docs、adapter、migration、oracle、clean-install 和 OpenSpec/release 门禁；完成安全/代码审查。
2. 创建非 draft PR，等待 canonical CI，处理 review threads，合并到 `main`，确认开放 PR 为零且本地 `main` 与远端一致。
3. 从已合并且 canonical CI 成功的精确 `main` SHA dispatch `release-candidate.yml`，输入 `tag=v1.0.2`；等待 writer 创建不可变 tag 和 GitHub Release，验证 release/tag/commit/assets/digest。这里 `main` 只证明候选资格，用户交付源是 `v1.0.2`。
4. 记录当前真实 plugin/marketplace/runtime/Dashboard；用 `codex plugin remove tenon@tenon --json` 和 `codex plugin marketplace remove tenon --json` 删除宿主安装，保留项目与 managed runtime。
5. 执行 README 的 `v1.0.2` 一行命令；验证重复安装、`tenon update --codex -y` 同版幂等、`codex plugin list --json` 来源、`tenon doctor --json`、runtime status、`/api/health`、`/api/snapshot`、新会话提示及项目数据保留。

验证：GitHub Release `v1.0.2` 非 draft/prerelease且 tag peel 到已合并 SHA；开放 PR `[]`；插件、runtime、Dashboard 均报告 `1.0.2`，来源无本地 path/`main`，新用户命令未构建源码。

回滚：若发布前失败则不创建 tag；若发布后安装失败，保留 v1.0.1 和旧 managed runtime，修复后发布更高 patch，绝不移动或覆盖 v1.0.2。

**此处建议 /clear**

## 子阶段 6：Verify 失败后的兼容与信任边界修复

1. 先更新 `release-coordinator.test.ts`、`update.test.ts` 与 `managed-release-journal.test.ts`，覆盖
   candidate-resolved 后 host/payload 漂移拒绝、v1.0.1 缺 `serverVersion` WAL 的可恢复读取和重新健康证明。
2. 为 coordinator 增加 activation 前候选复证回调；update/setup 在首次和恢复路径都重新证明 frozen tag、
   marketplace/plugin identity、candidate version 与 payload digest，旧 journal evidence 只作恢复输入。
3. 先更新 `install-bootstrap.node-test.mjs` 与 `launchers.test.ts`，覆盖 disabled exact registration、空/相对
   PATH 与 cwd 恶意 `node`/`bash`；再让 installer 和 launcher 只执行已冻结的绝对程序。
4. 先更新 `setup.test.ts`、`host-target-plan.test.ts` 与 clean-install acceptance 测试，覆盖“宿主候选精确但
   pre-transaction runtime 为空”的首次打开、setup 计划的条件 remove/rebind 诚实投影，以及 acceptance
   失败后的 Dashboard 清理。
5. 更新 README/安装文档：v1.0.1 只走一次 `v1.0.2/install.sh` legacy bridge；从 v1.0.2 起每次更新都走
   单条 `tenon update --codex`。禁止把无法追溯修改的旧进程描述成新版自迁移。
6. 重建 CLI/server/Dashboard 受控资产，运行定向、全量、clean install、跨进程恢复和 release identity 门禁。
7. 用真实磁盘形状 v1.0.1 native setup/update WAL 与 v2/v3 convergence receipt 补充恢复矩阵：所有旧 phase
   均先通过向后兼容 decoder；successor resolver 失败时原 WAL 字节不变；证明成功后同一 transaction 原子转换
   为 setup/preparing-host；并覆盖 `starting-dashboard` 迟到进程、已重绑 v1.0.2 宿主的一次性 runtime bridge、
   cleanup 前 v4 升级，以及 completed receipt 只能在 cleanup 后完整复证之后提交。

验证：`node --test tools/install-bootstrap.node-test.mjs && npx vitest run packages/cli/src/commands/update.test.ts packages/cli/src/commands/setup.test.ts packages/cli/src/commands/release-coordinator.test.ts packages/cli/src/runtime/managed-release-journal.test.ts packages/cli/src/runtime/launchers.test.ts && npm run build && npm test && npm run test:web && npm run test:clean-install`。

回滚：所有 coordinator/codec 修复保持 schema version 1 向后读；若新复证失败则保留 WAL 与旧 active runtime，
不回退到旧的 fail-open activation。launcher/installer 变更只在正式安装或 activation 提交时覆盖产品自有文件。
