# pr-7-merge-audit 文档一致性 Verify 失败报告

## 冻结对象

- Change：`pr-7-merge-audit`
- build SHA：`bdf78f22773bf60b9c1e2005ddb8337336756e28`
- base：`733b30fa85c7e7c4361dc8d63e7aa2ee24f01ec8`
- PR：<https://github.com/jefferysha/tenon/pull/38>

## 三轨证据

- Reviewer：delta 的 6 条 `MODIFIED` requirement 与 current main 的 narrative、23/23 场景正文逐字一致；
  OpenSpec 1.6.0/1.8.0 strict 均通过，canonical ledger/transition/revision 一致。
- E2E：两版真实 archive 均 exit 0；1.6.0 仅多写一个 EOF LF，1.8.0 为零 mutation；
  requirement、场景和正文均无漂移。Node 22.23.2 官方 OpenSpec 检查 42/42 通过。
- Codex CLI：read-only 审查确认 6 条 requirement 与 current main 完整一致；因完整分支审查长时间未收敛，
  在已取得结构化对照和官方 42/42 后由主线程中止，exit 130，未把该轨伪报为独立 PASS。
- 浏览器/UI：冻结差异不含产品源码或 UI 变更，不适用；这不是浏览器通过声明。

## 阻断发现

**M1 — proposal 的 capability 分类仍描述旧的五 MODIFIED + 一 ADDED 结构。**

`openspec/changes/pr-7-merge-audit/proposal.md` 的 `Modified Capabilities` 仍写“完整修改五条已落盘的
requirement，并新增一条 Context Bundle preview 与 Verify Evidence 共存 requirement”。冻结 delta 已为
6 条完整 `MODIFIED`，且 proposal 的 `New Capabilities` 同时声明不得重复 `ADDED`。这不会令 validator
失败，但会让治理文档与最终 delta 自相矛盾。

## 恢复路径

1. 对确切 `verify-fail` 留下 review request 与 delegated acknowledge。
2. 回到 Build 后以 `requirements-changed` 返回 Spec。
3. 只把 proposal 改为“完整修改六条已落盘 requirement，包括共存 requirement”；不改变任何产品语义。
4. 重新登记、全文读取、review、冻结，并重跑两版 strict/archive、Reviewer、E2E、Codex 与精确 head CI。
