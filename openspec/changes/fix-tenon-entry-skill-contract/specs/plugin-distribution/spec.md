# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 原生安装 SHALL 暴露唯一且可调用的根入口 Skill

每个原生 Tenon 候选 SHALL 从产品身份真相源读取根入口 Skill id，并在激活前证明
`skills/<entrySkill>/SKILL.md` 存在、frontmatter 名称匹配且完整 Codex 引用等于
`<plugin>:<entrySkill>`。Doctor、安装器、静态 adapter 和发布检查 SHALL 消费同一身份投影，
不得各自维护入口字符串。

#### Scenario: 新用户完成 Codex 安装

- **WHEN** `tenon setup --codex` 激活一个已验证候选
- **THEN** Selected Skill Root 包含产品身份声明的根入口
- **AND** `tenon doctor` 不报告入口缺失
- **AND** 项目目录不创建第二份同名 Skill 投影。

#### Scenario: 候选缺少根入口

- **WHEN** 候选缺失根入口文件或 frontmatter 名称与产品身份不一致
- **THEN** 候选验证和发布检查失败
- **AND** 既有 active release、launcher 与 Dashboard 保持不变。

### Requirement: 宿主插件登记 SHALL 在 Skill 执行前收敛为唯一工作流身份

原生 setup/update SHALL 以宿主插件 inventory 为登记权威。若宿主仍启用一个会与 Tenon 注册同类
Skill/hook 的冲突工作流插件，诊断 SHALL fail closed，并只通过宿主官方插件管理器完成卸载或
禁用；Tenon SHALL NOT 直接删除或改写宿主私有 cache。收敛完成后必须要求新宿主会话加载新的
Skill/hook 集合。

#### Scenario: 已卸载插件的 hook 仍会参与新会话

- **GIVEN** 宿主 inventory 或配置仍启用一个冲突工作流插件身份
- **WHEN** 用户运行 setup 或 doctor
- **THEN** 结果明确指出冲突的宿主登记而不是把它误报为 Tenon Skill 缺失
- **AND** 修复动作使用宿主插件管理命令
- **AND** 不直接操作 cache 内容。

#### Scenario: 宿主 inventory 已唯一

- **WHEN** 只有 `tenon@tenon` 负责 Tenon 的 Skill 与 hook
- **THEN** setup 可继续验证并发布 managed runtime
- **AND** 新会话只加载当前 Tenon 的入口和阶段 Skill。
