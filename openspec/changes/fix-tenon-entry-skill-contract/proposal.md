# 提案

## Why

Tenon 1.0 的插件包已经把主编排 Skill 命名为 `tenon`，但项目静态规则仍指向不存在的
`tenon:pipeline`，Codex doctor 也仍检查逻辑 id `pipeline`。新安装用户因此可能看到健康检查黄项，
并且正常对话无法按唯一、可验证的入口 Skill 契约分派。

## What Changes

- 将 Codex 可见主入口统一为 `tenon:tenon`，逻辑 Skill id 统一为 `tenon`。
- 让 doctor、生成的 Agent 规则、插件打包清单和回归测试共同验证同一入口。
- 让安装态只启用当前 Tenon 插件身份，避免被已卸载插件的 hook 或 Skill 根继续劫持。
- 补充安装态 doctor 与生成规则的回归覆盖，防止后续改名再次产生漂移。
- 将外部参考项目名称纳入仓库身份卫生门禁，禁止出现在受版本控制的路径与正文中。
- 将 Dashboard 的“已注册项目集合”与“用户显式选择的项目上下文”拆成两个状态；URL 没有
  `root` 时保持未选择，不再回退首个、默认或历史项目，也不向 URL/API 隐式注入项目根。
- 将 setup/update 的宿主变更从“记录命令已开始后盲目重放”提升为可持久化的期望状态对账：
  每个宿主步骤先记录 before inventory、desired postcondition 与 replay policy；恢复时只允许
  “已达期望则提交”“仍是 before 才执行”或“出现第三状态则失败关闭”三种结果。
- 将受管 Dashboard 的 transaction id 贯穿启动环境、健康响应、pidfile、WAL、inspect/adopt/stop；
  普通 Dashboard 不携带 transaction id，不能被 release 事务收养或停止。
- 将正常对话持续授权定义为 Change 绑定、可撤销、可审计的显式意图；它只能在真实 Skill、
  文档读取、guard 与精确 review event 均满足后生成 delegated receipt，不能跨 Change 继承。
- 将 Build→Verify 改为“Build 全量收敛审查 → 冻结候选 → Verify 全量独立复核”的双层契约：
  Build 未记录 `pre_verify_review_result=pass` 时不得冻结；Verify 的并行轨必须先全部完成并汇总
  全量 findings，禁止用只覆盖上一轮少数问题的窄 brief 提前判定 PASS/FAIL。
- 非目标：不改变七阶段相位拓扑或 OpenSpec 文档协议；新增字段和 guard 采用末尾追加与旧状态
  精确兼容读取，不把“减少返工”实现成跳过独立 Verify。

## Capabilities

### New Capabilities

- `dashboard-project-selection`：定义未选择、显式选择、失效选择与 URL 同步的项目上下文契约。

### Modified Capabilities

- `plugin-distribution`：安装后的唯一 Skill 发现根必须包含可调用的 `tenon` 主入口。
- `plugin-runtime`：宿主变更、runtime 激活、Dashboard 服务与 convergence evidence 必须形成
  可恢复、可对账且不会误接管外部进程的单一事务；Build→Verify 必须有可机检的全量收敛审查。
- `normal-chat-routing`：生成的 Agent 规则必须调用真实存在的 `tenon:tenon`。
- `tenon-product-identity`：入口 Skill、生成投影、安装态身份与仓库名称卫生由同一产品身份契约约束。

## Impact

影响 Codex doctor 的 Skill 合约、仓库 Agent 静态规则及其生成/漂移测试、发布版本和安装态验收；
同时影响 managed release WAL codec、宿主命令装配、Dashboard 进程身份/健康协议、持续授权分类器，
默认 workflow Build/Verify guard、canonical state 末尾字段、Reviewer brief，以及 Dashboard App
shell 的项目选择模型、受项目约束的视图入口、URL 投影与回归测试。不新增依赖，不保留旧入口别名；
旧 canonical revision 缺少新 review 字段时只按精确旧形状补默认值，其他缺字段继续失败关闭；旧版
未完成 WAL 若无法证明 before/desired 状态则只报可诊断的 indeterminate，不自动重放。
