# 2026-07-29 合并后统一审查：Pre-Verify 证据

## 审查范围与身份

- Change：`post-merge-unified-review-20260729`
- 主干基线：`main@907dac067c17ed77fb440b91b20d64fd0f24773b`
- 审查对象：已串行合并到上述主干的 PR #8、#14、#13、#11、#12、#9，以及统一修复工作树。
- 生产 Dashboard：`http://127.0.0.1:18819`，项目 root 为当前独立 review worktree。
- 当前修复资产：`assets/index-4SOLOvlh.js`、`assets/index-66K4PrwP.css`，Vite 6.4.3 生产构建。

## 规则、架构、安全与代码审查

- `COMMON.md`、`FRONTEND.md`、`BACKEND.md` 的边界均纳入审查；没有新增 CLI/HTTP DTO、持久化格式或
  shell 命令拼接。
- Governance 确认状态由 React 对象 identity 改为明确的 decision key：
  root、row root、loop id、自治级、就绪、预算与 graduation 任一事实变化才关闭确认。
  等价 snapshot refresh 保持确认；取消、Escape、事实变化均不发 mutation 并恢复焦点。
- Workbench 产品文案、可访问名称、状态和操作全部复用既有 `I18nProvider`；自定义 workflow、
  用户数据和技术 token 保持原文，默认 workflow 的内建阶段才做产品级本地化。
- Track Settings 迁移到共享 `Dialog`，得到首焦点、Escape、焦点困笼和触发器归位；没有建立第二套
  modal/focus 实现。
- 依赖修复采用 manifest、lockfile 与 VitePress override 原子组合，没有使用
  `npm audit fix --force`。CI、pre-tag candidate 与 release packaging 共用
  `npm audit --audit-level=high && npm ls --all`，advisory 和无效解析树均阻断。
- release packaging 不再接受 tag push 或直接手动分派；只有精确 `main` SHA 的 pre-tag
  candidate 在全部门禁前后都证明身份后才能创建 tag。3 个静态契约测试防止该路径被绕开。
- `GovernanceRail.tsx` 保持在架构门的 400 行上限内；decision key 下沉到
  `governanceModel.ts`，没有借删除检查或提高阈值绕过。
- 对当前修复 diff 执行空白错误、注释诚实、架构、仓库卫生、依赖树、生成物和发布工作流复核。
  Build 交接代码审查结论：Critical 0、High 0、Medium 0；最终浏览器与四轨结论留给新 SHA 的 Verify。

## `design-taste-frontend` 首遍发现与修复

| 严重度 | 发现 | 修复与回归 |
| --- | --- | --- |
| Medium | English Workbench 混入 header、阶段、轨道、Hook、Skill、产出与 aria 中文产品文案 | 收敛到同一翻译表；新增 English Workbench、执行面与编排 Dialog 回归；生产浏览器可见 CJK 扫描为空 |
| Medium | Track Settings 自制 portal 不响应 Escape，关闭后焦点留在背景控件 | 改用共享 `Dialog`；真实键盘验证首焦点为 Close、Escape 关闭、焦点回到精确触发器 |
| Medium | Governance 升档确认依赖 row 对象 identity，等价轮询刷新会误关弹窗 | 先建立 RED，再改为 decision key；42 个 Governance 回归覆盖等价刷新和事实变化 |
| Release blocker | 依赖树含 1 Critical、1 High、5 Moderate advisory | 原子升级 AJV/Vite/Vitest 并固定 VitePress override；`npm audit` total 0，CI/release 加阻断门 |
| Low | 390px 下 Hook 标题用 ellipsis 截断，关键动作不可完整阅读 | 改为可换行 `break-words`；真实 DOM 确认无 ellipsis，移动端截图人工复核 |
| Low | 内建 Product/Frontend/Backend 与 Governance Dialog 标题/Close 在英文态仍混合语言 | 增加内建轨道展示映射与 Dialog 翻译；打开态 CJK 扫描为空 |

该次视觉基线随后在 Verify attempt 1 发现了更深的 Dashboard 问题；不能作为最终通过结论。
完整 finding 与回退证据见
`docs/superpowers/reports/2026-07-29-post-merge-unified-review-verify-attempt-1.md`。

## 首次真实浏览器基线（非最终 Verify）

### 正常态、语言与响应式

- English：`Workbench`、Product/Frontend/Backend、Open→Archive、Hook/Skill/产出/可访问名称均为英文；
  全页面可见 CJK 扫描 `[]`。
- 中文：工作台、产品/前端/后端、立项→归档均存在，390px 无根级溢出。
- 390×844、720×900、1024×768、1440×900 的 document/body 宽度均等于 viewport；
  小视口阶段条使用内部横向滚动，1440px 不需要内部滚动。
- 390px Hook 标题 `Inject workflow context` 与 `Gate interception` 完整换行，无 ellipsis；
  desktop 与 mobile 最终截图均经过人工视觉检查。

### 状态、键盘、焦点、主题与动效

- 加载态：延迟真实 `/api/config` 响应 1.8 秒，观察到
  `Loading runtime track configuration…`，随后正常恢复。
- 错误态：仅将 `/api/config` 注入 500，显示
  `Runtime track configuration failed to load`，Workbench 主界面仍可用；服务端原始错误文本不泄漏。
- 空态：Governance 显示 `Auto-run is not configured yet`；Dialog 首焦点、Escape、触发器焦点归位正确。
- Track Settings：首焦点为 `Close track settings`；Escape 关闭并回到
  `wb-track-settings-toggle`。
- 主题：System(light) → Light → Dark → System(light) 的有效 color scheme 均正确。
- `prefers-reduced-motion: reduce`：390px 生产页面 `animation` 0、有效 `transition` 0，且无溢出。
- 干净正常加载：console warning/error 0、page error 0、HTTP 4xx/5xx 0。该轮使用旧修复资产
  `assets/index-DOIcCiLI.js`；新资产必须在第二轮 Verify 重新覆盖同一矩阵。

## Verify attempt 1 与回退修复

- attempt 1 结论为 FAIL：Reviewer C0/H0/M4/L0，Dashboard 视觉 C0/H0/M5/L1，
  Codex review 另确认同类 i18n、依赖树和 pre-tag 缺口；E2E/API 轨未完整完成。
- 已完成 review gate、Hook/Policy、Projects、Automation 全产品文案本地化；英文 populated
  Automation 回归要求可见产品文案 CJK 为零。
- 已完成 workflow menu roving keyboard、Escape/Tab、暗色 token 对比度与 config error retry。
- 已完成全仓 26/26 OpenSpec strict、依赖 audit/tree、pre-tag 身份双检和 release 防绕过测试。
- 这些修复只构成新的 Build 候选；必须冻结新 SHA 后由四轨 Verify 重新独立验证。

## 自动化验证基线

- 定向 Dashboard：5 files、203 tests 通过。
- Dashboard typecheck 与 Vite 6.4.3 production build 通过。
- root tests：327 files、5741 passed、14 个仓库既有 honest-skip；Dashboard：67 files、
  1205 passed。
- 干净 `npm ci`、root production build、docs check/build/smoke、architecture、comment honesty、
  repository hygiene、identity、default workflow freshness、dependency audit/tree、document
  templates、npx package、512 hook tests、13 migration CAS tests、golden oracle 与 legacy bridge
  全部通过。
