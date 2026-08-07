# 任务

## 立项

- [x] 记录 Linux FD alias 失败、最小修复边界与非目标。

## 调研

- [x] 复核失败 CI、现有路径锚点与 TOCTOU 不变量，形成设计与 ADR。 (explore)

## 规格

- [x] 编写现有 capability 的 delta spec 与可执行验证计划。 (spec)

## 实现

- [x] 复核并收敛 kernel anchored-directory 读取与 repository 选项装配。 (build)
- [x] 验证 server 只从已打开且身份匹配的 Change 目录传递 dev/ino。 (build)
- [x] 覆盖普通 alias 拒绝、正确/错误身份、读中重定向与 server Linux 路径回归。 (build)
- [x] 重新生成并校验 server/CLI tracked bundles。 (build)

## 验证

- [ ] 运行定向测试、全量 build、架构/格式门禁与受限 worker 全量测试。 (verify)
- [ ] 审查相对 origin/main 的安全、正确性、契约和回归风险。 (verify)

## 交付

- [ ] 应用 OpenSpec、提交并推送现有分支，等待 PR #34 当前 head CI。 (ship)
- [ ] 核对 PR base/head、draft、mergeability、reviews/comments/threads，不合并。 (ship)

## 归档

- [ ] 完成文档读取门禁并归档本 Change，保留原归档 Change 不变。 (archive)
