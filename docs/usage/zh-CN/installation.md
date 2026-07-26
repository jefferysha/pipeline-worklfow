# 安装与宿主配置

本指南完成 Tenon 的一次性安装、宿主选择、运行时检查和第一轮验证。安装时必须显式选择宿主，避免把 Codex、Claude Code 或其他平台的 hook/skill 目录混在一起。

## 目标

完成后，你会得到一个用户级、可更新、可回滚的 Tenon 安装；选定宿主能在新会话加载对应 adapter，`tenon` CLI 能找到受管 runtime，Dashboard 能在本机 loopback 打开。

## 前置条件

- Node.js 22 或更高版本；
- Git；
- 对用户级插件目录有写权限；
- 可选：Docker，用于 AFK 隔离执行。

先确认基础环境：

```bash
node --version
git --version
```

不要把仓库内 `node_modules/.bin` 当成用户安装结果。setup 的目标是安装稳定 launcher 和受管 release，让多个项目共享同一份已验证 runtime。

## 步骤

### 1. 一步安装并选择宿主

新用户无需 clone、安装 monorepo 依赖或本地 build。安装 Codex：

```bash
curl -fsSL https://raw.githubusercontent.com/jefferysha/tenon/main/install.sh | bash -s -- --codex
```

安装 Claude Code：

```bash
curl -fsSL https://raw.githubusercontent.com/jefferysha/tenon/main/install.sh | bash -s -- --claude
```

脚本只负责注册 Tenon Marketplace、安装并验证完整 payload，然后调用包内
`tenon setup --<host>`。已经安装的用户可以直接再次运行 `tenon setup --codex`
修复宿主接线；已存在 active runtime 后可运行 `tenon update --self-update`，由受管发行记录推断
Codex 或 Claude 宿主并在隔离目录完成校验、Dashboard readiness 和精确回滚。

Marketplace bootstrap 是当前可用且推荐的一步安装入口。仓库同时构建一个薄 npx 发布包，但只有
维护者配置了 npm publisher scope 并完成公开发布后，文档才会展示真实的
`npx --yes @<publisher>/tenon setup --codex` 命令；它不会复制第二套 runtime，最终仍执行同一个
Marketplace 安装事务。未发布前不要猜 npm 包名。

不同宿主的 hook 能力不完全相同。文档和 Dashboard 会按 adapter fidelity 说明哪些门是原生强制、哪些依赖会话提示或显式 CLI。

不要省略宿主参数。`tenon setup` 需要知道要写入哪个宿主的 skills、hooks 和 manifest；这不是能从当前 shell 可靠猜出的信息。

### 2. 新开宿主会话

setup 完成后关闭旧会话，再创建新会话。已启动的 Codex 或 Claude Code 通常不会热加载刚写入的 SessionStart、skills 和 hook 配置。

### 3. 检查受管 runtime

```bash
tenon doctor
tenon runtime status
tenon dashboard --open
```

`doctor` 应报告 CLI、skill bundle、hook 和 runtime 的真实状态。Dashboard 默认使用 `127.0.0.1:18765`；如果端口占用，先确认进程身份，不要盲目结束其他项目。

### 4. 理解安装目录

发行版使用不可变 release 目录和稳定 launcher。自动更新切换 release 指针，而不是覆盖项目内 Change 文档。项目仓库只保存 `.pipeline` 配置、`openspec/changes` 和实际证据。

具体绝对路径由操作系统的用户级标准目录决定。不要在项目根复制一份私有 CLI 作为“后门”，否则自动更新、回滚和 skill trust tier 会产生两个互相漂移的真相源。

## 预期结果

- `tenon doctor` 不会把缺失 runtime、损坏 skill 或失效 hook 报成绿色；
- `tenon runtime status` 显示当前激活 release 和校验状态；
- `tenon dashboard --open` 打开 Tenon，而不是其他占用端口的应用；
- 新建 Change 时治理文档默认使用中文；
- 显式 `--document-locale en` 的新 Change 固定使用英文模板。

## 验证

在任意已初始化项目执行：

```bash
tenon doctor
tenon runtime status
tenon list --json
```

验证 Dashboard 时，除 HTTP 200 外还要核对页面标题、导航和项目根。端口可访问不代表服务身份正确。

## 常见失败

- `command not found`：重新打开 shell，检查 launcher 是否在 PATH；
- skill 缺失：运行 `tenon doctor`，再执行对应宿主的 repair/setup；
- hook 未生效：关闭旧会话并新建会话；
- Dashboard 打开了其他应用：核对页面标题和实际监听进程；
- setup 报已有不同宿主配置：使用明确的 `--codex` 或 `--claude`，不要手工混合目录；
- runtime 校验失败：先运行 `tenon runtime status`，再按受控流程 repair/rollback；
- Docker 不可用：只影响声明需要 AFK/sandcastle 的路径，不应阻断普通交互式 Change。
- 从旧产品身份升级：旧仓库只发布迁移桥；它先安装并复验 Tenon，再等待新会话证明，最后才删除旧登记和仍与所有权摘要一致的旧 launcher。

## 下一步

继续完成[第一个受治理任务](./quickstart.md)。更新和回滚见[更新、恢复与卸载](./updates-recovery-and-uninstall.md)。
