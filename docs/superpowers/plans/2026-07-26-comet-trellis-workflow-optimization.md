# Comet/Trellis 工作流优化实施计划

change: comet-trellis-workflow-analysis  
design-doc: docs/superpowers/specs/2026-07-25-comet-trellis-workflow-analysis-design.md

## 目标与边界

在不引入第二套 workflow engine、不削弱 exact-event review 和文档证据的前提下，实现四个
最小可验证闭环：

1. 同一 Git 仓库不同 worktree 的显式工具调用可产生真实 Skill-read 证据；
2. 自然语言确认绑定唯一 pending target，pending 期间严格只读动作可继续；
3. 原生插件与静态 adapter 的 Skill 发现互斥，一个 release 只有一个 Selected Skill Root；
4. 现有 handoff 可选择生成 ledger-bound、确定性、预算有界的 Context Bundle v1。

不在本轮实现 Artifact Graph 持久化、task checkpoint、完整 risk-tier 编译器或宿主 LLM
分类服务。旧 handoff 输出、旧 ledger schema 和无原生能力的 static-only 安装保持兼容。

## 工作纪律

- 所有修改只在
  `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow-comet-trellis-analysis`。
- 每个任务先增加失败测试，再实现，再运行局部测试。
- shell/hook 改动必须通过 `bash -n` 和 `tools/test-hooks.sh`。
- adapter 改动必须验证真实目录、owned symlink、foreign symlink、重复运行四类场景。
- Context Bundle 不修改 canonical state；bundle 是 ledger 的确定性派生物。
- 每个阶段完成后重读 diff；Spec→Build、Build→Verify 按 pipeline receipt 推进。

## Phase 0：worktree Skill 证据兼容（已实现，Build 需复验）

### Task 0.1：建立 Git physical-project identity

文件：

- 新建 `packages/cli/src/codexProjectIdentity.ts`
- 修改 `packages/cli/src/codexTranscriptEvidence.ts`
- 修改 `packages/cli/src/codexSkillReceipt.test.ts`

步骤：

1. 添加 red tests：session cwd 与工具 workdir 是同一仓库 sibling worktree 时接受；缺失
   explicit workdir、不同 Git common-dir、非目标路径时拒绝。
2. 用 `git rev-parse --git-common-dir` 解析 physical identity；解析失败时严格回退到原有
   exact-root 行为。
3. 只在 completed tool call 明确声明 governed worktree 时放宽 transcript cwd。
4. 运行：

   ```bash
   ./node_modules/.bin/vitest run packages/cli/src/codexSkillReceipt.test.ts
   npm run bundle
   ```

验收：新增正例通过，所有原有拒绝场景不回归。回滚只需移除 helper 和调用点。

## Phase 1：自然确认与 ActionEffect tracer bullet

### Task 1.1：扩充单一 prompt intent 合同

文件：

- 修改 `hooks/prompt-intent.sh`
- 修改 `tools/test-hooks.sh`

测试先行：

- `可以`、`同意`、`按推荐`、`继续，按照你的推荐` 在存在唯一 pending target 时确认；
- `不可以`、`不要继续`、`继续但先别改代码` 不被误判为无约束批准；
- 普通提问中出现“可以”不成为持续授权；
- 跨 Change/event marker 不被清除。

实现：

- 在 source-only classifier 中增加规范化的 contextual approval 结果；
- rejection/revocation/constraint 规则优先；
- 保持 continuous authority 单独分类，禁止短回复升级为 continuous。

验收：

```bash
bash -n hooks/prompt-intent.sh
bash tools/test-hooks.sh
```

### Task 1.2：pending gate 放行严格只读动作

文件：

- 修改 `hooks/gate.sh`
- 必要时新建 `hooks/lib/action-effect.sh`
- 修改 `tools/test-hooks.sh`

测试先行：

- 允许文件读取工具、`rg`、`git status/diff/log/show`、只读 pipeline
  `list/status/get/document status/inbox`；
- 阻断 `apply_patch`、文件写工具、`git commit`、`pipeline set/transition`；
- 阻断重定向、命令替换、后台执行、管道中未知命令、读取+写入 shell 链；
- 未知工具 fail closed；
- 放行只读动作不清 marker。

实现：

- 先按 tool name 分类；
- 对 shell 使用严格 command-segment allowlist，任何不确定构造使整条命令非只读；
- exact review acknowledge/transition 继续走现有专用例外和 receipt。

验收：

```bash
bash -n hooks/gate.sh hooks/lib/action-effect.sh
bash tools/test-hooks.sh
```

回滚：删除 read-only 特例即可恢复 blanket gate；不影响 canonical receipt。

## Phase 2：单一 Skill 所有权和安装收敛

### Task 2.1：提取 Selected Skill Root 检测

文件：

- 检查并复用 `packages/cli/src/skillBundleAssembly.ts`
- 修改或新建 `packages/cli/src/selectedSkillRoot.ts`
- 修改 `packages/cli/src/commands/doctor-skills.ts`
- 修改相应 `*.test.ts`

测试先行：

- native selected root 是唯一高信任根；
- 历史 cache 不进入 active candidate set；
- 同 ID/同 digest 返回 `duplicate-projection`；
- 同 ID/不同 digest 返回 `shadow-conflict` 并 fail closed；
- 输出不泄漏不必要的机器级敏感路径。

实现：

- 返回 selected root identity、release identity、Skill digest 和 conflicts；
- execution/evidence 不以全盘 cache 扫描结果替代 selected root；
- 保留 external-tier 仅在高信任 tier not-found 时下降的现有契约。

### Task 2.2：让 native/static adapter 互斥

文件：

- 修改 `adapters/codex/install.sh`
- 修改 `tools/test-adapters.sh`
- 如需 ownership 记录，新增 adapter-local manifest schema 与测试 fixture

测试先行：

- 检测到 native selected root 时不创建 `.agents/skills/pipeline-*`；
- 无 native 能力的 static mode 创建且只创建一个项目投影；
- 重复安装幂等；
- 切换 native 时只删除指向 exact expected source 的 owned symlink；
- 真实目录、普通文件、foreign symlink 一律保留并报冲突。

实现：

- `install_project_skills` 前解析 native capability/selected root；
- native 模式跳过投递，并执行 ownership-safe legacy convergence；
- static 模式保留兼容投影；
- 不对 `~/.agents/skills` 或历史 cache 做批量删除。

验收：

```bash
bash -n adapters/codex/install.sh
bash tools/test-adapters.sh
./node_modules/.bin/vitest run packages/cli/src/commands/doctor-skills.test.ts
```

若实际测试文件名不同，使用 `rg --files packages/cli/src | rg 'doctor.*test'` 定位后记录。

### Task 2.3：发布时证明 Skill 内容唯一

文件：

- 修改现有 package verification 实现和测试
- 检查 `.codex-plugin/plugin.json`、`.claude-plugin/plugin.json`
- 检查 `templates/skill-sources.yaml`

测试：

- registry 每个 first-party content Skill 映射到一个 `skills/<id>/SKILL.md`；
- payload 内第二棵相同 ID 内容使验证失败；
- 两个 host manifest 引用同一 payload tree 不算内容重复。

验收：package tests、bundle smoke 和 adapter tests 全部通过。

## Phase 3：Context Bundle v1

### Task 3.1：定义纯领域 bundle 类型和确定性编码

文件：

- 新建 `packages/kernel/src/compress/contextBundle.ts`
- 修改 `packages/kernel/src/compress/types.ts`
- 修改 `packages/kernel/src/index.ts`
- 新建 `packages/kernel/src/compress/contextBundle.test.ts`

类型：

```ts
interface ContextBundleV1 {
  schemaVersion: 'context-bundle/v1'
  change: string
  from: string
  to: string
  tier: 'light' | 'strong'
  inputs: Array<{
    kind: string
    path: string
    digest: `sha256:${string}`
    reason: string
    mode: 'full' | 'summary' | 'reference'
    content?: string
  }>
  budget: { maxBytes: number; usedBytes: number }
  aggregateDigest: `sha256:${string}`
}
```

测试先行：

- 固定输入顺序与稳定 canonical JSON；
- 输入顺序变化由 policy 规范化；
- aggregate digest 不包含其自身字段；
- mandatory bytes 超预算失败；
- 非法 target/path/digest 拒绝。

kernel 保持纯函数；文件读取、ledger 校验和 SHA 计算留在 CLI application 层。

### Task 3.2：在现有 handoff 上增加 opt-in bundle 模式

文件：

- 修改 `packages/cli/src/commands/handoff.ts`
- 修改 CLI 参数注册文件
- 修改 `packages/cli/src/handoff.integration.test.ts`
- 复用 document ledger 读取/哈希 helper

兼容接口：

```bash
pipeline handoff <change> --bundle --target build [--budget-bytes 120000] [--json]
```

行为：

- 不带 `--bundle` 时旧 text/JSON 完全不变；
- `--bundle` 必须有一个合法 target；
- 从 effective document policy 取得 kind 顺序和 reason；
- 对每个输入校验 ledger record 与当前文件 SHA；
- delta specs 按 capability 稳定排序；
- 超预算、缺失、漂移时非零退出，不输出有效 digest。

集成测试：

- 两次生成 byte-identical；
- Build 输入顺序完整；
- 文件改动后报 stale；
- 未登记文档报 missing；
- 小预算报 required/available bytes；
- legacy snapshot 不变化。

### Task 3.3：生成文档和消费说明

文件：

- 修改 CLI reference/readme 对 handoff 的说明
- 修改相关 phase Skill，使 Build/Verify 在支持时优先读取 bundle
- 不把 bundle 手工登记为 canonical document

验收：旧 runtime 可继续调用 legacy handoff；新 runtime 只在显式 bundle 模式使用 v1。

### Task 3.4：解除 free track 的 artifact producer 死锁

文件：

- 修改 `packages/cli/src/commands/artifact.ts`
- 修改 `packages/cli/src/commands/artifact.test.ts`
- 修改 `packages/cli/src/artifact.integration.test.ts`
- 修改 `packages/cli/src/test-support.ts`

行为：

1. `matrix=false` 继续关闭自动 Skill 编排和 exit gating。
2. 声明式 artifact 仍使用 Track profile 的 phase allowlist 校验 producer。
3. 未声明 profile producer、未知 producer 和真正的空 profile 继续 fail closed。
4. 以 free/verify/`verification-before-completion` 的 unit + production-manifest
   integration test 覆盖该边界。

## Phase 4：整体验证和交付

### Task 4.1：局部与全量自动化

依次运行：

```bash
./node_modules/.bin/vitest run packages/cli/src/codexSkillReceipt.test.ts
bash tools/test-hooks.sh
bash tools/test-adapters.sh
./node_modules/.bin/vitest run packages/kernel/src/compress/contextBundle.test.ts
./node_modules/.bin/vitest run packages/cli/src/handoff.integration.test.ts
npm test
npm run bundle
git diff --check
```

任何失败先分类为本次回归、既有失败或环境限制；不得把未运行写成通过。

### Task 4.2：行为级验收矩阵

- 自然确认：正例、拒绝、混合约束、歧义、错 target；
- ActionEffect：只读正例、shell 注入/组合负例、未知工具；
- worktree evidence：同 common-dir 显式 cwd 正例与三个负例；
- Skill root：native、static、duplicate、shadow、foreign ownership；
- bundle：确定性、顺序、reason、digest、budget、drift、legacy compatibility。

### Task 4.3：文档和 OpenSpec 收口

- 更新最终研究报告中的“当前差距”为“已实现/后续”；
- 生成 Verify report，记录确切命令和输出摘要；
- Ship 时应用 delta specs 到主 specs；
- Archive 前读取全部最终产物和收据。

## 风险与回滚

| 风险 | 抑制 | 回滚 |
| --- | --- | --- |
| 自然语言误批准 | exact target + 拒绝/约束优先 + 低置信度不清门 | 恢复旧 approval 词表 |
| shell 只读误分类 | 严格 allowlist，未知构造整体拒绝 | 关闭 read-only shell 特例 |
| 删除用户 Skill | 只删 exact owned symlink，foreign 一律保留 | adapter 保留 static projection |
| native 检测假阳性 | 验证 selected root/payload identity | 回到显式 static-only |
| bundle 成为第二真相源 | 只读 ledger 派生，不写 canonical state | 移除 opt-in `--bundle` |
| 旧 CLI 消费破坏 | 保留 legacy handoff 默认输出 | 禁用 bundle flag |

## 完成定义

- Delta Specs、计划、旅程、tasks 均登记到 document ledger 并在当前 visit 读取；
- 四个闭环的成功和失败测试均通过；
- native 模式不再安装同名项目 Skill，静态模式仍有唯一兼容路径；
- 用户自然确认不要求固定口令，pending 下只读研究不再自锁；
- Context Bundle v1 可由当前 ledger 确定性生成并校验漂移；
- 原工作树无任何本次修改。
