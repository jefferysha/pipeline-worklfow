# 设计

## 已验证事实

- `codex-cli 0.144.1` 的真实 Marketplace 在临时 `HOME`/`CODEX_HOME` 中完成 GitHub
  Marketplace 登记与 `tenon@tenon` 1.0.1 安装，未写入真实 Codex 用户目录。
- 新启动的无凭据 Codex app-server 可通过 `plugin/installed`、`skills/list`、`hooks/list`
  证明 Tenon 插件、62 个 skills 与 12 个 hooks 被真实宿主发现；不需要模型调用或复制 secret。
- setup/update 的 Dashboard starter 已支持端口参数，但 managed release coordinator 未贯穿
  `TENON_DASHBOARD_PORT`，导致隔离首装仍会硬碰 18765。
- 相同 release 的既有健康 Dashboard 尚未实现 journal 已声明的 `preexisting` 成功路径，
  重复 setup 会被误判为跨事务冲突。
- `plugin-runtime` 的修复仅在 `## Requirements` 前插入 Purpose，变更前后 requirements
  tail digest 必须保持
  `6334e35ef63c7c58a7dd70f4e9c01be44650c622beaab0a23e8620413bff1e5c`。

## 设计决策

- 新增共享干净首装验收器：CI 的 local Marketplace 候选轨与 release 的 public bootstrap 轨
  共用 runtime、doctor、Dashboard、新 Codex 进程与重复执行断言。
- 从既有 SetupEnv runtime environment 解析一次 Dashboard port，贯穿 setup/update transaction
  的 inspect/start/recovery；缺省仍为唯一生产端口 18765。
- 同 release、同 state scope、同端口的健康 managed Dashboard 可作为 `preexisting` 保留，
  但新事务不得停止它。不同 release 默认 fail closed；唯一例外是 activation 前已将当前 active
  previous release 的完整 identity 写入 WAL，新事务才可精确 adopt/stop 该 listener，启动候选。
- pre-activation 空端口也必须显式写入 WAL，防止探针之间出现的 listener 被误认成 preexisting。
  candidate/evidence 失败后恢复 previous Dashboard；fresh retry 重新冻结并精确替换它，不进入
  永久 indeterminate。
- 进入 `runtime-activated` 前未冻结 `dashboardBefore`/`dashboardBeforeAbsent` 或未冻结 port
  的旧 WAL 不得用 activation 后的环境补证，必须 fail closed。
- 补偿动作在任何外部副作用前写入明确 WAL phase；恢复时先证明动作已完成或安全地幂等续跑，
  只有 previous Dashboard 的精确恢复证明落盘后才能清 WAL。
- starter/spawn 层在返回 `ready` 前验证 release、port、child PID 与 health PID、canonical
  state scope 及 transaction；私有 child 不匹配时由该层直接清理。coordinator 或 restore
  adapter 返回的不可信 session 不属于可发送信号的所有权证明，只能保留 WAL 并失败关闭。
- previous restore 使用本次补偿唯一 identity 防止并发 listener 冒充恢复结果。
- Release public 轨显式绑定当前 checkout 的不可变 Git ref/commit；普通用户的一步安装仍使用
  `main`，但发布门禁不得用 `main` 代替待发布候选。
- kernel lock 只接受完整十进制正整数 PID；Dashboard health 在解析 JSON 前先保留非 2xx
  HTTP status，避免错误根因被解析异常覆盖。
- 验收只清理本轮精确临时根和经 health identity 证明属于本轮的 Dashboard。
- Purpose-only 通过 tail digest、Git diff、strict validate 与隔离 archive rehearsal 四重证明。

## 详细设计

完整拓扑、失败矩阵、覆盖与发布门见
`docs/superpowers/specs/2026-07-27-clean-codex-install-and-plugin-runtime-purpose-design.md`；
架构取舍见
`docs/adr/2026-07-27-clean-install-acceptance-and-purpose-only-baseline.md`。
