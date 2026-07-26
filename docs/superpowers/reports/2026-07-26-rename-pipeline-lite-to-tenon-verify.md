# Tenon 全局迁移验证报告

> Change：`rename-pipeline-lite-to-tenon`
> 冻结构建：`f6787fc3a1247815b2a7db6a6c282d30cd9e5cb3`
> 本轮结论：失败，退回 Build 修复

## 已执行验证

- `npm run test:all`：通过；后端/集成 301 个文件、5208 个测试通过，5 个外部认证场景如实跳过；
  Dashboard 50 个文件、939 个测试通过。
- `npm run build`、身份、Skill、adapter、bundle、文档、架构、仓库卫生、npx、legacy bridge 与
  golden oracle 门禁：通过。
- 真实浏览器：18765 进度页正确显示终端来源且不混入自动运行；中文文档页 4 张 1440×900 WebP
  全部加载，Pages base 正确且无横向溢出。
- `openspec show rename-pipeline-lite-to-tenon --json --deltas-only`：通过，识别 17 个 delta。
- `openspec validate rename-pipeline-lite-to-tenon --strict`：通过。
- 隔离副本 `openspec archive rename-pipeline-lite-to-tenon --yes --json`：失败，未修改副本文件；
  真实 `openspec/specs/**` digest 未发生变化。

## 阻断问题

隔离归档在重建 `repository-architecture-compliance` 主规格时返回：

```text
archive_spec_validation_failed
Rebuilt spec for 'repository-architecture-compliance' failed validation.
No files were changed.
```

根因不是本 Change delta 缺少 scenario，而是既有
`openspec/specs/repository-architecture-compliance/spec.md` 只有 `## Requirements`，缺少
OpenSpec 1.6.0 当前严格格式要求的 `## Purpose`。单独运行
`openspec validate repository-architecture-compliance --strict` 可稳定复现同一错误。

## 处理决定

- 不在 Verify 写真实主规格，也不跳过隔离应用演练。
- 走 `verify-fail` 返回 Build。
- 在 Build 以最小格式迁移补充该现有主规格的 `Purpose`，不改变既有 Requirement 语义；补回归检查，
  然后重新冻结并执行完整 Verify。
