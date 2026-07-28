# 任务

## 立项

- [x] 建立独立 Change/worktree，记录非重复范围和初始安全边界。

## 调研

- [x] 固定 上游 A/上游 B 默认分支与 release/tag 证据并形成差异映射。 (explore)
- [x] 审计现有 kernel mem、server session-link 与 Dashboard 任务详情调用链。 (explore)
- [x] 完成设计 RFC 与 ADR，明确隐私、预算和错误语义。 (explore)

## 规格

- [x] 编写 `related-session-memory` delta spec 与实现计划。 (spec)
- [x] 明确 API、解码、i18n、加载/空/错态和浏览器验收场景。 (spec)

## 实现

- [x] 以 TDD tracer bullet 打通 bounded read、kernel、POST、decoder 与 TaskDetail 成功态。 (build)
- [x] 完成读取预算、user-only 隐私 DTO、宿主闭集、single-flight 与 typed errors。 (build)
- [x] 完成 Dashboard 空/错/partial/重试/旧响应丢弃状态和中英文文案。 (build)
- [x] 回归 session-link、CLI mem search 与生成物，完成集成门禁。 (build)
- [x] 修复 Claude 缺失 cwd 时的项目隔离 fail-open，并用回归测试覆盖目录名碰撞。 (build)
- [x] 将 related search 的文件候选读取限制落实到 adapter 读取前，并显式报告截断。 (build)
- [x] 将 OpenCode reader/schema 失败映射为 partial warning，而非完整空结果。 (build)
- [x] 统一 Unicode code-point 查询长度、IME Enter 与主按钮对比度。 (build)
- [x] 更正 POST 调研措辞，并让 bounded read 检测并发 append。 (build)
- [x] 将最近 100 个候选改为项目内跨宿主全局按时间选择，并阻止异项目来源抢占候选。 (build)
- [x] 保留宿主压缩摘要 provenance，确保只有原始 user turn 能形成 Dashboard 命中。 (build)
- [x] 以 `platform:id` 隔离父子索引，并只允许 OpenCode 会话合并 OpenCode 后代。 (build)
- [x] 用真实同步 kernel/HTTP 事件循环回归兑现 single-flight `429` 契约。 (build)
- [x] 区分读取限制、来源不可用和未知 partial，补齐可访问长度错误与稳定表单元数据。 (build)
- [x] 移除主按钮 hover 透明混色，并以真实浏览器 computed style 验收四种主题/交互对比度。 (build)
- [x] 将 host-summary 隐私重分类限制在 Related Sessions 路径，保持旧 CLI 计数、excerpt 与排序。 (build)
- [x] 将重复 token 的命中计数与 excerpt 选择改为有界近线性算法，并补长重复文本性能回归。 (build)
- [x] 为 OpenCode descendant 图加入 platform-scoped cycle/self-cycle guard。 (build)
- [x] 按物理来源累计 metadata 与正文的单文件 2 MiB 预算，并诚实报告 metadata 截断。 (build)
- [x] 让同一 OpenCode SQLite 文件跨多个 session 共享单文件预算。 (build)
- [x] 区分不存在与不可读的会话目录，并将已选来源读取失败返回为 partial warning。 (build)
- [x] 修复宽屏 validation 时按钮下移的视觉 Low，并保持窄屏/键盘路径。 (build)
- [x] 保留后置全 token coverage excerpt 的排序资格，同时维持候选内存有界与近线性扫描。 (build)
- [x] 为 OpenCode child 环选择确定性可搜索根，避免环节点全部被吸收为空。 (build)
- [x] 在 metadata 截断且项目身份仍未知时返回 partial，而非静默排除合法会话。 (build)
- [x] 以 raw byte 累计跨 range 拼接，避免 UTF-8 code point 在 8 KiB 边界损坏。 (build)
- [x] 将 OpenCode session metadata 投影纳入同一数据库的 per-source/aggregate 硬预算。 (build)
- [x] 标记 Codex `replacement_history` 的 synthetic summary，保留真实 user 历史与旧 CLI 语义。 (build)
- [x] 以生产级有界目录读取、entry/depth/time/top-K 预算约束 Claude/Codex/Pi 候选发现。 (build)
- [x] 对 OpenCode dialogue SQL 的关系 id 与 data 共同截断、计费并在 SQL 内施加行上限。 (build)
- [x] 保留 `buildChildIndex` 裸 OpenCode parent lookup 兼容别名，内部继续使用 `platform:id`。 (build)
- [x] 在 Dashboard 同步重挂 root/name scope，并在本地校验最多 8 个 token 的中英文错误。 (build)
- [x] 区分 Codex local plaintext summary 与 remote opaque compaction，保留 remote 最后一条真实 user。 (build)
- [x] 在 bounded directory 不可读、discovery top-K/截止触发时诚实返回 partial warning。 (build)
- [x] 在 OpenCode 剩余预算不足关系 id 预留时标记截断，并重建最终 server/CLI bundle。 (build)
- [x] 将 discovery file cap 提升为请求级共享预算，修复 exact-boundary 误报与裸 alias 键覆盖。 (build)
- [x] 为 all-host 预留公平 discovery 配额，并在 SQLite/目录读取边界前执行硬预算检查。 (build)
- [x] 排除 Claude 嵌套 subagent 日志，并按原始 SQL byte cap 识别多字节 SQLite 截断。 (build)
- [x] 惰性执行 Claude fallback，并在缺少有界 SQLite query plan 时 fail closed。 (build)
- [x] 复用稳定 OpenCode source warning，使 query-plan 失败进入正确 Dashboard partial 状态。 (build)

## 验证

- [ ] 重新运行定向测试、typecheck:web、test:web、build:web、build 与 npm test。 (verify)
- [ ] 对新冻结基线重新执行四轨审查与真实 Tenon Dashboard 浏览器验收。 (verify)
- [ ] 更新验证报告并完成 verify-pass review gate。 (verify)

## 交付

- [ ] 应用 OpenSpec，提交、推送并创建包含上游映射和真实证据的非草稿 PR。 (ship)
- [ ] 检查远端 PR 与 CI，修复可归因失败并记录外部阻塞。 (ship)

## 归档

- [ ] 归档 Change 并将本轮结果写回 automation memory。 (archive)
