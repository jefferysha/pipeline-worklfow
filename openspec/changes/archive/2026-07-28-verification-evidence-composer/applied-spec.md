# 已应用规格

## 应用记录

- 日期：`2026-07-28`
- 结果：`changed`
- Delta：`openspec/changes/verification-evidence-composer/specs/verification-evidence-composer/spec.md`
- Delta SHA-256：`07a78fed89e7da5747f357af6eb8ffae17b4063167ff46bc80911f7cbf348d05`
- 主规格：`openspec/specs/verification-evidence-composer/spec.md`
- Before SHA-256：`absent`
- After SHA-256：`39829bf745e187ee03849579099216912a8e736cdde830a4dd34c48ac3ae8fe5`

## 效果

新增 5 条持久 requirement：

1. 独立闭集的不可信验证草稿契约；
2. 确定、防 Markdown 结构注入的双语格式化；
3. 受既有本地安全边界保护的无状态 compose API；
4. Verify-only Dashboard 完整空/加载/错误/成功/复制/键盘交互；
5. 对可信验证、document ledger、CAS、review 与 gate 的兼容边界。

目标原本不存在，因此本次应用创建主规格；没有合并冲突或无关主规格内容。应用后的目标规格已通过：

`openspec spec validate verification-evidence-composer --strict`

重复应用时必须按 requirement/scenario identity 比对；当前主规格已经逐字包含全部 delta
需求，后续相同 delta 应为 byte-preserving `no-op`，不得重复追加。
