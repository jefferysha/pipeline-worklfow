---
change: guide-codex-auth-during-plugin-install
design-doc: docs/superpowers/specs/2026-07-28-codex-auth-install-guidance-design.md
track: backend
---

# Codex 插件安装认证引导实施计划

## 目标与边界

实现一个不接触秘密、不会阻塞安装、可由安装/setup/update/doctor 共用的 Codex 宿主认证契约。
本计划不代替用户登录、不修改 OpenAI 计费、不读取 `auth.json` 内容、不把 AFK 凭证转发等同于
本地 Codex 登录。

## Phase 1 — Tracer bullet：统一 probe 贯通 setup 与 doctor

这是第一个 build 子阶段，先用最小纵向链路从外部 Codex 进程事实贯穿 CLI 契约、setup 输出、
doctor JSON 和单测，尽早暴露注入/异步/输出兼容问题。

### 1.1 先写共享认证契约的失败测试

文件：

- 新建 `packages/cli/src/codexAuth.ts`
- 新建 `packages/cli/src/codexAuth.test.ts`
- 修改 `packages/kernel/src/types.ts`
- 修改 `packages/kernel/src/types.test.ts`

测试先覆盖：

- status exit `0` → `authenticated`；
- status exit `1` 且有界 stderr 精确为 `Not logged in` → `unauthenticated`；
- exit `1` 但无精确哨兵、输出溢出、其他非零、CLI missing、unsupported、timeout、
  signal/spawn error → `unavailable`；
- 状态对象不包含 stdout/stderr；
- 固定引导包含 ChatGPT、`--device-auth`、API Key 官方入口、`--with-api-key`、
  Platform 按用量计费和 `login status`；
- 恶意 stdout/stderr 中的 secret-like 文本不出现在 renderer 输出。

运行并确认红：

```bash
npx vitest run packages/cli/src/codexAuth.test.ts
npx vitest run packages/kernel/src/types.test.ts
```

### 1.2 实现最小共享 probe 与固定 renderer

实现：

- `CodexAuthStatus = authenticated | unauthenticated | unavailable`；
- 有上限的 `codex login status` runner，stdin=`ignore`，stderr 仅保留小型有界缓冲用于精确
  `Not logged in` 哨兵比较，捕获内容不进入公开结果；
- `CODEX_AUTH_GUIDANCE` 结构化固定文案；
- full/compact 两种 renderer，但共享同一命令与链接常量；
- production probe 任何异常均收敛到 `unavailable`，不抛出秘密/宿主输出。

Verify 回边追加的 TDD 步骤：

- 先把 `exit 1 + 无哨兵` 和 `exit 1 + auth-store error` 写成失败测试；
- 再把真实 runner 改为只返回 `unauthenticatedSignal` 布尔值，不返回捕获内容；
- 验证精确哨兵为未登录，任意前后附加错误、超限输出和损坏存储均为 `unavailable`；
- 窄测：`npx vitest run packages/cli/src/codexAuth.test.ts`；
- 宽测：CLI、全仓、web、hooks、文档、分发和 clean-install 全量验证。

验证：

```bash
npx vitest run packages/cli/src/codexAuth.test.ts packages/kernel/src/types.test.ts
npx tsc -b packages/kernel packages/cli
```

### 1.3 接入 foreground setup 与 doctor

文件：

- `packages/cli/src/commands/setupEnvironment.ts`
- `packages/cli/src/commands/setup.ts`
- `packages/cli/src/commands/setup.test.ts`
- `packages/cli/src/deps.ts`
- `packages/cli/src/main.ts`
- `packages/cli/src/test-support.ts`
- `packages/cli/src/commands/doctor.ts`
- `packages/cli/src/commands/doctor.test.ts`

行为：

- 仅 `setup --codex` 在 host/runtime 安装成功后运行 probe；
- dry-run 只展示计划，不执行 probe；
- Claude/adapter setup 不输出 Codex auth；
- doctor 新增稳定 `auth:codex`，已登录 green，未登录/无法确认 yellow，非 Codex active host
  明确 not-applicable；
- doctor JSON 只含固定 detail/hint。

验证：

```bash
npx vitest run packages/cli/src/commands/setup.test.ts packages/cli/src/commands/doctor.test.ts packages/cli/src/codexAuth.test.ts
npx tsc -b packages/kernel packages/cli
```

### 子阶段边界

此处建议 `/clear`。进入下一阶段前，确认 tracer bullet 已贯通真实 runner seam、setup 人读输出和
doctor JSON；不得把仅有纯函数测试视为端到端完成。

## Phase 2 — 生命周期覆盖：bootstrap、重复安装、update 与 AFK 分离

### 2.1 Bootstrap 缺 CLI fail-fast 与 dry-run 零副作用

文件：

- `install.sh`
- `tools/install-bootstrap.node-test.mjs`

先写测试：

- 正常 Codex 安装缺 CLI 时，在 Marketplace mutation 前非零退出；
- 输出官方 `npm install -g @openai/codex` 和 `codex --version`；
- dry-run 在缺 CLI 时仍成功、零调用、零写；
- dry-run 计划包含 CLI/auth 检查；
- packaged setup 仍是完整 auth 引导所有者，shell 不复制完整教程。

运行：

```bash
node --test tools/install-bootstrap.node-test.mjs
bash -n install.sh
```

### 2.2 成功的 manual/auto update 接入

文件：

- `packages/cli/src/commands/update.ts`
- `packages/cli/src/commands/update.test.ts`

测试并实现：

- manual Codex update 提交后输出 full 状态/引导；
- `--auto` 不启动交互，只输出 compact 复验提示；
- Claude update 不输出 Codex auth；
- update 失败路径不运行 probe、不掩盖主要错误；
- auth 缺失不触发 managed runtime rollback。

运行：

```bash
npx vitest run packages/cli/src/commands/update.test.ts packages/cli/src/codexAuth.test.ts
```

### 2.3 修正 AFK CODEX_HOME 误判并区分术语

文件：

- `packages/cli/src/afkReadiness.ts`
- `packages/cli/src/afkReadiness.test.ts`
- `packages/cli/src/commands/setupRuntime.ts`
- `packages/cli/src/commands/setup.test.ts`
- `packages/cli/src/commands/doctor.ts`
- `packages/cli/src/commands/doctor.test.ts`

行为：

- 显式 `CODEX_HOME` 仅在 `<CODEX_HOME>/auth.json` 可读时标记容器凭证来源；
- AFK 输出明确是“容器凭证转发”，不声称本地 Codex 已登录；
- 构造交叉状态：host auth green / AFK yellow，以及 host auth yellow / AFK secret green。

运行：

```bash
npx vitest run packages/cli/src/afkReadiness.test.ts packages/cli/src/commands/setup.test.ts packages/cli/src/commands/doctor.test.ts
```

### 子阶段边界

此处建议 `/clear`。下一阶段只处理文档、分发与真实验收，不再改变认证状态机；如状态语义需要变化，
先按 `requirements-changed` 回 Spec。

## Phase 3 — 文档、分发和干净安装验收

### 3.1 更新中英文安装/故障排查文档

文件：

- `README.md`
- `docs/usage/installation.md`
- `docs/usage/zh-CN/installation.md`
- `docs/usage/troubleshooting.md`
- `docs/usage/zh-CN/troubleshooting.md`（若存在；不存在则不凭空新建平行结构）
- `packages/npm-bootstrap/README.md`

内容：

- Codex CLI 安装与 `codex --version`；
- ChatGPT 方案包含 Codex时的 `codex login`；
- headless `--device-auth`；
- Platform API Key 创建、stdin login、按量计费；
- `codex login status`；
- 明确安装不自动登录、不读取凭证，hook trust 是另一人工边界。

增加文档一致性测试或静态断言，避免中英文命令漂移。

### 3.2 扩展 clean-install acceptance

文件：

- `tools/clean-codex-install-acceptance.mjs`
- `tools/clean-codex-install-acceptance.node-test.mjs`
- 必要时 `.github/workflows/ci.yml` 与 release workflow（仅新增真实断言，不改变发布权限）

断言：

- 隔离空 auth、`CI=1`、非 TTY 首装与重复安装均成功；
- 两次输出都含三路径引导和复验命令；
- 不创建/复制真实 auth；
- hook 仍 untrusted；
- runtime、doctor、Dashboard、app-server discovery 和 listener/release 幂等断言不缩水；
- public 模式仍绑定精确 checkout/ref。

运行：

```bash
node --test tools/clean-codex-install-acceptance.node-test.mjs
npm run test:clean-install
```

真实公网 public acceptance 只有在网络与不可变 ref 可用时运行；否则明确区分本地候选验收和未执行项。

### 3.3 生成并验证分发产物

运行：

```bash
npm run build
npm run check:npx-package
bash tools/verify-skills.sh
```

确认：

- `packages/cli/dist/tenon.mjs` 包含共享认证状态和引导；
- npm bootstrap 仍委托同一 `install.sh`；
- tarball 不包含研究文档、测试运行态或秘密；
- changed files secret scan 无真实 token/Key。

## Phase 4 — Build 内全量自检与候选冻结

按风险从窄到宽运行：

```bash
npx vitest run packages/kernel/src
npx vitest run packages/cli/src
node --test tools/install-bootstrap.node-test.mjs
node --test tools/clean-codex-install-acceptance.node-test.mjs
npx tsc -b packages/kernel packages/channel packages/tap packages/automation packages/cli packages/server
npm run check:comments
npm run check:architecture
npm test
git diff --check
```

逐项核对 delta spec 的已登录、未登录、缺 CLI、旧 CLI/timeout、device auth、API Key、non-TTY/CI、
重复安装、manual/auto update、doctor/AFK 交叉状态和 clean-install。全部绿后才勾选 Build 任务并
冻结 `build_sha`；Verify 不替代本阶段自测。

## 回滚与兼容

- probe/renderer 是附加诊断；回滚时移除接入即可，不迁移用户数据。
- doctor 新 check id 只增不改；旧消费者忽略新项。
- status unsupported 收敛为 `unavailable`，除精确 `Not logged in` 哨兵外不解析任何 CLI 人读文案，
  不回退读取 `auth.json`。
- auth 缺失不进入 runtime selection、release publication 或 update 补偿事务。
- `install.sh` 的缺 CLI fail-fast 发生在宿主 mutation 前，失败无部分安装。
- 若真实 clean-install 暴露宿主版本差异，修兼容 probe/测试，不降低插件/Skill/hook/runtime 身份断言。

## 安全审查清单

- [ ] 未读取 `auth.json` 内容。
- [ ] 未读取、回显或记录 API Key/token。
- [ ] status 子进程 stdin 为 ignore，stderr 仅有界比较精确哨兵且原始内容不进入结果。
- [ ] API Key 只通过 stdin 示例，不进入 argv。
- [ ] CI/non-TTY 不启动 browser/device login。
- [ ] ChatGPT 权益使用条件表述，不推断用户套餐。
- [ ] Platform API Key 明确按用量计费。
- [ ] 安装/auth/hook trust/AFK 凭证四个状态不互相冒充。
- [ ] update 失败主因不被 auth warning 覆盖。
- [ ] clean-install 不接触真实用户 credential/state/listener。

## 原型决策

无需一次性 prototype。外部 CLI 退出码、注入 seam、setup/update/doctor 调用链和 clean-install fixture
均已有可测试边界；优先用 TDD tracer bullet 直接暴露未知，不引入会被丢弃的第二实现。
