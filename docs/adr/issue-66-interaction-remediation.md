# 架构决策记录

## 背景

Issue #46 的 Review 2/2 证明两个安全/正确性事实：replay 不能静默忽略 terminal 后的非法 core event；canonical review authorization sidecar 不能通过 `lstat` 后无界 `readFile` 决定权限。同时，旧 proposal 宣称 canonical review 完全兼容，但实际实现已经要求缺 binding 的 legacy receipt fail closed。

## 决策

1. Replay 在通用 anchor/time 检查之后建立 terminal fence。除完整已知的幂等 `resume.validated(success)` 外，terminal 后所有 core event 产生 `malformed-order` 并使 journey 不可 verified。
2. Review sidecar 复用 kernel state 层现有 bounded regular-file reader，固定 16 KiB 上限，要求 `O_NOFOLLOW`、普通文件、parent/target/fd identity 前后稳定、严格 UTF-8、闭合 shape 和 canonical JSON bytes。
3. Sidecar-less 或不可证明的 legacy receipt 一律不授权。恢复只能通过持 Change lock 的 fresh exact review request 原子生成新的 receipt/binding，再重新 acknowledge。
4. 通过本 Change 的官方 Spec/`requirements-changed` 证据显式更新 compatibility contract，禁止 Build 直接改写已批准语义。

## 备选方案

- 自动从当前 state 回填 legacy binding：无法证明 approval 时刻的 decision state，拒绝。
- compatibility flag 或缺 binding bypass：制造两套授权语义并可能环境相关 fail-open，拒绝。
- 把 binding 搬进 canonical YAML：需要 schema/migration 与更多调用方改造，超出 #66，拒绝。
- 为 sidecar 复制一套 reader：会与已有 `document-path` 安全原语漂移，拒绝。

## 后果

正面后果：授权读取在同一物理文件上有界完成；替换、symlink、增长、同 inode 修改、非 canonical/duplicate-key JSON 都可稳定拒绝；legacy receipt 有明确且可审计的恢复操作；interaction projection 与 canonical authorization 继续解耦。

成本：旧 pending/approved receipt 若没有当前 canonical sidecar，必须重新执行 exact `review request` 与 acknowledgement；非 canonical 手工 sidecar 不再被宽松接受。当前 writer 已输出 canonical bytes，因此正常新 receipt 无迁移成本。

回滚：整个 remediation 可回退到治理提交 `5f93fd84f6f984c16d55df2eac65caa4f5159958`；回滚不会改写 #46 的 Review 历史，但会重新暴露 #66 已记录的三个阻断，所以不得在未替代这些安全保证时作为发布方案。
