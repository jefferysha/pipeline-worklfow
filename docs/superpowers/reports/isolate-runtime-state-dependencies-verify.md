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

## 第三轮冻结基线

冻结基线 `c8bb2916ae798e573862bf573063d84dcba3e517` 已补全第二轮丢失的主规格场景，并新增真实
CLI 入口、运行时环境提供器、迁移冲突和 `hostHome` 与产品状态目录分离的回归测试。

本轮执行并确认：

- `npx vitest run --maxWorkers=4 --minWorkers=1`：309 个文件，5269 项通过，5 项因真实凭证缺失
  按既有策略明确跳过；
- `npm run test:web`：50 个文件，939 项通过；
- `npm run build`：通过；
- 架构、产品身份、注释可信度、仓库卫生、default workflow 新鲜度、npx 包、迁移桥、
  文档和文档模板门禁：本地全部通过；
- OpenSpec 主规格演练前后摘要均为
  `e4d130e0b530a7b1eb419bff58f8baba6b888353e828507e1b561fb83da3e145`；
- `openspec validate isolate-runtime-state-dependencies --strict`：通过；
- 在 `/tmp/tenon-openspec-final.VQDoj9` 的隔离副本中归档成功，2 个受影响主规格严格校验通过，
  真实工作区主规格未被写入。

## 第三轮三轨结果

### Reviewer Agent

`FAIL`。冻结范围 `46c6a5e5f4a9a6c0859ddefd51333810665dd371..c8bb2916ae798e573862bf573063d84dcba3e517`
发现两个未被现有测试覆盖的作用域缺口：

1. `packages/server/src/server.ts` 的默认 `memFs` 仍调用无参数 `nodeMemFs()`，会绕过显式
   `hostHome` 并读取操作系统全局宿主目录。现有测试均显式注入 `nodeMemFs(home)`，遮蔽了生产默认
   wiring 的错误。
2. `tenon doctor` 的 `nativeRuntimeHost` 仍单独读取实时 `homedir()` / `process.env`，而同一
   doctor 命令的 AFK 探针消费缓存的 runtime 路径快照，导致一次真实命令仍可能存在两个产品
   runtime scope。

### Codex CLI

第三轨已按完整提交区间启动并检查冻结产物与实现；进程长时间未收敛，在 231488 token 后由主流程
终止，按 Verify 规范记为降级，不冒充通过。Reviewer Agent 的确定性复现和 CI 失败已经足以判定本轮失败。

### E2E

E2E 子轨在隔离副本中执行时未在时限内收敛，已中止；本轮不声明 E2E 通过。冻结范围的全量 Vitest、
Dashboard 测试、构建和 OpenSpec 隔离演练结果如上保留为已确认事实。

## PR CI 结果

发布 PR 的 `verify` job 真实失败：

- `bash tools/test-hooks.sh`：453 项通过，2 项失败；
- 两项失败均指向 review acknowledge 没有被调用；
- 根因是 `hooks/review-ack.sh` 先用 `command -v pipeline` 检查已经废弃的 CLI 名称，
  随后却调用 `tenon review acknowledge`。CI 只注入当前 `tenon` 启动器，因此函数在调用前错误返回。

这不是测试环境兜底问题，而是产品身份迁移不完整。修复必须以当前 Tenon CLI 为唯一稳定入口，并增加
Hook 级回归。

## 新增范围审计

用户要求当前仓库、发布包、命令、Dashboard 和文档中不得出现任何外部参考项目身份，并删除历史测试项目
及无关资产。只删除当前命中字符串不足以形成稳定架构，因此下一轮必须把以下约束纳入
`repository-architecture-compliance` / `plugin-distribution`：

- 当前跟踪树和生成发布资产不得含外部参考项目名称、URL 或品牌来源说明；
- 仓库卫生门禁使用集中式禁止身份表扫描路径与文本，并有可证明失败的测试；
- 删除不属于 Tenon 产品的历史测试项目、演示和对应 OpenSpec/文档资产；
- 不重写 Git 历史，不删除 Tenon 支持的真实宿主、标准、依赖或协议名称。

## 第三轮结论

`FAIL`。冻结基线不得进入 Ship。下一步按
`verify-fail → build → requirements-changed → spec`
受控回退，把作用域单一真相源、Tenon CLI 唯一身份、外部参考身份零残留和历史测试项目清理纳入同一
架构规格，再用 TDD 修复并重新冻结验证。
