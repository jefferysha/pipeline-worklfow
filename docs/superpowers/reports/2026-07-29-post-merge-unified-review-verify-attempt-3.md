# 2026-07-29 合并后统一审查：Verify 第三次尝试

## 结论

- Change：`post-merge-unified-review-20260729`
- 原 base：`907dac067c17ed77fb440b91b20d64fd0f24773b`
- frozen Build SHA：`aacba5a80302962d32ffa776169aeaa1942e5dc2`
- 结论：**FAIL，必须以 `verify-fail` 返回 Build**
- 产品 findings：未形成可用于放行的最终结论

本轮 Verify 开始后，`main` base 又出现两个新的开放非 Draft PR：

- #15 `feat(dashboard): clarify desktop host plan selection`
- #16 `feat: surface document evidence timelines`

用户明确要求先把所有开放 PR 合入 `main`，再对最终 `main` 开一个统一 Review Change。
因此 `aacba5a8` 不再覆盖被授权的最终范围，所有未完成轨道立即停止；旧 frozen SHA 的绿色
结果不能用于放行随后变化的 `main`。

## 轨道状态

| 轨道 | 状态 | 说明 |
| --- | --- | --- |
| Reviewer | INVALIDATED | 在新 PR 出现后中止，未形成最终报告 |
| Codex review | INVALID | 进程误在共享工作树运行 `npm run build:web`，协调器立即终止；生成物内容经 `git diff --exit-code packages/dashboard-app/dist` 确认未漂移，但该轨证据不可采用 |
| E2E/API | INVALIDATED | 隔离 clone 上已通过 `npm ci`、构建、类型检查、全仓 5741 tests/14 honest skips、Dashboard 1210 tests 与现有 gates；因范围移动中止，不能外推到新 `main` |
| Dashboard visual | INVALIDATED | 校正到目标工作树后因范围移动中止，未形成最终报告 |

`openspec validate --all --strict` 的既有简单/非治理历史 Change 失败不计入本轮产品 finding：
它们在 base 与 frozen SHA 间未变化；本 Change 的 canonical gate 仍是主 specs strict、当前
Change strict 与隔离 apply/archive rehearsal。新最终基线仍须重新执行这些门禁。

## 下一轮出口

1. 正常合并 CI 绿色的 #15。
2. 修复 #16 的真实 GitHub Actions 失败、等待 exact-head CI 绿色后正常合并。
3. 再次检查 `main` 的开放非 Draft PR；只有清零后才冻结统一 Change 的新 base。
4. 更新统一 Change 的范围/计划与 capability 映射，重新完成 Build。
5. 对新的 exact frozen SHA 从零执行 Reviewer、Codex、E2E/API 与全 Dashboard
   `design-taste-frontend`/真实浏览器四轨；只有 C0/H0/M0 且 exact-SHA CI 成功才能
   `verify-pass`。
