# Tenon 一步安装与仓库卫生调研

> 日期：2026-07-26
> Change：`rename-pipeline-lite-to-tenon`
> 范围：首装入口、Marketplace/npx 分工、仓库图片与发布内容

## 结论

1. 新用户不需要手动 `git clone`。首选入口是一行 bootstrap 命令；bootstrap 只负责把同一个
   Tenon Marketplace 插件安装到指定宿主，再调用包内 `tenon setup --codex|--claude`。
2. Marketplace 与 npx 不是两套产品。它们必须进入同一个安装事务、校验同一份发行 manifest、
   激活同一个 content-addressed runtime。
3. 首发以 Marketplace bootstrap 为主，因为仓库已经具备 Codex/Claude marketplace manifest，
   不依赖尚未配置的 npm 发布凭据。npm 包同时做成可发布、可 `npx` 验证的薄入口，待发布者 scope
   与凭据可用后开放 `npx --yes @<publisher>/tenon setup --codex`。
4. 当前 Git 跟踪 67 个图片文件；其中 `design-demos/shots/` 63 个、约 21.7 MiB。它们是旧验收截图，
   不是 Marketplace、CLI、Dashboard 或文档站运行资产。根目录另有 3 个未被当前文档引用的 PNG。
5. 保留被现行源码注释和设计文档引用的文本型 `design-demos/*.html|*.md`，移除并忽略可再生截图。
   `docs-site/public/logo.svg` 是当前文档站资产，保留；另生成少量正式 Tenon Dashboard 文档图，
   进入明确 allowlist，而不是恢复任意截图入库。
6. 本 Change 不重写 Git 历史。历史重写会改变提交 SHA、破坏审计引用并影响现有 clone；
   当前优化只清理主分支工作树、缩小后续提交和发布包，并用门禁防止回归。

## 一步安装契约

推荐的公开入口：

```bash
curl -fsSL https://raw.githubusercontent.com/jefferysha/tenon/main/install.sh \
  | bash -s -- --codex
```

Claude 仅把宿主参数换为 `--claude`。脚本内部执行以下确定性事务：

1. 注册 `jefferysha/tenon` Marketplace；
2. 安装 `tenon@tenon`；
3. 从宿主真实 inventory 解析安装根；
4. 校验 CLI、Dashboard、Skills、hooks、adapter 和 release manifest；
5. 执行包内 `tenon setup --<host> --yes`；
6. 启动并健康检查唯一 Dashboard `127.0.0.1:18765`；
7. 任一步失败都不得把未校验候选标记为 active。

脚本是 Marketplace 的 bootstrap，不做源码 checkout，也不要求用户安装仓库依赖或本地 build。

## npx 边界

npx 入口的目标契约为：

```bash
npx --yes @<publisher>/tenon setup --codex
```

公开 npm 包应是薄 bootstrap：

- 只携带入口、identity manifest、完整发行包的校验信息；
- 不把 monorepo 的测试、设计稿、研究文档和截图装给用户；
- 下载/选择与 Marketplace 相同的受校验发行 payload；
- `npm pack --dry-run`、临时 HOME 首装和 `--version` smoke 必须在发布前通过。

本机 `npm whoami` 当前没有登录，且发布者 scope 不能从仓库名安全推断。因此本 Change 可以完成包结构、
pack 验证和发布 workflow，但不能把“npm 首次发布”伪报为已完成。Marketplace 一步安装不受此限制。

## 仓库卫生规则

当前树按以下类别治理：

| 类别 | 处理 |
| --- | --- |
| `docs-site/public/logo.svg` 等被正式站引用的源资产 | 保留并进入 allowlist |
| `docs-site/public/images/dashboard-*.webp` 当前正式宣传图 | 浏览器验收后生成、压缩、进入 allowlist |
| `design-demos/*.html|*.md` 等仍被实现/设计规范引用的文本真相源 | 保留 |
| `design-demos/shots/*.png` 旧浏览器验收截图 | 从当前树删除并忽略 |
| 根目录 `workflow-governance-*.png` 等未引用截图 | 从当前树删除并忽略 |
| `.playwright-tmp/`、`e2e-runs/`、本地浏览器快照 | 保持忽略 |
| CLI/server/SPA 受控 bundle | 由构建生成、通过显式 allowlist 跟踪 |
| OpenSpec archive、ledger、ADR、研究结论 | 保留；它们是审计事实而非“无关文件” |

新增 repository hygiene 检查至少保证：

- Git 不再跟踪 `design-demos/shots/` 或根目录 QA 截图；
- 超过阈值的二进制必须在显式 allowlist 中；
- npm/Marketplace 发布清单不包含 demo、截图、测试运行态和内部研究；
- README、文档站和报告不存在指向已删除图片的活跃链接。

正式 Dashboard 图遵守以下约束：

- 只保留 3–4 张能解释产品能力的当前界面，不把每轮 QA 截图当文档资产；
- 文件名稳定、无时间戳，单图设尺寸上限，优先 WebP；
- 不出现本机用户名、临时目录、凭据、真实项目隐私或错误状态；
- README 只放核心总览与紧凑能力图，完整图文说明放中文文档站；
- 真实浏览器同时验收 GitHub Markdown 相对链接和 VitePress production base 下的图片 URL。

## 官方约束

- npm 官方文档要求 scoped public package 首次发布使用 `--access public`，并建议通过
  `.npmignore`/`.gitignore` 排除测试数据和不必要内容。
- npm scope 归属于用户或组织，不能在没有对应账号/组织所有权时假设 `@tenon` 可发布。
- GitHub 仓库改名会重定向 Web/Git URL，但 GitHub Pages project URL 不重定向；发布面必须独立验收。
