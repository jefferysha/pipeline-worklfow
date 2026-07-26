# Tenon 全局迁移验证报告

> Change：`rename-pipeline-lite-to-tenon`
> 冻结构建：`e9153eeca887a0f97870443dc26ec755e88dac3e`
> 当前结论：失败，退回 Build 修复迁移生命周期与进程输出契约

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

## 冻结复核结果

- 代码审查验证上一轮两个 P1 与 CAS P2 已修复，定向 9 个文件、111/111 通过。
- 真实浏览器验收通过：受管 18765 精确匹配 release `sha256-411676fa…`、PID `34846`、
  state scope `sha256-v1-89b139…` 和 20 个项目；Progress 显示终端来源，Auto Run 不含
  `automation=off` 的目标 Change；Dashboard、中文 Docs、README 的桌面/375px 无 overflow、
  无 4xx/5xx、无 console error/warn。
- 用户清理 19 条测试项目注册后，canonical Tenon registry 已只剩当前项目；进一步复核发现现有迁移
  会在下次 setup 再读取旧宿主注册表，可能把这些项目重新导入。

## 新阻断问题

- `packages/server/src/main.ts` 的 help 与 invalid-argv 输出使用 `\\n`，真实 stdout/stderr 出现字面量
  反斜杠+n；parser 单测无法覆盖进程输出字节。
- `packages/kernel/src/product-paths.ts` 直接拥有 `.claude/.codex` 路径知识，违反 vendor-neutral kernel
  边界；宿主协议解析应属于 CLI migration/host adapter。
- 项目注册表“一次性迁移”没有版本化 receipt；每次 native setup 都重新扫描宿主文件，会复活用户已从
  Tenon 删除的旧项目。

## 处理决定

- 走 `verify-fail` 返回 Build，不把三项 P2 降级成发布后处理。
- 把宿主候选路径解析移回 CLI migration owner；kernel 只保留 Tenon 产品路径与通用原子原语。
- 在 Tenon state 域加入版本化 migration receipt，使用跨进程锁与原子发布；完成后永不再读取旧宿主来源，
  损坏 receipt 必须 fail-closed。
- 增加迁移二次执行/用户删除后不复活/并发执行，以及 server bundle stdout/stderr 精确字节测试。
