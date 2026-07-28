# Host Target Plan Center 验证报告

## 结论

冻结提交 `e32cf7f924cf3964e46bc942e9dff31192733d4a` 验证失败，必须回到 Build 修复后重新冻结并全量复验。

- CRITICAL：0
- HIGH：1
- MEDIUM：6
- LOW：2
- 门禁失败：`npm run check:repository-hygiene`

## 冻结与零输出

- `build_sha`：`e32cf7f924cf3964e46bc942e9dff31192733d4a`
- 隔离验证副本：`/tmp/tenon-host-plan-verify-track2.l8YgO7/repo`
- 隔离日志：`/tmp/tenon-host-plan-verify-track2.l8YgO7/*.log`
- 真实 worktree 前后 HEAD 相同。
- 真实 worktree status fingerprint 前后均为
  `b62bfcc873926afb5e7811ccf68facec8f43ced8ecf55da0ec2eb5fee42ec22c`。
- 真实 `openspec/specs/**/spec.md` 聚合 digest 前后均为
  `44328f9c948d747c455e279f141d5eeb4d0f9db8571afdbb2de3bcc40aa299eb`。

## 四轨聚合

### Reviewer

结论：FAIL，完整审阅冻结 commit、全部交付文件、项目规则、proposal、design、ADR、plan 与 delta spec。

1. HIGH：Comet 研究文档直接收录大量上游源码、测试、Changelog 与 package metadata 原文，违反用户“不复制 Comet 代码”和 delta spec clean-room 条款。
2. MEDIUM：英文模式的真实 HTTP/network/decoder 错误直接显示中文字符串。
3. MEDIUM：server decoder 只校验 native step 的形状和 ID，没有校验真实 native command chain；测试夹具与 CLI 当前 update plan 已漂移。
4. MEDIUM：Dashboard decoder 没有完整校验 catalog 顺序/唯一性/准确能力、计划命令、步骤顺序和 notices。
5. LOW：中英文 CLI reference 未记录新命令。
6. LOW：`Nav.tsx` 的五视图注释遗漏 `hostPlan`。

### 隔离 E2E

结论：FAIL，仅 `check:repository-hygiene` 阻断。

通过：

- CLI/server 定向：3 files，66 tests。
- Dashboard 定向：5 files，88 tests。
- `npm run typecheck:web`。
- `npm run test:web`：52 files，979 tests。
- `npm run build`。
- `npm test`：317 files，5439 passed，5 skipped。
- `bash tools/test-bundle.sh`：31 passed。
- `npm run check:docs`：39 个 canonical Markdown files。
- `npm run check:npx-package`：35 passed。
- `git diff --check`。
- 真实 CLI smoke：12 targets、2 native、10 adapter；setup/update 均
  `side_effects=none`；custom host、非法/缺失 operation 和额外 option 均 exit 1。
- 真实 API smoke：health、catalog、Codex setup plan 成功；missing、duplicate、extra、
  unknown host、invalid operation 均为稳定脱敏 `400 HOST_TARGET_QUERY_INVALID`。

失败：

- `npm run check:repository-hygiene`：12 项。外部参考项目身份的全局禁令与本 Change
  必须保留的固定上游 URL/SHA 冲突；需要窄范围、带测试的引用证据 allowlist。

诚实跳过/警告：

- 5 个既有 honest skips：1 个需要 `TENON_REQUIRE_REAL_CODEX=1`，4 个需要
  `CLAUDE_CODE_OAUTH_TOKEN`。
- Web 测试保留既有 React `act(...)` / GSAP 警告。
- Vite 保留大于 500 kB chunk 警告。
- `npm ci` 报告既有 audit：5 moderate、1 high、1 critical。

### Codex commit review

第一次把完整 binary diff 送入 stdin 时超过 1,048,576 字符上限，未产生结论；随后使用原生
`codex exec review --commit e32cf7f...` 完整审冻结 commit。

结论：FAIL。

1. MEDIUM：`hostPlan` 虽绕过 zero-project onboarding，但仍会被全局 snapshot error 分支遮挡。
2. MEDIUM：Host Plan 请求错误缺少 i18n 稳定错误类别。
3. MEDIUM：计划由 loading 进入 ready 后没有给辅助技术明确的完成公告。

### 真实浏览器与视觉

结论：视觉轨无 CRITICAL/HIGH/MEDIUM；行为与状态本身通过。

- 页面身份：标题 `Tenon Dashboard`，URL
  `http://127.0.0.1:18766/?view=hostPlan`，health `version=1.0.1`。
- 桌面：`1440×900`，截图
  `/tmp/tenon-host-plan-verify-visual/desktop-plan-viewport.png`。
- 移动：`390×844`，`clientWidth=scrollWidth=390`，main width `334`，截图
  `/tmp/tenon-host-plan-verify-visual/mobile-plan-viewport.png`。
- 真实成功：Codex → Setup → `tenon setup --codex`，步骤与 notices 可见；只有复制按钮，
  无执行按钮；复制后状态公告“命令已复制”。
- 状态截图：
  - `/tmp/tenon-host-plan-verify-visual/catalog-loading.png`
  - `/tmp/tenon-host-plan-verify-visual/catalog-empty.png`
  - `/tmp/tenon-host-plan-verify-visual/catalog-error.png`
  - `/tmp/tenon-host-plan-verify-visual/plan-loading.png`
  - `/tmp/tenon-host-plan-verify-visual/plan-error.png`
- empty、catalog error 与 plan error 均有具名 retry。
- 原生 button、`aria-pressed`、具名 group 与可见 focus ring 存在；实测 ring 为
  `rgb(109, 155, 251) 0 0 0 2px`。Browser runtime 的 Tab/Enter 驱动没有推进焦点，
  因此不把该运行时行为伪报为通过；语义控件和组件测试提供替代证据。
- 最终 console error logs：0。

## 逐文件 Spec 回读

`git diff --name-only e32cf7f^ e32cf7f` 的全部文件已按以下映射回读：

| 冻结文件集合 | 对应规范 | 结论 |
| --- | --- | --- |
| `packages/cli/src/**`、`packages/cli/dist/tenon.mjs` | catalog、单目标计划、兼容与许可边界 | 形状/零副作用通过；外部研究污染失败 |
| `packages/server/src/**`、`packages/server/dist/dashboard.mjs` | 严格只读 API | query/错误/Host guard 通过；command chain 严格性失败 |
| `packages/dashboard-app/src/api/**` | 严格 client decoder、错误恢复、i18n | 状态恢复通过；decoder 与错误 i18n 失败 |
| `packages/dashboard-app/src/hostPlan/**` | 选择、预览、复制、状态、键盘 | UI 状态通过；ready 公告失败 |
| `packages/dashboard-app/src/App*`、`shell/**`、`i18n/**` | machine-level view、路由、双语 | zero-project 通过；snapshot error 独立性失败 |
| `packages/dashboard-app/dist/**` | 交付 bundle | 已构建并通过 bundle smoke |
| `docs/adr/**`、`docs/superpowers/**` | clean-room、固定来源与设计理由 | 固定来源存在；逐字上游内容失败 |
| `docs/usage/**` | CLI/API 使用与安全边界 | Dashboard/API 已记录；CLI reference 遗漏 |
| `openspec/changes/host-target-plan-dashboard/**` | 全部五项 Requirement 与治理证据 | delta valid；治理文件齐全 |
| `tools/check-docs*` | 文档与导航 source-bound 一致性 | 通过 |

## OpenSpec 隔离应用演练

在隔离副本执行：

```text
npx openspec show host-target-plan-dashboard --json --deltas-only
npx openspec validate host-target-plan-dashboard --strict
npx openspec archive host-target-plan-dashboard --yes --json
```

结果：

- show 返回 5 个 `ADDED` requirements。
- Change strict validate 通过。
- archive 成功，应用 5 项新增 requirement，并生成 `spec/host-target-plan`。
- `spec/host-target-plan` strict validate 通过。
- `npx openspec validate --all --strict` 同时暴露 12 个仓库既有 unrelated change/spec
  失败；不把它们归因于本 Change，也不把全仓 strict 伪报为通过。
- 真实主规格 digest 未变化。

## 修复清单

回 Build 后必须：

1. 将 Comet/Trellis 研究收敛为固定 URL/SHA、许可事实、自主摘要和差异矩阵，删除逐字代码/测试/文案。
2. 为固定上游引用设计窄范围、带测试的 repository-hygiene allowlist。
3. 把 client errors 改为稳定 error kind/code，并在 view 层双语映射。
4. 强化 server 与 Dashboard v1 decoder 的完整命令、顺序、能力与 notice 不变量。
5. 让 Host Plan 在 snapshot error 下仍保持机器级可达。
6. 增加 ready live announcement。
7. 更新 CLI reference 与导航注释。
8. 重新 Build、提交、冻结并完整复跑四轨；不得只复查上述 finding。
