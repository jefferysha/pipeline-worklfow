# codex-skill-receipt-same-turn 验证报告

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
- **第五轮 Verify — Codex 轨发现 1 High / 1 Medium。** Reviewer 轨与真实 managed runtime
  E2E 轨通过，OpenSpec 隔离 apply 演练通过，冻结基线
  `workspace:sha256:9614154f2b83afab0f444715fbb187aab8c150df1af06bcac9eca1a442318ab5`
  前后未漂移；但独立 Codex CLI 轨证明 `successfulOutput` 会从任意 stdout 文本提取
  `exit_code: 0`，使没有完整 nested result 的输出可能伪造成功（High）。同时 fallback
  discovery 只绑定 session 与 visit 时间，没有绑定可审计的当前 turn（Medium）。
- 第五轮选择持续自主模式的安全默认值“修复”：不得把两轨通过抵消第三轨的安全发现，
  先走 `verify-fail` 回 Build，拆分 custom/function completion ABI，令 custom 路径只接受
  完整 result 信封，并把 fallback 限定在受信当前 turn；新增 exact/fallback 伪造输出与跨 turn
  回归测试后重新执行全量门禁。
- **第六轮 Verify — Codex 轨发现 2 High / 3 Medium。** Reviewer 轨以 146 个文件全覆盖、
  Critical/High/Medium/Low 全零通过；真实 managed runtime E2E 轨完成首次同轮推进和 13 类拒绝
  路径，冻结基线 `workspace:sha256:59c9d64bd8ebbfb8e3a87b7db4029afe7f9daa557b06e4e887bd8e6bd169ef13`
  前后未漂移；OpenSpec 隔离 archive/apply 演练及主规格 digest 也通过。
- 独立 Codex CLI 轨发现：custom completion 仍接受未标型顶层 `exit_code` 对象与完整形状 JSON
  stdout（High）；fallback 在 `payload.id` 缺失时仍回退继承的 `session_id`（High）；损坏 JSON
  或 `session_meta` 前 I/O 中断仍可能继续旧 transcript（Medium）；sibling `workdir` symlink
  未被显式拒绝（Medium）；最新 current-turn/fork/I/O 安全语义尚未进入 delta spec，上一轮未走
  `requirements-changed`（Medium）。
- 第六轮继续选择安全默认值“修复”：登记本失败报告并走精确 `verify-fail` 回 Build，再以
  `requirements-changed` 回 Spec 固定完整信封、强制 transcript `payload.id`、损坏 transcript
  失败关闭和无 symlink sibling 身份，随后重新实现、冻结并执行全量三轨。
- **第七轮 Verify — Codex 轨发现 2 High / 2 Medium。** Reviewer 轨对 168 个路径完成全覆盖，
  Critical/High/Medium/Low 全零通过；真实 managed runtime E2E 轨在冻结基线
  `workspace:sha256:61113e4d8e989987e3223db8efe300953914ee0db99cd31ff4d872c6f2b04a23`
  上通过首次同轮推进、101 项定向测试、31 项 bundle、512 项 hooks 与 66/62 项 Skill 校验，
  且基线前后未漂移。
- 独立 Codex CLI 轨证明：custom 调用可与同 `call_id` 的 function output 错型配对，从而绕过
  custom 完整信封要求（High）；带全套公开字段的未标型对象仍可伪造 custom 成功（High）；
  transcript 枚举阶段的读取、竞态或预算失败可能跳过新文件并回退旧证据（Medium）；当
  `commandWorkdir` 与 `targetRoot` 同时使用含 symlink 祖先的相同字面路径时仍会被接受
  （Medium）。
- 第七轮继续选择安全默认值“修复”：必须把 invocation ABI 与 output ABI 严格绑定，只接受
  序列化的当前 custom 信封或明确标型的旧 `execution_result`，令枚举阶段无法证明最新性时
  整体失败关闭，并拒绝目标路径自身含 symlink 祖先。完成红灯测试与实现后重新执行三轨 Verify。

## 最终 Verify（冻结基线）

- 冻结内容基线：
  `workspace:sha256:eb6aeded3ee47bbe8c40e0e2dc0c9d80c6bcfc34ccf4420495be75820f02f92f`；
  implementation HEAD：`8e2850bb1a24ad329fa400ec956ab64db207c886`；
  implementation 指纹前后均为
  `cd4a8c7949d6f54d46d00e732221f8551639722961270dabd8e03bf6c429ebe4`。
- Reviewer 轨覆盖 base...HEAD 的 198/198 个路径：implementation 11/11、读者文档/规格/
  ADR/计划 9/9、canonical governance 178/178、未分类 0；结论
  `Critical/High/Medium/Low = 0/0/0/0`。
- Codex CLI 在只读隔离 clone 中完成 base review，结论为“未发现可执行回归”。其额外 Vitest
  尝试因只读网络沙箱无法连接本机 npm 代理而失败；该环境失败不作为测试证据，也不抵消主轨
  已有的可写隔离验证。
- 主线在全新隔离 clone 中对最终 HEAD 运行
  `codexSkillReceipt.test.ts`、`internal-skill-gate-hook.integration.test.ts`、
  `runtime/stable-hook.integration.test.ts` 与 `skillSources.test.ts`：
  4 个文件、111 项全部通过。其中包含 stable launcher/hook、真实 receipt→同轮 evidence、
  sibling worktree、完整 custom result 与拒绝矩阵。
- 本次真实宿主会话在 sibling worktree 的 Spec 阶段首次
  `document record ... --producer tenon-spec` 即成功，并在同一轮完成全部文档登记与
  `tenon check`；没有依赖第二条用户消息，直接验证了本修复的调度场景。
- OpenSpec 1.6.0 隔离演练：change strict validate 通过，archive/apply 成功并新增
  4 项 requirement，应用后的 `codex-skill-receipt-current-turn` 主规格 strict validate
  通过。全仓 `--specs --strict` 仍有 8 个与本 Change 无关的既有规格失败，未声称全仓规格绿色。
- 聚合结论：三轨均无 Critical / High / Medium，冻结实现未漂移，Verify **PASS**。

## 剩余风险

- 未来 Codex 若改变 tool-program 或 custom result ABI，当前实现会失败关闭并继续显示“缺少 Skill
  调用证据”，不会伪造 evidence；届时需以新的真实 host transcript 扩展受支持 ABI。
- `npm audit` 的 7 个既有依赖漏洞（5 moderate、1 high、1 critical）不由本 Change 引入。
- 全仓 OpenSpec strict validation 的 8 个既有失败与本 capability 无关；本 Change 与应用后的
  `codex-skill-receipt-current-turn` 均已单独 strict validate 通过。
- `npm audit` 报告的 7 个既有依赖漏洞（5 moderate、1 high、1 critical）不由本 Change 引入，不能据此声称依赖面绿色。
