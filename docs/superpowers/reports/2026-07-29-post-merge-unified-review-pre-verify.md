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

## 第六次 Build 与最终合并主干范围

- 统一分支已合入 `origin/main@ef728bf6`，范围包含已合并 PR #21 与 #23；旧
  `main@445aa141` 及其冻结证据不外推到本候选。
- 第六轮修复覆盖 Default Skill per-cell identity、Track 权威 DTO reconcile、
  Operations 完整 decision token、AFK normalized settings，以及 Workbench 全草稿导航和
  unload 守卫；整个桌面 Dashboard 的已记录设计 Low 均已修复。
- 独立复审继续发现并回退修复 2 个 Medium：畸形 review-handshake SSE 现在触发 stream
  error 并保留最后已知快照但取消 live；dirty Workbench 取消 Back 现在通过真实 Forward
  补偿恢复历史项，确认后重放原 Back。最终浏览器交互又发现空的新 Track identity 仍可保存，
  现已在必填身份为空或非法时禁用 Save。
- 最终 root 测试：327 files / 5783 passed / 14 honest-skip；Dashboard：73 files /
  1388 passed。production build 资产为 `index-viHDz-8x.js` 与 `index-YeY6VsN7.css`，
  SHA-256 分别为 `1e745e7d…5858` 与 `1a4a0f55…8aff1`。
- 最终 production 浏览器矩阵覆盖 Overview、Projects、Progress、AFK、Workbench、
  Machine、Host Plan，在 1024/1440/1920 px、中文/英文、明/暗色及 reduced-motion
  组合下生成 21 张截图，console/page error、横向溢出、可见性和布局失败均为 0。
  证据目录为 `/private/tmp/tenon-unified-final-browser-20260730`。
- AFK、Track Settings、Governance 的关键交互复验通过：Dialog 首焦点与触发器焦点恢复正确，
  无 Loop 时提交禁用，空 Track identity 时 Save 禁用，runtime error 为 0。
- 本节记录的是最终独立 exact-candidate review 前的 Build 证据；只有复审达到
  C0/H0/M0/L0 后才允许写入 pre-Verify pass 并冻结 SHA。

### `07c712fd` 独立复审回退

- 独立 reviewer 在精确提交上继续发现 2 个 Medium：dirty Workbench 的历史目标仍为
  Workbench、但 project root 变化时会绕过确认；Workflow guard decoder 会接受非法附加字段
  并静默归一化。
- 导航守卫现在把任何 root 变化视为离开当前 dirty Workbench，并以 root A→root B 的真实
  history Back、取消恢复 A 草稿、确认才进入 B 的 RED→GREEN 覆盖。
- 9 类 Workflow guard 按各自 exact-key 闭集解码；嵌套 `when` 与
  `file-exists.path` 也必须 exact。`{type:"nonempty-output",n:2}` 明确失败关闭。
- 修复后定向 5 files / 214 tests、Dashboard 全量 73 files / 1417 tests、typecheck、
  architecture 693 files 与 production build 均通过。新 JS 为 `index-BDpnC0x_.js`
  （SHA-256 `c1f4c76e…6ac63`），CSS 保持 `index-YeY6VsN7.css`
  （SHA-256 `1a4a0f55…8aff1`）。
- 重建后再次执行 21 场景全 Dashboard 浏览器矩阵及 AFK/Track/Governance 交互，失败均为 0。
  旧 reviewer 结果保持作废，必须在新提交上重新取得 C0/H0/M0/L0。

### `daae7045` 独立复审回退

- 独立 reviewer 继续发现 1 个 Medium：任意陈旧零字节 Codex transcript 都会让 fallback
  discovery 整树永久 fail closed，即使存在更新且有效的当前证据。
- discovery 现在记录空文件 mtime；只有空文件严格早于最新可读 transcript 时才跳过。空文件
  更新、与最新可读文件同时间，或树中只有空文件时仍保持 fail-closed，exact transcript 路径也
  继续拒绝空文件。
- 新增 4 个精确回归，覆盖 stale/newer/equal/only-empty；focused 4/4、完整 receipt suite
  82/82、CLI TypeScript build 与 `git diff --check` 均通过。
- `daae7045` 的审查结果保持作废；修复提交后重新执行完整独立审查。

### `0591006f` 独立复审回退

- 精确提交复审发现 2 个 High 与 1 个 Medium：手动 release dispatch 可选择分支拥有的
  workflow 并触达写入 job；tracked CLI bundle 未包含 transcript fallback 修复；Prompt
  Routing Bypass 草稿未汇入 Workbench 统一 dirty 守卫。
- release candidate 现为严格只读，只在 dispatch SHA 与 workflow definition SHA 都等于精确
  最新 `main`、全部门禁与 canonical push CI 通过后发布 1 天 approval artifact。默认分支拥有的
  `workflow_run` writer 重验 repository/head repository、canonical workflow id/path、事件、
  结论、branch/SHA、REST run metadata、artifact run/ref/SHA 与最新 `main` 后，才以最小
  `contents: write` 创建 tag。candidate、writer、packaging 三段都只接受完整稳定 SemVer。
- CLI bundle 已从修复源码重新生成。Prompt Routing Bypass 以有效草稿与服务端基线比较 dirty，
  同时保护站内导航和 `beforeunload`；改回基线或成功保存才清除。
- release contract 8/8、相关 Dashboard 183/183、receipt 82/82、CLI/Dashboard typecheck 和
  workflow YAML/shell 静态校验均通过。该复审结果保持作废，需在新提交上重新完整复审。

### `276d2b3e` 独立复审回退

- 精确提交复审发现 2 个 Medium：dirty Workbench 把所有 `popstate` 都当作 Back，Forward
  场景会补偿和确认重放错误方向；Workflow action decoder 会接受附加字段并静默归一化。
- Dashboard 自建 history entry 现在登记单调位置。Back/Forward 的目标 delta、逆向补偿和确认
  重放保持同一方向；真实三项 history 回归覆盖 Forward 取消与确认。
- 5 类 action 都只接受 exact `{type}`；`tasks-at-least.n` 同步 kernel 的非负整数口径。
- focused 2 files / 90 tests、Dashboard 全量 73 files / 1422 tests、typecheck、production
  build 与 `git diff --check` 通过。新资产为 `index-UJjh5PoS.js`（SHA-256
  `a927f340…6a9f`）与
  `index-YeY6VsN7.css`。旧复审作废，下一精确提交必须重新独立复审。

### `571997db` 后独立复审回退

- 两个独立 reviewer 对 `origin/main@445aa141..571997db` 的完整范围给出合并结论
  C0/H2/M3/L0：特权 release job 执行候选代码；Skill receipt 可被零行读取或重定向欺骗；
  tag 创建后的崩溃无法恢复；Workbench 子面板可绕过 dirty guard 卸载草稿；Create Change
  在途 POST 可被 Esc/backdrop/Cancel 静默关闭。
- release candidate 现在只读、无 secrets，所有构建/测试/打包均在该 job 内完成；payload
  绑定 artifact id/name/digest/run/head 与逐资产 `SHA256SUMS`。特权 writer/release 不 checkout、
  不 setup Node、不运行 npm lifecycle、不 `secrets: inherit`，自动化不再执行 `npm publish`。
- writer 对 existing tag 递归 peel；仅在精确等于批准 SHA 时恢复。GitHub Release 已存在时
  拒绝 draft/prerelease/未知资产/digest 漂移，只补齐缺失资产；不存在时先建 Release 后逐项上传，
  可覆盖 tag 后或部分上传后的崩溃窗口。
- Skill receipt 仅接受完整 literal `cat [--] <trusted SKILL.md>`，允许安全的 `&&`/换行批量，
  拒绝 head/tail/sed、重定向、pipe、wrapper、替换、glob、选项和分号。定向 receipt + 两个
  Hook 集成文件 113/113 通过。
- Dashboard 新增统一丢弃确认：Loop、Automation、Secrets、Track、机器折叠与整个 Governance
  workspace 都不能静默卸载 dirty draft。Create Change POST 在途时 Cancel disabled，Esc 与
  backdrop 均无效，成功结果仍只触发一次刷新/提示/关闭。
- Dashboard 全量 73 files / 1426 tests、web typecheck、694-file architecture、root build、
  release contract 12/12、YAML 与 shell syntax、docs、repository hygiene、`git diff --check`
  已通过。生成资产为 `index-DVjAM_GF.js`（SHA-256 `254e4323…ad8`）和
  `index-YeY6VsN7.css`；CLI bundle SHA-256 为 `5c091ac1…acd5`。
- 首次 root 全量运行共 327 files / 5803 passed / 14 honest-skip，仅 3 条仍使用 partial `sed`
  模型的旧 fixture 失败；fixture 已改成完整 `cat`。修复后的 fresh root 全量为
  327 files / 5806 passed / 14 honest-skip，且定向 113/113 通过。
- 同一候选上的 hooks 512/512、adapters 272/272、bundle 31/31、migration CAS 13/13、
  npx 安装契约 39/39、docs check/build/smoke、clean Codex install 与五套 golden oracle
  （0 差异）均通过。仍必须在最终 commit 上完成生产浏览器矩阵、独立 C0/H0/M0/L0 与
  canonical GitHub CI。

## 2026-07-30 exact-candidate rollback and remediation

The exact `8224c75d` candidate was rejected by three independent tracks with a
combined C0/H2/M7/L4. No severity was deferred:

- release reproducibility now pins OpenSpec 1.6.0 and validates all specs and
  Changes strictly in both canonical CI and the read-only release candidate;
- canonical checkout/setup actions are immutable full commit pins;
- transcript completion reads host status only, never Skill-authored stdout;
- the complete Dashboard now has honest Machine pending state, compact Operations
  retry and per-tool empty states, keyboard reorder/cross-stage controls,
  complete radio semantics, and focusable named help/count affordances;
- Loop refresh/save rebases untouched fields and preserves post-submit edits by
  field revision; Workbench updates its dirty ref synchronously and keeps a
  permanent `beforeunload` listener.

Current regression results are root 327 files / 5810 passed / 14 honest skips,
Dashboard 73 files / 1445 tests, Dashboard typecheck, architecture 698 files,
release contracts 23/23, OpenSpec 35/35, and receipt tests 105/105. An initial
concurrent run hit one existing 5-second Hook timeout; that Hook file passed 9/9,
then the complete root suite passed under a 15-second integration limit.
Two clean builds are byte-identical at CLI `74bf6154…c366`, Server
`e2327b62…a07`, Dashboard `index-CRNCuoIq.js` (`64fbca9d…299`) and
`index-CLLRnTB_.css` (`1200acad…226`). Hooks 512/512, adapters 272/272,
bundle 31/31, migration CAS 13/13, npx contracts 39/39, bilingual docs,
and all five oracle fixtures are green. The regenerated production browser
matrix and fresh exact-SHA C0/H0/M0/L0 review remain required before this report
may record PASS.

## 2026-07-30 final main integration

- PR #27 and PR #28 are merged into `main`; the unified branch now integrates
  `main@a86dabb481a8d20e0c50ce8c1b421fac45f886f9`.
- Canonical-state compatibility, frozen Workflow-definition status and the
  orchestration graph are reviewed as one fullstack contract with the existing
  Dashboard error, navigation, mutation-identity and accessibility protections.
- Integration REDs covered malformed 2xx snapshot classification, initial versus
  stale snapshot copy, the i18n technical-token allowlist and the 600-line
  Progress route boundary. All are green.
- Current local gates: Dashboard 78 files / 1525 tests; root 330 files / 5875
  tests with 26 honest environment skips; architecture 717 files; OpenSpec 38/38;
  release workflow contracts 24/24; dependency, hygiene, comments, typecheck,
  build and diff checks pass.
- Two consecutive builds are byte-identical at CLI `75faafe2…c0c7`, Server
  `a809869f…d1e4`, Dashboard HTML `0020c20e…e6c4`,
  `index-BIUkQHZD.js` (`25fc4998…5f56`) and
  `index-CTzkdGem.css` (`3651c3a4…f515`).
- The exact-candidate browser matrix and three independent zero-finding reviews
  remain mandatory before Build is frozen.

### `5a17a2af` security review rollback

- The backend/security reviewer found a Medium lstat→open race and unbounded
  read in the aggregate snapshot `tasks.md` path. The exact candidate and its
  21-scene browser evidence are invalidated.
- The replacement reader uses `O_NOFOLLOW | O_NONBLOCK`, a 256 KiB hard limit,
  and before/after Change-directory plus leaf inode/size/realpath validation.
  Suspicious, missing, special, raced and oversized inputs fail closed.
- Deterministic leaf-swap and oversized-input tests prove rejected paths are not
  passed to the fd reader. Focused snapshot tests pass 43/43; architecture and
  full build pass. All exact-SHA reviews and browser gates must be rerun.
- FIFO and in-read growth regressions extend the aggregate reader proof to
  45/45 snapshot tests.
- The PR #27/#28 cross path now proves a future-version sibling can coexist with
  a readable Change whose orchestration graph is requested and rendered.
- Heavy Dashboard routes use real lazy imports with localized Suspense fallback.
  The former 1.06 MB single JS becomes a 290.17 kB initial chunk and route
  chunks no larger than 212.29 kB; the 500 KiB warning is gone. Dashboard passes
  78 files / 1526 tests.

### Post-`11902da4` Dashboard design remediation

- The complete Dashboard review returned C0/H0/M4/L1. Machine card overlap and
  repeated live regions, breakpoint-only Progress scroll guidance, the
  unbounded visual graph expansion, and the 100-row assertive compatibility
  wall were all repaired; no Low was waived.
- New RED→GREEN coverage proves one Machine aggregate announcement and a
  three-column desktop grid, true DOM-overflow detection with a focusable
  labelled scroller, five-item compatibility disclosure, and a 21-node visual
  cap while all 123 test nodes remain in the accessible list.
- Dashboard passes 78 files / 1530 tests. Root tests pass 330 files / 5879
  tests with 26 honest environment skips before the final helper-only
  extraction. The architecture gate then caught WorkflowCanvas at 413 lines;
  moving the overflow observer into the existing positioning hook restored the
  717-file gate, and the affected Progress tests pass 85/85.
- Production `index-CRRTQLIW.js` passed the corrected complete 21-scene matrix
  using a fixed desktop viewport capture after a 2.6-second per-route settle.
  At 1024/1440/1920 CSS pixels across zh/en, light/dark and reduced-motion, each
  scene reports the exact `innerWidth`, desktop navigation and zero document
  overflow, alerts, route-loading/busy residue, console errors and CDP
  exceptions. Machine has zero heading/badge overlap and one live region; the
  seven-stage track reports its real 1624/1046 overflow; the live 142-node /
  149-edge graph renders only 21 canvas nodes at 532px high while preserving
  the full accessible list.
- Evidence is stored under
  `/tmp/tenon-unified-final-dashboard-736da232-v2`. A fresh exact-SHA three-track
  review is still mandatory before Build freeze.

### `d02587e0` Machine review rollback

- The Dashboard-design and release/E2E tracks independently rejected the exact
  candidate because a blocked Docker card still said Docker was available and
  repeated `pipeline-worklfow` risk rows exposed no stable target distinction.
  Neither finding was waived.
- Two RED regressions now prove the contradictions. Docker detail consumes the
  same daemon/image facts as the badge, and every project/Change/Loop risk shows
  a bounded `…/<parent>/<basename>` hint while its button retains the exact root.
- Machine passes 12/12 and Dashboard passes 78 files / 1532 tests. Root tests
  pass 330 files / 5879 tests with 26 honest skips; architecture 717, strict
  OpenSpec 38/38, release 24/24, identity, comments, hygiene, docs, typecheck and
  the full build are green.
- Production `index-CrqBAgSc.js` passed a new 21-scene fixed-viewport matrix
  after a 2.7-second settle per route. Every capture has the exact desktop width,
  requested zh/en, light/dark and motion setting, zero horizontal overflow,
  busy/loading residue, console errors and CDP exceptions. Progress truthfully
  retains the expected trusted-reader precheck alert on this non-Linux runtime;
  no alert was suppressed or reclassified as success.
- Screenshots and `audit.json` are stored in
  `/tmp/tenon-unified-final-dashboard-CrqBAgSc-v3`. A new exact commit and three
  zero-finding reviews remain mandatory.

### `bfa229a7` bounded identity and accessible action remediation

- Exact reviewers returned C0/H0/M1/L1: two-segment hints still leaked Windows
  roots, were unbounded and could collide, while every action exposed the same
  accessible name. The candidate was rejected despite green CI.
- Root presentation now handles `/` and `\`, reads only a bounded prefix/tail
  sample, caps visible segments and titles, and adds a stable short identifier
  only to colliding bounded suffixes. A deterministic occurrence suffix keeps
  the rendered set unique even if short identifiers collide.
- Each action keeps the short visible label but receives a localized accessible
  name with its bounded title and target hint. POSIX collision, long Windows
  root, non-disclosure, length, stable uniqueness, exact routing and accessible
  name regressions pass.
- Machine passes 13/13, Dashboard 78 files / 1533 tests, root 330 files / 5879
  tests with 26 honest skips, typecheck and architecture 717. The new production
  build uses `index-JA5PIwBX.js`.
- The fixed-viewport 21-scene matrix and bounded `audit.json` are in
  `/tmp/tenon-unified-final-dashboard-JA5PIwBX-v5`. Every scene has zero page
  overflow, busy/loading residue, mobile navigation, console or CDP exception;
  every live Machine action has a unique accessible name. The three Progress
  scenes retain the honest non-Linux trusted-reader precheck alert.

### `e80502b7` Unicode-boundary remediation

- Release/E2E found one Low after the other tracks passed: code-unit slicing
  could split an emoji/non-BMP character at the path-window or display boundary.
  The exact candidate was rejected despite green CI.
- The fixed-size tail window now removes a leading orphan low surrogate, then
  only the already-bounded segment is converted to Unicode code points for
  display truncation. An emoji-boundary regression proves no isolated surrogate
  reaches visible or accessible text.
- Machine remains 13/13; typecheck, architecture 717 and full build pass. The
  production entry is `index-Ci4cbgx1.js`.
- A new 21-scene matrix and `audit.json` are stored in
  `/tmp/tenon-unified-final-dashboard-Ci4cbgx1-v6`; overflow, busy/loading,
  mobile navigation, console and CDP exception counts remain zero, and every
  Matrix size reports 21/21 unique Machine action names.

### Final Build freeze: `f6e16437`

- Backend/security, complete Dashboard design/accessibility and release/E2E/API
  independently returned C0/H0/M0/L0 on exact
  `f6e164379e42fe6fca77a1245bf244e453329738`.
- Final evidence is Dashboard 1533/1533, root 5879 passed with 26 honest skips,
  snapshot security 45/45, OpenSpec 38/38, release 24/24, typecheck,
  architecture 717, byte-matching tracked distribution and the v6 21-scene
  browser matrix.
- PR #20 is non-draft and mergeable. Exact CI run `30552730210` and Docs build
  `30552730398` succeeded. Verify, merge/main CI, Ship and Archive are not yet
  claimed.

### 2026-08-03 final actual-trigger remediation

- Exact-SHA Codex and independent review rejected parent `2448ea13` at
  C0/H0/M1/L0 because editor return focus used `document.activeElement` instead
  of the actual Edit/Create control. A non-focusing `fireEvent.click` regression
  failed on the parent and passes after passing `event.currentTarget` through
  the editor-switch boundary.
- The parent GitHub CI also found the StrictMode Create Change test could click
  during the observable disabled interval between route winner and first-step
  readiness. It now waits for the supported enabled precondition before proving
  that the callback survives StrictMode. The complete file passed 25 consecutive
  focused runs.
- Current gates are Dashboard 1548/1548, root 5881 passed with 26 honest skips,
  full build/typecheck, architecture 719, OpenSpec 38/38, release 24/24,
  comments, hygiene, docs, identity, dependencies, workflow freshness and diff.
- Fresh independent review and production browser acceptance return
  C0/H0/M0/L0. Programmatic non-focusing Edit/Create/save/dirty-switch/Stay
  paths all return exact focus. The intercepted browser run made zero real
  writes; project config remains builtin-only at revision `09bfcc6a14b83e21`.
- The rebuilt entry is `index-FQ5CIyhA.js`, SHA-256
  `10770c647c3b2e588d9ce5e3abe832b2a3ae3148ba5ed12ac1501d71d5fe1226`,
  and matches a separate fresh Vite build byte-for-byte. A new commit, frozen
  Build SHA, exact Verify tracks and GitHub CI are still mandatory.
