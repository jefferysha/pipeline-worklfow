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
- 非目标：不改变七阶段状态机、OpenSpec 文档协议或 `tenon` CLI 命令语义。

## Capabilities

### New Capabilities

- `dashboard-project-selection`：定义未选择、显式选择、失效选择与 URL 同步的项目上下文契约。

### Modified Capabilities

- `plugin-distribution`：安装后的唯一 Skill 发现根必须包含可调用的 `tenon` 主入口。
- `normal-chat-routing`：生成的 Agent 规则必须调用真实存在的 `tenon:tenon`。
- `tenon-product-identity`：入口 Skill、生成投影、安装态身份与仓库名称卫生由同一产品身份契约约束。

## Impact

影响 Codex doctor 的 Skill 合约、仓库 Agent 静态规则及其生成/漂移测试、发布版本和安装态验收。
同时影响 Dashboard App shell 的项目选择模型、受项目约束的视图入口、URL 投影与回归测试。
不新增依赖，不保留旧入口别名；已有 Change 的 canonical 状态和文档 ledger 不受影响。
