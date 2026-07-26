# 发布说明

Tenon 的发布说明用于回答三个问题：这一版改变了什么、用户需要做什么、如何确认升级成功。

本页只记录已经进入公开发行包的能力，不把规划、内部 ADR 或尚未合并的实验写成已交付事实。

## 阅读方式

每个版本条目都按“新增、变化、修复、升级动作、验证、兼容性”组织。

命令、事件名、phase id、配置 key 和文件路径保留英文，以便与 CLI 输出逐字对应。

面向用户的解释、影响与操作步骤默认使用中文。

## v1.0.1 · 2026-07-26

### 正常对话入口契约

- `product/identity.json` 新增 `entrySkill: "tenon"`，它是唯一公开入口。
- Codex 正常对话统一调用 `tenon:tenon`，不保留第二入口别名。
- 根 `AGENTS.md` 与 Codex 静态 adapter 消费同一份生成 managed block。
- `tenon doctor` 会验证入口 Skill，并把仍启用的冲突工作流插件报告为红灯。
- `tenon setup --codex -y` 会先通过 Codex 官方插件管理器移除该精确旧登记，再激活 Tenon。

### 仓库与发布卫生

- CI 与 Release 对所有受版本控制路径和文本执行外部参考项目身份扫描。
- 扫描不区分大小写、没有豁免，诊断信息也不会回显受限名称。
- Release payload 构建前执行同一门禁，避免源码干净但发行包污染。

### 升级动作

运行 `tenon update --codex`，随后运行 `tenon setup --codex --auto-update -y`。新开 Codex 会话后执行
`tenon doctor --json`。

## v1.0.0 · 2026-07-26

### 中文治理文档

- 新 Change 的治理文档默认固定为 `zh-CN`。
- `tenon init`、`tenon document scaffold` 与 default OpenSpec fallback 使用同一 Document Presentation Registry。
- 用户可以在创建时显式选择 `--document-locale en`。
- 已固定 locale 的 Change 不允许在中途静默切换语言。
- 历史 Change 会从现有 H1 文字信号推断语言。
- 语言信号混合或不足时命令失败并要求显式选择，不会猜测覆盖。

### 执行模式

- Discussion 用于不需要状态机的普通问答。
- Simple 使用 `change → verify → done`，不生成完整 OpenSpec 文档链。
- Default 使用 `open → explore → spec ⇄ build ⇄ verify → ship → archive`。
- Free 显式绑定 workflow，不叠加 PM、前端或后端 Track。
- Custom 完全遵守自身声明的 DAG、Skill、gate 与 document contract。

### 文档站

- 仓库首页 README 默认中文，并提供 `README.en.md`。
- 文档站提供中文根路由与 `/en/` 英文镜像。
- 本地搜索基于公开 content manifest 构建。
- GitHub Pages 只从 `main` 分支部署。
- Pull Request 只构建和检查，不执行生产部署。
- 发布 artifact 经过闭集 allowlist、敏感信息扫描和 project base 检查。
- `llms.txt` 只索引公开页面。
- 内部 ADR、Superpowers 计划、review receipt 与本地控制面状态不会进入公开站点。

### 安装与更新

- Codex 使用 `tenon setup --codex`。
- Claude 使用 `tenon setup --claude`。
- 更新使用对应宿主的 `tenon update --codex` 或 `tenon update --claude`。
- 托管 runtime 以内容摘要发布，稳定 launcher 指向已验证版本。
- 更新失败时保留上一版，可用 `tenon runtime repair --rollback` 恢复。
- Dashboard 默认监听 `127.0.0.1:18765`。

## 升级动作

1. 在现有仓库确认工作区状态。
2. 运行对应宿主的 `tenon update` 命令。
3. 运行 `tenon runtime status` 查看活动版本。
4. 运行 `tenon doctor` 检查安装、Skill 与宿主适配。
5. 在项目中运行 `tenon list --json` 验证 CLI 可读状态。
6. 打开 Dashboard 时确认地址为 `127.0.0.1:18765`。

## 验证

- `tenon --help` 能显示命令族。
- `tenon runtime status` 能显示活动 runtime。
- `tenon doctor` 不报告缺失的内建 Skill。
- `tenon setup --codex` 重复运行保持幂等。
- `tenon update --codex` 不修改项目的 canonical Change 状态。
- 新建测试 Change 时 proposal、design 与 tasks 默认中文。
- 显式英文 Change 的新文档保持英文。

## 兼容性

canonical Change codec 不因文档 locale 增加新字段。

locale 固定信息保存在 `.pipeline-document-locale.json` sidecar，因此旧版 runtime 仍可读取 canonical state。

发行资产继续包含 default、simple、free 与 custom workflow 所需的模板和 Skill。

## 已知边界

GitHub Pages 的真实公开 URL 只有在 `main` workflow 成功部署后才能确认。

本地预览通过不等于远程部署成功；应以 Actions 的 deploy job 和 Pages environment 为准。

Dashboard 的界面语言与治理文档 locale 是两个独立边界，不互相覆盖。

## 回滚

如果升级后的 runtime 无法启动，先运行 `tenon runtime status` 收集版本信息。

随后运行 `tenon runtime repair --rollback` 切回上一份已验证内容摘要。

回滚 runtime 不会删除项目中的 Change、OpenSpec 文档或证据账本。

## 版本记录规范

未来发布必须在本页增加中文条目，并同步英文镜像。

条目必须对应真实提交、构建和验证证据。

未验证的规划只能写入 roadmap，不得提前进入发布说明。

每次发布还应检查安装命令、更新命令、Dashboard 端口和 Pages 路径是否与源码真相一致。

## 下一步

继续阅读[更新、恢复与卸载](./updates-recovery-and-uninstall.md)，了解完整的运行时维护与恢复流程。
