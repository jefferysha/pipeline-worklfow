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
