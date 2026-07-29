# Prompt Routing Bypass 最终验证报告

## 结论

**PASS。** 冻结基线为 `fa0cf3c36ddaf700c3ec6c2f072f2a2091f164bc`，相对
`origin/main@15fe619b2885b928dd27be9668cca6b0ee903c57` 共 6 个提交、171 个变更文件。
独立 reviewer、隔离 E2E 与视觉证据均无 Critical / High / Medium / Low。

Codex CLI 轨如实降级：首次把 2.2 MB 完整 diff 送入 stdin，被 1 MiB 输入硬限制拒绝；第二次改为
read-only 自主读取仓库，持续约十分钟仍未返回结论，并伴随本机
`models cache: missing field supports_reasoning_summaries` 错误，故终止异常轨。按
`tenon-verify` 的降级条款，以 reviewer + E2E + 视觉三条独立轨和完整 Build 门禁作为通过证据，
不把 Codex CLI 记为绿色。

## 冻结与零输出屏障

- 冻结 commit：`fa0cf3c36ddaf700c3ec6c2f072f2a2091f164bc`。
- 冻结 tree：`f9fb7c0149d582aee4b434de36bff5f341c7e110`。
- 完整 binary diff SHA-256：
  `c35994254ca04a1d44d8681eb4204fecbe74a5b6b5ed0121e64e9862697dbc79`。
- 路径清单 SHA-256：
  `5f5ee42274613496f13547d5b2a866ebccccde372cfc2a580aebb66082fe648e`。
- E2E 轨真实工作区前后 status / tracked diff / untracked 指纹分别保持
  `2ef58771922bacdfe5d4e1c1cbe4651177e4d3412054656b1179bfde9daddc35`、
  `ceb44961dc7d84e36cb593723fb9091c9bea2e157fd902d44d9748753bc664fe`、
  `149e272a41da64f98a5ee4ff5993c1b0c691bc49658cdf00ecf1015aee9c4d90`。
- 测试写产物位于 `/tmp/prompt-routing-verify-track2.8sGMpa`；截图、OpenSpec 演练与
  Codex 日志均位于 `/tmp`。真实工作区只有允许的 Verify 治理状态变化。

## 独立 Reviewer

PASS，Critical 0 / High 0 / Medium 0 / Low 0。

完整覆盖可信 root、HTTP DTO、canonical config、跨进程锁与原子 rename、Bash 3.2、
symlink/FIFO/NUL/4096-byte 边界、持续增长、reader 后代清理、EOF/sibling/PID reuse、
Dashboard decoder、加载/禁用/错误/成功、键盘、项目与语言竞态、中英文、移动端、生成物与 ledger。
全部历史 finding 已回归关闭。`hooks-config.sh` SHA-256 为
`9cd1bc6866cc182c232801b2e8fddae40b458d523a56ae5be022a4badca99789`。

## 隔离 E2E 与 Build 门禁

- `bash -n hooks/hooks-config.sh tools/test-hooks.sh`：PASS。
- `bash tools/test-hooks.sh`：511/511。
- server 定向：309/309。
- frontend 定向：36/36。
- 独立冻结 E2E 合计：856/856。
- `npm test`：317 files，5464 pass，5 个缺外部凭据的 honest skip。
- `npm run typecheck:web`：PASS。
- `npm run test:web`：50 files，981/981。
- `npm run build`：PASS；只有既有 Vite chunk-size warning。
- identity、repository hygiene、architecture（619 files / 5 size-only exceptions）、
  comments、skills（66 / 62 / 0 / 62）、adapters 272、bundle 31、`git diff --check`：PASS。
- Oracle 五个 fixture 双跑：0 处不一致；只报告既有的 `in-place` isolation 与 PM 自动入队扩展。
- fake-stat 阻塞后代已回收；fresh descendant 只 signal 一次且 sibling 未触及；worker EOF
  不调用 kill-tree；独立进程复查为 `FAKE_STAT_POSTCHECK=no-live-process`。

## 浏览器与视觉

最终 UI/server 内容与先前独立真实浏览器 PASS 的提交 `02bc540` 完全相同：
`git diff 02bc540..fa0cf3c -- packages/dashboard-app packages/server` 为空；两端生产 bundle blob
均为 `b3d10aa33b1e61f8ee2821adc572c6f9d24abcdf`（`index-CTbAZy34.js`）。之后的唯一产品变更是
只读 Hook reader 超时清理，不影响 Dashboard 交付面。

真实页面 title=`Tenon Dashboard`，精确绑定 bfb9 worktree。已覆盖中英文、1440/375、
loading/ready/error/invalid/busy/retry/success/disabled、Enter/Tab、保存中禁用与恢复；
375px 下 `scrollWidth = clientWidth = 375`，console/pageerror 为 0。证据：

- `/tmp/tenon-prb-remediation-zh-1440-ready.png`
- `/tmp/tenon-prb-remediation-zh-1440-save-error.png`
- `/tmp/tenon-prb-remediation-zh-1440-success.png`
- `/tmp/tenon-prb-remediation-en-375-loading.png`
- `/tmp/tenon-prb-remediation-en-375-ready.png`
- `/tmp/tenon-prb-remediation-en-375-invalid.png`
- `/tmp/tenon-prb-remediation-en-375-busy.png`
- `/tmp/tenon-prb-remediation-en-375-save-error.png`
- `/tmp/tenon-prb-remediation-en-375-success.png`
- `/tmp/tenon-prb-remediation-en-375-disabled-fresh.png`

视觉 baseline 不存在，因此像素级回归仍记为 INCONCLUSIVE，不影响行为与视觉人工验收 PASS。

## OpenSpec 与逐文件回读

- `openspec show prompt-routing-bypass --json --deltas-only`：PASS。
- `openspec validate prompt-routing-bypass --strict`：PASS。
- 隔离副本 `/tmp/tenon-pr-openspec-final.PKTyOa` 中
  `openspec archive prompt-routing-bypass --yes --json`：PASS，新增 4 项，修改/删除/重命名 0。
- 隔离副本的主规格 `openspec validate prompt-routing-bypass --strict`：PASS。
- 真实工作区前后 status 完全一致；Ship 才是唯一真实规格应用边界。

逐文件映射已回读：

| 改动范围 | 对照 capability | 结果 |
| --- | --- | --- |
| `hooks/**`、`tools/test-hooks.sh` | delta + `normal-chat-routing` | 已比对 |
| `packages/server/src/hooksConfig*`、GET/POST routes、server dist | delta + `live-dashboard-project-anchor` | 已比对 |
| Dashboard API、i18n、Workbench source/tests、web dist | delta + `live-dashboard-project-anchor` | 已比对 |
| Contract、ADR、plan、research、Change 文档 | `prompt-routing-bypass` delta | 已比对 |
| revisions / transitions / ledger / workflow 状态 | `document-evidence-contract` | 已比对 |

## 剩余风险与回滚

- Codex CLI 轨因本机工具状态降级，未获得独立结论；完整 reviewer 与 E2E 已覆盖同一冻结 diff。
- Vite 大 chunk 与若干既有 React `act(...)` warning 未由本功能引入。
- 回滚可整体 revert 本 PR；操作级停用只需把 `prompt_skip_keyword` 保存为 `""`，不会关闭任何
  review、confirm、PreToolUse 或安全门。
