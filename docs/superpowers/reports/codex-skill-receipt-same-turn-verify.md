# codex-skill-receipt-same-turn 验证报告（失败回退记录）

## 验证范围

- 冻结基线：`workspace:sha256:0c7f415d4403e2037b0ff978c125e201bc6e995dea7b845f5795d476ef93188f`。
- 审查自定义 Codex `custom_tool_call` ABI 对 `cmd` / `workdir` 的解析、同轮完成判定和 sibling worktree 身份校验。
- 回归既有 `function_call` ABI、Skill receipt、internal Skill DAG 与 stable hook。
- 在仓库外隔离副本中验证首次 `document record` 成功以及缺少 `workdir`、跨仓库、动态值、失败输出的拒绝路径。

## 执行命令

- `npx vitest run packages/cli/src/codexSkillReceipt.test.ts`
- `npx vitest run packages/cli/src/codexSkillReceipt.test.ts packages/cli/src/internal-skill-gate-hook.integration.test.ts`
- `npm run test:hooks`
- `npm run build`
- `npm run check:architecture`
- `npm run check:comments`
- `npm test`
- `openspec show codex-skill-receipt-same-turn --json --deltas-only`
- `openspec validate codex-skill-receipt-same-turn --strict`
- 隔离副本中的 `openspec archive codex-skill-receipt-same-turn --yes --json`

## 结果

- 行为 E2E 轨通过：真实 main + sibling worktree + Change 中，配置受信插件根后，首次同轮 `document record` 成功；四类安全拒绝路径均通过。原工作树指纹保持不变。
- 定向测试、hook、构建和静态门禁均通过。首次全仓测试仅因 fresh worktree 尚未生成 `packages/server/dist/workflows.js` 失败；执行正式构建后该用例单独通过，完整重跑仍在本轮聚合时执行。
- OpenSpec delta strict validate 通过，隔离副本 archive/apply 演练成功，真实主规格 digest 未变化。
- Reviewer 轨结论：**FAIL**，发现 1 个 High、1 个 Low；无 Critical / Medium。

## 失败与阻塞

- **High — 可伪造 custom ABI Skill receipt。** `codexToolProgram.ts` 仅以文本搜索定位 `tools.exec_command(`，没有证明它是被 `await` 的真实调用，也没有把成功输出绑定到该调用的返回值。注释、字符串、死代码或未执行调用可与自造 `text("Script completed")` 组合，被 `codexTranscriptEvidence.ts` 误判为真实 Skill 读取。该缺陷会绕过 mandatory Skill evidence 信任门，必须回到 Build 修复。
- **Low — function-call 负向回归覆盖被替换。** 需恢复 sibling worktree 缺 `workdir` 的旧 ABI 拒绝测试，同时保留新增 custom ABI 用例。
- 本报告明确选择持续自主模式的安全默认值“修复”，不接受偏差，不进入 `verify-pass`。
- **第二轮 Verify — 上游基线漂移。** 新冻结基线为
  `workspace:sha256:42928f19ec05babda84555ad9408950530887cf8db8e8005f0ab10fdf247b0b7`，
  但进入 Verify 后确认 `origin/main` 已从 `7c59eecf` 前进到 `607c2ed9`（PR #18）。
  用户要求分支从最新 `origin/main` 干净审查，因此不能在 Verify/Ship 静默改写已冻结基线；
  本轮再次走 `verify-fail` 回 Build，在 Build 中 rebase、重建并重新验证。
- **第三轮 Verify — High：内部非零退出可被外层成功遮蔽。** 规范 wrapper
  `const result = await tools.exec_command(...); text(result.output);` 只把 stdout 转发到
  `custom_tool_call_output`；`tools.exec_command` 对非零退出不抛异常，外层仍可显示
  `Script completed`。现有成功判断因看不到内部 `exit_code`，可能把实际失败的 Skill 读取登记为
  `CodexSkillRead`。必须只接受把同一变量的完整执行结果传给 `text(result)` 的 wrapper，并要求可见
  的内部 `exit_code=0`；只转发 `.output` 必须拒绝。
- **第三轮 Verify — Medium：规格尚未固定完整 wrapper 与内部退出码。** delta spec、设计和 ADR
  必须明确 awaited 顶层调用、同一变量的完整结果转发、绝对 `workdir`、内部零退出以及 output-only
  wrapper 的拒绝路径。
- **第三轮 Verify — P2：JSON 旁路选项被过度限制。** JSON 对象已经由 `JSON.parse` 限定为纯数据，
  但当前实现额外拒绝数组值，导致 Codex 合法的 `prefix_rule` 等非关键选项使解析失败。实现应只验证
  `cmd` / `command` / `workdir` 三个信任字段，忽略其他 JSON 字面量值。
- 第三轮 E2E 的既有 63 项场景通过，但矩阵未覆盖内部非零退出，不能抵消上述 High。隔离 Codex
  review 因只读副本中的 Vitest timestamp 写入 `EPERM` 未能重跑测试；这是审查环境限制，不计为代码
  通过证据。
- 本轮继续选择持续自主模式的安全默认值“修复”，先以 `requirements-changed` 回到 Spec 固定契约，
  再进入 Build 实现和全量复验。
- **第四轮 Verify — 上游基线再次漂移。** 冻结基线为
  `workspace:sha256:eafc6d1adb9f759921cf7e08fa633a1c8942f5d7f5d994c0dd10e19ce78634c0`，
  Reviewer 轨以 0 个 Critical / High / Medium 通过，运行时 E2E 轨在真实 managed runtime、
  stable launcher、真实 Git sibling worktree 与全新 Change 上通过首次同轮登记和 12 条拒绝路径；
  OpenSpec 隔离 archive/apply 演练也通过。进入 Verify 后 `origin/main` 又从 `607c2ed9`
  前进到 `445aa141`。虽然新提交与本 Change 的实现文件没有重叠，用户要求从最新主线干净审查，
  因此仍不能在 Verify 中静默重写冻结基线。本轮选择 `verify-fail` 回到 Build，rebase 后重新构建、
  冻结和执行三轨验证。
- 第四轮 Codex CLI 审查在只读 sandbox 中运行；其 Vitest 尝试因无法写入 Vite timestamp
  返回 `EPERM`，不计为测试通过证据。正式可写工作树中的最新权威结果为 327 个测试文件通过、
  5743 个测试通过、26 个条件跳过。

## 剩余风险

- 修复必须只接受规范、可静态证明的 `await tools.exec_command(<受限字面对象>)` wrapper，并把结果传给 `text`；不应扩展为通用 JavaScript 求值器。
- 内部执行退出码必须来自完整的 nested result，外层完成状态不能替代内部成功证据。
- 下一轮 Verify 必须重新冻结基线、回归本轮全部发现并重新全量审查，而非只复查两个 finding。
- `npm audit` 报告的 7 个既有依赖漏洞（5 moderate、1 high、1 critical）不由本 Change 引入，不能据此声称依赖面绿色。
