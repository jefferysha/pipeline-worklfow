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

- [ ] 合入 `main@7c59eecf`，将 PR #15/#16/#17、CI 调度稳定性修复和 Trace session workspace 纳入统一文件→capability 矩阵。 (build)
- [ ] 从最终源代码重建 CLI、Server、Dashboard 生成物，并证明连续构建稳定。 (build)
- [ ] 重跑 Host Plan、document evidence timeline 与 Trace workspace 的 kernel/server/decoder/UI 定向回归及全量门禁。 (build)
- [ ] 对整个 Dashboard 重做设计质量、可访问性、响应式、主题、语言、状态、键盘和焦点 pre-Verify 审查。 (build)
- [ ] 更新统一 REVIEW/pre-Verify 报告并冻结覆盖九个合并 PR 的新 Build SHA。 (build)

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
