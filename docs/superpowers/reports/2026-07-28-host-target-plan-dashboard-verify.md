# Host Target Plan Center 验证报告

## 结论

第二轮 Verify 审查冻结提交
`8928d9d484395c84e87fc8b044a9af5423663f3a` 的完整
`origin/main...build_sha` 交付面。Reviewer、隔离 E2E 与真实浏览器视觉轨均通过，
Codex CLI 轨发现 2 个可修复 MEDIUM/P2 输入边界问题，因此聚合结论为 **FAIL**，必须回到
Build 修复、重新提交、重新冻结并再次全量验证。

- CRITICAL：0
- HIGH：0
- MEDIUM：2
- LOW：0
- 首轮 Verify 的 1 HIGH / 6 MEDIUM / 2 LOW 与 hygiene 门禁问题均已回归修复。

## 冻结与零输出

- `build_sha`：`8928d9d484395c84e87fc8b044a9af5423663f3a`
- 比较基线：`origin/main` /
  `2d103e330f847e003ff5909097d892f5722cca04`
- 主线前后 worktree fingerprint：
  `6fda9323ce2c1efb1492ebab31c2e0809f8606789533b61a348d44bafbc2fee0`
- Reviewer 前后 fingerprint：
  `915f9afb25e9d51531bd67900927b8f38cf3f153dda657ff1ec0c7eed19b5e66`
- E2E 真实 worktree 前后 HEAD、status、unstaged、staged digest 完全一致。
- 视觉轨前后 fingerprint：
  `587277f8ff6726cd366cb649269df913584fec512e2fe83f3e2036a55304c0b8`
- 真实 `openspec/specs/**/spec.md` 聚合 digest 前后均为
  `44328f9c948d747c455e279f141d5eeb4d0f9db8571afdbb2de3bcc40aa299eb`。
- 验证期间没有实现、配置或生成物写入真实 worktree；本报告是聚合后唯一写入的治理产物。

## 四轨聚合

### Reviewer Agent

结论：PASS，CRITICAL/HIGH/MEDIUM/LOW 均为 0。

- 完整审阅 2 个提交、105 个文件、COMMON/FRONTEND/BACKEND、proposal、design、ADR、
  delta spec、tasks 与 REVIEW。
- 覆盖 CLI catalog/plan、native truth 复用、setup/update 兼容与零写操作。
- 覆盖 API 白名单、固定 argv、严格 DTO、Host guard、脱敏错误。
- 覆盖 Dashboard 全状态、并发陈旧响应、键盘语义、响应式、双语与无执行入口。
- 回归首轮全部 finding，并确认 clean-room 文档和依赖没有 Comet/Trellis 源码或 AGPL 污染。

### 隔离 E2E

结论：PASS。隔离副本：
`/tmp/tenon-host-plan-verify2-track2.XwB9BU/repo`，日志位于其父目录。

实际通过：

- `npm ci`
- `npm run build`：2011 modules；Dashboard JS 772.56 kB、server 822.0 kB、CLI 1.9 MB。
- CLI/server focused：3 files，102/102。
- Dashboard focused：5 files，106/106。
- `npm run typecheck:web`
- `npm run test:web`：52 files，997/997。
- `npm test`：317 files，5475 passed、5 skipped，共 5480。
- `bash tools/test-bundle.sh`：31/31。
- `npm run check:npx-package`：35/35。
- `npm run check:docs`：10/10，39 canonical Markdown files。
- `npm run check:repository-hygiene`：6/6。
- `npm run check:architecture`：623 production files。
- `npm run check:comments`
- `git diff --check`

真实 CLI smoke 确认 catalog 为有序 12 targets（2 native、10 adapter），Codex
setup/update 与 Cursor update 均为 `side_effects=none`，adapter 保留 `<project>`；
`.foo`、非法或缺失 operation、额外 `--root` 均 exit 1。真实 API smoke 确认 health、
catalog、Codex setup 成功，缺失/重复/额外/未知查询均为脱敏
`400 HOST_TARGET_QUERY_INVALID`。CLI/API 前后隔离状态 fingerprint 均相同。

诚实跳过与警告：

- 1 个真实 Codex 场景因 `TENON_REQUIRE_REAL_CODEX!=1` 跳过。
- 4 个 container agent 场景因缺少 `CLAUDE_CODE_OAUTH_TOKEN` 跳过。
- 既有 React `act(...)`、GSAP target、Vite >500 kB chunk 警告。
- `npm ci` 报告既有 5 moderate、1 high、1 critical 依赖漏洞及 4 个未批准 install scripts。
- `check:npx-package` 只在一次性隔离克隆内把 bootstrap mode 改为 `100755`，真实 worktree 未变。

### Codex CLI

结论：FAIL。命令：

```text
codex exec review --base origin/main
```

原始日志：
`/tmp/host-target-plan-codex-review-2.log`。

1. MEDIUM/P2：Commander 对重复 `--host` 与 `--operation` 采用末值覆盖。例如非法首值后接
   合法末值会成功，违背单目标计划“恰好一个 host 和一个 operation”及 API 的重复参数
   fail-closed 口径。必须在 action 前拒绝重复值并加入 bundle/Commander 回归测试。
2. MEDIUM/P2：两个只读 GET 对每次请求都启动 CLI 子进程。任意网页可对 loopback 发起无法读取
   响应但仍能触发的 simple GET；当前没有成功结果缓存、相同请求 in-flight 去重或跨 key 并发上限，
   而 runner 超时很长，可能耗尽本机进程。必须在 server 实例范围提供有界并发，并缓存/合并
   catalog 与至多 24 个白名单计划 key；失败结果不可永久缓存。

Codex 轨同时复跑 focused Dashboard、typecheck、docs、hygiene 与 bundle，均通过；其前后主线
fingerprint 相同。

### 真实 Dashboard 浏览器与视觉

结论：PASS，CRITICAL/HIGH/MEDIUM/LOW 均为 0。

- 冻结代码在临时 archive 中构建并运行于 `127.0.0.1:58725`。
- 页面身份：health `{ok:true,scope:global,version:1.0.1}`，title `Tenon Dashboard`。
- Desktop `1440×900`：显示 2 native + 10 adapter；键盘 Enter 选择 Codex、Space 选择
  Setup；`aria-pressed` 生效，focus ring 为 `rgb(37,99,235) 0 0 0 2px`。
- Codex Setup 显示 `tenon setup --codex`；复制后 clipboard 值一致。
- Cursor Update 显示 `tenon update --cursor --target <project>` 与项目占位 notice。
- 页面只有 Copy，没有 Run/Execute/立即执行控制。
- Mobile `390×844`：目标卡单列；body/document `scrollWidth=390`；长命令只在 code block
  内横向滚动，无页面级溢出。
- 实测 catalog loading、empty→Retry、英文 503；plan loading、英文 502→Retry→ready。
  英文错误不泄漏 server 原文或内部 detail。
- 正常 desktop/mobile console 与 pageerror 均为空；人为 502/503 mock 只有 Chrome 预期资源错误。
- Browser/server 已关闭，端口已释放。

主证据：
`/tmp/tenon-host-plan-verify-v4ISXv/browser-evidence.json`。
同目录保存 desktop/mobile、loading/empty/error/plan、health、server log、关闭与 fingerprint
截图/文本证据。

## 逐文件 Spec 回读

`git diff --name-only origin/main...8928d9d` 的 105 个文件已逐项枚举，并按下表的唯一覆盖规则
回读 `openspec/changes/host-target-plan-dashboard/specs/host-target-plan/spec.md`。表内 glob
覆盖清单的每个路径；没有未映射文件。

| 冻结文件集合 | 命中的 requirement | 结论 |
| --- | --- | --- |
| `packages/cli/src/**`、`packages/cli/dist/tenon.mjs` | catalog、单目标计划、兼容与许可 | 主路径通过；重复 option fail-closed 失败 |
| `packages/server/src/**`、`packages/server/dist/dashboard.mjs` | 严格只读 API、安全与兼容 | DTO/query/Host guard 通过；子进程并发边界失败 |
| `packages/dashboard-app/src/api/**` | client DTO 与错误契约 | 通过 |
| `packages/dashboard-app/src/hostPlan/**` | 选择、预览、复制与全状态 | 通过 |
| `packages/dashboard-app/src/App*`、`src/shell/**`、`src/i18n/**` | machine-level view、路由、双语、a11y | 通过 |
| `packages/dashboard-app/dist/**` | 可发布 Dashboard bundle | 通过 |
| `docs/adr/**`、`docs/superpowers/**` | clean-room、固定来源、设计与验证 | 通过 |
| `docs/usage/**` | CLI/API 用法与安全边界 | 通过 |
| `openspec/changes/host-target-plan-dashboard/**` | 五项 requirement 与治理证据 | delta valid；证据齐全 |
| `tools/check-docs*`、`tools/check-repository-hygiene*` | 文档/导航与许可边界门禁 | 通过 |

## OpenSpec 隔离应用演练

- OpenSpec CLI：`1.6.0`
- `openspec show host-target-plan-dashboard --json --deltas-only`：成功。
- `openspec validate host-target-plan-dashboard --strict`：成功。
- 隔离 clone：
  `/tmp/host-target-plan-openspec.de9ZRC/repo`
- 隔离 `openspec archive host-target-plan-dashboard --yes --json`：成功，应用 5 个新增
  requirement，生成 archive `2026-07-28-host-target-plan-dashboard`。
- 隔离 `openspec validate host-target-plan --strict`：成功。
- 真实主规格 digest 演练前后不变；Ship 仍是唯一真实 apply 边界。

## 下一轮 Build 必修项

1. CLI 在 Commander 解析层拒绝重复 `--host` / `--operation`，增加非法首值、重复合法值与
   bundle 回归。
2. server 为 deterministic host plan 请求增加 server-instance scoped 的成功缓存、同 key
   in-flight 去重和跨 key 有界并发；失败必须可重试。
3. 重新运行全部 Build 门禁、独立 pre-Verify review、提交和 `build-complete`。
4. 下一轮 Verify 同时回归本轮两项 finding，并重新全量完成 reviewer、E2E、Codex 与真实浏览器，
   不只复查修复点。
