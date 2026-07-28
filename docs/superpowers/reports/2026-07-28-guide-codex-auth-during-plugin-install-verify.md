# guide-codex-auth-during-plugin-install Verify 报告

日期：2026-07-28

冻结基线：`workspace:sha256:e49f1fd6b19567ac5e9dec104850f69ded8caf0f045bb862d9b513cf42018b4f`

本轮结论：**PASS**
聚合严重级别：**Critical 0 / High 0 / Medium 0 / Low 1**

## 三轨聚合

| 轨道 | 结果 | 严重级别 | 独立证据 |
| --- | --- | --- | --- |
| 独立 Reviewer | PASS | C0/H0/M0/L0 | 完整回读 46 个产品交付文件及 proposal/design/tasks/delta；针对可信绝对 Codex binding、POSIX/Windows 生命周期、秘密边界、dist freshness 与相关 capability spec 逐项复核；隔离 targeted 193/193、bootstrap/clean-install 38/38、build 与 dist byte-for-byte 比对通过 |
| 隔离 E2E | PASS | C0/H0/M0/L0 | 隔离副本 bootstrap/clean-install 38/38、auth/setup/update/doctor/kernel 174/174、npx 39/39；真实空认证探测、首次/重复 clean-install、恶意 cwd、Windows batch 模拟、Dashboard 清理与无秘密残留均通过 |
| Codex CLI | PASS | C0/H0/M0/L1 | 全量测试、Web、hooks、文档、架构、迁移、分发、secret scan、相关 strict validate 与归档演练通过；Low 仅为未在真实 Windows runner 上执行 |

所有轨开始和结束时的 official fingerprint 都精确等于冻结基线。独立轨未写入真实仓库；
本报告和 Verify tasks 状态是三轨聚合后的治理写入。

## 功能与安全矩阵

| 场景 | 结论 | 验证 |
| --- | --- | --- |
| ChatGPT 订阅登录 | PASS | 固定引导 `codex login`，明确仅适用于包含 Codex 权益的 ChatGPT 方案 |
| Device auth | PASS | 固定引导 `codex login --device-auth` |
| Platform API Key | PASS | 固定 stdin 登录命令，明确 Platform API 使用按量计费且与 ChatGPT 订阅分离 |
| 已登录 | PASS | `codex login status` 成功时不重复输出完整教程 |
| 未登录 | PASS | 只有有界且精确的 `Not logged in` 哨兵判为未登录；输出完整三路径教程 |
| 无 Codex CLI | PASS | install/setup 在任何 marketplace mutation、journal 或 host 写入前失败，并给出 CLI 获取与版本复核命令 |
| 非交互/后台更新 | PASS | 不阻塞、不输出交互式教程；保留 deferred 状态供后续前台操作处理 |
| 异常与秘密边界 | PASS | timeout/signal/spawn/status error、stderr overflow 与非哨兵 exit 1 全部 fail-closed；宿主 stdout/stderr、API Key 与 auth 文件不进入状态或日志 |
| POSIX 可信对象 | PASS | 跳过空/相对 PATH 项，解析并复用同一个绝对普通可执行文件；恶意 cwd 同名 `codex` 不会被执行 |
| Windows 可信对象 | PASS | `.cmd/.bat` 使用有界 `cmd.exe /d /s /c` 计划并绑定 shim cwd；拒绝命令扩展字符与不安全参数；taskkill killer 生命周期有界 |

真实凭据登录没有执行，因为会访问或改变用户认证状态；上表的三条登录路径由确定性 process/auth
测试、命令一致性测试与真实空认证状态共同覆盖。真实 Codex CLI `0.144.1` 在隔离空
`HOME`/`CODEX_HOME` 下返回 exit 1、stdout 0 bytes、stderr 精确 `Not logged in`，且没有创建
`auth.json`。

## 全量验证

- `npm test`：316 个测试文件，5449 passed，5 honest skips。
- `npm run test:web`：50 个测试文件，963/963。
- `npm run test:hooks`：482/482。
- `npm run build`、`npm run check:identity`、`npm run check:comments`、
  `npm run check:architecture`（618 production files）、repository hygiene 全部通过。
- `npm run check:npx-package`：39/39；migration CAS：13/13。
- docs check/build/smoke、templates 与 default workflow freshness 全部通过。
- Change、`plugin-distribution`、`plugin-runtime`、
  `open-source-documentation-experience`、`repository-architecture-compliance`
  的 strict validate 全部通过。
- 全仓 `openspec validate --specs --strict` 仍有 7 个与本 Change 无关的既有基线债务：
  `automation-loop-init`、`declarative-document-governance`、`effective-workflow-plan`、
  `live-dashboard-project-anchor`、`simple-task-routing`、`skill-content-resolution`、
  `workspace-verification-integrity`；本 Change 未扩大范围修改这些 requirements。
- secret scan 只命中刻意的假秘密测试夹具，没有真实 token、API Key、auth 文件或秘密日志。
- 双层隔离 clean-install 首次与重复安装通过，release
  `sha256-e47fbe3766af57d5ba0d39c31cecc2da45f2ba7eac66bc73cf14adff7643ad30`；
  runtime、doctor、Dashboard HTML/health、app-server、Skill 和四类 hooks 均通过，hook trust
  保持 `untrusted`，结束后 PID、端口和临时安装残留均已清理。

## OpenSpec 应用与归档演练

- 演练副本：`/private/tmp/tenon-auth-archive-rehearsal.PzDcZN/repo`，使用 `cp -a` 保留 symlink
  与可执行权限。
- 副本执行 `openspec archive guide-codex-auth-during-plugin-install --yes --json` 成功：
  `specsUpdated=true`，`added=1`，随后 `plugin-distribution` 与 `plugin-runtime` strict validate
  均通过。
- 真实仓库演练前后的主规格 digest 不变：
  `plugin-distribution=6c4438aff1087f55a1911e84447c2c04d0686b96af7a0655b11856d2c173695a`，
  `plugin-runtime=6e83dfbd5216028bf84a3e844e5abed5aade754295b505f4dd36fdc4e5a77a4a`。
- 真实仓库冻结指纹在演练前后保持
  `workspace:sha256:e49f1fd6b19567ac5e9dec104850f69ded8caf0f045bb862d9b513cf42018b4f`。

## 剩余风险

- Low：Windows `.cmd/.bat`、ComSpec 与 taskkill 的完整调用计划和 setup 生命周期已由模拟测试覆盖，
  但本轮没有真实 Windows CI runner。
- 公网 `install.sh --codex` 不能在推送前证明本地冻结候选；推送后将以远端 `main` 再执行一次
  public clean-install 验收。

结论：冻结候选满足本 Change 的规格、实现、安全、分发和归档前置要求，可以通过 Verify。
