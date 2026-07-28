# ADR：以受保护 POST 提供有界相关会话检索

## 背景

Tenon 已有跨 Claude、Codex、OpenCode、Pi 的只读 mem 内核，也有把 Change 关联到最近会话的
`/api/mem/session-link(s)`。后者只解决恢复最近现场，不能按任务关键词找回多段历史。
直接把现有无界 CLI 搜索暴露给 HTTP 会同时引入敏感 query URL、同步整文件读取和契约混淆。

## 决策

新增独立的 kernel 有界 related-search 用例与
`POST /api/mem/related-sessions/search`，在 TaskDetail 中以独立、显式提交的区块消费。

- root 固定到机器注册项目并校验 Change；
- POST 复用 Host、token、content-type 与 body guard；
- 仅返回有界 user excerpt 和必要 session 元数据，不返回路径/cwd；
- 候选、结果、单文件、总字节和摘要都有硬预算；
- 预算耗尽返回 200 partial/warnings，非法/漂移/忙/真正 I/O 错误使用稳定 typed error；
- 不改变现有 session-link、canonical state 或宿主会话文件。

## 备选方案

### 扩展 session-link GET

拒绝。它会把“最近可恢复会话”和“关键词相关历史”混在一起，并让 query 进入 URL。

### 仅在 Dashboard 复制 `tenon mem search` 命令

拒绝。它没有前后端闭环，用户仍需离开任务详情，也无法提供一致的空/错/加载状态。

### 建立持久索引

拒绝。它带来新的敏感数据副本、失效和迁移机制，超出本轮最小纵向切片。

## 后果

正面结果是：跨宿主历史检索获得明确的项目、隐私和资源边界，旧恢复契约保持兼容。
代价是首次查询仍需读取有限数量的本地 session，partial 结果必须诚实展示；后续若需要完整上下文，
必须另建二次显式动作和更严格预算，不能扩大本端点。
