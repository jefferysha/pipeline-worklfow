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
21. 已手动折叠的 repository group 会遮住后续搜索命中的 workspace；查询或 focus 过滤现在强制展开匹配组。
22. 未显式选择项目时 Machine 可能在项目级事实未知时宣告无阻断；现只呈现全局信号，不借用注册表首项，并明确标记项目级 AFK 与未知核心事实。
23. Git identity 与 registry 成员变化未完整进入 SSE fingerprint；现纳入每个已登记 root identity 和 `.git` topology metadata，空/非 Git/失效项目增删、初始化或 worktree metadata 变化都会触发实时快照。
24. 已登记空 root 被删除时 fingerprint 不变；现纳入 root 的稳定类型与 inode 身份，并在 root 为 symlink/非目录时停止向下探测，既感知删除/替换又不穿透边界。
25. POSIX 合法的反斜杠仓库名被前端 decoder 误拒；现只拒绝真正的路径分隔符 `/`，保留合法 repository label。
26. 批量注销的失败计数会在 root 恢复、消失或被筛选后残留；现随权威不可达 roots 收敛，并只统计当前可见的不可达项。
27. root 与 `.git` 目录 mtime 会让普通顶层文件或 `git add` 触发无关快照；现目录只记录稳定身份，`.git` 指针文件和 `worktrees` topology 仍保留真实变更信号。
28. Snapshot 的 root 可达性检查仍使用会跟随 symlink 的 `stat`，与 fingerprint 的停止边界不一致；现统一改为 `lstat`，registered root 被替换为 symlink 时按不可达处理且不读取外部 Change。
29. 单次 `lstat` 仍会在 Git identity 与 Change 扫描间留下 registered root 换位窗口；Snapshot 与 SSE 现复用 server 长期持有的 inode/fd anchor，Linux 使用 fd-relative 根，Darwin fallback 使用捕获时 canonical realpath，并在异步边界前后复核词法路径、inode 与 realpath。祖先 symlink 在启动后及 Git probe 期间换位均有强制无 `fdPath` 的回归测试。
30. Anchor/Git 探测增加耗时后，20ms SSE poll 可能重叠并由较早请求回写旧 fingerprint；现用单飞锁串行化 poll，状态转换后稳定推送新的 Snapshot。
31. `readdir(changesRoot)` 后的 root 稳定性断言曾落在“合法空项目”catch 内，换位错误会被误报为 `ok=true`；现仅将 `ENOENT` 解释为尚无 Changes 的合法空项目，其他 I/O 错误失败关闭，且在降级前复核 anchor、读取成功后于 catch 外复核。换位与 `EACCES` 回归都不会发布健康空项目。
32. 首轮冻结 Verify 发现 SSE fingerprint 会把 `readdir(openspec/changes)` 的非 `ENOENT` 错误也折叠为空目录，导致合法空目录与 `EACCES`/`EIO`/`EMFILE` 状态之间可能不刷新已连接页面；现与 Snapshot 统一为仅 `ENOENT` 表示合法空目录，其他读取错误生成稳定的 `unreadable:<root>` 指纹，并把同一个目录读取依赖贯穿初始 stream 与轮询路径。新增空目录 → `EACCES` → 恢复及 `ENOENT` 等价性的回归测试。
33. 第二轮冻结 Verify 发现未选择项目时已成功返回的全局 Docker 探测仍被项目级 readiness 的空值覆盖成“未知”；现 Docker 卡片只消费全局 `/api/docker/images` 权威事实，项目级镜像配置仍保持独立未知。新增无项目选择且 daemon 不可用的红绿回归，状态明确为 AFK `optional-unavailable`，不会进入核心 blocker。

## Re-review

两轮 Verify 的实现、归档兼容与后续统一复审 finding 已全部修复。第二轮 Codex CLI 找到的无项目 Docker 状态问题已按 TDD 修复；最终 Reviewer、Codex、浏览器与规格轨仍针对下一次冻结 SHA 独立复验。

## Verification evidence

- Web 全量：87 files / 1632 tests；新增 Projects 搜索重汇总/重排序、Graph Enter、Host 滚动提示，以及 Machine 在无项目选择时消费全局 Docker 探测的回归均纳入最终全量结果。
- Repository 全量：332 files / 5948 passed / 26 honest skips；Docker daemon 缺失的容器集成按既有规则诚实跳过。
- 统一 Reviewer 定向：Server 4 files / 161 tests、Web 9 files / 256 tests，均通过。
- TypeScript、production build、architecture、comment honesty、OpenSpec 与 `git diff --check` 通过。
- OpenSpec 严格归档预演在隔离副本通过：8 个 requirement 新增、约 3 个 requirement 修改，归档后的 32 个 specs 严格检查全部通过。
- 1024px、1440px 与 1920px 真实桌面浏览器确认 Projects 分组、Machine core/AFK 分层、Host 自动检测与 Workbench 统一 40px 控件均无 root 横向溢出。
- 编排图的阶段主干为七个等宽节点；键盘从“实现”按 Home/End 分别停在“立项”/“归档”，未越界到 workflow、change 或 resource。
- 稳定服务的新浏览器页控制台为 0 error / 0 warning。
