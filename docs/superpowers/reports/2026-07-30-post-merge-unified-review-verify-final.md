# 最终主干统一审查 — Verify 失败报告（2026-08-03）

## 冻结身份

- Build SHA：`71429fd6ada9f43acd79558ee65e32d9c6e6175b`
- Git tree：`c10ad99308d486986a386a2658c945f18a5c4087`
- 基线：`a86dabb481a8d20e0c50ce8c1b421fac45f886f9`
- 完整范围：591 files，20,366 additions，3,680 deletions
- diff SHA-256：`29294e79ce44cf7075462ca6d718a51f1933b164fe20a5a5ddd614a618674fb1`
- 真实实现指纹前后均为
  `afa92cb74034c23f6a7a0baa0d043fd9470d4a7a906f61a75eb83e2c4995451a`；
  `openspec/specs` 无漂移。各轨只写 `/tmp` 隔离副本或外部证据目录。

## 聚合结论

Verify：**FAIL — C0 / H0 / M1 / L0**。PR #20 不得合并，必须经官方
`verify-fail` 回 Build 修复并冻结新 SHA。

### Medium — 同 root 晚到旧刷新覆盖较新的 Hook 状态

`packages/dashboard-app/src/workbench/mandatoryState.ts:275` 的
`reloadConfig()` 在 `await loadMandatoryConfig(requestRoot)` 后只校验 root 即执行
`setCfg(next)`。`mandatoryConfig.ts` 的 per-root generation 能阻止旧响应写模块缓存，
但不能阻止旧 Promise 的返回值写 Hook-local state。

Reviewer 与 E2E 分别在仓库外精确 SHA 隔离副本中确定性复现：连续触发 A/B 两次同 root
刷新，B 的 `revision-b-new` 先完成并显示，A 的 `revision-a-old` 后完成后，最终 UI
revision 回退为 `revision-a-old`。永久修复需要在 Hook 层增加 exact root + 当前 reload
generation/token fence，并加入 A/B 逆序响应回归；不能只依赖模块 cache 测试。

## 四轨证据

| 轨道 | 结论 | 证据 |
| --- | --- | --- |
| 完整 reviewer | FAIL，C0/H0/M1/L0 | 全量 591 文件；隔离 probe 复现 late A 覆盖 newer B；archive SHA-256 `501a265ac974436f41c2c7906f6297014d21127300743af28d1dcc79b097109a` |
| E2E/API | FAIL，M1 | `/tmp/tenon-pr20-verify2.QAsVch`；clean install、全量测试、API、安全与 OpenSpec 均完成，额外 Hook probe 确定性失败 |
| Dashboard 视觉 | PASS，C0/H0/M0/L0 | `/tmp/tenon-pr20-verify4-71429fd6/audit.json`，SHA-256 `ac0a006e790320845585c858aa141280fa4bf26bdc1492659d20cbf9f6b21ffa` |
| Codex CLI | 降级，未产最终结论 | 只读隔离副本扫描两个冻结 SHA、591 个路径、OpenSpec、发布工作流与全部生成物；内部子代理线程状态异常导致持续等待，14 分钟后有界中止，未把不完整轨伪报为 PASS |

Codex 已确认两个 SHA、实际 591 文件范围、`git diff --check`、全部 JSON/JSONL 可解析、
Dashboard chunk 引用完整，以及 CLI、Server、Dashboard JavaScript bundle 语法有效。它在只读
沙箱内无法安装依赖，release fixture 因临时目录 `EPERM` 失败；这些是环境限制，不是代码
finding，也不覆盖 reviewer/E2E 已确认的 M1。

## 通过但不能覆盖 M1 的验证

- `npm ci`：486 packages，audit 0。
- Build 与 build 后 Dashboard typecheck：通过。
- Root Vitest：330 files，5881 passed，26 honest skips。
- Dashboard Vitest：84 files，1541 passed，0 skipped。
- Track UI 专项：205/205；snapshot：47/47；API 安全与 Track CRUD：8/8。
- Architecture：719 production files，5 个 size-only exceptions。
- OpenSpec：当前 38/38；`show` 6 deltas；隔离 archive 应用 6 项，archive 后 37/37。
- Release workflow contracts：24/24。
- comments、repository hygiene、docs、identity、default workflow freshness、dependency tree、
  生成资产新鲜度与 diff whitespace：通过。
- GitHub 精确 head CI run `30760160050`：success；Documentation Pages run
  `30760160056`：build success、deploy 按 PR 规则 skipped。
- 视觉矩阵覆盖 1024/1440/1920、zh/en、light/dark、reduced motion、
  loading/empty/error/busy、连续保存 revision、409、键盘与焦点；4 个模拟写请求全部拦截，
  真实项目仍为原 revision 和 6 条 Track。

26 个 honest skips 为 real-Codex 未启用 1 项、Docker daemon 不可用 16 项、macOS 上
Linux-only 9 项；没有与本 finding 相关的 skip。

## 逐文件规范回读与 OpenSpec 隔离演练

冻结 diff 的 591 个文件已逐项映射到受影响 capability，未映射 0；映射 SHA-256 为
`6c7014cbae0640bbdc6f7275bf09979cad23622fa74b1b21d72ddb98f3ae3426`。
所有主规格回读集合 SHA-256 为
`fe389a8629d1eba5206eec62dca60c8d92c30d4e08b9fcb5a4479afdd76b46cd`。
隔离副本执行 OpenSpec 1.6.0 `show`、strict validate 与 archive；真实主规格前后无变化。

## 后续动作

1. 使用官方 `verify-fail` 回 Build；不勾选“精确 head CI 与四轨通过”任务。
2. 先增加 Hook 层同 root A/B 逆序响应 RED，再加入 reload generation/token guard。
3. 重跑 Dashboard/root/build/static/browser pre-Verify，冻结新 SHA。
4. 在新 SHA 上重新执行完整 reviewer、E2E、Codex、视觉与 GitHub CI；不得复用本 SHA 的
   通过结论。
