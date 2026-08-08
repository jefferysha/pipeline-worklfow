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

## 实现

- [x] 用失败测试打通 stable Release resolver → 冻结 tag/commit → Codex 重绑定 WAL → inventory proof → runtime activation tracer bullet。 (build)
- [x] 实现严格 latest stable 解析、版本比较、同版幂等、降级拒绝与无 mutation 失败关闭。 (build)
- [x] 将 Codex setup/install/update/host target plan 从 `main` 迁移到稳定版本标签。 (build)
- [x] 扩展 managed host desired-state 和恢复测试，覆盖 plugin/marketplace absent、目标 tag commit 与目标插件版本。 (build)
- [x] 保持交互首次 setup、curl/CI、手动 update、后台 update 的 Dashboard 行为一致且可诊断。 (build)
- [x] 同步 `1.0.2` 全部版本清单、公开命令、发布资产、用户文档和生成 bundle。 (build)

## 验证

- [ ] 运行定向测试、安装/更新/卸载集成测试、构建、bundle、skills、adapter 与 release 门禁。 (verify)
- [ ] 从已发布版本执行真实卸载、版本化全新安装、重复安装与一键更新验收。 (verify)
- [ ] 验证 CLI、Skills/hooks、managed runtime、Dashboard API/页面身份及用户数据保留。 (verify)

## 交付

- [ ] 完成代码评审、CI、非草稿 PR、合并与稳定 SemVer Release 发布。 (ship)
- [ ] 复核开放 PR 为零、本地 `main` 与远端一致，并用正式版本命令重装当前插件。 (ship)

## 归档

- [ ] 应用主规格、登记最终证据、归档 Change 并记录剩余风险。 (archive)
