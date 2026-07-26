# 验证报告

## 验证范围

冻结基线 `058f1b8b37609a66f78d1caf3afe46140a6e5c32` 的 Server 路径注入、
项目注册表迁移环境依赖和 managed runtime 安装事务作用域。

## 执行命令

- `npx vitest run packages/cli/src/commands/release-coordinator.test.ts packages/cli/src/commands/runtime.test.ts packages/cli/src/commands/setup.test.ts packages/cli/src/commands/update.test.ts packages/cli/src/migration/legacy-project-registry.test.ts packages/cli/src/runtime/release-store.integration.test.ts packages/server/src/server.test.ts`
- `npm run build`
- `git diff 058f1b8^..058f1b8 -- packages/cli/src packages/server/src | codex exec ...`

## 结果

- 定向测试：7 个文件、359 项通过。
- 全栈构建：通过。
- Codex 冻结提交审查：`FAIL`。

## 失败与阻塞

1. `createDashboardServer({ home })` 仍可编译，但 `paths` 缺省时不再消费 `home`，
   可能把既有隔离调用静默导向真实进程状态目录。
2. `RuntimeInstaller.rollback` 在获取锁前后两次解析可变环境，存在锁目录与写目录不一致的窗口。
3. `cmdRuntime` 在子命令校验与错误映射之外读取 `homeDir()` / `runtimeEnv()`，
   环境提供器异常会逃逸既有 CLI 错误契约。

## 剩余风险

当前基线不得进入 Ship。需要回到 Build，消除上述隐式兼容行为、复用单一路径快照，并新增
公共 API、可变环境与环境提供器异常的回归测试后重新冻结和验证。

## 第二轮冻结基线

冻结基线 `46c6a5e5f4a9a6c0859ddefd51333810665dd371` 已修复第一轮的三项实现缺陷：

- `DashboardServerOptions.paths` 改为必填，`hostHome` 与产品状态路径分离；
- runtime rollback 在进入锁之前只生成一个不可变路径快照；
- runtime 子命令只在有效分支的错误边界内解析作用域。

定向测试、全量测试、构建、架构、身份、仓库卫生和发布资产门禁均已通过；冻结 SHA 已推送到
现有发布 PR。

## 第二轮 OpenSpec 隔离演练

执行：

- `openspec show isolate-runtime-state-dependencies --json --deltas-only`
- `openspec validate isolate-runtime-state-dependencies --strict`
- 在 `/tmp/tenon-openspec-verify.aw9jQx/repo` 隔离副本执行
  `openspec archive isolate-runtime-state-dependencies --yes --json`

真实主规格演练前后摘要均为
`e4d130e0b530a7b1eb419bff58f8baba6b888353e828507e1b561fb83da3e145`，未发生写入。
隔离归档返回 `archive_spec_update_failed`：`plugin-distribution` 的 `MODIFIED Requirement`
没有完整保留主规格已有的 4 个场景，官方应用器为防止场景丢失而拒绝归档。

## 第二轮结论

`FAIL`。实现修复可以保留，但当前 delta spec 不能进入 Ship。必须按
`verify-fail → build → requirements-changed → spec` 回退，补全被修改 Requirement 的全部既有场景，
重新登记和读取规格证据，再冻结新的 Build SHA 并重跑隔离演练与三轨验证。
