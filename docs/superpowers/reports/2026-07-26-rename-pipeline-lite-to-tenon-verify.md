# Tenon 全局迁移验证报告

> Change：`rename-pipeline-lite-to-tenon`
> 冻结构建：`acd613ea841da024e2acf9bb6d53c4633c3fe80a`
> 当前结论：失败，返回 Build 统一项目注册表事务所有权

## 验证范围与新鲜证据

- `npm run build`：通过；CLI、server、Dashboard 与文档构建产物逐字节新鲜。
- 独立隔离 E2E：核心 307 个测试文件全部通过；隔离无 Docker 环境为 5237 通过、18 个诚实跳过，
  本机 Docker 环境为 5250 通过、5 个诚实跳过。
- Dashboard：50/50 个文件、939/939 个测试通过。
- hooks：457/457；adapters：267/267；N−1 bundle：23/23。
- `check:architecture`、`check:identity`、`check:comments`、`check:repository-hygiene`、
  docs、npx package、legacy bridge 与 Skill 分发门禁均通过。
- OpenSpec Change strict validate 与隔离副本 archive/apply 演练通过；本 Change 应用后的 5 份
  capability 主规格逐份 strict validate 通过。
- `origin/main...11e7b9b` 的 1171 条冻结 diff 记录均已映射并回读 capability spec；266 条已删除的
  受禁参考路径使用不可逆摘要登记，未在当前树重新引入名称。详见
  `docs/superpowers/reports/2026-07-26-rename-pipeline-lite-to-tenon-file-spec-map.md`。
- 当前树含 hidden/ignored 文件的受禁参考身份文本与路径扫描均为 0；repository hygiene 对路径和
  文本注入均 fail-closed。

## 浏览器与运行时验收

- 冻结实例 `19766` 的 Dashboard bundle 与 `acd613e` Git blob 摘要一致。
- Progress 在桌面与 375px 显示 1 个项目、目标 Change 为“终端运行中 / 05 验证”；Auto Run
  不包含该任务并显示“当前没有自动运行任务”。
- 中文 Dashboard、Docs、README 桌面与 375px 均无根页面横向溢出；四张正式图片均真实加载为
  1440×900；目标页面 console error/warn 为 0。
- 正式 `18765` 尚运行前一受管 release，不属于 `acd613e`；必须在 Ship 更新后对正式实例重跑 smoke。

## 三轨复核

- 独立代码审查：失败，发现一项 P1 注册表并发丢更新和一项 P2 receipt 语义校验缺口。
- 独立 E2E：通过；迁移中断恢复精确验证 `imported=1`、`ensured=2` 且不重读宿主文件。
- 独立真实浏览器：通过；冻结 bundle、桌面/移动、来源区分、Pages base、19 个网络请求均通过。
- Codex CLI 轨：宿主仍加载旧插件并要求为只读审查创建新 workflow，未产生有效冻结 diff 结论；
  本轮按降级处理，不把它记为通过。

## 已关闭的前序阻断

1. Pages build job 已在上传和 deploy 前执行 repository hygiene；deploy 只依赖该已受门禁的 build。
2. legacy registry 已在首次写入前原子发布 pending snapshot，部分失败后从 snapshot 幂等恢复且不重读
   host；completed receipt 仍保证用户后续删除不复活。
3. 无 Docker 集成测试已按生产 fail-loud 契约断言 exit 1；隔离无 Docker 环境通过。
4. `imported` 已只累计本次真实写入，receipt 用独立 `ensured` 记录最终保证存在数。

## 新阻断问题

1. Dashboard add/remove 仍自行执行无锁 read-modify-write；迁移的 `registerProjectRoot()` 虽有 config-dir
   锁，但不是所有 writer 的共同事务边界。并发探针已复现双方均报告成功而最终丢项目；迁移随后仍可写
   completed receipt，造成永久失真。
2. receipt codec 只检查非负整数，未约束 `imported <= ensured <= discovered`；语义矛盾的合法 JSON
   会被接受为 already-complete。

## 处理决定

- 走 `verify-fail` 返回 Build。
- kernel 提供项目注册、注销的唯一锁内事务 API；CLI 迁移与 Dashboard add/remove 全部复用同一个
  config-dir lock，不允许 server 再自行读改写。
- receipt codec 对新 receipt 强制 `imported <= ensured <= discovered`；兼容读取无 `ensured` 的旧
  receipt 时按 `ensured=discovered` 解释，并同样校验关系。
- 增加真实并发回归与矛盾 receipt fail-closed 测试，修复后重新冻结并重跑三轨。
