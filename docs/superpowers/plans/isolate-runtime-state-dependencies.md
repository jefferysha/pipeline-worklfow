---
change: isolate-runtime-state-dependencies
design-doc: docs/superpowers/specs/isolate-runtime-state-dependencies-design.md
locale: zh-CN
---

# 实施计划

## 目标与边界

把产品路径解释权收敛到进程装配边界，让 Dashboard Server 与项目注册表迁移只消费显式依赖。
同时收敛 Tenon CLI 产品身份与仓库当前树边界：删除外部参考身份和历史测试项目，建立覆盖路径、文本
与发布前检查的集中门禁。不改变环境变量优先级、机器目录布局、HTTP/CLI 契约、持久化格式或默认端口，
不重写 Git 历史。

## 阶段 1：曳光弹——从装配入口贯通一个真实状态读写

1. 先在 `packages/server/src/server.test.ts` 增加失败用例：进程拥有共享运行环境时，显式注入的
   `ServerPaths` 仍决定健康检查、注册表与密钥路径。
2. 在 `packages/server/src/types.ts` 将完整 `paths` 值对象定义为 `DashboardServerOptions`
   的必填依赖；从 `ServerPaths` 删除宿主字段，宿主发现目录统一改用正交的 `hostHome`。
3. 在 `packages/server/src/server.ts` 只消费该路径对象，不提供环境解析 fallback。
4. 在 `packages/server/src/main.ts` 把已经解析的同一个 `ServerPaths` 交给 Server，消除生产入口的
   第二次解析。
5. 运行：
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
2. 让 `RuntimeInstaller.rollback` 在加锁前解析一次路径并在锁内复用，增加动态环境回归测试。
3. 把 `cmdRuntime` 与真实 CLI 入口的作用域解析移入对应子命令错误边界；无效或不完整命令不得
   读取环境，并用 dist 进程级测试覆盖损坏 root contract。
4. 让 skills registry、AFK readiness 与 runner locator 全部从同一个 `hostHome` 派生宿主目录，
   并用 `hostHome !== paths.homeDir` 的回归场景固定边界。
5. 执行 `npm run build` 重建 CLI、Server 和 Dashboard 的受控 bundle 与类型声明。
6. 运行架构与发布新鲜度检查，确认源码、dist 和 immutable payload 一致。

验收：不再存在“被测路径”和“断言路径”分别读取全局环境的测试结构；受控 bundle 无陈旧实现。

**子阶段边界：此处建议 /clear**

## 阶段 4：曳光弹补强——真实宿主会话与 doctor 单快照

1. 先在 `packages/server/src/server.test.ts` 增加失败用例：不注入 `memFs`，并让 `hostHome`、
   `paths.homeDir` 与 OS home 三分离；只在 `hostHome` 写入匹配 session，真实
   `/api/mem/session-link` 必须找到它。
2. 在 `packages/server/src/server.ts` 让默认 `nodeMemFs` 显式绑定 `hostHome`，保持注入式测试
   adapter 兼容。
3. 先在 `packages/cli/src/commands/doctor.test.ts` 或真实入口集成测试增加 provider 计数与动态环境失败
   用例，证明一次 doctor 只解析一次 runtime scope。
4. 重构 `packages/cli/src/main.ts` 的 doctor 装配，让 native runtime 与 AFK readiness 消费同一
   memoized snapshot。
5. 运行相关 Server/CLI 定向测试，保留红→绿输出。

验收：默认生产 wiring 不再读取 OS home；doctor 的 runtime provider 读取次数固定为一次。

**子阶段边界：此处建议 /clear**

## 阶段 5：Tenon 唯一身份与当前树清理

1. 用现有 `bash tools/test-hooks.sh` 的两项失败作为红灯，在 `hooks/review-ack.sh` 统一使用当前
   `tenon` 启动器做发现和调用，禁止添加旧命令兼容。
2. 在 `tools/check-repository-hygiene.node-test.mjs` 先增加第三类外部参考身份与历史测试项目资产族
   的失败测试；身份值使用机器构造，测试源码不得出现受禁明文。
3. 在 `tools/check-repository-hygiene.mjs` 扩展集中式禁止身份表和测试项目路径规则，保证路径与文本
   无豁免扫描、错误输出脱敏。
4. 将 `skills/tenon/SKILL.md`、`skills/tenon-build/SKILL.md` 中的外部品牌来源改写为
   “用户自有 DESIGN.md / Tenon 自定义设计规范”。
5. 删除历史测试项目的 `design-demos`、配套文档、OpenSpec 主规格与 archive；检查所有发布
   allowlist、README、文档站和生成资产均不引用被删内容。
6. 若清理发现新的可再生路径，补入 `.gitignore`，但不依赖 ignore 掩盖已跟踪文件。

验收：`git ls-files` 当前树无受禁身份、无历史测试项目资产族；hook suite 和 repository hygiene
定向测试转绿。

**子阶段边界：此处建议 /clear**

## 阶段 6：全量验证与交付

1. 在共享运行根环境下重新运行最初失败的 Server 与迁移测试，证明 13 个失败归零。
2. 运行 `npm test`、`npm run test:web`、`npm run test:hooks`、
   `npm run check:architecture`、`npm run check:identity`、
   `npm run check:repository-hygiene`、文档和发布包审计。
3. 重建 CLI、Server、Dashboard、Marketplace 与 npx 受控资产，检查当前树和 tarball 均无受禁身份。
4. 将修复提交到现有 Tenon 发布 PR，等待 GitHub Actions 全绿后应用主规格并归档 Change。

验收：本地全量门禁与远端 CI 均通过，当前 Git 树和全部可发布资产不存在受禁外部参考身份或历史
测试项目。

## 原型决策

不插入一次性原型。共享运行根已能稳定复现失败，`ServerPaths` 值对象、迁移入口与编译期依赖边界均已存在，
未知点是可由失败测试直接验证的装配缺陷，而不是未确定的数据模型或状态机。

## 验证矩阵

| 风险 | 证据 |
| --- | --- |
| Server 重新读取环境 | 显式 `paths` 与冲突环境并存的定向测试 |
| Server 漏传路径 | 编译期拒绝 `createDashboardServer` 的缺失 `paths` 调用 |
| 宿主资产借用产品 home | `hostHome !== paths.homeDir` 时 skills/readiness/runner 只读取 hostHome |
| 默认 mem session 借用 OS home | 不注入 `memFs` 的真实 HTTP 测试只从 `hostHome` 找到 session |
| 迁移状态串扰 | 共享 `TENON_RUNTIME_HOME` 和 XDG 的多实例测试 |
| runtime 锁与写入跨根 | 动态环境探针证明 rollback 只读取一次并复用路径快照 |
| CLI 环境解析失败 | 单元测试与真实 dist 进程均证明 status/repair 映射稳定错误；无效子命令环境读取次数为零 |
| doctor 子探针作用域漂移 | provider 计数与动态环境测试证明同一命令只解析一次 |
| Hook 依赖旧命令 | 只注入 `tenon` 的 hook suite 确认 manual/delegated acknowledge 均执行 |
| 外部参考身份回归 | 集中式身份表的路径/文本红绿测试与全树扫描 |
| 历史测试项目残留 | 资产族路径测试与 `git ls-files` 审计 |
| 生产入口双重解析 | `main.ts` 只解析一次并注入；bundle 检查 |
| 路径协议漂移 | kernel 路径测试与现有环境优先级测试 |
| 凭据跨作用域 | secrets、token、registry、pidfile 同源断言 |
| 发布资产陈旧 | build、freshness、Marketplace/npm/Pages allowlist 门禁 |

## 回滚

若显式依赖装配造成回归，回滚本 Change 的源码提交并重新构建受控资产；不修改用户状态文件、不迁移目录，
也不改变 active/previous release。删除的测试项目可从 Git 既有提交恢复，但恢复后必须重新通过身份与
仓库卫生门禁。由于磁盘格式与路径协议未变化，回滚不需要数据迁移。
