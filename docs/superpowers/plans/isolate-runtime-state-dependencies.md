---
change: isolate-runtime-state-dependencies
design-doc: docs/superpowers/specs/isolate-runtime-state-dependencies-design.md
locale: zh-CN
---

# 实施计划

## 目标与边界

把产品路径解释权收敛到进程装配边界，让 Dashboard Server 与项目注册表迁移只消费显式依赖。
不改变环境变量优先级、机器目录布局、HTTP/CLI 契约、持久化格式或默认端口。

## 阶段 1：曳光弹——从装配入口贯通一个真实状态读写

1. 先在 `packages/server/src/server.test.ts` 增加失败用例：进程拥有共享运行环境时，显式注入的
   `ServerPaths` 仍决定健康检查、注册表与密钥路径。
2. 在 `packages/server/src/types.ts` 为 `DashboardServerOptions` 增加完整 `paths` 值对象依赖，
   在 `packages/server/src/server.ts` 优先消费该值对象。
3. 在 `packages/server/src/main.ts` 把已经解析的同一个 `ServerPaths` 交给 Server，消除生产入口的
   第二次解析。
4. 运行：
   `npx vitest run packages/server/src/server.test.ts packages/server/src/paths.test.ts`。

验收：测试夹具、健康响应和真实 Server 状态读写使用同一对象；共享环境无法覆盖显式路径。

**子阶段边界：此处建议 /clear**

## 阶段 2：收紧迁移应用服务的环境依赖

1. 在 `packages/cli/src/migration/legacy-project-registry.ts` 将 `env` 改为必填只读依赖，继续由
   kernel 的 `resolveProductPaths` 解释语义。
2. 更新 `packages/cli/src/migration/legacy-project-registry.test.ts` 与真实装配调用方，测试明确传入
   `{}`，生产明确传入当前环境。
3. 增加共享 `TENON_RUNTIME_HOME` 与 XDG 根的回归场景，断言独立 home 的注册表、迁移回执和锁互不串扰。
4. 运行：
   `npx vitest run packages/cli/src/migration/legacy-project-registry.test.ts packages/cli/src/commands/setupHost.test.ts`。

验收：省略 `env` 的调用无法通过类型检查；共享环境下所有状态仍落在调用方明确选择的路径。

**子阶段边界：此处建议 /clear**

## 阶段 3：统一测试夹具并重建发布资产

1. 让 Server 测试夹具只构造一次 `ServerPaths`，被测对象和断言复用同一快照。
2. 执行 `npm run build` 重建 CLI、Server 和 Dashboard 的受控 bundle 与类型声明。
3. 运行架构与发布新鲜度检查，确认源码、dist 和 immutable payload 一致。

验收：不再存在“被测路径”和“断言路径”分别读取全局环境的测试结构；受控 bundle 无陈旧实现。

**子阶段边界：此处建议 /clear**

## 阶段 4：全量验证与交付

1. 在共享运行根环境下重新运行最初失败的 Server 与迁移测试，证明 13 个失败归零。
2. 运行 `npm test`、`npm run check:architecture`、`npm run check:identity`、
   `npm run check:repository-hygiene` 和发布包审计。
3. 将 CI 修复提交到现有 Tenon 发布 PR，等待 GitHub Actions 全绿后应用主规格并归档 Change。

验收：本地全量门禁与远端 CI 均通过，当前 Git 树仍不存在受禁外部参考身份。

## 原型决策

不插入一次性原型。共享运行根已能稳定复现失败，`ServerPaths` 值对象、迁移入口与编译期依赖边界均已存在，
未知点是可由失败测试直接验证的装配缺陷，而不是未确定的数据模型或状态机。

## 验证矩阵

| 风险 | 证据 |
| --- | --- |
| Server 重新读取环境 | 显式 `paths` 与冲突环境并存的定向测试 |
| 迁移状态串扰 | 共享 `TENON_RUNTIME_HOME` 和 XDG 的多实例测试 |
| 生产入口双重解析 | `main.ts` 只解析一次并注入；bundle 检查 |
| 路径协议漂移 | kernel 路径测试与现有环境优先级测试 |
| 凭据跨作用域 | secrets、token、registry、pidfile 同源断言 |
| 发布资产陈旧 | build、freshness、Marketplace/npm/Pages allowlist 门禁 |

## 回滚

若显式依赖装配造成回归，回滚本 Change 的源码提交并重新构建受控资产；不修改用户状态文件、不迁移目录，
也不改变 active/previous release。由于磁盘格式与路径协议未变化，回滚不需要数据迁移。
