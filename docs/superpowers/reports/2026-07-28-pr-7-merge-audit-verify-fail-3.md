# PR #7 合并审计验证报告（第三轮失败）

> Change：`pr-7-merge-audit`
> 冻结构建：`ac3695ff32a75cc276519f7fabded346aa92ccb4`
> 对比基线：`8f9c5fa2b5712b5f0422f61d9ecea32b0f3d41b9`
> 结论：失败；保留 PR，取得精确 `verify-fail` receipt 后返回 Build

## 结论

第三轮冻结 Verify 在聚合前发生共享工作树写入，repo-zero 硬门禁失效。本轮结论为
**FAIL**：

- Critical：1（隔离轨遗漏 `cd`，在共享工作树执行 `npm ci`）
- 产品 Critical / High / Medium / Low：已完成范围内未确认新增 finding
- 静态 Reviewer：因硬失败提前停止，不能声称完整 PASS
- E2E / API / OpenSpec：因硬失败提前停止，不能声称完整 PASS
- Dashboard 视觉/无障碍：因硬失败提前停止；首个焦点断言还使用了错误的短 key，
  结果不具备判定产品焦点恢复是否成功的充分信息
- Codex CLI：DEGRADED（账户额度门禁，未产出独立 finding）

受影响文件的 mode 已恢复，当前 tracked 产品/package diff 重新为空；但
`tenon-verify` 要求从冻结到最终聚合全过程零输出，恢复不能追认已经污染的运行。
本轮不得进入 `verify-pass`，也不得复用未完成的轨道证据。

## 冻结边界、CI、GitHub 与路径覆盖

- PR #7 本地 head、远端 PR head、`build_sha`：
  `ac3695ff32a75cc276519f7fabded346aa92ccb4`
- base / merge-base：
  `8f9c5fa2b5712b5f0422f61d9ecea32b0f3d41b9`
- 精确 head CI run `30405861875`：PASS，耗时 7m25s。
- 进入 Verify 前 GitHub 状态：OPEN、非 Draft、MERGEABLE/CLEAN；0 reviews、
  0 inline comments、0 issue comments、0 review threads。
- `base...frozen` 共 358 个唯一路径，完整 capability 映射：
  - Change governance / 原 capability 归档证据：285
  - 合同、设计、计划与验证文档：13
  - Dashboard Context Bundle / Verify Evidence 共存：22
  - kernel ledger、预算与 digest：16
  - server trusted API 与安全边界：10
  - CLI 与 tap runtime：7
  - compatibility oracle：4
  - canonical capability spec：1
- 映射表：
  `/private/tmp/tenon-pr7-verify3-path-map.tsv`
  （358 行；SHA-256
  `f0af7637ec5cc10767e1fd7c67993f87460f285aff0c8b09fb29f61c2a2b98c2`）。

## C1：共享工作树执行 `npm ci`，repo-zero 失效

E2E / standards 轨先创建了独立 clone：

```text
/private/tmp/pr7-third-verify.XyduuV/repo
```

同一工具调用先用 `git -C "$VERIFY_REPO"` 操作 clone，但安装命令遗漏显式进入
`$VERIFY_REPO`：

```text
git clone ... "$VERIFY_REPO"
git -C "$VERIFY_REPO" checkout ...
npm ci >"$VERIFY_LOGS/npm-ci.log" 2>&1
```

该调用的实际工作目录仍是共享 PR worktree：

```text
/Users/a1234/.codex/worktrees/fc73/pipeline-worklfow
```

因此 install lifecycle 把：

```text
packages/npm-bootstrap/bin/tenon-bootstrap.mjs
100644 -> 100755
```

后续隔离 build 报过 `tsc: command not found`，也佐证首次安装没有发生在 clone。
轨道发现事故后停止；主轨只把该 tracked mode 恢复为 `100644`。恢复后：

```text
non-governance git diff: empty
packages git status: empty
canonical spec tracked diff: empty
HEAD: ac3695ff32a75cc276519f7fabded346aa92ccb4
```

但 repo-zero 判断包含运行全过程，不能只比较最终快照。本轮必须失败。

## Reviewer / Correctness / Security

结论：**FAIL（完整性门禁）；已完成范围未发现额外产品 C/H/M/L**。

- 确认 base、frozen head 与 358 路径。
- 完成 proposal、design、delta/canonical spec、plan，以及 Context Bundle 与既有
  handoff / Verify Evidence 契约关系的静态审查。
- 检查 ledger 编译、顺序、预算、reason/digest、可信路径、server redaction、
  success/error revision recheck、CLI v1 兼容、tap readiness、API decoder、
  i18n、抽屉共存与焦点相关 diff。
- 因硬失败提前结束，未完成所有前端组件、测试与生成资产矩阵，也没有运行动态验证；
  因此不能登记 Reviewer PASS。
- 本轨没有写入共享工作树。

## E2E / API / OpenSpec

结论：**FAIL（C1）；动态矩阵不完整**。

已在正确的隔离 clone 完成：

- `npm ci --include=dev`：PASS
- root build：PASS
- architecture：PASS（639 files、5 个既有 size-only exception）
- dist 内容重建一致

未完成、不得声称：

- root / Web 全量测试
- Linux / Darwin API 矩阵
- Context Bundle、tap、composer、安全负面矩阵
- OpenSpec 1.6.0 show / strict / isolated archive/apply
- 最终 before/after repo-zero 聚合

首次共享 `npm ci` 是本轨造成的精确 C1；没有把事故归因给产品实现。

## Dashboard `design-taste-frontend` / 视觉 / 无障碍

结论：**FAIL / INCONCLUSIVE**。

- 使用与 frozen head 内容一致的 production dist 和隔离 runtime。
- 真实 Chromium 在直接路由自动打开 PR #7 后执行 Escape；首个“焦点回到 PR #7
  卡片”断言失败，脚本随即停止。
- 该脚本比较：

  ```text
  data-drawer-trigger-key === "pr-7-merge-audit"
  ```

  但冻结实现的公开内部 key 合同是
  `rowKeyOf(root, name) = "${name}@${root}"`。脚本没有记录实际 active element/key，
  所以这次失败不能区分“焦点未恢复”与“焦点已恢复但完整 key 不等于短 name”。
- 因此本报告不把它登记为已确认的产品 High，也绝不把焦点恢复登记为 PASS。下一轮必须把
  断言改成完整 `change@root` key、记录实际 active element，并连续覆盖 direct route、
  A→B route、DOM replacement 与 owner-scope。
- 完整主题、语言、视口、状态、modal、overflow、contrast、性能和截图矩阵均未完成。
- 本轨没有写入共享工作树；临时证据位于
  `/private/tmp/tenon-pr7-verify3-visual.1oNf1a/`。

## Codex CLI

结论：**DEGRADED；未执行独立审查**。

只读 `codex review --base 8f9c5fa2b5712b5f0422f61d9ecea32b0f3d41b9`
创建会话 `019faaf3-56c5-7b41-8829-e46cde25bf27`，随后在产出 finding 前被账户额度
门禁终止，提示在 `2026-08-04 11:13` 后重试。不能伪报独立 Codex PASS。

## 回退与下一轮

1. 登记本报告，取得 exact-event `verify-fail` delegated receipt，返回 Build。
2. 在 Build 刷新必要的本地依赖/生成物，确认 shared tracked tree 只含允许的 Change
   治理输出。
3. 修正外部视觉脚本的完整 `change@root` 断言，并以真实 Chromium诊断 direct-route
   焦点恢复；若实际焦点为空或错误，则先加红测、修复产品，再做 pre-Verify 复审。
4. 所有可写安装、build、测试、OpenSpec 演练和 browser runtime 必须在独立 clone；
   wrapper 必须先断言 `pwd`、独立 `.git`、精确 head 与路径不等于 shared root。
5. 串行重跑前后端全量、生成物、架构、安全、hooks、adapters、bundle、oracle、
   OpenSpec、Dashboard `design-taste-frontend`、真实 production Chromium 和独立
   pre-Verify review。
6. 普通提交、推送并取得新的 exact-head CI 后，冻结新的 `build_sha`。
7. 从零重跑四条 Verify 轨、358+ 路径映射、Linux/Darwin/浏览器、GitHub 与
   repo-zero；本轮不完整结果不得复用。
8. 只有新一轮产品 C/H/M/L 全为 0 且所有门禁通过，才能进入 Ship。
