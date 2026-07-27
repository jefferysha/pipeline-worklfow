# ADR：真实干净首装门与 Purpose-only 基线修复

- 日期：2026-07-27
- 状态：Accepted
- Change：`validate-clean-install-and-plugin-runtime-purpose`

## 背景

Tenon 已有一步 bootstrap、fake-host 黑盒测试和真实既有环境 setup 证据，但它们不能共同证明
空 Codex 用户状态从公开 Marketplace 首装后，managed runtime、Dashboard、skills 与 hooks
全部可用。直接复用真实用户 HOME 又会污染插件配置、runtime 和 18765 服务。

与此同时，`plugin-runtime` 主规格缺失 OpenSpec 必需的 Purpose。该债务必须修复，但用户明确
禁止借机改变任何既有 requirement。

## 决策

1. 用临时 `HOME`、`CODEX_HOME`、`TENON_RUNTIME_HOME` 和唯一 Dashboard 端口运行真实 Codex
   Marketplace 首装；不复制、不读取真实凭据。
2. 用新启动的 Codex app-server inventory API 证明插件、skills 与 hooks 被宿主发现；模型登录
   不再是这项加载证明的前置。
3. managed setup/update 贯穿既有 `TENON_DASHBOARD_PORT`。正常缺省仍为 18765，不创建第二
   runtime home 或第二安装通道。
4. 相同 release 的健康 managed Dashboard 可作为 `preexisting` 被新事务证明并保留，但不得被
   新事务 adopt 或 stop。changed release 只有在 activation 前已把 current active previous
   Dashboard 的完整 identity 写入 WAL 时，才可逐字段复核后精确 adopt/stop；空端口、未冻结、
   身份漂移或其他 release 均 fail closed。
5. candidate/evidence 失败后精确停止本事务 candidate、补偿 activation 并恢复 previous
   Dashboard；candidate stop、activation revert、previous restore 与恢复证明分别持久化为 WAL
   phase，恢复证明前不得 clear，fresh retry 才重新冻结并替换 previous listener。
6. CI 使用当前 checkout 的真实 Codex local Marketplace 验收候选；release/人工轨使用公开
   `install.sh`。普通人工安装可选 `main`，release workflow 必须传当前 checkout 的不可变
   ref/commit；两轨共享同一后置断言和精确清理。
7. `plugin-runtime` 只在 `## Requirements` 前加入准确 Purpose。修改前后从
   `## Requirements` 到 EOF 的 SHA-256 必须保持
   `6334e35ef63c7c58a7dd70f4e9c01be44650c622beaab0a23e8620413bff1e5c`。
8. strict validate 覆盖 Change、`plugin-runtime` 和 `plugin-distribution`；OpenSpec archive
   只在隔离副本演练，真实 Change 由 Tenon Archive phase 管理。
9. `runtime-activated` 后缺 pre-activation identity/port 的旧 WAL fail closed，不从当前环境补证。
   starter/spawn 层是新 child 私有 handle 的唯一 owner，必须对账 child/health PID 并清理不匹配
   child；coordinator/restore 对不可信 session 禁止发送信号。previous restore 使用唯一 identity。
10. lock PID 使用完整十进制解析；health 非 2xx 在 JSON 解析前保留 HTTP status。

## 被拒绝方案

- 复用当前 HOME 或先停 18765：会改变真实用户状态，不符合非破坏验收。
- 只检查插件缓存文件：不能证明新宿主进程实际发现 skills/hooks。
- 复制现有 Codex auth 到临时 HOME：扩大 secret 访问面，且加载验证根本不需要模型调用。
- 把 Marketplace/network smoke 塞进普通单元测试并允许静默 skip：会继续产生“测试绿但没有
  真实首装”的歧义。
- setup 遇到任何其他 transaction id 都失败：会让相同 release 的重复安装不幂等。
- activation 后才第一次看见 previous listener 就直接 stop：缺少 pre-activation 冻结事实，会把
  探针之间出现的未知服务误纳入事务所有权。
- coordinator 对返回 identity 不匹配的 session 调用 `stop()`：session 本身不能证明进程归属，
  只能由仍持有私有 child handle 的 spawn 层执行清理。
- 在 activation revert 后先 clear WAL 再 restore：崩溃会永久丢失 previous Dashboard 的恢复责任。
- release tag checkout 后仍下载 `main/install.sh`：验证对象可能与待发布候选不同。
- 为修 Purpose 重写或格式化整个 spec：无法证明 requirements 未变。

## 后果

- CI 多一个真实宿主集成轨，运行时间和网络依赖增加，但安装声明有了直接证据。
- Release 公网 smoke 失败时必须阻断或明确失败，不能仅凭包构建成功继续宣称可安装。
- hook trust 仍由用户在 Codex `/hooks` 完成；自动化只证明发现和信任状态，不绕过安全门。
- `plugin-runtime` strict validate 恢复，同时保留全部历史 requirement 字节。
