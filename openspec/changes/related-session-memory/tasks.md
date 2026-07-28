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

## 验证

- [ ] 重新运行定向测试、typecheck:web、test:web、build:web、build 与 npm test。 (verify)
- [ ] 对新冻结基线重新执行四轨审查与真实 Tenon Dashboard 浏览器验收。 (verify)
- [ ] 更新验证报告并完成 verify-pass review gate。 (verify)

## 交付

- [ ] 应用 OpenSpec，提交、推送并创建包含上游映射和真实证据的非草稿 PR。 (ship)
- [ ] 检查远端 PR 与 CI，修复可归因失败并记录外部阻塞。 (ship)

## 归档

- [ ] 归档 Change 并将本轮结果写回 automation memory。 (archive)
