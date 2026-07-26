# 安全模型

Tenon 默认本地优先，但“在本机运行”不等于没有风险。插件能够读取项目、执行命令、记录证据并启动本地服务，因此必须保持最小权限和清晰信任边界。

## 信任边界

- 宿主 hooks/skills：来自已安装 release；
- 项目 workflow/track：来自当前仓库；
- agent 输出：不可信输入，必须经过 schema、路径和 guard 校验；
- Dashboard/API：只绑定 loopback；
- Pages：只包含公开白名单静态内容；
- 外部 provider：受凭证、预算和数据策略约束。

## 状态与路径

canonical state 只由 Tenon CLI 写。路径必须落在项目允许范围，拒绝 symlink、目录目标、遍历和绝对路径注入。文档 ledger 记录安全相对路径和摘要。

## Secrets

不得把 API key、OAuth token、prompt、headers、Tap trace、CA 私钥或真实用户数据写入 README、Issue、Pages artifact 或验证截图。诊断输出先脱敏。

## Dashboard

不要把 Dashboard 绑定到 `0.0.0.0` 或通过公共反向代理暴露。它包含项目 root、Change、session 和 mutation 能力。

## 自动化

持续授权不包含发布、付费、外部通信或生产数据操作。AFK/loop 必须有预算、停止条件、隔离和可审计 policy snapshot。

## 供应链

依赖固定版本，CI 使用最小权限。Pages deploy 只接受已验证 artifact；第三方搜索/分析默认不启用。

## 报告漏洞

优先使用 GitHub private vulnerability reporting。不要在公开 Issue 中包含利用细节、凭证、prompt、token 或本地 trace。

## 状态与发布控制

新文件采用原子 no-replace，避免并发覆盖。脚手架在真实父目录检查项目边界，不能只做字符串前缀判断；已有目标只接受非 symlink 普通文件。

`.pipeline-document-locale.json` 是不可变呈现 sidecar，不进入旧 canonical schema。新版本固定语言，旧版本回滚时可以安全忽略。

公共文档和本地控制面属于不同发布域。文档站只从白名单源生成静态内容；Dashboard、Change 状态、内部研究、绝对路径和 API 不得进入 Pages artifact。

静态构建至少扫描：

- 私钥头；
- `Authorization: Bearer`；
- 常见 token/query 参数；
- 用户主目录绝对路径；
- 内部 `docs/adr` 与 `docs/superpowers` 路径；
- source map 与调试快照。

自动扫描只是下限，发布前仍需人工检查源清单与 artifact。

## GitHub Pages

Pages workflow 可在 pull request 或手动分支上执行构建检查，但只有 `main` 的非 PR 运行可以配置、上传并部署 artifact。权限限制为读取内容和部署 Pages 所需的最小集合。

## 安装与更新

`tenon setup --codex`、`tenon setup --claude` 等入口必须显式选择宿主，不猜测环境。运行时安装到用户级标准数据目录，项目只保留必要 adapter 与规则投影。

release 使用内容寻址或不可变版本目录，更新通过指针切换；失败时回滚到已验证版本。setup/update 不能重写历史 Change 与 Archive。

自动发现新版本不等于可以绕过 hash、兼容检查或用户配置边界。

## 威胁与控制

| 威胁 | 主要控制 |
| --- | --- |
| 旧 Change 串入新对话 | 只在明确恢复时激活 |
| 路径或 symlink 逃逸 | realpath 边界与普通文件校验 |
| 并发覆盖文档 | 原子 no-replace |
| review 被错误复用 | exact phase/event receipt |
| 自动更新破坏历史 | 不可变 release 与 sidecar |
| 内部信息进入 Pages | 白名单、扫描、main-only deploy |

## 发布前清单

- Pages artifact 不含内部路径、token、私钥或 source map；
- Dashboard 仍只绑定 loopback；
- 文档脚手架拒绝 symlink 与越界；
- 更新与回滚在临时环境验证；
- CI 权限和部署分支受限；
- 验证报告与截图已脱敏；
- 未验证的安全承诺没有写进 README。

漏洞报告应包含受影响版本、最小复现、预期与实际结果、影响范围和可安全分享的日志。无法确认是否敏感时，先走私有渠道。
