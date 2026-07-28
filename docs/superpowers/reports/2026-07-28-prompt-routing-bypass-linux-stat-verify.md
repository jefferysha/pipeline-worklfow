# Linux 只读 Hook 配置 identity 修复验证报告

## 结论

首次 Verify 结论为 **FAIL**，必须回退 Build 后重新冻结。

## 冻结范围

- 基线：`04181d015d3aac0968af83f357cf601652912531`
- 首次冻结：`1b7a36052eb356d73e623bc6c0c40fe3768b257a`
- 变更：GNU `stat -Lc` 优先、BSD `stat -f` fallback

## 已通过证据

- Standards/Spec 独立审查：Critical 0 / High 0 / Medium 0 / Low 0。
- macOS：`bash tools/test-hooks.sh`，511/511 通过。
- macOS：`bash -n hooks/hooks-config.sh tools/test-hooks.sh` 通过。
- macOS：`git diff --check` 通过。
- GNU/Linux 非 root 最小只读配置回归：原有 3/3 失败，修复后 3/3 通过。
- GNU/Linux 非 root 完整 hook suite：原有 13 个 identity 语义失败全部消失；容器 PID 1
  不回收 zombie 导致一个与本补丁无关的 cleanup 环境差异，GitHub runner 上该用例此前已通过。

## 阻断发现

Codex 独立轨构造了首个平台探针“写 stdout 后返回失败”的情形。当前 helper 使用直接
`stat ... || stat ...`，因此失败探针的 stdout 与成功 fallback 的 stdout 会拼接为两行；
调用方没有检查 helper 退出码，也没有验证完整输出必须为单一 `inode:size`。这违反 delta spec
中“失败的平台探针不得污染 identity stdout”的明确要求。

复现：

```text
polluting-fallback rc=0 lines=2 value=<pollution
7:8>
```

## 决策

不在 Verify 中修改产品代码。对确切 `verify-fail` event 留下 delegated review receipt，回退
Build；隔离每个探针的 stdout、验证单一数字 identity，并新增失败探针污染回归测试后重新冻结。

GitHub Actions run `30343849378` 针对首次冻结提交已启动；其结果不能替代上述规格失败。
