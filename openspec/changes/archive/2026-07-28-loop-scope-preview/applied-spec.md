# Loop 路径作用域预检主规格应用记录

## 应用结果

- date：`2026-07-28`
- result：`changed`
- source delta：`openspec/changes/loop-scope-preview/specs/loop-scope-preview/spec.md`
- source SHA-256：`811276b6a7cd8dbcbb5dfc21095bb63a024ab54b44ebd243f4f9581a46cca267`
- target main spec：`openspec/specs/loop-scope-preview/spec.md`
- before SHA-256：`absent`
- after SHA-256：`65917ae9e1459e97216d9afb0a90f7bf3ed11ea7470199d6124ed7a5b9298692`

## 持久化效果

新增 `loop-scope-preview` 主规格，包含 5 个 requirements 与 21 个 scenarios：
kernel 逐路径解释、受保护且无副作用的 API、预检非许可边界、Dashboard 完整交互以及
aggregate evaluator 兼容性。未修改其他 capability 的主规格。

## 验证

- `openspec validate loop-scope-preview --strict --type change`：PASS
- `openspec validate loop-scope-preview --strict --type spec`：PASS
- Verify 隔离 archive/apply 演练已确认 delta 与 applied requirements normalized digest 一致。
- 重复应用时，已存在的同一 requirement/scenario 身份应保持 byte-preserving no-op。
