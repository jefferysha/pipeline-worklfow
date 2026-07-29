# 已应用规格

## 应用结果

- 日期：2026-07-28
- 结果：`changed`
- delta：
  `openspec/changes/prompt-routing-bypass/specs/prompt-routing-bypass/spec.md`
- delta SHA-256：
  `dfe4cf3529736576a61b084f7556d51a0c4ab19d60c4e8352b90b87d39adef00`
- main spec：`openspec/specs/prompt-routing-bypass/spec.md`
- before SHA-256：`absent`
- after SHA-256：
  `10426f6a709bbc4bd55a8bad19a383f55ee4e10ccbd5588b3c04810b984d29bf`

## 影响摘要

新增 4 个持久化 requirement，覆盖项目级旁路词、Dashboard API、仅当前轮的 UserPromptSubmit
旁路语义，以及可访问的中英文 Dashboard 管理状态。没有修改、删除或重命名既有 requirement。

## 校验

- Verify 隔离副本应用：新增 4，修改/删除/重命名 0。
- `openspec spec validate prompt-routing-bypass --strict`：PASS。
- 重复应用时，requirement 与 scenario identity 已存在即为 byte-preserving `no-op`，不得重复追加。
