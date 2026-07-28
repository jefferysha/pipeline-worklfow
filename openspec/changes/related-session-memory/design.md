# 设计

## Explore 结论

- Trellis 的 project journal 与只读 raw-session mem 是不同共享边界；本功能属于后者，不写回仓库。
- Comet release 后的 `--platform` 支持显式宿主隔离，但其 `run_id/sessionHash` 不是会话索引。
- 现有 `searchMemSessions` 只有结果条数上限，没有 HTTP 所需的候选/单文件/总读取预算。
- 采用独立 bounded kernel use case、受保护 POST 和 TaskDetail 自包含区块。
- V1 只返回 user excerpt，不返回 source path/cwd，不生成新的 resume 命令。
- 详细契约见 `docs/superpowers/specs/2026-07-28-related-session-memory-design.md`。

## 风险

- 会话摘要可能包含敏感文本；通过 token POST、user-only excerpt 与不返回路径收窄。
- 大型会话集合的同步扫描可能影响 Dashboard；在读取层限制候选、单文件与总字节，并限制并发。
- Dashboard 大改 PR 正在并行，集成点必须最小化并在 PR 中声明重叠风险。

## 待验证问题

- 预算值需以真实 fixture 和定向性能测试验证，达到预算时必须显示 partial。
- PR #5 合并后可能需要机械 rebase；不得把视觉冲突扩大为功能耦合。
