# 最终主干统一审查 — Verify 失败报告（2026-08-03）

## 冻结身份

- Tenon Build 基线：`workspace:sha256:8f69241c68975e1314fc76a3a5183b9ec43596d083949730e673a62e8158fcdd`
- 产品 Git HEAD：`796faf627abd3a2af12a59f826a9b05d19097b51`
- Git tree：`016dc85378eb4bdef274ec21c54ff699d70424c8`
- Git 基线 / merge-base：`a86dabb481a8d20e0c50ce8c1b421fac45f886f9`
- 完整范围：646 files，21,414 additions，3,687 deletions
- binary diff SHA-256：`e1cf1bf5a25460c2e6c0ebc9fda6753d89f9e3ee7dedec8a1479b33fa486acc0`

四轨前后与聚合后重算的真实工作区 fingerprint 均精确命中冻结基线。所有测试、构建、
OpenSpec archive/apply、浏览器产物和原始审查文件均位于 `/tmp` 隔离环境；真实工作区没有
实现、配置或生成物漂移。

## 聚合结论

Verify：**FAIL — C0 / H0 / M2 / L0**。PR #20 的精确 head CI、完整 reviewer、隔离
E2E/OpenSpec 与真实浏览器均为绿色，但 Codex 全范围审查确认两个可达的并发状态完整性缺陷。
绿色测试和 CI 不能覆盖未建模的竞态；必须经官方 `verify-fail` 回 Build，先建立确定性 RED，
再修复并冻结新基线。

### Medium 1 — mandatory-skill 局部写可能压过较新的 Track 权威 reload

`packages/dashboard-app/src/workbench/mandatoryConfig.ts:230-232` 的
`primeMandatoryConfig()` 会推进 per-root generation、删除当前 in-flight GET，再写入调用方提供的
局部快照。可达顺序如下：

1. mandatory-skill 保存持有旧 `requestCfg`；
2. Track Save/Delete 成功后调用 `reloadConfig()`，清缓存并启动取得新 Track revision 的 GET；
3. mandatory-skill 响应先返回，`peekMandatoryConfig()` 为空，于是基于旧 `requestCfg` 合并 cell；
4. `primeMandatoryConfig()` 推进 generation 并删除新 GET 身份，发布含旧 Tracks/revision 的快照；
5. 新 GET 返回时 generation 不匹配，拒绝写缓存；Hook 的 `peek === next` 门也拒绝显示它。

最终 UI 会保留旧 Track 集与旧 revision，直到重挂载。修复必须让完整权威 reload 胜过局部 cell
响应，或把局部响应合并到当前权威快照且不使新 GET 失效；需要覆盖两个请求的反序完成顺序。

### Medium 2 — 同一 Loop 的权威刷新不会取消旧预算去抖写

`packages/dashboard-app/src/workbench/GovernanceRail.tsx:69-73` 只在 `root` 或 `row.id`
变化时清除 `commitTimer`。同一 id 的新 row 到达时，另一个 effect 会清空界面草稿，却不会取消
旧 timer；timer 闭包仍持有旧 row 与旧 slider 值。若 LoopCard mutation 或轮询在去抖窗口内把
`max_tokens_per_day` 更新为新的权威值，旧 timer 随后仍会 POST 旧值并覆盖它。

修复必须在相关 row 权威事实变化时取消/重基 timer，或在提交时读取当前权威 row；需要覆盖
“拖动 → 同 id 新快照 → 去抖到期”的无写入/不覆盖回归。

## 四轨与远端证据

| 轨道 | 结论 | 证据 |
| --- | --- | --- |
| 完整 reviewer | PASS，C0/H0/M0/L0 | 全量 646 文件；root 5881、Dashboard 1552、构建与 24 个提交 runtime 逐文件 hash 一致；真实 fingerprint 前后相同 |
| E2E/API/OpenSpec | PASS，C0/H0/M0/L0 | `/tmp/tenon-track2-final-verify.Q8HxRB/logs/`；root 5881、Dashboard 1552、hooks 512、adapters 272、migration 13、OpenSpec 隔离 archive/apply 通过 |
| Dashboard 浏览器/视觉 | PASS，C0/H0/M0/L0 | `/tmp/tenon-pr20-final-verify-796faf/audit.json` SHA `ccedcf7f…4488b`；failure audit SHA `6a2c44ae…49f20` |
| Codex CLI | FAIL，C0/H0/M2/L0 | `/tmp/tenon-pr20-codex-review-796faf62.md` SHA `85d1862b787ea3730a1609d0931299099a48ebd1ef329896e543cfa6c593898d` |

GitHub exact-head CI run `30764294431` 为 success；Documentation Pages run
`30764294442` 的 build 为 success、deploy 按 PR 规则 skipped。PR 是 `CLEAN/MERGEABLE`，
但治理 Verify 结论优先阻止合并。

## 已通过但不能覆盖失败结论的验证

- `npm ci`：486 packages，0 vulnerabilities。
- Root Vitest：330 files，5,881 passed，26 honest skips。
- Dashboard Vitest：85 files，1,552 passed；TrackSettings/focus 11/11。
- 完整 production build、Dashboard typecheck 与 committed runtime freshness：通过。
- Hooks 512/512；adapters 272/272；migration CAS 13/13；clean install `ok:true`。
- Architecture 719、comments、dependencies/tree、release workflows 24/24、identity、
  interaction contract、repository hygiene、default workflow freshness、docs、document templates：通过。
- OpenSpec change strict 1/1、全仓 38/38；隔离 archive 应用 6 项，archive 后主规格 32/32。
- 浏览器覆盖 1024/1440/1920、zh/en、light/dark、reduced motion、loading/empty/error/busy、
  Save/Delete 409 与 network、Enter/no-submitter、成功态、键盘与焦点；10 个 mutation 全部拦截，
  真实配置仍为 revision `09bfcc6a14b83e21` 与原六条 Track。

26 个 honest skips 为 Docker-dependent 16 项、macOS 上 Linux-only 9 项、PR 环境 real-Codex
H14 1 项；受信 main push 才能执行最后一项。本次 finding 与这些 skip 无关。

## 逐文件规范回读与 OpenSpec 隔离演练

冻结 diff 的 646 个文件全部映射并回读：191 个 Dashboard/Server 文件对照
`openspec/specs/dashboard-ui-ux-system/spec.md`，其余 455 个实现、治理、发布、文档与生成物对照
`openspec/specs/repository-architecture-compliance/spec.md`；未映射 0。逐文件映射 SHA-256 为
`3545ec52c23d3f6ef24bb24f7bd9957cb5e628cb19f28517ac30eb6273d22e11`。

真实主规格前后 digest 均为
`fe389a8629d1eba5206eec62dca60c8d92c30d4e08b9fcb5a4479afdd76b46cd`。隔离 archive/apply 后
digest 为 `e139915d665483a9d6da2a28b260f6ce9fca4c847c0a559b8a9eb6e0237c8ca7`，
`specsUpdated=true`、added 6、archive 后 strict 32/32；真实 `openspec/specs` 未写入。

## 后续动作

1. 通过官方 `verify-fail` 回 Build，保持“精确 head CI 与四轨通过”任务未勾选。
2. 为局部 mandatory 写与完整 reload 的交错建立确定性 RED，并修正权威优先级。
3. 为预算去抖跨同 id row 刷新建立确定性 RED，并取消或重基陈旧 timer。
4. 重新运行定向、全量、构建、静态、独立 pre-Verify；提交并冻结新基线。
5. 在新基线上重新执行所有 Verify 轨与 exact-head CI；不得复用本轮 PASS 轨。
