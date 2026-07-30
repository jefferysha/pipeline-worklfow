# Orchestration Graph Foundation 验证报告（第二轮失败）

> Change：`frozen-workflow-definition-status-20260730`
> 冻结构建：`c5ec5f9e7a3144e3a0c9891f60c56c139e2abbab`
> 对比基线：`ef728bf63f6902251e87fb9495a3dfafe10e42b7`
> 结论：失败；取得精确 `verify-fail` receipt 后返回 Build 修复一个视觉 Medium

## 结论

Reviewer、E2E/安全与实现规格审查均通过，OpenSpec 隔离 archive 成功，真实浏览器也确认
图的交互、双语、键盘、响应式和自环路径可用。但独立视觉轨发现 transition/event 标签在
真实默认图中叠压，自环标签在右侧被截断。聚合结论为 **FAIL — Critical 0 / High 0 /
Medium 1 / Low 0**。按 Verify 冻结纪律，本轮不在 Verify 内修改实现，而是以
`verify-fail` 回到 Build 做最小修复。

## 唯一发现

**M1 — transition 标签布局不可读。** 普通边都使用同一直线中点作为 label 坐标，平行边、
反向边和回边没有稳定 lane/offset，导致 Explore→Archive 区域多条 event 文案相互叠压并
压在线上。自环 label 固定为 `source.x + 168`，没有为文本宽度和画布右侧留白，中文
“转换 · 已归档”被截断。语义替代列表和选中节点的 incoming/outgoing 详情仍能恢复完整语义，
因此不是契约或可访问性 High，但核心可视图的可读性不足。

修复目标：为同端点、反向和回边生成确定性 lane/曲线与 label offset；自环使用可见的 label
anchor，并扩展画布右侧空间或按文本宽度约束位置。修复后重跑视觉基线与冻结全量验证。

## 多轨证据

- Reviewer：PASS，C0/H0/M0/L0；逐 blob 回读 141 个冻结变更路径，前后
  `HEAD = build_sha = c5ec5f9e…`。
- E2E/安全：PASS，C0/H0/M0/L0；Server 7 files / 393 pass / 9 skip，Dashboard
  41/41，typecheck、architecture、hygiene、diff check 均通过。
- Codex/规格：此前完整 Codex review 找到的四项 P2 已全部修复；最后一次补充 CLI 重试因
  Codex 账户 usage limit 降级，未伪报为 CLI 绿色。主代理与独立 reviewer/E2E 轨覆盖了同一
  冻结 SHA。
- 视觉/规格：FAIL，C0/H0/M1/L0；Chorus 能力映射、i18n、无障碍替代路径、筛选、选中、
  详情、键盘和响应式均通过，唯一失败为上述 label 布局。

## 浏览器证据

均为真实 production Tenon Dashboard，目标 Change 与 worktree URL 已核对：

- 1024 英文图：`/tmp/tenon-4677-graph-1024-en.png`，
  SHA-256 `3c072006d50631a922cd3fc466978367c3a2d81b4809df99f007ad64ad1eee8b`；
- 1920 英文 All + 选中详情：`/tmp/tenon-4677-graph-1920-en-selected.png`，
  SHA-256 `91fa6f090a01db5c997e4cfaad988798a06f12a0ce985bde3dcc60434afdd667`；
- 键盘 End → Enter、focus/selected/pressed：`/tmp/tenon-4677-graph-keyboard-focus-selected.png`，
  SHA-256 `6becaeb502f331d0980226dfb389304bde1a1dcb2b72a1f4750f35afa885091a`；
- 中文自环：`/tmp/tenon-4677-graph-self-loop-zh.png`，
  SHA-256 `13745ba369e7d212c9ad4035d4304bf1d196b64ebc4a784bbbd4571825ca7d56`。

1024/1440/1920 均无页面级横向溢出；窄视口只在图容器内部滚动。自环通过受控只读代理
向真实 graph response 增加 `archive → archive` transition 验证，DOM 确认
`data-self-loop=true`，没有扩大 Dashboard 写权限。Dashboard 已知 Context Bundle preview
请求返回 501；它与 graph API 无关，未作为本功能通过项。两个临时端口均已关闭。

## OpenSpec 隔离应用硬门

OpenSpec CLI `1.6.0`：

- `openspec show ... --json --deltas-only`：exit 0；
- `openspec validate frozen-workflow-definition-status-20260730 --strict`：exit 0；
- detached `c5ec5f9e…` 隔离 clone 中 `openspec archive ... --yes --json`：exit 0，
  7 个 requirement 全部以 added 应用；
- 隔离副本的 `frozen-workflow-definition-status` 与 `orchestration-graph` strict validate：
  exit 0；
- 真实 `openspec/specs/**/spec.md` 前后清单 digest 均为
  `ee9ec373b59cc4648f05e744fe1a53c9a48612cbdbce099f0979c7f254c9b2f8`，
  `cmp` exit 0，真实主规格未被 Verify 修改。

## 已执行验证

- `npm test`：331 files / 5830 pass / 14 honest skips；
- `npm run test:web`：71 files / 1252 pass；
- `npm run typecheck:web`、`npm run build:web`、root `npm run build`：pass；
- hooks：512 pass；architecture：680 production files，5 个既有 size exceptions，pass；
- bundle、docs、identity、interaction contract、repository hygiene：pass；
- oracle：5 fixtures / 0 differences；
- CLAUDE_CODE_OAUTH_TOKEN 缺失的 Docker agent case 被诚实跳过，与代码失败分开记录；
- broad OpenSpec `--specs --strict` 的 8 项为 main 上既有、与本 Change 无关的失败；本 Change
  及隔离应用后的两个目标 capability 均 strict pass。

## 逐文件 capability 回读

| 改动路径组 | 数量 | capability / 规范 | 已回读并比对 |
| --- | ---: | --- | --- |
| `docs/**` | 6 | graph 设计、研究、ADR、验证 | ✓ |
| `openspec/**` | 98 | Change 治理及两个 delta capability | ✓ |
| `packages/dashboard-app/**` | 15 | `orchestration-graph` Dashboard contract | ✓ |
| `packages/server/**` | 20 | graph endpoint、shared projection、definition diagnostic | ✓ |
| `tools/**` | 2 | repository hygiene / Change contract | ✓ |
| **总计** | **141** | 冻结 diff 全路径 | **✓** |

## 决策

持续授权默认采用最保守、可逆的“修复”路径，不接受偏差或强制通过。取得 exact-event
`verify-fail` delegated receipt 后返回 Build，只修 M1，重新运行受影响测试、生成物、真实浏览器
验收与完整 Verify；未实现的 Chorus agent、历史 session/turn、acceptance criteria、
task dependencies、写编排和 live refresh 仍明确保持 deferred。
