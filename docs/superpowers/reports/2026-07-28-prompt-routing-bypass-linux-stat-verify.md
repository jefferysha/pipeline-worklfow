# Linux 只读 Hook 配置 identity 修复验证报告

## 结论

二次冻结 `097620611054a000cbce4b279abd120b5a7fb808` 的 Standards、Spec 与行为轨均
**PASS**，Critical / High / Medium / Low 为 `0 / 0 / 0 / 0`。

## 冻结与回退记录

- 基线：`04181d015d3aac0968af83f357cf601652912531`
- 首次冻结：`1b7a36052eb356d73e623bc6c0c40fe3768b257a`
- 二次修复范围：`1b7a36052eb356d73e623bc6c0c40fe3768b257a..097620611054a000cbce4b279abd120b5a7fb808`
- 二次冻结 tree：`82b6ba55d15b15f9b58fd55dabc13864a65eb4b9`
- 二次区间 diff SHA-256：`9a860a50f32a3e5d1f29369a02f0e6af586e48c335a08c7969991df37f7b15c8`

首次 Verify 中，Codex 独立轨构造了“GNU 探针写 stdout 后失败”的情形，发现直接
`stat ... || stat ...` 会把污染输出与成功 fallback 拼接。流程通过确切 `verify-fail`
event 回退 Build，没有在 Verify 中修改产品代码。二次实现隔离每个 probe 的 stdout，并只接受
单一、非空、纯数字 `inode:size`。

## 独立审查

- Standards：PASS，0 findings。GNU-first/BSD fallback、Bash 3.2 与 Darwin/GNU 兼容性保持。
- Spec：PASS，0 findings。stdout 隔离、严格 identity、Darwin fallback 与 fail-open 均闭环。
- Codex CLI：准确发现首次冻结缺口；二次只读复核的行为矩阵全部通过，但本地 logs DB 损坏与
  model cache schema 异常使进程在输出最终结论前被 180 秒上限终止，按 degraded 记录，不伪报
  CLI 终态。独立 Standards/Spec reviewer 与行为轨均在二次冻结 SHA 上 PASS。

## 行为验证

- `bash -n hooks/hooks-config.sh tools/test-hooks.sh`：PASS。
- macOS `bash tools/test-hooks.sh`：512/512。
- Darwin：GNU probe rc=1 且零输出；BSD pathname/fd identity 一致。
- Linux 非 root、mode `0444`：custom keyword、empty 禁用、matrix 三个语义 3/3。
- 失败输出矩阵：5/5；覆盖失败后污染、multiline、extra-colon、双路 malformed。
- GNU pathname 与 `stat -L` fd identity 一致；nofollow fd 不一致，固定了 `-L` 必要性。
- `git diff --check 1b7a3605..09762061` 与工作树 `git diff --check`：PASS。

## OpenSpec rehearsal

- `openspec show prompt-routing-bypass-linux-stat --json --deltas-only`：PASS。
- `openspec validate prompt-routing-bypass-linux-stat --strict`：PASS。
- 隔离副本应用并归档 delta：新增 1 个 requirement，随后
  `openspec validate prompt-routing-bypass --type spec --strict`：PASS。
- 工作树主规格在 rehearsal 前后未修改；隔离副本应用后 SHA 从
  `10426f6a709bbc4bd55a8bad19a383f55ee4e10ccbd5588b3c04810b984d29bf`
  变为 `a9df123b5c47d943bee3afdad4e01bcb7fc403e965b80f4ba7eae87ee3c5acd2`。
- 全仓 `openspec validate --specs --strict` 仍有 7 个既有非目标 spec 失败；目标
  `prompt-routing-bypass` 严格校验通过，二者分开记录。

## 映射与 UI 边界

| 实现 | 规格/证据 |
| --- | --- |
| `hooks/hooks-config.sh` | `openspec/changes/prompt-routing-bypass-linux-stat/specs/prompt-routing-bypass/spec.md` |
| `tools/test-hooks.sh` | 本报告的 macOS/Linux 与污染矩阵证据 |
| Build 设计与审查 | design、ADR、plan、`REVIEW.md` |

本 remediation 不改变 Dashboard、API、i18n 或产品交互，因此不重复运行浏览器；主产品冻结
`fa0cf3c36ddaf700c3ec6c2f072f2a2091f164bc` 的真实浏览器验收仍覆盖 zh/en、1440/375、
loading/error/invalid/busy/retry/success/disabled、Enter/Tab，console/pageerror 为 0。

## GitHub CI

最终冻结对应 run `30344839446`：**PASS**，7m44s。build/release freshness、clean install、
docs/governance、vitest、Dashboard、hooks、adapters、skills、spec CAS、bundle 与 oracle 均通过。
Required real-Codex H14 因仓库 secret 不可用而 skipped，对应 honest-skip 检查通过；这是外部
credential 缺失，不是代码失败。另有 GitHub Actions 将 Node 20 action 强制运行于 Node 24 的
deprecation annotation，不影响本次结论。
