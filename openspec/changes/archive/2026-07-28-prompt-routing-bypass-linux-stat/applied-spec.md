# 已应用规格

## 应用记录

| Delta | 主规格 | Before SHA-256 | After SHA-256 | 结果 |
| --- | --- | --- | --- | --- |
| `openspec/changes/prompt-routing-bypass-linux-stat/specs/prompt-routing-bypass/spec.md` | `openspec/specs/prompt-routing-bypass/spec.md` | `10426f6a709bbc4bd55a8bad19a383f55ee4e10ccbd5588b3c04810b984d29bf` | `144b7b2f31a3f26e13a77e14f2c507bde0af5095ac692581341d8f4f3887731e` | `changed` |

## 效果

- 新增“只读 Hook 配置 SHALL 跨 GNU 与 Darwin 保持 fd identity” requirement。
- 新增 GNU/Linux mode `0444`、Darwin BSD fallback 与失败探针污染拒绝三个 scenario。
- 保留主规格中既有持久化、API、单轮旁路与 Dashboard requirements；无冲突或手工语义改写。
- `openspec validate prompt-routing-bypass --type spec --strict` 通过。

应用日期：2026-07-28。
