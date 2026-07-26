# Tenon 全局迁移验证报告

> Change：`rename-pipeline-lite-to-tenon`
> 冻结构建：`df7837bfb51f53119a36ce49087f2ad19fc0ac50`
> 当前结论：失败，返回 Build 修复三项发布门禁

## 验证范围与新鲜证据

- `npm run build`：通过；CLI、server、Dashboard 与文档构建产物已重建。
- 独立隔离 E2E：核心 307 个测试文件中 306 个通过、1 个失败；5235 个测试通过、
  1 个失败、18 个环境分支跳过。
- Dashboard：50/50 个文件、939/939 个测试通过。
- hooks：457/457；adapters：267/267；N−1 bundle：23/23。
- `check:architecture`、`check:identity`、`check:comments`、`check:repository-hygiene`、
  docs、npx package、legacy bridge 与 Skill 分发门禁均通过。
- OpenSpec strict validate 与隔离副本 archive/apply 演练通过；真实主规格 digest 前后均为
  `ad96f88699a651f1cab09659d229e78dc9175e5b22d26db7aa506b75c536f4f6`。
- `origin/main...df7837b` 的 1156 条冻结 diff 记录均已映射并回读 capability spec；266 条已删除的
  受禁参考路径使用不可逆摘要登记，未在当前树重新引入名称。详见
  `docs/superpowers/reports/2026-07-26-rename-pipeline-lite-to-tenon-file-spec-map.md`。
- 当前树含 hidden/ignored 文件的受禁参考身份文本与路径扫描均为 0；repository hygiene 对路径和
  文本注入均 fail-closed。

## 浏览器与运行时验收

- 冻结实例 `19766` 的 Dashboard bundle 与 `df7837b` Git blob 摘要一致。
- Progress 在桌面与 375px 显示 1 个项目、目标 Change 为“终端运行中 / 05 验证”；Auto Run
  不包含该任务并显示“当前没有自动运行任务”。
- 中文 Dashboard、Docs、README 桌面与 375px 均无根页面横向溢出；四张正式图片均真实加载为
  1440×900；目标页面 console error/warn 为 0。
- 正式 `18765` 尚运行前一受管 release，不属于 `df7837b`；必须在 Ship 前更新并对正式实例重跑 smoke。

## 三轨复核

- 独立代码审查：失败，发现两项 P1。
- 独立 E2E：失败，发现一项测试契约漂移。
- Codex CLI 轨：宿主仍加载旧插件并要求为只读审查创建新 workflow，未产生有效冻结 diff 结论；
  本轮按降级处理，不把它记为通过。

## 阻断问题

1. `.github/workflows/docs-pages.yml` 的独立 Pages 发布链没有执行
   `npm run check:repository-hygiene`。主 CI 与 Pages workflow 并行，主 CI 失败不能阻止 Pages 部署，
   因而不满足“Pages 发布前零参考身份”契约。
2. `legacy-project-registry` 逐项写 registry、最后写 receipt；若中途失败，下一次 setup 会因 registry
   已存在而跳过宿主来源，并可能把不完整迁移记为完成。一次性迁移尚未形成失败可重试事务。
3. `afk-run.integration.test.ts` 的无 Docker 用例仍断言 exit 0；生产契约明确“有候选但 Docker 不可用”
   返回非零。测试标题和断言落后于真实 fail-loud 契约。

## 已确认修复

- server `--help` 与未知参数的换行、退出码和不监听行为已由真实进程测试覆盖并通过。
- kernel 已不再拥有宿主专属路径知识；相关解析位于 CLI migration owner，架构 guard 已覆盖。
- 项目迁移成功、重复执行、并发与损坏 receipt 分支通过；仅部分提交失败恢复仍阻断。
- 冻结前清理的外部参考调研、演示、归档和本地 ignored 运行产物均未回到当前树。

## 处理决定

- 走 `verify-fail` 返回 Build。
- 将 repository hygiene 接入 Pages build 的发布依赖链。
- 把项目注册表迁移改为可恢复的 staged transaction：持久化候选快照与进度，逐项幂等提交，只有全部
  成功后写 completed receipt；失败重跑继续未完成项，canonical registry 的用户后续删除仍保持权威。
- 将无 Docker 集成测试改为断言非零与明确诊断，不改变正确的生产行为。
- 修复后重新提交、冻结 SHA，并重跑核心、三轨与正式 `18765` 验收。
