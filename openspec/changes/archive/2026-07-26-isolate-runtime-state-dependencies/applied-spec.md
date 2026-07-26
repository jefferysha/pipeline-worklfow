# 运行时状态依赖隔离主规格应用收据

## 应用信息

- Change：`isolate-runtime-state-dependencies`
- 日期：`2026-07-26`
- 阶段：`ship`
- 结果：`changed`
- 验证：`openspec validate <capability> --type spec --strict`
- 隔离演练：`openspec archive isolate-runtime-state-dependencies --yes --no-validate`

Ship 先在隔离克隆中使用 OpenSpec 官方归档算法生成预期主规格，再把完全相同的 Requirement 与
Scenario 差异应用到真实树。应用只修改两个声明的 capability，不覆盖无关需求。

## 逐规格结果

### plugin-distribution

- delta：`openspec/changes/isolate-runtime-state-dependencies/specs/plugin-distribution/spec.md`
- main：`openspec/specs/plugin-distribution/spec.md`
- before：`sha256:6b29b18614e27d129b6e16a3d50c16afbf8f42cea78d6afcc27de71e24f399bb`
- after：`sha256:346ac3a93a00032006fdd89b8911e528d7fb4edaebf182c09d581c688b3f458e`
- effect：`changed`
- 摘要：补齐 Server 路径装配、hostHome 隔离、Tenon 单一命令入口与 doctor 单快照契约。

### repository-architecture-compliance

- delta：`openspec/changes/isolate-runtime-state-dependencies/specs/repository-architecture-compliance/spec.md`
- main：`openspec/specs/repository-architecture-compliance/spec.md`
- before：`sha256:818f01ec93f325bd04d13750ce29bb7529dca531536db02a906865c79d6d29c0`
- after：`sha256:cf141f5b4ea0a673022ff7b071e1f16710f6affe6f6c198cc45f096a2a18a03e`
- effect：`changed`
- 摘要：补齐显式运行环境依赖、历史测试资产清理和外部参考身份零明文门禁。

## 交付证据

- 隔离演练结果：`+1 requirement`、`~4 requirements`、`0 removed`。
- 两份真实主规格的 Requirement/Scenario 内容与隔离演练生成结果一致；真实树按仓库规范移除
  OpenSpec CLI 额外生成的 EOF 空白行，`git diff --check` 通过。
- 未发现 Requirement 或 Scenario 身份冲突。
- 主规格应用未执行历史重写；被删除资料仍可从既有 Git 提交对象恢复。
