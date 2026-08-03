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
9. 首轮 Verify 发现 separate git-dir/submodule 会把 repository identity 误判为 worktree；已改为同时解析 `--git-common-dir`、`--show-toplevel` 与 `--git-dir`，并增加回归测试。
10. Projects 文本搜索只过滤 workspace、却沿用组级旧统计；已对过滤结果重新汇总 repository group，状态与数量不再残留。
11. 宿主插件缓存残留仍可能被误判为已安装；已把 Codex/Claude 活动插件配置与受控、非 symlink 缓存标记交叉验证，并限制配置文件读取大小。
12. Docker 镜像端点失败会让 AFK 可选能力停在未知态；已降级为明确的“可选能力不可用”，不再扩大为全局阻断。
13. 编排搜索仅剩一个节点时 Enter 无动作；已支持唯一结果选择与聚焦，并覆盖键盘测试。
14. 宿主列表超过首屏时缺少滚动提示；已增加固定高度列表和中英文桌面滚动/Tab 提示。
15. OpenSpec 的 `MODIFIED` requirement 未完整保留既有场景导致归档预演失败；已恢复原 requirement/scenario 并在隔离副本验证严格归档通过。
16. 统一复审发现搜索后的 repository group 仍沿用过滤前顺序；已按过滤后的 `need/running/wip` 重新稳定排序，并增加优先级翻转测试。
17. 外置 Git directory 无法总能从单个 linked worktree 反推出 primary top-level；现由 Snapshot 在同仓已登记 root 中优先选择 primary 的真实目录名并统一投影，`repository.git` 则直接稳定派生，避免登记顺序造成项目名漂移或显示 metadata 名。
18. Codex 活动插件检测只接受一种 TOML 序列化；已覆盖插件子表、`[plugins]` dotted key、根 dotted key 及空格/注释等价写法。
19. 宿主配置的 `lstat`→路径读取存在 TOCTOU、增长越界与 FIFO 阻塞窗口；已改为 `O_NOFOLLOW | O_NONBLOCK` 打开同一描述符、`fstat`、固定 `MAX+1` 缓冲，并在读取前后复验父目录链与文件 inode/size。
20. 外置 `.git` 的 primary 与 linked worktree 曾分别生成 top-level 与 metadata 标签；已在聚合层按 repository id 选择 primary 标签并统一投影，用反序 registry、真实 separate-git-dir 与任意 `repository.git` 回归锁定。

## Re-review

首轮 Verify 的六项实现 finding、一项归档兼容 finding，以及统一复审的四项 medium finding 已全部修复；最终 Standards、Spec/UX 与浏览器三轨将针对同一冻结 SHA 统一复审。当前没有遗留 critical、high 或 medium finding。

## Verification evidence

- Web 全量：87 files / 1626 tests；新增 Projects 搜索重汇总/重排序、Graph Enter、Host 滚动提示与 Machine 可选能力错误回归均纳入最终全量结果。
- Repository 全量：331 files / 5930 passed / 26 honest skips；Docker daemon 缺失的容器集成按既有规则诚实跳过。
- TypeScript、production build、architecture、comment honesty、OpenSpec 与 `git diff --check` 通过。
- OpenSpec 严格归档预演在隔离副本通过：8 个 requirement 新增、约 3 个 requirement 修改，36 个严格规格检查全部通过。
- 1024px、1440px 与 1920px 真实桌面浏览器确认 Projects 分组、Machine core/AFK 分层、Host 自动检测与 Workbench 统一 40px 控件均无 root 横向溢出。
- 编排图的阶段主干为七个等宽节点；键盘从“实现”按 Home/End 分别停在“立项”/“归档”，未越界到 workflow、change 或 resource。
- 稳定服务的新浏览器页控制台为 0 error / 0 warning。
