# 2026-07-29 合并后统一审查：Pre-Verify 证据

## 审查范围与身份

- Change：`post-merge-unified-review-20260729`
- 主干基线：`main@445aa1411d45a2c112d296a9fc3530db0f62e31e`
- 审查对象：已串行合并到上述主干的 PR #8、#14、#13、#11、#12、#9、#15、#16、
  #17、#18、#19，以及统一修复工作树。
- 生产 Dashboard：`http://127.0.0.1:18819`，项目 root 为当前独立 review worktree。
- 当前最终主干范围的 clean production 资产：`assets/index-C-VYJj93.js`、
  `assets/index-tJOew8ws.css`，Vite 6.4.3 生产构建。

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

## Verify attempt 2 与第三次 Build 回退修复

- attempt 2 结论为 FAIL：Reviewer C0/H3/M2/L0，Codex review 命中同一发布 SHA 与 tooltip
  问题，Dashboard 视觉 C0/H0/M1/L0；E2E/API 轨 C0/H0/M0/L0。
- 发布候选的完整门禁 job 已改为 `contents: read` + `actions: read` 且 checkout
  `persist-credentials: false`；它通过 Actions API 要求精确候选 SHA 已有成功的 canonical
  `ci.yml` push run。
- tag 写入已隔离到不 checkout、不安装依赖、不执行仓库代码的最小 `contents: write` job；
  写入前重新证明 `main` 未前进。reusable release 新增必填 `expected_sha`，checkout 后同时校验
  detached HEAD 与 peeled tag commit，拒绝 tag 移动或打包错 SHA。
- Automation 工具与重试弹窗统一迁移到共享 `Dialog`；390px 底部三操作导航改为两行弹性布局；
  built-in Track 的候选与继承 tooltip 统一走当前语言展示名。
- RED→GREEN：release workflow 静态契约 6/6、AfkView + mandatory skills 98/98；
  Dashboard 全量 67 files / 1210 tests，root 327 files / 5741 passed / 14 honest-skip。
- 真实 Chrome（390×844）复验英文 Automation：nav `scrollWidth=clientWidth=356`，
  三按钮右边界最大 367px（viewport 390px），`Validate schedule` 的键盘焦点为 2px
  可见 outline。工具 Dialog 首焦点 Close、Shift+Tab 留在 Dialog、Escape 回到
  `New schedule`；真实临时 Change 的失败重试 Dialog 首焦点 Cancel、Shift+Tab 到
  Confirm retry 且不逃逸、Escape 回到 `Review retry`。console warning/error 与 page error
  均为 0。截图位于 `/tmp/tenon-unified-browser-build3/`，不写入发布仓库。
- full build、dependency/release checks、docs check/build/smoke、OpenSpec 26/26 strict、
  skills/bundle/hooks/adapters、migration CAS、legacy bridge 与 golden oracle（0 差异）均通过。
  这些仍是第三次 Build 候选证据；必须 commit 并冻结精确 SHA 后重新跑四轨 Verify。
- 独立 pre-Verify reviewer 随后抓到 1 个 High：增量 Dashboard dist 保留了已删除
  `max-w-5xl` 对应的未使用 Tailwind rule，导致候选 CSS 比隔离 clean build 多 22 bytes，
  release 的 committed-freshness 门会失败。已重新执行 clean `npm ci` 与 production build；
  连续两次全构建的 HTML/JS/CSS SHA-256 逐字节不变，且与隔离 clean build 完全一致：
  JS `886af287…`、CSS `ad3d668f…`。最终独立代码审查为 C0/H0/M0/L0。

## 最终主干范围 Build

- PR #15–#19 合并后重新冻结 `main@445aa141`；开放非 Draft PR 队列清零。旧
  `aacba5a8` Verify 证据因范围移动保持作废，没有外推到最终主干。
- Workbench、Loop、Machine、Project Registration、Progress、Create Change、AFK 与
  Operations 的 network/HTTP/schema/no-project 错误统一走 locale-aware policy；英文态不再泄漏
  server-authored 中文，AbortError 保持原生取消语义。
- 所有危险确认、mutation、草稿和异步结果绑定 exact root、entity 与 generation/operation token。
  覆盖 A 慢/B 快、同名实体跨 root、StrictMode 重挂载、语言切换和 unmount 后晚到结果。
- Workflow/Skill registry 的 200 成功体在 API 边界执行完整 runtime decode；非法嵌套字段、
  错名 Workflow 以及 OpenSpec/document 双契约互斥违例均 fail closed。
- 架构门发现并修复 6 个问题：AFK、Workbench、Governance、Loop、Track Settings 按业务区块拆分到
  仓库硬上限内，schema decoder 移除双重断言。独立 pre-Verify reviewer 在最终 dirty diff 上结论
  C0/H0/M0；exact-SHA 隔离复审和真实浏览器矩阵仍由 Verify 执行。
- 干净安装后连续两次完整 build 的 CLI/Server/Dashboard 聚合 SHA-256 均为
  `c93fa1916b6365d637eda2430c004e5b014c218e272b36c950b41368f95ddede`。
  Dashboard JS 为 `26ff724f…179b`，CSS 为 `2b53918d…2886`。
- root tests：327 files、5729 passed、26 honest-skip；Dashboard：69 files、1263 passed。
  Docker/真实容器与 real-Codex 路径只按环境条件诚实跳过，未计作产品通过。
- OpenSpec target 与全仓 strict validation 为 32/32；hooks 512/512、adapters 272/272、
  bundle 31/31、migration CAS 13/13，五套 golden oracle 为 0 差异。
- 本地 clean Codex install 通过并重复确认相同 Dashboard identity。可选 npx payload 的
  39 项契约测试通过；实际 payload build 需要仓库变量 `TENON_NPM_PACKAGE`，本地未猜测或伪造
  package ownership。legacy bridge 与双语 docs sync/check/build/smoke 均通过。

## 自动化验证基线

- 定向 Dashboard：5 files、273 tests 通过。
- Dashboard typecheck 与 Vite 6.4.3 production build 通过。
- root tests：327 files、5729 passed、26 个环境条件 honest-skip；Dashboard：69 files、
  1263 passed。
- 干净 `npm ci`、root production build、docs check/build/smoke、architecture、comment honesty、
  repository hygiene、identity、default workflow freshness、dependency audit/tree、document
  templates、npx package 契约测试、512 hook tests、272 adapter tests、13 migration CAS tests、
  golden oracle 与 legacy bridge 全部通过。

## Verify attempt 4 回退与独立复审收口

- attempt 4 在 `f4c79a377e9dc986271778452675d80f9adde718` 上结论为
  C0/H0/M7/L2，已按 `verify-fail` 回到 Build；该 SHA 的绿色 CI、E2E/API 与视觉执行结果
  不外推到新候选。
- 7 个 Medium 与 2 个 Low 均先建立确定性 RED，再完成零 step、canonical guard/action、
  save/create/delete identity、mandatory/delete runtime decode、pending locale、ARIA/i18n 与
  390px 标签完整性的修复。
- 第一轮返工独立复审继续发现 4 个 Medium：合法 sentinel step id、Step Policy ARIA、
  Workflow delete 错误信封闭集和 mandatory 不同 cell 并发 identity。全部以 RED→GREEN 修复。
- 第二轮独立复审继续发现 1 个 Medium：删除路径只验证非 2xx 错误体，HTTP 200 的 `{}`、
  `{ok:false}` 或 non-JSON 仍会误删本地 Workflow。现在 response decoder 对成功与错误统一
  fail closed，200 只接受精确 `{ok:true}`；三类畸形体均保留当前选择、定义与缓存并显示
  `common.invalid_response`。
- `WorkbenchView.tsx` 的新响应处理没有绕过 600 行架构门；纯定义编辑逻辑下沉到
  `workbenchDefinition.ts`。定向 Workbench 96/96、Dashboard typecheck、architecture 与
  `git diff --check` 已通过。
- 最终独立 reviewer 在完整 dirty diff 与 tracked bundle 上结论为
  **C0/H0/M0/L0，PASS**。`dist/index.html` 只引用 `index-CCGhygZp.js` 与
  `index-Bi3InOKq.css`；JS SHA-256 为
  `03bdbbbb5f24f507cef2618ff9ed1c158394001c76b4293f3a8c8e08266227be`，且已在 minified
  bundle 中确认 exact `{ok:true}` 分支。旧 hash asset 已删除且未被引用。
- 最终 `test:all`：root 327 files / 5729 passed / 26 honest-skip；Dashboard
  69 files / 1287 passed。连续两次 full build 产生相同 Dashboard asset 名称和 size。
