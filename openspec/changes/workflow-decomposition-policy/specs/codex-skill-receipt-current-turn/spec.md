# OpenSpec 增量规格

## MODIFIED Requirements

### Requirement: stable runtime 保留可信 Codex cache provenance

stable bootstrap MUST 从已验证 active payload 派生当前 Codex plugin cache root，并把该身份显式传给负责解析当前 turn transcript 的 receipt bridge。bridge MUST 继续校验 session、turn、phase、worktree、Git common directory、Skill id、ABI、完整嵌套命令结果与文件元数据；caller 提供的未验证 override 不得扩大可信范围。

#### Scenario: stable launcher 读取当前 cache Skill

- **WHEN** 当前 host session 通过 stable launcher 在登记 worktree 读取 active payload 对应 cache 中的当前 phase Skill，且完整命令结果成功
- **THEN** 当前 Change/step 获得同 session、同 turn、同 phase 的可审计 receipt

#### Scenario: cache 或 runtime 身份漂移

- **WHEN** cache root 不属于已验证 active payload、Skill 文件元数据在读取中变化、managed runtime 与 active payload bridge 不匹配，或 transcript 绑定错误 session/turn/worktree
- **THEN** receipt 失败关闭并返回可诊断原因，不得以分支 CLI 直调或 backfill 标记为通过

#### Scenario: stable bootstrap 回归

- **WHEN** 安装后的 stable bootstrap 启动正式 CLI/hook/receipt bridge
- **THEN** 自动化测试证明可信 cache 身份在完整进程边界保留，且缺失或伪造身份被拒绝
