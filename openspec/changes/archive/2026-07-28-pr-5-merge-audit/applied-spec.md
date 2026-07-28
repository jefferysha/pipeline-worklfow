# 已应用规格

## 变更摘要

- Change：`pr-5-merge-audit`
- 应用日期：`2026-07-28`
- 结果：`changed`
- 冲突处理：无。仅按相同 Requirement / Scenario 身份替换目标 requirement，保留主规格其余内容。

## 已应用需求

| delta source | main spec target | before SHA-256 | after SHA-256 | result |
| --- | --- | --- | --- | --- |
| `openspec/changes/pr-5-merge-audit/specs/dashboard-ui-ux-system/spec.md` | `openspec/specs/dashboard-ui-ux-system/spec.md` | `e8588281864394aef8c438e85d6011a74e9992c9fea52f587aa707e779483f67` | `cdc31db8411899f7afe4ef2d09dcbd9396f4539d6416ea26ae851d3a1465d4ee` | `changed` |

本次应用修改 4 个既有 requirement：

- `自适应应用外壳`：登记共享 720px 临界语义与精确临界场景。
- `有目的且可关闭的动效`：登记打开/关闭 ease-out、共享 transition token 与
  reduced-motion 关闭终态。
- `可访问的反馈与恢复状态`：登记 Traffic 捕获记录加载态的中英文翻译义务。
- `生产环境浏览器验收`：登记 720px、1024px 阶段发现性和真实官方截图要求。

## 交付证据

- Verify 隔离演练：
  `/private/tmp/pr5-openspec-verify.hEBpHQ` 中
  `openspec archive pr-5-merge-audit --yes --json` 为 `specsUpdated=true`，并应用相同
  4 条 modified requirement。
- Ship 主规格与隔离演练产物的 Requirement / Scenario 内容一致；Ship 保留单个 EOF newline
  以通过仓库 whitespace 门禁，重复应用为 byte-preserving no-op。
- `openspec validate dashboard-ui-ux-system --type spec --strict`：exit 0。
- 聚合验证报告：
  `docs/superpowers/reports/2026-07-28-pr-5-merge-audit-verify.md`。
- README 无需改文案或链接：现有 Dashboard 入口与截图引用路径没有变化；受影响的官方
  `docs-site/public/images/dashboard-progress.webp` 已从身份校验通过的真实 Dashboard 刷新，
  ADR、计划和验证报告已同步。
- 回滚：撤销 PR #5 的 merge commit 可恢复 UI/生成物；若只回滚本审计应用，恢复上述主规格
  before digest，并同时撤销本 Change 的 applied-spec/治理提交，避免实现与 durable spec 漂移。
