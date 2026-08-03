# Unified Build Review

## Scope

一次性审查本 Change 相对 `origin/main` 的完整前后端、共享契约、测试、生成资产与 OpenSpec 文档。

## Findings and resolutions

1. Projects 的状态数字仍按 workspace 计数；已改为 repository group 口径，并保留 workspace 总数。
2. 状态 focus 会缩小同仓 workspace 集合；已改为先按组命中，再保留组内完整 workspace。文本搜索仍可缩小匹配项。
3. 批量注销后同 root 直接恢复可读时仍被隐藏；已在 `ok=true` 权威快照到达时清除本地 tombstone。
4. 阶段轨键盘导航会越界到 workflow/change/resource；已把阶段节点的 Arrow/Home/End 限定在 canonical phase trunk。
5. 空插件缓存目录会误判为已安装；已要求受控版本目录中存在宿主对应的非 symlink `plugin.json` 标记。
6. Snapshot 会对全部 registry roots 无界并发执行 Git；已增加稳定保序的四路并发上限。
7. 宿主推荐文案重复操作名；已修正中英文模板。
8. Workbench 治理按钮因图标和文字换行达到 50px；已统一一等动作的 inline flex、nowrap 与 40px 高度。

## Re-review

Standards 与 Spec/UX 两轨复审均为 `no findings`。确认没有未解决的 critical、high 或 medium finding。

## Verification evidence

- Web 全量：87 files / 1621 tests；新增 Projects、Graph、Workbench、Host 与 Machine 回归均纳入最终全量结果。
- Repository 全量：331 files / 5922 passed / 26 honest skips；Docker daemon 缺失的容器集成按既有规则诚实跳过。
- TypeScript、production build、architecture、comment honesty、OpenSpec 与 `git diff --check` 通过。
- 1024px、1440px 与 1920px 真实桌面浏览器确认 Projects 分组、Machine core/AFK 分层、Host 自动检测与 Workbench 统一 40px 控件均无 root 横向溢出。
- 编排图的阶段主干为七个等宽节点；键盘从“实现”按 Home/End 分别停在“立项”/“归档”，未越界到 workflow、change 或 resource。
- 稳定服务的新浏览器页控制台为 0 error / 0 warning。
