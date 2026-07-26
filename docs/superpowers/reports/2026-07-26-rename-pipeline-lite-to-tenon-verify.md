# Tenon 全局迁移验证报告

> Change：`rename-pipeline-lite-to-tenon`
> 冻结构建：`f450a87a5bb6ae69e843815315748b9906cd24e1`
> 本轮结论：失败，退回 Build 修复

## 已执行验证

- `npm run build`：通过；CLI、server 与 Dashboard 受控 bundle 已重建。
- `npm run test:all`：通过；后端/集成 302 个文件、5222 个测试通过，5 个外部认证场景诚实跳过；
  Dashboard 50 个文件、939 个测试通过。
- 产品路径、项目注册表、凭证、launcher、bootstrap、setup/update 与 Dashboard 定向测试：
  12 个文件、153 个测试通过；独立 E2E 再抽样 5 个文件、77 个测试通过。
- `bash tools/test-adapters.sh`：267/267；Skill、hook、身份、架构、仓库卫生、文档、npx pack、
  legacy bridge 与 golden oracle 门禁通过。
- 冻结 N−1 payload 模式：23/23，通过；CI 不再硬编码历史 CLI 文件名。
- OpenSpec 1.6.0：Change strict validate、隔离副本 archive/apply 与五个受影响 capability strict
  validate 全部通过；真实主规格 digest 前后均为
  `ad96f88699a651f1cab09659d229e78dc9175e5b22d26db7aa506b75c536f4f6`。
- 以 `6c874963..f450a87` 为范围的 821 个冻结变更文件均已映射并回读 capability spec，详见
  `docs/superpowers/reports/2026-07-26-rename-pipeline-lite-to-tenon-file-spec-map.md`。

## 阻断问题

独立 E2E 与冻结代码审查发现三个同属整包发布事务的阻断：

1. `RuntimeReleaseStore.stageAndActivate` 的锁在 selection 提交后结束，launcher 写入、Dashboard readiness
   与补偿不在同一个产品级事务中。并发 setup/update 可以交错；selection CAS 补偿失败后继续恢复稳定
   launcher，还可能覆盖另一个已提交事务。
2. Dashboard 的 `terminate()` 在 `kill()` 抛错、返回 false 或发出 SIGKILL 后立即视为完成，没有等待
   child `exit`。协调器可能在候选仍占用 18765 时启动 previous Dashboard，却报告已恢复。
3. 独立 E2E 按实施计划运行本地 npx tarball 的隔离首装 dry-run：

```text
HOME=<isolated> npm_config_cache=<isolated> \
  npx --yes --package fixture-tenon-1.0.0.tgz -- tenon setup --codex --dry-run
```

命令以 1 退出，stderr 为：

```text
tenon bootstrap: unsupported option: --dry-run
```

薄包的 `parseArgs` 只接受 host 与 `--auto-update`。这使 npx 入口无法执行计划明确要求的无副作用
安装预检，也说明 npx 与 Marketplace 尚未共享完整的 Setup 参数契约。tarball 内容审计本身通过，仅含
`LICENSE`、`README.md`、`bin`、`package.json`、`product` 五项；隔离 HOME 未被写入。

## 处理决定

- 不为某个失败分支增加局部重试或宽松透传，也不跳过 npx 隔离首装门禁。
- 走 `verify-fail` 返回 Build。
- 由 kernel 唯一路径模型提供产品级 managed transaction lock；setup、update 与 runtime repair 通过
  `RuntimeInstaller.withManagedTransaction` 串行覆盖 activation、launcher、Dashboard readiness 和补偿。
- Dashboard starter 改为 `ready|failed|indeterminate` 显式状态机；只有观察到 child `exit` 才允许回滚，
  无法确认时不改 selection、不启动 previous Dashboard。
- 薄 bootstrap 只在显式 Setup 参数模型中加入 `--dry-run`，并贯穿经 SHA-256 验证的 installer 调用；
  增加参数解析、生成 tarball与隔离 HOME 的零写入回归后重新冻结。
