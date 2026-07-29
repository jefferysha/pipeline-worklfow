# 设计

## Explore 结论

- 以 PR #8 的完整 diff 和当前 `origin/main` 为双基线；两侧为 55/11 个独占提交，合并基点为 `15fe619b`，预合并有 4 个内容冲突。
- CLI 应继续拥有宿主与 setup/update 计划真相；server 只做严格只读 adapter；Dashboard 通过既有 API 边界消费 DTO。
- 采用“普通合并当前主线、保留 bounded capability、按当前规则 TDD 审计”的方案；不直接接受旧证据，也不无理由重写全部 PR。
- 当前主线的 setup/update 已有更强 managed runtime、事务/WAL 和 Dashboard handoff 语义；Host Plan 只能描述稳定层级，必须由当前真实 owner 与跨端测试证明。
- 所有公共契约、分发 bundle、Dashboard 正式资产和文档必须同步；生成物冲突从最终源码重建。
- 详细 RFC：`docs/superpowers/specs/2026-07-29-pr-8-merge-audit-design.md`；ADR：`docs/adr/2026-07-29-pr-8-merge-audit-explore.md`。

## 风险

- PR #8 基线较旧，可能与已合并的 PR #5–#7 能力和归档治理发生冲突。
- 计划预览可能与真实 setup/update 顺序、参数或副作用语义漂移。
- GET API 可能存在 query、Host、stdout decoder、并发、缓存或错误泄露风险。
- Dashboard 可能存在加载/错误/空态、焦点、键盘、移动端、主题、国际化或视觉层级缺口。
- 原 PR 已有验证证据可能因主线与生成资产变化而失效，不能直接复用。
- server 与 Dashboard decoder 复制 native 命令/步骤真相，可能在三层漂移。
- 固定 25-key 空间使缓存有界，但全局串行 child 队列可能产生跨 key 阻塞。
- adapter 可复制命令必须固定使用当前工作目录 `--target .`，不得把 `<project>` 这类会被 shell 解释为重定向的伪占位符交给用户；`display` 只允许展示 schema 封闭且可安全逐 token 拼接的 argv。

## 待验证问题

- Spec 必须冻结 `host-target-plan/v1` 的稳定层级、错误码、缓存/并发和安全复制命令语义；adapter 的复制命令明确作用于用户运行命令时的当前项目目录。
- Build 必须用当前源码/测试回答 12 个注册宿主、setup/update 真实顺序与事务化 runtime 的一致性。
- Build/Verify 必须证明固定 argv、严格 JSON、Host 守卫、错误脱敏和失败不缓存均 fail-closed。
- Dashboard 必须通过前端分层、文件长度、i18n、状态机、可访问性及强制 `design-taste-frontend` 门禁。
