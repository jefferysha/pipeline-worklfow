# 分发产物：完整 runtime 随插件入包

## 是什么

插件发布的运行时产物共有三组，全部由 `npm run build` 生成并提交：

- `packages/cli/dist/pipeline.mjs`：单文件 ESM CLI bundle，带 `#!/usr/bin/env node` shebang；
- `packages/server/dist/dashboard.mjs`：单文件 dashboard server bundle；
- `packages/dashboard-app/dist/`：同源 dashboard SPA 静态产物。

其余所有 tsc 中间产物（例如 `packages/cli/dist/` 下的 `main.js`/`commands/`/`*.d.ts`）仍被 `.gitignore` 忽略，不入库。

## 为什么要入库

Codex 与 Claude 的原生插件都通过 marketplace clone 整仓落地，**装完即用、没有 build 步**。新用户
本机没有仓库的 `node_modules`，因此不能把 dashboard 留成待编译源码：CLI/hook 直接引用 CLI bundle，
`pipeline dashboard` 直接执行 server bundle，server 再同源托管随包 SPA：

- `hooks/router.sh` 的 `_CLI_BUNDLE` → `$PLUGIN_ROOT/packages/cli/dist/pipeline.mjs`
- `hooks/gate.sh` 的 `SG_BUNDLE` → `$SG_PLUGIN_ROOT/packages/cli/dist/pipeline.mjs`

若任一产物不随 clone 带上，hooks 会断，或 dashboard 会退化为无法启动/无页面。`tools/verify-skills.sh`
会把三组资产都作为安装期硬校验项；校验失败不得切换 launcher。

## .gitignore 机制（为什么需要显式放行）

`.gitignore` 第 2 行 `dist/` 会忽略任意层级名为 `dist` 的目录。git 的规则是：**父目录被忽略后就不再下探**，因此单独写 `!packages/cli/dist/pipeline.mjs` 一行**不生效**（已 `git check-ignore` 实测确认仍被忽略）。要放行目录内某一个文件，须三行缺一不可：

```gitignore
!packages/cli/dist/          # 先放行该目录本身，让 git 重新下探
packages/cli/dist/*          # 再把目录内全部内容重新忽略
!packages/cli/dist/pipeline.mjs   # 最后单独放行这一个 bundle
```

同样的“先放行目录、再精确放行资产”规则适用于 dashboard server；SPA 的整个 `dashboard-app/dist/`
是同一份运行时产物，必须完整入库（含哈希资产）。验证：`git check-ignore packages/cli/dist/pipeline.mjs`
和 `git check-ignore packages/server/dist/dashboard.mjs` 应均无输出。

## 维护纪律（重要）

**改了 CLI、server 或 dashboard 前端源码后，必须 `npm run build` 重新构建，并把三组更新后的发布资产一并提交。** 否则入库的包会与源码脱节（stale dist），装插件的人会运行旧行为或缺失完整 dashboard。

提交 bundle 时逐文件 add：

```bash
npm run build
git add packages/cli/dist/pipeline.mjs
git add packages/server/dist/dashboard.mjs packages/dashboard-app/dist
```

## 单插件发布与自动更新

发布物是一个 `pipeline-lite` 插件，不拆分为外部 OpenSpec、Superpowers 或 skill 安装包。每次发版必须
让下面四份清单保持同一个插件 identity（拥有 `version` 字段的两份 plugin manifest 还必须同版），并且
继续指向仓根的同一套 `skills/` 与 `hooks/`：

- `.codex-plugin/plugin.json`
- `.agents/plugins/marketplace.json`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`

默认 workflow 的每个 skill 都必须在 `templates/skill-sources.yaml` 里标为 `tool: bundled`，并有
对应的 `skills/<name>/SKILL.md`。禁止把新的默认步骤改回 npm、第三方 marketplace 或某个开发者本机
cache；可选集成只能作为非阻断增强项。

用户侧入口固定为 `pipeline setup --codex` 或 `pipeline setup --claude`。升级时：

```bash
pipeline update --codex
# 或启用每日一次的 SessionStart 自动检查：
pipeline setup --codex --auto-update
```

更新实现先让宿主刷新 marketplace/插件，再用宿主 `plugin list --json` 返回的安装根运行资产校验；只有
校验通过才把 `~/.local/bin/pipeline` 切到新 bundle。校验同时检查内置 skills、CLI、dashboard server 和
SPA；失败必须保留旧 launcher。自动更新是用户 opt-in，当前会话不热替换 skills/hooks，新会话才加载新
版本。Codex 的第三方 hook 必须由用户在 `/hooks` 完成一次性信任；新发布物改变 hook hash 时，宿主可能要求
重新信任，不能用安装脚本绕过这一安全边界。完整工作台固定通过 `pipeline dashboard` 启动，默认端口 8765；旧端口需显式
`pipeline dashboard --port 18765`。

每次发布至少执行：

```bash
npm run generate:default-workflow
npm run build
bash tools/verify-skills.sh
bash tools/test-hooks.sh
bash tools/test-adapters.sh
npm run check:default-workflow-freshness
```

## CI 新鲜度门（2026-07-17 补）

`d34b5f7 → ef84644` 已经出现过一次 source/dist 脱节（source 改了行为，入库 bundle 没跟着重
build），W1 第二增量的 codex review 第 8 轮又真实撞见第二次——本轮多处 kernel/CLI/server 源码
改动，`packages/cli/dist/pipeline.mjs` 全程没有随之重新构建，直到 review 明确点名才发现。已满足
本文此前"若未来 bundle stale 反复发生，再上一道 CI 门"的条件，`.github/workflows/ci.yml` 的
Build 步骤之后新增了完整 runtime 的逐字节比较：
`packages/cli/dist/pipeline.mjs`、`packages/server/dist/dashboard.mjs` 与
`packages/dashboard-app/dist/` 都必须等于当前源码重新构建的结果。源码改了却忘记本地 `npm run build`
并一并提交，会在这里直接红，不再只靠本文纪律与人肉 review 兜底。`bash tools/test-bundle.sh` 仍然是
行为冒烟（能否真正 init/transition/history，以及发现随包 dashboard），不能替代这条新鲜度门——两者
验证的是不同的事，都保留。
