# 任务

## 立项

- [x] 冻结最终批次 `origin/main` SHA 和已合并 PR 清单。
- [x] 建立独立 worktree、分支和 `post-merge-unified-review-20260729` full Change。
- [x] 明确统一审查覆盖前端、Dashboard、后端、共享契约、安全、文档和发布就绪。

## 调研

- [x] 将所有已合并 PR、capability、源码路径、生成物、测试和用户状态映射为 coverage matrix。 (explore)
- [x] 检查最终主干 CI、重复复现已知 Dashboard 时序波动并定位根因。 (explore)
- [x] 审查前后端调用链、共享解码契约、错误/取消/缓存边界、架构规则和安全边界。 (explore)
- [x] 审计依赖、生成物、OpenSpec、README/测试现实和 release freshness 现状。 (explore)
- [x] 建立 Dashboard 浏览器基线，覆盖响应式、主题、语言、状态、键盘、焦点和 reduced-motion。 (explore)

## 规格

- [x] 为 `dashboard-ui-ux-system` 编写语言完整性与逻辑等价升档快照 delta。 (spec)
- [x] 为 `repository-architecture-compliance` 编写依赖安全门与 override 证明 delta。 (spec)
- [x] 固化最小修复架构、兼容边界、回滚路径和 tracer-bullet 实施计划。 (spec)
- [x] 建立规则/安全/设计质量/测试/API/浏览器/文档/发布的完整验证矩阵。 (spec)
- [x] 将 Workbench 401/network/non-JSON locale、主规格 Purpose 和 state-only Change 完整归档门纳入 delta 与计划。 (spec)

## 实现

- [x] 先建立逻辑等价 row refresh RED，再修复 Governance 升档确认状态机与焦点恢复。 (build)
- [x] 补齐 Workbench zh/en 产品文案和可访问名称，并新增混合语言回归门。 (build)
- [x] 原子升级 AJV/Vitest/Vite 与 VitePress Vite override，得到干净 audit 0 和有效依赖树。 (build)
- [x] 运行全栈组合定向测试并复核 CLI、Server、Dashboard、共享契约与必要生成物。 (build)
- [x] 更新 README、测试现实、依赖安全/发布文档和持久浏览器证据。 (build)
- [x] 完成 Spec、规则/架构/安全与 Dashboard 设计质量的独立 pre-Verify 复核。 (build)

## Verify 回退修复

- [x] 本地化 review gate、Hook fallback/tooltip、Policy 模板、Projects default phase 与 Automation 空态/动作。 (build)
- [x] 修复 workflow menu 的完整键盘交互、暗色旁路按钮对比度与 config error 显式重试。 (build)
- [x] 将 audit 与 `npm ls --all` 合并为 CI/release canonical dependency gate。 (build)
- [x] 增加精确候选 main SHA 的 pre-tag release-candidate 门并更新发布文档。 (build)
- [x] 为七个既有 OpenSpec capability 补齐不改变 requirement 语义的 Purpose，使全仓 strict validation 为 GREEN。 (build)
- [x] 为所有回退 finding 建立 RED→GREEN 回归并重新运行全量 Build 门禁。 (build)
- [x] 更新统一 REVIEW、pre-Verify 报告并冻结新的完整 Build SHA。 (build)

## 第二次 Verify 回退修复

- [x] 将 release candidate 拆为只读验证与最小写权限 tag job，并 fail-closed 证明精确 SHA canonical CI。 (build)
- [x] 将 approved SHA 传入 reusable packaging，验证 peeled tag commit 且 checkout 不持久化写凭据。 (build)
- [x] 将 AFK 两个 dialog 迁移到共享键盘/focus primitive，并修复 390px Automation 三动作裁切。 (build)
- [x] 本地化 TrackSelector candidate/inherited tooltip，补齐全部回退 finding 的 RED→GREEN 与全量门禁。 (build)

## 最终 main 范围扩展

- [x] 合入 `main@445aa141`，将 PR #15/#16/#17/#18/#19、CI 调度稳定性修复、Trace session workspace、治理归档与 Progress triage 纳入统一文件→capability 矩阵。 (build)
- [x] 从最终源代码重建 CLI、Server、Dashboard 生成物，并证明连续构建稳定。 (build)
- [x] 重跑 Host Plan、document evidence timeline 与 Trace workspace 的 kernel/server/decoder/UI 定向回归及全量门禁。 (build)
- [x] 对整个 Dashboard 重做设计质量、可访问性、响应式、主题、语言、状态、键盘和焦点 pre-Verify 审查。 (build)
- [x] 更新统一 REVIEW/pre-Verify 报告并冻结覆盖十一个合并 PR 的新 Build SHA。 (build)
- [x] 修复 Workbench 401、network 与 non-JSON HTTP fallback 的 locale 泄漏并补英文错误回归。 (build)
- [x] 修复 Loop 语言切换隐式 refetch 与 dirty draft 覆盖，并补 GET 次数、草稿和错误本地化回归。 (build)
- [x] 将 Machine/Project Registration/Create Change/AFK/Progress 的 raw `.message` 收敛到统一 locale error policy，并加静态门禁。 (build)
- [x] 将 Operations/AFK 与 Workbench 危险确认和 mutation 绑定 exact root+entity+operation token，覆盖 A 慢/B 快与同名实体切换回归。 (build)
- [x] 将 Progress Create Change 草稿/提交绑定 exact root+name+track+workflow+intent token，root 切换关闭清空，并覆盖 A 草稿切 B 不提交回归。 (build)
- [x] 分离 AFK settings 与 enqueue/retry 的 generation/busy/error identity，并覆盖交错请求不会永久 busy 或静默保留失败乐观值。 (build)
- [x] 修复 default Workflow 创建/复制阶段标签、旧 locale 异步结果和编辑器错误重译，保留用户自定义 label 与草稿。 (build)
- [x] 将 malformed success JSON/schema、HTTP failure、network failure 与 no-project 本地状态准确分类并覆盖 UI 回归。 (build)
- [x] 补齐 `document-evidence-timeline` Purpose，并通过目标 strict validation。 (build)
- [x] 通过 OpenSpec 官方 archive 完整迁移 5 个 state-only 历史目录，使全仓 strict validation 真实全绿。 (build)

## 第四次 Verify 回退修复

- [x] 空 custom Workflow 不得进入可创建状态，并以 RED→GREEN 覆盖零 step 不发送请求。 (build)
- [x] 同步 Dashboard Workflow runtime decoder 与 kernel canonical guard/action 闭集，并覆盖 default Workflow round-trip。 (build)
- [x] 将 Workbench save/create/delete 拆分为 exact root+workflow+operation identity，覆盖切换与交错 finally。 (build)
- [x] 对 mandatory 和 Workflow delete error envelope 做完整 runtime decode，畸形响应进入 invalid-response 而不崩溃。 (build)
- [x] 修复 mandatory 与 clipboard 回调的在途 locale 竞态，所有迟到结果按当前语言呈现或失效。 (build)
- [x] 本地化 Track Settings/Nav accessible name 与中文资源中的英文产品标签，并增加技术 token allowlist 语义门。 (build)
- [x] 修复 390px 英文底部导航标签省略，在无横向溢出的前提下完整呈现。 (build)
- [x] 重建 Dashboard tracked assets 并重跑定向、全量、架构、依赖、文档、OpenSpec 与 release 门禁。 (build)
- [x] 移除空 Workflow sentinel 冲突，本地化 Step Policy ARIA，并以 runtime 闭集解码 Workflow delete 错误信封。 (build)
- [x] 将 mandatory 保存身份隔离到 exact root+cell+token，覆盖不同 cell 并发 busy/error/finally。 (build)
- [x] 严格要求 Workflow delete HTTP 200 返回精确 `{ok:true}`；畸形成功体保留当前定义并显示 invalid-response。 (build)
- [x] 抽离 Workbench 定义编辑纯函数，保持 page/route 600 行架构硬门并重跑回归。 (build)
- [x] 对完整返工 diff 重做 Standards+Spec pre-Verify 审查并冻结新 SHA。 (build)

## 第五次 Verify 回退修复

- [x] 将 Operations 危险确认绑定 exact root+operation+全部决策输入，任一输入变化立即失效旧确认。 (build)
- [x] 将 Loop 升档确认绑定完整权威决策事实，逻辑等价刷新保持、事实变化关闭且旧确认不可提交。 (build)
- [x] 严格解码 Workbench save/create 的 2xx success schema，畸形成功体保留编辑状态并显示当前语言错误。 (build)
- [x] 为 Track Settings 与 Default Skill Chain 的同 root 跨实体 mutation 增加完整 operation identity 守卫。 (build)
- [x] 严格解码 AFK settings/enqueue/retry/dismiss success envelope，畸形 2xx 不得提交状态或成功反馈。 (build)
- [x] 同步权威前端规则到 Vite 6，重建 tracked assets并完成全量 Standards+Spec pre-Verify 收敛。 (build)

## 第六次 pre-Verify 回退修复

- [x] 将 Default Skill 保存升级为 per-cell revision/token 身份并严格校验服务端回显实体，保证跨 cell 并发成功均可对账。 (build)
- [x] 将 Track save/delete 严格解码权威 registry DTO，并在编辑器切换后安全 reconcile 已提交的迟到成功。 (build)
- [x] 将 Operations 在途结果绑定完整决策事实与唯一 token，提交后消费危险确认；收紧 AFK normalized settings 值域。 (build)
- [x] 为 Workbench 全部真实草稿建立统一站内导航与 browser unload 守卫，取消离开时保留状态和焦点。 (build)
- [x] 修复 Machine 双列卡片等高空洞、AFK 重复 CTA、泛化 transition 与输入 autocomplete/name 等全部设计 Low。 (build)
- [x] 抽离临界大组件中的身份/解码/状态 helper，恢复架构行数余量并完成全量 RED→GREEN。 (build)
- [x] 更新 REVIEW、pre-Verify 报告、生成资产与真实浏览器证据，经独立 C0/H0/M0/L0 复审后冻结新 SHA。 (build)

## 最新 main 范围扩展（PR #21 / #23）

- [x] 将 `origin/main@ef728bf6` 合入统一分支并从合并后源码重建 Dashboard 生成物。 (spec)
- [x] 复核 #21 的 Codex Skill receipt ABI、current-turn、session/turn、worktree 与 fail-closed 安全边界。 (build)
- [x] 复核 #23 的 canonical review handshake、snapshot/SSE、严格 decoder 与 Progress 状态卡。 (build)
- [ ] 完成 #21 Ship pending Change 的官方治理收尾，确保 active Change tree 无合后悬空状态。 (ship)
- [x] 重跑全栈、Hook、Dashboard 全量及整个 Dashboard 的 production 浏览器矩阵。 (verify)
- [x] 更新统一 REVIEW、pre-Verify 报告和精确 SHA，经 C0/H0/M0/L0 独立复审后冻结。 (build)

## 最终独立复审回退修复

- [x] 将畸形 Review Handshake SSE 帧路由到 stream error，保留最后已知快照但取消实时连接状态。 (build)
- [x] dirty Workbench 取消浏览器 Back 时用 Forward 补偿恢复当前历史项，确认后重放原 Back。 (build)
- [x] 新建 Track 必填身份为空或非法时禁用保存，并以浏览器交互与 RED→GREEN 覆盖。 (build)
- [x] dirty Workbench 的历史目标即使仍为 Workbench，只要 project root 变化也必须先确认。 (build)
- [x] Workflow guard decoder 按变体 exact-key 闭集拒绝附加字段和畸形嵌套对象。 (build)
- [x] fallback transcript discovery 仅跳过严格更旧的零字节残留；最新、同时间或仅空文件时保持 fail-closed。 (build)
- [x] 从修复源码重新生成 tracked CLI bundle，保证 release freshness 与运行时实现一致。 (build)
- [x] 将 Prompt Routing Bypass 草稿汇入 Workbench 统一 dirty/navigation/beforeunload 守卫。 (build)
- [x] 将 release candidate 限制为只读 approval producer，并由 default-branch `workflow_run` writer 重验身份后创建 tag。 (build)
- [x] 为 Dashboard 历史项登记单调位置，dirty Workbench 对 Back/Forward 均按原方向补偿和确认重放。 (build)
- [x] Workflow action decoder 按 exact-key 闭集拒绝附加字段，并同步 `tasks-at-least` 非负整数契约。 (build)
- [x] 将 Codex Skill transcript 证据收紧为完整 literal `cat`，拒绝 partial reader、重定向、管道、wrapper、替换与 glob，并同步真实 Hook 集成 fixture。 (build)
- [x] 将所有候选代码执行和 release payload 打包隔离到无 secrets 的只读 candidate；特权 writer/release 不 checkout、不运行 npm lifecycle、不继承 secrets。 (build)
- [x] 以 artifact provenance、GitHub digest、逐资产 SHA-256 清单绑定 release payload，并移除自动化 npm publish。 (build)
- [x] 让正确 existing tag、部分 GitHub Release 与已上传资产可验证地幂等恢复；冲突 tag、未知资产或 digest 漂移保持 fail-closed。 (build)
- [x] 为 Track、Loop、Automation、Secrets 与整个 Governance 面板的内部卸载入口增加统一丢弃确认，保留草稿与焦点直到明确确认。 (build)
- [x] 创建 Change 请求进行中禁用并拦截 Cancel、Escape 与 backdrop，避免服务器已创建但客户端静默取消。 (build)
- [x] 在最终实现与生成物上重跑全量门禁、生产浏览器矩阵和独立 C0/H0/M0/L0 复审。 (build)

## 验证

## 最终 main 范围扩展（PR #27 / #28）

- [x] 将 `origin/main@a86dabb4` 合入统一分支，覆盖 canonical state version、冻结 Workflow 定义状态与编排图前后端闭环。 (build)
- [x] 逐项合并 Dashboard 版本兼容、编排图、错误本地化、dirty navigation 与只读状态语义，不以单侧冲突取舍丢失能力。 (build)
- [x] 从合并后源码重建 CLI、Server 与 Dashboard tracked distribution，并消除全部冲突 marker。 (build)
- [x] 修复集成后 Progress route 超限，恢复前端 600 行架构硬门。 (build)
- [x] 重跑 Dashboard 78 files / 1525 tests、root 330 files / 5875 tests（26 honest skips）、OpenSpec 38/38、release 24/24 与仓库门禁。 (build)
- [x] 修复聚合 snapshot 的 `tasks.md` lstat→open 竞态和无界读取，以 O_NOFOLLOW、目录/leaf inode 复核与 256 KiB 硬上限 fail closed。 (build)
- [x] 补齐 future-version sibling 与可读 Change 编排图的交叉集成回归。 (build)
- [x] 将 Dashboard 重型 route 改为真实 lazy chunks，并拆分 vendor，消除 1.06 MB 单一 JS 与 Vite 500 KiB 告警。 (build)
- [x] 在修复源码与最新 production assets 上完成 21 场景全 Dashboard 浏览器矩阵。 (build)
- [x] 修复 Machine Docker badge/detail 事实冲突，并为同 basename 风险行显示有界稳定的父目录提示。 (build)
- [x] 在 `index-CrqBAgSc.js` 上重跑 21 场景固定桌面视口矩阵并保存可审计 JSON。 (build)
- [x] 将风险路径提示收紧为跨平台、有界且碰撞可区分的身份，并为每个打开动作提供唯一可访问名称。 (build)
- [x] 在 `index-JA5PIwBX.js` 上重跑完整 21 场景矩阵，验证 21/21 Machine 动作可访问名称唯一。 (build)
- [x] 修复非 BMP 字符位于路径窗口或显示截断边界时产生孤立 surrogate 的 Unicode Low。 (build)
- [x] 在 `index-Ci4cbgx1.js` 上重跑 21 场景矩阵并保存最终 bounded audit。 (build)
- [x] 在新精确提交上完成三轨 C0/H0/M0/L0 独立复审。 (build)

## 2026-08-03 Verify 回退修复

- [x] 将 proposal/design 的最终审查基线统一更新为 `origin/main@a86dabb481a8d20e0c50ce8c1b421fac45f886f9`，并把 PR #27/#28 纳入 capability 覆盖矩阵与验收边界。 (spec)
- [x] 为 Track Settings dirty 上报建立稳定 callback 身份，增加从 Workbench 实际编辑草稿时不发生无限 effect/render 循环的 RED→GREEN 回归。 (build)
- [x] 保存 Track 期间禁用全部会改变已提交草稿或 route preview identity 的输入，保证成功响应不会静默丢弃请求发出后的编辑。 (build)
- [x] 覆盖保存 busy 状态的字段、路由预览、删除与列表切换键盘/鼠标路径，并保持既有错误、取消与焦点语义。 (build)
- [x] 为 snapshot tasks reader 增加同 inode、同长度原地覆写 RED，并以 fd/path 的 size/mtime/ctime 读前读后 fence fail closed。 (build)
- [x] 在修订文档与实现上重新执行完整 pre-Verify Standards + Spec 收敛审查、全量测试和真实浏览器验收，所有 C/H/M 清零后冻结新 SHA。 (build)
- [x] 将 mandatory partial write 与当前 full config reload 按 generation 合流，保留最新 revision/tracks 并覆盖交错回归。 (build)
- [x] 在同 id Loop 的权威预算变化时取消旧 slider debounce，禁止迟到 POST 覆盖新快照。 (build)
- [x] dirty Workbench 遇到 snapshot root 缺失或变为不可写时保留草稿宿主并阻断写入，只有明确丢弃才卸载。 (build)
- [x] 为未标记 session-history entry 保留真实 Back/Forward 方向，覆盖 Forward 取消补偿与确认重放。 (build)
- [x] 将失权边界延伸到 `document.body` portal，并以流式有界扫描收紧 Codex transcript discovery；完成全量回归与 C0/H0/M0/L0 独立复审。 (build)

## 2026-08-03 第八次 Verify 回退修复

- [x] 保留已阻断的 browser pop 请求，使随后发生的 root 失权不会覆盖原 Back/Forward 目标。 (build)
- [x] 在 portal Dialog 恢复交互权威后恢复内部焦点，并确保外层 modal 活跃时不抢焦点、关闭后正确交还。 (build)
- [x] 在完整待冻结 diff 上重跑全量测试、生成物、静态门和 Standards + Spec pre-Verify 审查并冻结新 SHA。 (build)

## 2026-08-03 第九次 Verify 回退修复

- [x] 为“普通页面导航已阻断 + 随后 root 失权”建立确定性 RED，证明旧实现会把 Overview 覆盖为 Projects。 (build)
- [x] 将 pending navigation 固化为 first-request-wins 事务：在 Navigation API 发起点取消后续 traversal，不可取消时按序列身份等待真实 popstate/inverse restore，并在精确 AbortSignal 中止时只清除对应 barrier；无 API 时同步原生确认；覆盖 Back/Forward 交错、abort 竞态与继续编辑后的新事务。 (build)
- [x] 在完整待冻结 diff 上重跑全量测试、生成物、静态门、production 浏览器与 Standards + Spec pre-Verify 审查后冻结新 SHA。 (build)

- [x] 在干净环境运行安装、构建、类型检查、全量前后端测试、生成物和仓库门禁。 (verify)
- [x] 运行 OpenSpec 隔离 apply/validate、API 正负路径和安全验证。 (verify)
- [x] 使用 `tenon:design-taste-frontend` 与 `tenon:browser-qa` 完成真实 Dashboard 全状态矩阵。 (verify)
- [ ] 冻结精确 head，取得完整 GitHub CI 与 C0/H0/M0 的四轨验证结论。 (verify)

## 交付

- [ ] 应用确认的 capability delta，创建并合并统一审查修复 PR。 (ship)
- [ ] 确认精确合并 SHA 的主干 CI 通过，再启动独立 release Change。 (ship)

## 归档

- [ ] 在合并可达性、主干 CI、spec apply 和文档证据全部通过后归档 Change。 (archive)
- [ ] 仅清理已确认无进程、无未推送提交且可安全删除的批次 worktree。 (archive)
