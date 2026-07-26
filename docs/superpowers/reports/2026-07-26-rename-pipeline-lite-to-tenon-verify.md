# Tenon 全局迁移验证报告

> Change：`rename-pipeline-lite-to-tenon`
> 上一冻结构建：`4752a95c1611a9fa99eec5d6be8e78587ba3d0b7`
> 当前结论：Build 根因修复及本地全量门禁通过，等待新冻结提交的独立 Verify

## 已执行验证

- `npm run build`：通过；CLI、server 与 Dashboard 受控 bundle 已重建。
- `npm run test:all`：通过；核心/集成 306 个文件、5245 个测试通过，5 个外部认证场景诚实跳过；
  Dashboard 50 个文件、939 个测试通过。
- `check:architecture` 扫描 588 个生产文件通过；身份、仓库卫生、注释可信度、文档、npx package、
  legacy bridge、default workflow freshness、golden oracle、文档站与 bundle 门禁全部通过。
- `bash tools/test-hooks.sh`：457/457；`bash tools/test-adapters.sh`：267/267；
  `bash tools/verify-skills.sh`：65 个路径引用、62 个 Skill 目录与 62 个安装 token 全部通过。
- 锁定提交 `570d3780…` 的 N−1 CLI 先通过
  `e0e2b5ba…` SHA 校验，再以完整历史 payload 读取当前 canonical Change：23/23 通过。
- OpenSpec 1.6.0：Change strict validate、隔离副本 archive/apply 与五个受影响 capability strict
  validate 全部通过；真实主规格 digest 前后均为
  `ad96f88699a651f1cab09659d229e78dc9175e5b22d26db7aa506b75c536f4f6`。
- 以 `6c874963..HEAD` 为范围的 844 个变更文件均已映射并回读 capability spec，详见
  `docs/superpowers/reports/2026-07-26-rename-pipeline-lite-to-tenon-file-spec-map.md`。

## 本轮根因修复

- 候选 Dashboard spawn 后的 scope 解析、健康探测和异常统一归入 lifecycle owner；所有非 ready 分支
  都先请求终止并等待真实 `exit`，确认退出返回 `failed`，无法确认才返回 `indeterminate`。
- CLI 与 server 健康探针都处理 response `aborted/error`，使用独立 wall-clock deadline 和 16 KiB
  body 上限，慢滴流、半响应和超大响应都在有界时间内失败。
- release compensation 增加真实 CAS 所有权失败注入：并发新 owner 已推进 selection 时，旧事务不能恢复
  旧 launcher，也不能覆盖新 owner 的稳定入口。
- server bundle 增加 fail-closed 参数契约；`--help` 只输出帮助且不绑定端口，未知参数拒绝执行。
- unmanaged server 不得跨 state scope 抢占或覆盖 managed release；managed 发布仍可接管旧版实例。
- 项目注册表迁移改为 setup 时一次性导入宿主 `.claude/.codex` 协议，再只读 Tenon canonical registry。
  路径解析归 kernel 单一所有者；退役产品专属目录只属于隔离的 legacy distribution channel，不进入
  当前 Tenon runtime 或 bundle。

## 下一步验证边界

- 冻结新的 Build SHA 后，由独立代码审查、隔离安装 E2E 与真实浏览器三路复核同一提交。
- 浏览器必须验证受管 18765、20 个迁移项目、Progress 的终端来源与 Auto Run 的 automation 来源不混淆，
  以及 README/中文 Pages 的桌面与移动图片版式。
- 独立复核通过前不把本报告升级为最终 PASS，也不推进 Ship。
