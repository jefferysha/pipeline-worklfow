# pr-7-merge-audit OpenSpec 兼容性 Verify 失败报告

## 冻结对象

- Change：`pr-7-merge-audit`
- build SHA：`e258856111825ff600558839c79ade8303d89fc8`
- base：`733b30fa85c7e7c4361dc8d63e7aa2ee24f01ec8`（`origin/main`）
- PR：<https://github.com/jefferysha/tenon/pull/38>

## 已通过证据

- OpenSpec 1.8.0 strict validate：通过。
- OpenSpec 1.8.0 隔离 archive：exit 0、`specsUpdated=false`，主 spec SHA-256 前后均为
  `63b4ffdc73dac17b4063e0aadc7c063d2312633ef8da6e5941711ac885ac045d`。
- 5 条 `MODIFIED` requirement 与 current main 完整一致，22/22 个既有场景保留；
  “加载与 reduced motion”已恢复。
- 独立 reviewer：C0/H0/M0/L0；Node 22 官方 OpenSpec 门禁 42/42 通过。

## 阻断发现

**H1 — 仓库固定 OpenSpec 1.6.0 无法归档已存在的 `ADDED` requirement。**

在 `/tmp/pr7-pinned-replay.0RU2OH/repo` 的独立 clone 中，对冻结提交直接运行仓库固定 CLI：

```bash
/opt/homebrew/bin/node \
  /Users/a1234/.codex/worktrees/2f64/pipeline-worklfow/node_modules/@fission-ai/openspec/bin/openspec.js \
  archive pr-7-merge-audit -y --json
```

结果 exit 1，且在写文件前失败：

```text
context-bundle-budget-preview ADDED failed for header
"### Requirement: Context Bundle preview 与 Verify evidence SHALL 在 Dashboard 共存" - already exists
```

最新版 1.8.0 会把相同内容识别为零 mutation，但仓库官方固定版仍失败。现有 delta 把已存在于
current main 的完整 requirement 声明为 `ADDED`，因此不能声称两条官方路径都可执行归档。

## 决策与恢复路径

1. 对确切 `verify-fail` 生成 review receipt，并按用户持续授权 delegated acknowledge。
2. 官方 transition 回到 Build，再以 `requirements-changed` 返回 Spec。
3. 将该完整 requirement 从 `ADDED` 移入 `MODIFIED`；正文与场景保持 current main 原文，
   不删除、改名、弱化或扩展产品功能。
4. 将最新版验证解析并固定为 1.8.0：先记录 latest 解析结果，再用 `@1.8.0` 重放，避免未来
   `@latest` 漂移改变证据。
5. 重新登记、review、冻结新 SHA，并分别以 1.6.0 和 1.8.0 做隔离 archive 重放。

## 不适用证据

冻结 diff 不包含 UI、API、运行时或产品源码变化，因此浏览器/API 行为验收不适用；
这不是浏览器通过声明。
