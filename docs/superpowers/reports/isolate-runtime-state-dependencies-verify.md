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

## 第四轮冻结基线

冻结基线 `29c36ef7f2f25af7527475f519e0459381996c5a` 完成第三轮全部阻断项：

- Server 默认 `memFs` 由显式 `hostHome` 构造，不再回读操作系统 home；
- `tenon doctor` 的 native runtime 与 AFK 探针共享同一个冻结 runtime scope；
- review acknowledge hook 的可用性检查与执行都只依赖 `tenon` launcher；
- 当前树、生成 bundle 与分发资产中的外部参考身份及历史测试项目身份均为零；
- 历史测试项目的 demo、研究/ADR、OpenSpec 主规格与 archive 已从当前树删除，Git 历史仍作为恢复边界。

## 第四轮新鲜验证

- 定向回归：7 个文件、82 项通过；清理后的路由、指纹、稳定 hook 回归另有 4 个文件、17 项通过；
- 后端/共享全量：310 个文件、5272 项通过，5 项因真实凭证缺失按既有策略明确跳过；
- Dashboard：50 个文件、939 项通过；
- hook：457/457；adapter：267/267；bundle：23/23；
- `npm run build`、`check:architecture`、`check:identity`、`check:comments`、
  `check:repository-hygiene`、default workflow freshness、文档、文档模板、npx package、
  legacy bridge 和迁移 CAS 全部通过；
- Golden oracle 的 5 组 fixture 双跑为 0 处不一致；
- 双语文档站共 32 个唯一路由，确定性检查、构建和 smoke 全部通过；
- `openspec validate isolate-runtime-state-dependencies --strict` 通过；
- 隔离副本 `/tmp/tenon-openspec-current.6yhoOL` 的官方 archive/apply 演练成功，
  `plugin-distribution` 与 `repository-architecture-compliance` 主规格 strict validate 通过；
  演练后临时副本已删除，真实工作区主规格未被写入；
- 当前树含隐藏本地运行态和生成 bundle 的受禁身份扫描为零；仓库卫生门禁对外部身份文本、
  历史测试项目路径/文本和错误脱敏输出均有红灯回归。

## 第四轮三轨结果

### Reviewer Agent

`PASS`。独立隔离 clone 审查
`c8bb2916ae798e573862bf573063d84dcba3e517..29c36ef7f2f25af7527475f519e0459381996c5a`，
P0/P1/P2 均无发现。Reviewer 重跑 363 项定向测试、5272 项全量测试、939 项 Dashboard 测试、
hook、adapter、bundle 及全部架构/身份/卫生门禁，结论与主线一致。

### E2E Agent

`PASS`。独立 clone `/private/tmp/tenon-verify-29c36e.ofvCsY/repo` 完成：

- 不注入 `memFs` 的真实 HTTP hostHome 隔离；
- 冲突 `HOME` / `TENON_RUNTIME_HOME` / `XDG_*` 下真实 dist `tenon doctor --json`；
- 只提供 `tenon` launcher 的 manual/delegated review acknowledge；
- 外部身份和历史测试项目路径/文本 fail-closed；
- 仅 5 个文件的本地 npx tarball 离线黑盒 `tenon --help` 与 fake-host Marketplace 安装事务。

失败清单为 0，最终 clone 的 `git status` 与 `git diff` 为空。

### Codex CLI

第三轨启动后被本机尚未刷新会话的旧插件 hook 强制读取错误的历史技能副本，且未产生最终审查结论；
主流程立即终止该进程并按规范记为降级，不把错误宿主证据计作通过。独立 Reviewer、独立 E2E、
主线全量验证与远端 CI 仍全部审查精确冻结 SHA。

## PR CI

PR `#3` 对冻结提交的最新检查全部收敛：

- `build`：通过；
- `verify`：通过（5 分 54 秒）；
- Pages `deploy` 在 PR 事件按 workflow 设计跳过，合并 `main` 后执行。

CI 内架构、产品身份、仓库卫生、npx、迁移桥、构建产物新鲜度、双语文档、全量 Vitest、
Dashboard、hook、adapter、bundle 和 Golden oracle 均通过。仓库未配置真实 Codex 凭证，
对应 H14 步骤按 CI 的诚实 skip 契约明确跳过。

## 第四轮结论与剩余风险

`PASS`，允许进入 Ship。已知剩余风险：

- `npm ci` 报告 7 个第三方依赖告警（5 moderate、1 high、1 critical），本 Change 不包含依赖升级，
  后续应单独建立安全审计 Change；
- 公网 npm scope 尚未配置仓库变量与 token，因此本轮只证明 npx 可发布包和离线执行，不宣称已发布；
- 正式 Dashboard 与 Pages 只能在合并 `main` 并部署后做最终公网/正式端口验收。
