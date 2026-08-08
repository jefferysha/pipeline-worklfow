# 已应用主规格

## 应用结论

- Change：`pr-7-merge-audit`
- phase：`ship`
- verify result：`pass`
- 应用日期：`2026-08-08`
- OpenSpec 隔离演练版本：`1.8.0`（当前 latest）
- 结果：`no-op`

## Delta → main spec

| Delta | Main spec | Delta SHA-256 | Before SHA-256 | After SHA-256 | 结果 |
| --- | --- | --- | --- | --- | --- |
| `openspec/changes/pr-7-merge-audit/specs/context-bundle-budget-preview/spec.md` | `openspec/specs/context-bundle-budget-preview/spec.md` | `7f086c8d04739c86282b60bca939a7801f978393036069f75a4eb98e5e4de56b` | `63b4ffdc73dac17b4063e0aadc7c063d2312633ef8da6e5941711ac885ac045d` | `63b4ffdc73dac17b4063e0aadc7c063d2312633ef8da6e5941711ac885ac045d` | `no-op` |

## 应用内容

- 六条 `MODIFIED` requirements 已与当前主规格完整一致，23/23 个场景标题、正文和 requirement narrative 均逐字保留。
- 已知场景“加载与 reduced motion”完整保留；没有缺失、重命名、弱化或额外产品范围。
- 当前主规格已经包含 delta 的全部语义，因此 Ship 应用保持 byte-preserving no-op。

## 冲突与幂等

- 当前 OpenSpec CLI 1.8.0 的真实隔离归档回放为 `+0 / ~0 / -0`、`specsUpdated: false`，主规格 SHA-256 应用前后不变。
- 仓库固定 OpenSpec CLI 1.6.0 报告 `~6`，但结构化比较确认 6 个 requirements、23 个场景及所有正文完全相同，唯一差异是文件末尾额外 LF；工作区不引入该格式噪声。
- 再次应用必须保持相同 digest，不得重复追加、删除或改写场景。

## 校验

- `npx -y @fission-ai/openspec@latest validate pr-7-merge-audit --type change --strict --no-interactive` exit 0。
- `npx -y @fission-ai/openspec@1.6.0 validate pr-7-merge-audit --type change --strict --no-interactive` exit 0。
- 两个版本的真实隔离归档回放后 `validate --all --strict --no-interactive` 均为 41/41 passed。
