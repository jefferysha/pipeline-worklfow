# 架构决策记录

## 背景

Tenon 1.0 发布后，插件 inventory 的真实入口是 `tenon`，但 doctor 和 Codex 静态规则分别保留
`pipeline` 与 `tenon:pipeline`。这证明“全局替换字符串”没有建立可持续的入口身份所有权。

## 决策

把根入口 Skill 纳入 `product/identity.json` 的版本化产品身份。TypeScript 消费方直接导入生成常量，
Markdown/shell 消费方读取由同一生成器生成的 Codex managed block。身份门禁验证入口目录、完整
Codex 引用、AGENTS 投影和 adapter 消费链。

不提供旧入口 alias；原生安装也不创建项目 `.agents/skills` 投影。
宿主安装态必须由官方插件 inventory 证明只有一个 Tenon 工作流插件身份；冲突项只能经宿主插件
管理器卸载，不由 Tenon 直接改写私有 cache。仓库身份检查同时拒绝外部参考项目名称进入受版本
控制的路径和正文。

## 备选方案

- 手工同步 doctor、AGENTS 和 adapter：拒绝，缺少机械证明。
- 在发布包补 `skills/pipeline` alias：拒绝，会形成第二入口和兼容债务。
- doctor 只检查任意 Skill 数量：拒绝，不能证明 normal-chat 的精确入口。

## 后果

- 后续品牌或入口调整只需修改身份源并重新生成，漂移会在 CI 和 Release 前失败。
- 新安装、新会话和静态 adapter 都调用 `tenon:tenon`；CLI 仍唯一为 `tenon`。
- 冲突宿主插件会成为 doctor 红项，避免旧 hook 静默劫持当前 Skill。
- 外部研究只作为阶段输入，不进入最终发行仓库的路径、正文或产品身份。
- 历史 archive/ledger 保持不可变；旧本地投影由 ownership-safe 人工迁移，不被产品代码强删。
