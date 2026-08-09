# 任务

## 立项

- [x] 核对远端默认分支、开放 PR、本地主干、当前插件来源与 Dashboard 健康状态。
- [x] 确认公开发布必须使用稳定版本号，不允许以 `main` 作为安装或更新通道。
- [x] 建立版本化发布生命周期 Change，并固定 `backend/full/default` 身份。

## 调研

- [x] 追踪安装、setup、update、uninstall、Release workflow、Marketplace ref 与 managed runtime 完整调用链。 (explore)
- [x] 验证当前版本/Tag/Release/manifest/payload 身份以及 Dashboard open/no-open 行为。 (explore)
- [x] 比较可实现的 latest stable 发现与固定版本安装方案，记录风险和推荐决策。 (explore)

## 规格

- [x] 编写版本化安装、更新、回滚、幂等重装和 Dashboard 提示的 delta spec。 (spec)
- [x] 形成可执行实施计划、失败恢复策略与版本升级清单。 (spec)
- [x] 根据 Verify 事实修订 v1.0.1 legacy bridge、候选复证、旧 WAL 与可信可执行文件契约。 (spec)
- [x] 冻结一次性 Review 验收矩阵，覆盖发布身份、状态机/并发、可信执行、N-1、Dashboard、文档、架构与 dist。 (spec)
- [x] 为每个开放条目绑定规格、失败测试、实现边界、验证命令和退出条件，并禁止移动候选出 verdict。 (spec)
- [x] 定义任意 Workflow/Pipeline 的 `review_budget`、attempt begin/complete、实例 override 与耗尽行为。 (spec)
- [x] 明确 Review lane 分类与计数口径：独立 code/spec/security/E2E/browser 验证聚合为一次候选 attempt，Build 紧反馈不扣次。 (spec)
- [x] 登记并重读修订后的 proposal/design/delta spec/plan/tasks，以 delegated review receipt 推进 Build。 (spec)

## 实现

- [x] 用失败测试打通 stable Release resolver → 冻结 tag/commit → Codex 重绑定 WAL → inventory proof → runtime activation tracer bullet。 (build)
- [x] 实现严格 latest stable 解析、版本比较、同版幂等、降级拒绝与无 mutation 失败关闭。 (build)
- [x] 将 Codex setup/install/update/host target plan 从 `main` 迁移到稳定版本标签。 (build)
- [x] 扩展 managed host desired-state 和恢复测试，覆盖 plugin/marketplace absent、目标 tag commit 与目标插件版本。 (build)
- [x] 保持交互首次 setup、curl/CI、手动 update、后台 update 的 Dashboard 行为一致且可诊断。 (build)
- [x] 同步 `1.0.2` 全部版本清单、公开命令、发布资产、用户文档和生成 bundle。 (build)
- [x] 在 candidate-resolved 恢复与 activation 前重新证明 frozen target、host identity 和 candidate payload。 (build)
- [x] 兼容读取 v1.0.1 缺 `serverVersion` 的 journal，并通过新健康探测补齐证明。 (build)
- [x] 冻结 installer/launcher 的绝对 Node/Bash 路径，并让 disabled exact registration 可通过 remove/add 修复。 (build)
- [x] 修正首次 setup 浏览器判据、setup 只读计划与 clean acceptance Dashboard 清理。 (build)
- [x] 同步一次性 v1.0.1 安装器迁移文档、受控 dist 和新增回归测试。 (build)
- [x] 在 staged payload 取版本并对源候选做 activation/ready 前 digest 复证，拒绝候选 TOCTOU。 (build)
- [x] 将 native lifecycle 冻结的绝对 Bash 传入 runtime payload verifier，禁止 PATH 回退。 (build)
- [x] 让公开安装器在任何宿主 remove/add 前证明远端不可变 tag/commit。 (build)
- [x] fresh native managed release 在 resolver/proof 成功前不写 WAL 或候选状态。 (build)
- [x] legacy 插件已消失时把旧 cleanup receipt 收敛为当前 completed v4 identity。 (build)
- [x] 为 `tenon doctor --json` 增加宿主/runtime/Dashboard 发布版本与 release digest 对账。 (build)
- [x] 在中英文 quickstart 固定版本化一键安装且明确不从源码编译，并纳入文档门禁。 (build)
- [x] fresh native 准备在首个宿主步骤前失败时清除 target-only WAL，允许下次命令重新解析更高稳定版本。 (build)
- [x] 将冻结的绝对 Bash 贯穿候选、已存 runtime、恢复、回滚与 doctor 复证，禁止任何裸 PATH 回退。 (build)
- [x] 为新 managed release 引入向后兼容的 manifest/hash v2：无歧义 payload 编码、host/stable target 身份，并保留 v1.0.1 读取与恢复。 (build)
- [x] 用真实 v1.0.1 launcher/WAL fixture 修复 `activating-runtime` 已提交崩溃窗口的单次迁移。 (build)
- [x] 修复 cleanup-pending 与 resolver 失败边界：单条 update 要么继续 latest，要么非零说明未完成，解析失败零写入。 (build)
- [x] 将同版 Dashboard 异常收敛为 Dashboard-only reconciliation，禁止重复 host rebind 或 runtime activation。 (build)
- [x] 强化 Dashboard recovery 与 doctor：精确校验 server version，并对账 stable tag/commit、host root 与 payload digest。 (build)
- [x] 统一全部中英文官方安装命令、legacy bridge 与 Dashboard 打开说明，并让门禁覆盖每个正式入口。 (build)
- [x] 让稳定 runtime bootstrap 严格双读 v1 legacy 与 v2 framed release identity，并用真实稳定 launcher 验证新激活 v2 与旧 v1 rollback。 (build)
- [x] 按宿主边界、候选准备与完成报告拆分 `update.ts`，保持公开命令契约且所有 CLI 生产文件低于硬性长度上限。 (build)
- [x] 兼容真实磁盘 v1.0.1 `setup/update` advanced WAL：successor 证明前原字节不变，证明后同 transaction 单次迁移。 (build)
- [x] 修复 rollback 与 stable launcher 崩溃边界：保留 hardened bootstrap，精确恢复 old/new partial launcher pair，第三状态失败关闭。 (build)
- [x] 修复 runtime audit 提交顺序、损坏尾行诊断、update failure audit warning 与公开 runtime identity 投影。 (build)
- [x] 将 installer/native executable 冻结升级为可复验的物理文件/父目录信任，覆盖 symlink/inode swap 与同 owner Homebrew 路径。 (build)
- [x] 修正 plugin-distribution/plugin-runtime 的 `MODIFIED Requirements`，并让 archive rehearsal 消除 `main/install.sh` 与 `pipeline` launcher 矛盾。 (build)
- [x] 固定真实公开 v1.0.1 N-1 payload/commit/digest，修复 workflow plan 兼容投影并让 `tools/test-bundle.sh` 全绿。 (build)
- [x] 将 `runtime repair --rollback` 绑定冻结 Bash 物理证明，并让 payload 的每次 Node spawn 使用冻结 nodePath。 (build)
- [x] 拒绝 executable 自身不可信 owner/write 位并绑定同 inode 原地改写 identity，保持 Homebrew/sticky 根兼容。 (build)
- [x] 用 capture-and-validate + exclusive publication 消除 launcher proof/write 覆盖第三方字节的 TOCTOU。 (build)
- [x] 用 `MODIFIED Requirements` 明确补偿保留当前 hardened bootstrap，并验证 archive 后 canonical 唯一。 (build)
- [x] 让 stable launcher 在 capture 后 public path 缺失的崩溃窗口按 owner marker/previous 精确恢复，并为 exact launcher 提供无副作用 fast-path。 (build)
- [x] 将冻结 Node 绑定贯穿 Dashboard spawn/restore/compensation，且 Doctor 对 Host/Bash/Git/Node 每次执行前复验物理身份。 (build)
- [x] 禁止 native lifecycle 从 physical binding 降级为 pathname，并在 Windows 冻结 batch host 与 `cmd.exe` 双重身份。 (build)
- [x] 为公开 installer host bridge 增加 durable phase journal、存活 owner lease、崩溃续跑与第三状态保护。 (build)
- [x] 在正式 Release published 事件执行公网版本化安装、重复安装、`tenon update --codex` 与 Dashboard/runtime 身份验收。 (build)
- [x] 按冻结矩阵 R01-R07 修复受控 dist、当前 Run V3、正式 Release/commit proof、launcher Node identity 与宿主并发边界。 (build)
- [x] 按冻结矩阵 R08-R14 修复 terminal audit、公网验收并发/超时、架构门、断言与中英文发布文档。 (build)
- [x] 对 R01-R14 逐项完成失败测试先红、最小实现转绿和定向验证，不接受弱化断言。 (build)
- [x] 在源码停止变更后双重构建，证明受控 dist 新鲜且候选 fingerprint 前后相同。 (build)
- [x] 实现并验证 R15：Workflow/Pipeline 可配置 Review 次数，显式 Review lanes 共用候选 attempt，跨进程持久且耗尽后在任何 Skill/agent/E2E 派发前停止。 (build)
- [x] 接受安全的 Codex host output-budget pragma，同时以可信 Skill 全字节比对继续拒绝截断回执。 (build)

## 验证

- [x] 运行定向测试、安装/更新/卸载集成测试、构建、bundle、skills、adapter 与 release 门禁。 (verify)
- [x] 在隔离环境验证 CLI、Skills/hooks、managed runtime、Dashboard API/页面身份及用户数据保留。 (verify)
- [x] 在有限 Review attempt 3/3 对最终冻结候选完成 standards/spec/e2e 聚合并确认零实现漂移。 (verify)

## 交付

- [ ] 完成代码评审、CI、非草稿 PR、合并与稳定 SemVer Release 发布。 (ship)
- [ ] 从已发布版本执行真实卸载、版本化全新安装、重复安装与一键更新验收。 (ship)
- [ ] 复核开放 PR 为零、本地 `main` 与远端一致，并验证正式插件、runtime、Dashboard 与项目数据。 (ship)

## 归档

- [ ] 应用主规格、登记最终证据、归档 Change 并记录剩余风险。 (archive)
