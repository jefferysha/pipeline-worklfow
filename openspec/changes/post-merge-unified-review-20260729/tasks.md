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
- [x] 重建 Dashboard tracked assets并重跑定向、全量、架构、依赖、文档、OpenSpec 与 release 门禁。 (build)
- [x] 移除空 Workflow sentinel 冲突，本地化 Step Policy ARIA，并以 runtime 闭集解码 Workflow delete 错误信封。 (build)
- [x] 将 mandatory 保存身份隔离到 exact root+cell+token，覆盖不同 cell 并发 busy/error/finally。 (build)
- [x] 严格要求 Workflow delete HTTP 200 返回精确 `{ok:true}`；畸形成功体保留当前定义并显示 invalid-response。 (build)
- [x] 抽离 Workbench 定义编辑纯函数，保持 page/route 600 行架构硬门并重跑回归。 (build)
- [x] 对完整返工 diff 重做 Standards+Spec pre-Verify 审查并冻结新 SHA。 (build)

## 验证

- [ ] 在干净环境运行安装、构建、类型检查、全量前后端测试、生成物和仓库门禁。 (verify)
- [ ] 运行 OpenSpec 隔离 apply/validate、API 正负路径和安全验证。 (verify)
- [ ] 使用 `tenon:design-taste-frontend` 与 `tenon:browser-qa` 完成真实 Dashboard 全状态矩阵。 (verify)
- [ ] 冻结精确 head，取得完整 GitHub CI 与 C0/H0/M0 的四轨验证结论。 (verify)

## 交付

- [ ] 应用确认的 capability delta，创建并合并统一审查修复 PR。 (ship)
- [ ] 确认精确合并 SHA 的主干 CI 通过，再启动独立 release Change。 (ship)

## 归档

- [ ] 在合并可达性、主干 CI、spec apply 和文档证据全部通过后归档 Change。 (archive)
- [ ] 仅清理已确认无进程、无未推送提交且可安全删除的批次 worktree。 (archive)
