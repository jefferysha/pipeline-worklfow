# ADR：在现有 Change snapshot 投影 Review Handshake

## 背景

Tenon 已有 canonical exact-event review receipt，但 Dashboard 只能看到 transition guard readiness。
用户无法判断 review request 是否建立、绑定哪个 event，或是否已经批准。直接读取 raw
`review_gate_*` 会让前端复制安全状态机；新增 endpoint 或恢复 Inbox 又会制造竞态和重复工作面。

## 决策

Server 在现有 `ChangeSnapshot` 中增加必有的 `reviewHandshake` 判别联合：
`not-requested | pending(event, requestedAt) | approved(event, requestedAt, acknowledgedAt)`。
投影必须验证 receipt 的当前 phase、review gate、冻结 plan 出边与字段完整性，非法组合 fail-loud。

Dashboard 在滚动兼容期把字段设为可选：缺字段显示 unavailable，字段存在则严格解码，绝不从 raw
fields 回退。Progress Drawer 在当前阶段区显示只读状态卡；非 review gate 隐藏。卡片不禁用或替代
现有 Dashboard transition，因为按钮点击本身仍是 host-bound 人工批准。

## 备选方案

- Dashboard 直接解析 `fields.review_gate_*`：拒绝，因为会形成第二状态机和错误的 legacy 兼容。
- 新增 `/review-handshake` endpoint：拒绝，因为三态投影不值得第二 loading/error/race 面。
- WorkflowCanvas chip 或恢复 Inbox：拒绝，因为会与已收敛的 Progress 筛选/画布 IA 重复并弱化
  exact event 的决策上下文。

## 后果

- 好处：HTTP/SSE 同源、状态可追溯、双出口不混淆、旧 runtime 明确降级且没有新写权限。
- 代价：server、前端镜像、decoder、Drawer 与 i18n 必须同步；非法 receipt 会沿现有 snapshot
  错误面显式暴露。
- 验证：server/decoder/组件/Progress 集成测试，外加真实桌面浏览器三宽度、主题、状态、键盘和
  SSE 验收。
