# 分发产物：CLI bundle 随插件入包

## 是什么

`packages/cli/dist/pipeline.mjs` 是一个**已提交进 git 的构建产物**——由 `npm run build`（内部 `esbuild` 步骤 `npm run bundle`）从 `packages/cli/src/` 打成的单文件 ESM bundle，带 `#!/usr/bin/env node` shebang。

它是本仓中**唯一**入库的 dist 文件。其余所有构建产物（各包 `dist/`、`packages/cli/dist/` 下的 tsc 产物 `main.js`/`commands/`/`*.d.ts` 等）仍被 `.gitignore` 忽略，不入库。

## 为什么要入库

插件通过 `claude plugin install` 即 `git clone` 整仓落地，**装完即用、没有 build 步**。hooks 直接引用这个 bundle：

- `hooks/router.sh:125` → `$PLUGIN_ROOT/packages/cli/dist/pipeline.mjs`
- `hooks/gate.sh:151`   → `$SG_PLUGIN_ROOT/packages/cli/dist/pipeline.mjs`

若不随 clone 带上，克隆出来的插件里没有这个文件，hooks 直接断。故 force-track 这一个 bundle 入包，hooks 引用路径零改动。

## .gitignore 机制（为什么是三行）

`.gitignore` 第 2 行 `dist/` 会忽略任意层级名为 `dist` 的目录。git 的规则是：**父目录被忽略后就不再下探**，因此单独写 `!packages/cli/dist/pipeline.mjs` 一行**不生效**（已 `git check-ignore` 实测确认仍被忽略）。要放行目录内某一个文件，须三行缺一不可：

```gitignore
!packages/cli/dist/          # 先放行该目录本身，让 git 重新下探
packages/cli/dist/*          # 再把目录内全部内容重新忽略
!packages/cli/dist/pipeline.mjs   # 最后单独放行这一个 bundle
```

验证：`git check-ignore packages/cli/dist/pipeline.mjs` 应**无输出**（不再忽略）；`git add -n packages/cli/dist/` 应**只列出 pipeline.mjs**（其余 tsc 产物仍忽略）。

## 维护纪律（重要）

**改了 `packages/cli/src/` 下任何源码后，必须 `npm run build` 重新构建，并把更新后的 `packages/cli/dist/pipeline.mjs` 一并提交。** 否则入库的 bundle 会与源码脱节（stale dist），装插件的人跑到的是旧行为。

提交 bundle 时逐文件 add：

```bash
npm run build
git add packages/cli/dist/pipeline.mjs
```

## 已知缺口（YAGNI 登记）

本批**未**做 CI 新鲜度门（自动校验入库 bundle 与当前 src 一致）。目前靠本文纪律与 code review 人肉守门。若未来 bundle stale 反复发生，再上一道 CI 门（如构建后 `git diff --exit-code packages/cli/dist/pipeline.mjs`）。冒烟可跑 `bash tools/test-bundle.sh`。
