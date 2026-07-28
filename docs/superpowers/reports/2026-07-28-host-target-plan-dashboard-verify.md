# Host Target Plan Center 验证报告

## 结论

第三轮 Verify 审查冻结提交
`75df836602fe1bb3e79bf95c0ffad44837822d7a` 的完整
`origin/main...build_sha` 交付面。隔离 E2E 与真实浏览器/视觉轨通过；Reviewer 发现 2 个
LOW，Codex CLI 发现 2 个可修复 MEDIUM/P2 契约问题，因此聚合结论为 **FAIL**。必须回到
Build 修复、重新提交、重新冻结并再次全量验证。

- CRITICAL：0
- HIGH：0
- MEDIUM：2
- LOW：2
- 前三轮发现中的 clean-room、严格 decoder、i18n、snapshot、live announcement、文档、
  repository hygiene、重复 CLI option、server 有界 runtime 与初次 adapter 顺序修复均已回归。

## 冻结与零输出

- `build_sha`：`75df836602fe1bb3e79bf95c0ffad44837822d7a`
- 比较基线：`origin/main` / `2d103e330f847e003ff5909097d892f5722cca04`
- 主线实现 fingerprint 前后均为
  `workspace:sha256:591aad9530e58783f714e49316c5778851d5bdfebab5c4d19827135258ddc632`。
- 真实 `openspec/specs/**/spec.md` 聚合 digest 前后均为
  `44328f9c948d747c455e279f141d5eeb4d0f9db8571afdbb2de3bcc40aa299eb`。
- Reviewer delivery patch SHA-256：
  `85b22164b76830e634f9475b653fc4846aa81f5d97174c243563f0e9a8b4023a`。
- E2E 与浏览器轨只在 `/tmp` 隔离副本写入。并行 Codex skill/review 追加了受信
  `.pipeline-history.jsonl` ledger 行，造成全 worktree byte fingerprint 变化；实现路径、
  HEAD、status path set 与 staged digest 未变。本报告是轨道聚合后的唯一产品仓治理写入。

## 四轨聚合

### Reviewer Agent

结论：FAIL，仅 2 个 LOW，CRITICAL/HIGH/MEDIUM 为 0。

1. ADR 仍写“每次读取计划会启动一次 CLI bundle”，与已实现的成功缓存、同键合并和跨键串行
   不一致。
2. server 测试名为 “adapter deploy command differs” 的用例仍修改 `steps[1]`；新顺序中
   deploy 不在该位置，测试实际命中 managed-runtime 非空命令，没有覆盖其声明的 mismatch。

完整 119-file 差异、生产源、测试、tracked bundles、usage/ADR/OpenSpec 与门禁工具均已回读；
重复 CLI option、25-key runtime 和 adapter decoder 同步未回退。

### Codex CLI

结论：FAIL，P0/P1/P3 为 0，P2 为 2。

1. Adapter DTO 当前为
   `package-assets → managed-runtime → bundled-skills → runtime-readiness → adapter-deploy`，
   但真实完整 `tenon setup/update --<adapter>` 链在 `cmdSetupHost` 发布 runtime 后执行
   adapter，随后 `cmdSetup` 才运行 skills 与 readiness。正确顺序应为
   `package-assets → managed-runtime → adapter-deploy → bundled-skills → runtime-readiness`。
   三端 decoder/fixtures 同步锁定了错误顺序，需要加入与真实编排链的契约测试。
2. Server decoder 接受 `targets: []` 为成功，并由无失效期成功缓存永久保存。CLI 真相规定完整
   `TENON_HOSTS`，空 catalog 应是 `502 HOST_TARGET_PLAN_INVALID`。Frontend 可保留可达 empty
   状态测试，但 production server 不应把不可能的空 CLI catalog 当成成功。

Codex 只读验证：CLI 38/38、server resolver 66/66、Dashboard focused 106/106、三端
TypeScript、OpenSpec strict、docs、hygiene、`git diff --check` 均通过；其沙箱内 6 个真实
HTTP assembly 用例因 `listen EPERM` 未运行，由隔离 E2E 轨补足。

### 隔离 E2E

结论：PASS。隔离克隆：
`/tmp/tenon-host-plan-final-e2e.8VR4Oj/repo`，日志位于其父目录。

- `npm ci`：exit 0；401 packages。
- `npm run build`：exit 0；2011 modules，Dashboard 772.62 kB，server 823.4 kB，CLI 1.9 MB。
- CLI/server focused：3 files，110/110。
- Dashboard focused：5 files，106/106。
- `npm run typecheck:web`：通过。
- `npm run test:web`：52 files，997/997。
- `npm test`：317 files，5483 passed、5 skipped，共 5488，exit 0。
- `bash tools/test-bundle.sh`：31/31。
- `npm run check:npx-package`：35/35。
- `npm run check:docs`：10/10，39 canonical Markdown files。
- `npm run check:repository-hygiene`：6/6。
- `npm run check:architecture`：623 production files，5 个 size-only exception。
- `npm run check:comments`、`git diff --check`：通过。

真实 bundle smoke：四种重复/非法首值后合法末值的 host/operation 均 exit 1；20 个 adapter
setup/update DTO 与当前 tracked decoder 一致；真实 server 对 20 路同 key 只产生 1 个 CLI
child，25 个 canonical key 的 CLI 峰值并发为 1，失败不缓存、成功可重试并缓存。

诚实记录：

- 干净 clone 在 build 前先跑 focused，因 `@tenon/kernel` 尚未构建而 exit 1；build 后原样复跑
  110/110。
- 1 个 real-Codex 场景因 `TENON_REQUIRE_REAL_CODEX!=1` 跳过，4 个 container agent 场景因
  缺 `CLAUDE_CODE_OAUTH_TOKEN` 跳过。
- `npm ci` 报告既有 5 moderate、1 high、1 critical 漏洞、1 deprecated package 与 4 个未批准
  install scripts；既有 React `act(...)`、GSAP target 与 Vite chunk 警告保留。
- `check:npx-package` 只在隔离克隆将 bootstrap mode 改为 `100755`，真实 worktree 未变。

### 真实 Dashboard 浏览器与视觉

结论：PASS，CRITICAL/HIGH/MEDIUM/LOW 均为 0。

- 从冻结 SHA 的 git archive 构建，运行
  `http://127.0.0.1:61944/?view=hostPlan`；health
  `{ok:true,scope:global,version:1.0.1}`、title `Tenon Dashboard`、12 targets 身份正确。
- Desktop `1440×900` 与 mobile `390×844` 通过；键盘 Enter/Space、`aria-pressed`、复制、
  2px focus ring、loading/empty/error/retry/ready 均可用。
- 英文 network、HTTP 418、decoder invalid v2 文案正确且不泄漏原始 body。
- 页面没有 Run/Execute；请求日志只有两个只读 GET，没有 setup/update 执行。
- 移动端单列且页面宽度 390；长命令仅 code block `overflow-x:auto`。
- 正常 console/pageerror 为空；mock 错误只有 Chrome 预期资源错误。
- Browser/server 已关闭，61944 端口已释放。

证据：`/tmp/tenon-host-plan-final-M5JPNJ/browser-evidence.json`
（SHA-256 `c58b07dc38eaa646bce6ec5c4978476d7f3c6cad2b2212c4673634285ae8969a`）
及同目录 10 张关键状态截图。

## 逐文件 Spec 回读

`git diff --name-only origin/main...75df836` 的 119 个文件已逐项枚举并回读
`openspec/changes/host-target-plan-dashboard/specs/host-target-plan/spec.md`。

| 冻结文件集合 | 命中的 requirement | 结论 |
| --- | --- | --- |
| `packages/cli/src/**`、CLI bundle | catalog、单目标计划、兼容与许可 | 重复 option 通过；完整 adapter 顺序失败 |
| `packages/server/src/**`、server bundle | 严格只读 API、安全与兼容 | runtime 通过；空 catalog 失败关闭缺失 |
| Dashboard `src/api/**`、`hostPlan/**` | DTO、状态、复制、无执行入口 | 通过；需随 server 真相更新顺序 |
| Dashboard `App*`、`shell/**`、`i18n/**`、dist | 路由、双语、a11y、响应式 | 通过 |
| `docs/**`、OpenSpec Change | clean-room、设计、五项 requirement | delta valid；ADR 一处 LOW 漂移 |
| `tools/check-docs*`、`check-repository-hygiene*` | 文档与许可门禁 | 通过 |

## OpenSpec 隔离应用演练

- OpenSpec CLI：`1.6.0`
- `openspec show host-target-plan-dashboard --json --deltas-only`：成功。
- `openspec validate host-target-plan-dashboard --strict`：成功。
- 隔离 clone：
  `/private/var/folders/1c/hyn3mfvd12ngm6sgy28_s5gm0000gn/T/tmp.jM6hI5RyF7/repo`
- 隔离 `openspec archive host-target-plan-dashboard --yes --json`：成功，应用 5 个新增
  requirement，生成 archive `2026-07-28-host-target-plan-dashboard`。
- 隔离 `openspec validate host-target-plan --type spec --strict`：成功。
- 真实主规格 digest 未变；Ship 仍是唯一真实 apply 边界。
- 附加 `openspec validate --all --strict` 有 12 个既有无关 change/spec 失败，不属于本 Change
  成功硬门，已如实保留。

## 下一轮 Build 必修项

1. Adapter 步骤调整为
   `package-assets → managed-runtime → adapter-deploy → bundled-skills → runtime-readiness`，
   并增加与真实 setup 编排的契约测试。
2. Production server decoder 拒绝空 catalog；Dashboard empty 状态保持独立组件/客户端测试。
3. 修正 server mismatch 测试索引与 ADR 缓存说明。
4. 重跑全部 Build 门禁、独立 pre-Verify review、提交与冻结；下一轮 Verify 重新全量完成四轨。
