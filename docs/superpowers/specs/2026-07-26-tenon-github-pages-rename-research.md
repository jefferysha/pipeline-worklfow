# Tenon：GitHub 仓库改名与 Pages 迁移调研

> 调研日期：2026-07-26
> 目标变更：`rename-pipeline-lite-to-tenon`
> 范围：把公开仓库 `jefferysha/pipeline-worklfow` 改名为 `jefferysha/tenon` 时，确认 Git、GitHub Pages、Actions 与旧链接的真实行为边界。
> 证据边界：只采用 GitHub 官方文档、GitHub 官方 Action 仓库和当前仓库的 GitHub REST API 只读响应；本次未执行仓库改名、Pages 配置或其他远程写操作。

## 结论摘要

1. **仓库与 Git 远程可平滑改名。** GitHub 会重定向旧仓库的 Web 请求，旧地址上的
   `git clone`、`git fetch` 和 `git push` 仍会到达新仓库；但 GitHub 官方仍要求尽快把本地
   `origin` 改成新地址。[Renaming a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)
2. **GitHub Pages 项目站不是同一套重定向。** 项目站默认 URL 含仓库名；仓库改名后，目标 URL
   从 `https://jefferysha.github.io/pipeline-worklfow/` 变为
   `https://jefferysha.github.io/tenon/`，旧项目站 URL 不在 GitHub 的自动重定向范围内。
   [What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
3. **当前文档构建必须与远程改名协同切换。** 本仓 VitePress、内容同步与 smoke 门禁均硬编码
   `/pipeline-worklfow/`，不能只改 GitHub 仓库名；否则新 Pages URL 的脚本、样式、图标和站内链接会继续
   指向旧 base。
4. **现有 Pages Actions 编排结构可保留。** 当前工作流已经使用
   `actions/configure-pages@v5`、`actions/upload-pages-artifact@v4` 和
   `actions/deploy-pages@v4`，并具有 `pages: write`、`id-token: write`、`github-pages`
   environment 和 deployment output URL，符合 GitHub 官方自定义工作流要求。
   [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
5. **旧仓库名不得被重新占用。** 如果以后在同一账号下重新创建 `pipeline-worklfow`，原有仓库/Git
   重定向会失效。为了保留旧 Git 地址，不能用“新建一个旧名仓库放跳转页”作为 Pages 兼容方案。
6. **针对本 Change 已明确的“不兼容替换”决策，推荐直接迁移到 `/tenon/`。** 不为旧 Pages URL
   建兼容仓库；如未来需要长期稳定、与仓库 slug 解耦的文档地址，再启用已验证的自定义域名。

## 1. 当前远程与 Pages 事实

以下事实来自 2026-07-26 的只读查询：

```text
GET https://api.github.com/repos/jefferysha/pipeline-worklfow
full_name: jefferysha/pipeline-worklfow
visibility: public
default_branch: main
has_pages: true
admin: true

GET https://api.github.com/repos/jefferysha/pipeline-worklfow/pages
build_type: workflow
html_url: https://jefferysha.github.io/pipeline-worklfow/
cname: null
https_enforced: true
public: true

GET https://api.github.com/repos/jefferysha/pipeline-worklfow/actions/workflows
CI: active
Documentation Pages: active

GET https://api.github.com/repos/jefferysha/tenon
HTTP 404
```

可验证 API：

- [当前仓库 API](https://api.github.com/repos/jefferysha/pipeline-worklfow)
- [当前 Pages API](https://api.github.com/repos/jefferysha/pipeline-worklfow/pages)
- [当前 Actions workflows API](https://api.github.com/repos/jefferysha/pipeline-worklfow/actions/workflows)
- [GitHub Pages REST API 文档](https://docs.github.com/en/rest/pages/pages?apiVersion=2022-11-28#get-a-github-pages-site)
- [更新仓库 REST API 文档](https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#update-a-repository)

`jefferysha/tenon` 当前返回 404 只证明查询时没有可见的同名仓库，不构成名称预留；执行改名前仍应再次
检查，并以更新仓库 API 返回的 `200` 和新 `full_name` 为成功证据。

当前 HTTP 实测：

- `https://jefferysha.github.io/pipeline-worklfow/`：`200`
- `https://jefferysha.github.io/tenon/`：`404`

## 2. 仓库改名后的自动行为

### 2.1 会自动重定向的内容

GitHub 官方明确说明，仓库改名后，除项目站 URL 外的现有仓库信息会重定向到新名称，包括仓库 Web
流量；旧位置上的 `git clone`、`git fetch` 和 `git push` 也会继续工作。
[Renaming a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)

这意味着：

```text
旧仓库：https://github.com/jefferysha/pipeline-worklfow
新仓库：https://github.com/jefferysha/tenon

旧 Git：https://github.com/jefferysha/pipeline-worklfow.git
新 Git：https://github.com/jefferysha/tenon.git
```

旧 Git 地址可作为 GitHub 管理的迁移重定向继续使用，但不应成为发布后的文档、安装器、更新器或本地
clone 的规范地址。规范修复命令是：

```bash
git remote set-url origin https://github.com/jefferysha/tenon.git
```

### 2.2 不会自动重定向的内容

GitHub 把 **project site URL** 明确列为仓库改名重定向的例外。Pages 官方说明项目站的默认地址是
`https://<owner>.github.io/<repositoryname>`，所以仓库名本身就是 URL 路径契约。
[What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

因此本次迁移后的事实目标是：

```text
旧站点：https://jefferysha.github.io/pipeline-worklfow/
新站点：https://jefferysha.github.io/tenon/
新 base：/tenon/
```

不能把仓库 Web/Git 的重定向能力推断成 Pages 也会重定向。若要求 URL 与仓库名解耦，GitHub 官方推荐
在仓库改名前使用自定义域名。[About custom domains and GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages)

## 3. Actions 与 Pages 配置边界

### 3.1 当前无需重写的部分

`.github/workflows/docs-pages.yml` 当前具备：

- `actions/configure-pages@v5`
- `actions/upload-pages-artifact@v4`
- `actions/deploy-pages@v4`
- deploy job 的 `pages: write` 与 `id-token: write`
- `github-pages` environment
- `url: ${{ steps.deployment.outputs.page_url }}`
- `main` push 发布、PR 仅构建验证

这些都是 GitHub 官方文档要求的结构，仓库改名本身不要求把 Action 版本或权限模型换掉。
[Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Actions 中应保留动态上下文，不新增硬编码仓库名。GitHub 官方提供 `${{ github.repository }}` 等运行时
上下文，适合必须引用当前仓库身份的场景。[Variables reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)

### 3.2 必须同步修改的当前硬编码

当前仓库只读扫描确认至少包含以下公开运行面：

| 位置 | 当前值 | 目标值 |
| --- | --- | --- |
| `docs-site/.vitepress/config.mts` | `base: '/pipeline-worklfow/'` | `base: '/tenon/'` |
| `docs-site/.vitepress/config.mts` | favicon、GitHub nav、social link 指向旧路径/仓库 | `/tenon/` 与 `jefferysha/tenon` |
| `docs-site/scripts/sync-content.mjs` | 旧 GitHub blob URL 与 `/pipeline-worklfow/` 索引 | 新仓库 URL 与 `/tenon/` |
| `docs-site/scripts/smoke.mjs` | 只允许 `/pipeline-worklfow/` 绝对路径 | 只允许 `/tenon/` |
| `docs-site/public/llms.txt` | 全部公开路由使用旧 base | 全部使用 `/tenon/` |
| `README.md`、`README.zh-CN.md` | 旧 Pages、clone 与目录名 | 新 Pages、clone 与 `tenon` |
| `docs/usage/**` | 旧安装、贡献和故障排查路径 | 新仓库与新 Pages base |
| 受跟踪构建产物 | 旧 base 生成的 HTML/JS/索引 | 由新源码重新构建，不手改 |

Pages Action 只能发布上传的 artifact，不会替应用修复硬编码的 base。`configure-pages` 能读取站点元数据，
但本仓 VitePress 配置目前没有消费它的 output；因此本 Change 仍必须显式把构建目标改为 `/tenon/`。
[actions/configure-pages](https://github.com/actions/configure-pages)

### 3.3 Action/reusable workflow 的特殊风险

GitHub **不为被其他仓库调用的 Action 或 reusable workflow 提供重定向**。如果外部 workflow 使用
旧的 `owner/repository@ref`，仓库改名后会失败；官方建议不要依赖仓库重定向来兼容这类调用。
[Reusing workflow configurations](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)

本次本地扫描没有发现 `action.yml`、`action.yaml`、`workflow_call` 或
`uses: jefferysha/pipeline-worklfow/...`，所以当前仓库没有已识别的 GitHub Action/reusable workflow
调用面。这个结论只覆盖当前 checkout；改名前仍应在 GitHub Code Search、README、release 说明和下游
仓库中再查一次旧 `uses:` 引用。

## 4. 主要风险

| 风险 | 后果 | 当前证据 | 处理 |
| --- | --- | --- | --- |
| 只改仓库名，不改 VitePress base | 新站 HTML 可达但 asset、favicon、导航或搜索失效 | config、sync、smoke 均硬编码旧 base | 同一发布批次切换到 `/tenon/` 并重建 |
| 误以为旧 Pages URL 会重定向 | README、搜索结果和用户书签长期 404 | GitHub 官方把项目站 URL 列为例外 | 全量替换公开链接；把旧 URL 404 视为预期破坏性变化 |
| 先合并 `/tenon/`、后改仓库名 | 旧 Pages 在间隔期加载错误路径 | 当前 `/tenon/` 仍为 404 | 先准备分支；远程改名后立即合并并部署 |
| 先改仓库名、迟迟不发新 artifact | 新 Pages 在间隔期仍引用旧 base | 当前 main artifact 是 `/pipeline-worklfow/` | 将改名和 merge/dispatch 放在同一维护窗口 |
| 重新创建旧名仓库做跳转页 | 破坏 GitHub 提供的旧仓库/Git 重定向 | 官方明确警告不要复用旧名 | 不创建 `jefferysha/pipeline-worklfow` 新仓库 |
| 外部 Action/reusable workflow 仍引用旧仓库 | 下游 workflow 报 `repository not found` | GitHub Actions 不跟随仓库重定向 | 改名前做 GitHub 级别调用方搜索；发现后单独迁移 |
| Pages environment/rules 在改名后异常 | deploy job 等待或失败 | 当前已有 branch policy | 改名后只读复核 environment、Pages 与 workflow API |
| 浏览器/CDN 缓存 | 新部署后短时间仍显示旧内容或 404 | GitHub Pages 使用缓存/CDN | 用无缓存请求、API deployment 状态和多路径 smoke 交叉验证 |

## 5. 推荐迁移顺序

本 Change 要求不保留旧产品兼容层，因此推荐“**预备分支 + 单一维护窗口 + 新 URL 直接切换**”：

1. **冻结发布并再次做只读前检**
   - 确认 `jefferysha/tenon` 仍未被占用。
   - 记录当前仓库 ID、默认分支、Pages 配置、两个 workflow ID 和最后成功 deployment。
   - 搜索所有公开 `pipeline-worklfow`、`/pipeline-worklfow/`、旧 clone URL 与旧 `uses:`。
2. **在未合并分支准备完整迁移**
   - 把品牌、包/命令、仓库 URL、Pages base、llms 索引、smoke 门禁和公开文档统一改为 Tenon。
   - 重新生成受跟踪分发资产与文档站 artifact。
   - 至少运行 `npm run docs:sync`、`npm run docs:check`、`npm run docs:build`、
     `npm run docs:smoke`，并以 `/tenon/` 做本地 HTTP 浏览器验收。
   - 先把准备分支推到当前仓库，但不要让旧 Pages 发布 `/tenon/` artifact。
3. **远程改名**
   - 由管理员在 GitHub Settings → Repository name 执行，或使用官方
     `PATCH /repos/jefferysha/pipeline-worklfow`，body 为 `{"name":"tenon"}`。
   - 要求返回新 `full_name: jefferysha/tenon`；不得仅以 UI toast 作为成功证据。
4. **立即更新本地与自动化规范远程**
   - `git remote set-url origin https://github.com/jefferysha/tenon.git`
   - `git remote -v` 与 `git ls-remote origin` 复核。
   - 更新安装器、自动更新源、marketplace URL、README 和 release metadata 中的规范地址。
5. **立即合并准备分支并触发 Pages**
   - 合并到 `main`，让 `Documentation Pages` workflow 从新仓库上下文运行。
   - 如果 path filter 未触发，则使用现有 `workflow_dispatch`，不修改 Pages 权限模型。
6. **核验新站与 GitHub 状态**
   - 新仓库 API：`full_name=jefferysha/tenon`、仓库 ID 与改名前一致。
   - 新 Pages API：`html_url=https://jefferysha.github.io/tenon/`、`build_type=workflow`。
   - Actions：CI、Documentation Pages 均在新仓库 URL 下 active，最新 main run 成功。
   - HTTP：主页、中文/英文安装页、CSS/JS、logo、搜索索引和 404 页面均从 `/tenon/` 返回。
7. **验证迁移边界**
   - 旧仓库 Web URL应跳到新仓库。
   - 旧 Git URL 的 `git ls-remote` 应仍成功，但产品内不再发布旧地址。
   - 旧 Pages URL不作为通过条件；在无自定义域名方案下，其 404 是官方行为和本 Change 的预期破坏性结果。
   - 永久禁止重新占用 `jefferysha/pipeline-worklfow`。

这个顺序不能在无自定义域名时保证 Pages 完全零中断：仓库名与 site base 不可能原子切换。它把间隔限制在
远程改名与准备分支合并/部署之间。若业务要求零中断，必须先引入已验证的自定义域名，再执行仓库改名。

## 6. 回滚与恢复边界

- **代码未合并前**：取消改名窗口，不改远程；准备分支可继续修订。
- **仓库已改名、Pages 尚未成功**：优先修复 `/tenon/` artifact 并重新 dispatch，不要立刻复用旧名新建仓库。
- **必须回退仓库名**：可再次通过仓库设置/API 把同一仓库改回 `pipeline-worklfow`，同时恢复旧 Pages
  base 并重新部署；这是另一次外部变更，必须按完整验证流程执行。
- **自定义域名方案**：先验证域名所有权再绑定，避免域名接管风险；DNS 与 HTTPS 可能存在传播时间。
  GitHub 建议配置域名前先验证域名。[Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

## 7. 开放问题

1. **是否要求旧文档书签连续可用？** 当前 Change 的“不兼容”要求意味着答案默认为否；若改为是，必须先
   准备自定义域名，不能通过复用旧仓库名解决。
2. **Tenon 的正式文档域名是否已确定？** 当前 Pages API 的 `cname` 为 `null`，所以本次应以
   `https://jefferysha.github.io/tenon/` 为唯一可验证目标。
3. **是否存在 GitHub 之外的下游 `uses: jefferysha/pipeline-worklfow/...@...`？** 当前 checkout 未发现，
   但 GitHub 不为此类调用重定向；发布前需做组织/公开代码级搜索。
4. **GitHub Marketplace/Claude 插件入口是否缓存仓库 slug？** Git 重定向可以暂时保证 clone/fetch，
   但产品发布内容必须改为 `jefferysha/tenon`；具体 marketplace 刷新行为不在 GitHub Pages 官方资料
   的证明范围内，应由对应平台验收覆盖。
5. **远程改名由谁在何时执行？** 当前 API 显示登录身份对仓库有 admin 权限，但远程改名会立即改变公开
   URL，必须放在 Ship 阶段的同一维护窗口，而不是 Build 中提前执行。

## 8. 研究方法与来源

本调研围绕四个子问题展开：仓库/Git 重定向、Pages URL/base、Actions/Pages 发布、旧链接与人工边界。
阅读并交叉核对了以下 GitHub 官方资料：

1. [Renaming a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)
2. [What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
3. [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
4. [About custom domains and GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages)
5. [Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
6. [Reusing workflow configurations](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)
7. [Variables reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)
8. [REST API endpoints for repositories](https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#update-a-repository)
9. [REST API endpoints for GitHub Pages](https://docs.github.com/en/rest/pages/pages?apiVersion=2022-11-28#get-a-github-pages-site)
10. [actions/configure-pages](https://github.com/actions/configure-pages)

当前仓库事实由 `gh api`、`git remote -v`、代码只读搜索与两个 Pages URL 的 HTTP HEAD 请求复核。
外部事实与本地推断已分开陈述；本次没有执行任何远程写操作。
