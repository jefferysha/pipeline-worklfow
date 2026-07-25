# Comet / Trellis 工作流优化验证报告

日期：2026-07-26  
Change：`comet-trellis-workflow-analysis`  
Track：`free`  
冻结 Build 基线：`547632980e09074fde86dca08850723180e69def`  
结论：PASS

> 2026-07-26 首轮 Verify 曾发现：free track 的 Skill orchestration
> `matrix=false`，但 Verify 文档合同仍要求
> `verification-before-completion` 生产报告；`artifact register` 复用 orchestration
> 可用集后得到空 producer 集，使合法报告无法写入 artifact 字段。流水线未用
> `pipeline set` 绕过，而是记录 `verify-fail`，经 `requirements-changed` 回到 Spec
> 补齐不变量，再在 Build 以红→绿测试修复。第二轮 Verify 已证明 artifact 字段和
> document ledger 均可正常登记。

## 验收范围

本次验证覆盖：

1. 自然语言 contextual approval、拒绝/约束优先和 pending 下只读动作放行。
2. sibling worktree Skill-read evidence 的 Git common-dir 绑定。
3. 插件单一 canonical Skill 内容树、native/static 发现互斥、安全迁移与冲突诊断。
4. ledger-bound、确定性、预算受限的 Context Bundle v1。
5. Comet、Trellis、pipeline-lite 的研究证据、文档治理和下一阶段消费对比。
6. 原工作树隔离。

## 冻结基线与变更审查

Build 在独立 worktree 中完成，冻结 SHA 与该 worktree 基线一致。实现与规格的逐文件映射如下：

| 改动文件 | 回读并比对的 capability spec | 结果 |
| --- | --- | --- |
| `hooks/prompt-intent.sh` | `interaction-and-skill-provenance` | 通过 |
| `hooks/confirm-clear-prompt.sh` | `interaction-and-skill-provenance` | 通过 |
| `hooks/gate.sh` | `interaction-and-skill-provenance` | 通过 |
| `packages/cli/src/codexProjectIdentity.ts` | `interaction-and-skill-provenance` | 通过 |
| `packages/cli/src/codexTranscriptEvidence.ts` | `interaction-and-skill-provenance` | 通过 |
| `packages/cli/src/codexSkillReceipt.test.ts` | `interaction-and-skill-provenance` | 通过 |
| `adapters/codex/install.sh` | `plugin-distribution` | 通过 |
| `packages/cli/src/commands/doctor-skills.ts` | `plugin-distribution`、`document-evidence-contract` | 通过 |
| `packages/cli/src/commands/doctor.test.ts` | `plugin-distribution`、`document-evidence-contract` | 通过 |
| `packages/cli/src/deps.ts` | `plugin-distribution` | 通过 |
| `packages/cli/src/main.ts` | `plugin-distribution` | 通过 |
| `packages/cli/src/commands/artifact.ts` | `document-evidence-contract` | 通过 |
| `packages/cli/src/commands/artifact.test.ts` | `document-evidence-contract` | 通过 |
| `packages/cli/src/artifact.integration.test.ts` | `document-evidence-contract` | 通过 |
| `packages/cli/src/test-support.ts` | `document-evidence-contract` | 通过 |
| `tools/verify-skills.sh` | `plugin-distribution` | 通过 |
| `tools/test-adapters.sh` | `plugin-distribution` | 通过 |
| `tools/test-hooks.sh` | 三项实现 capability | 通过 |
| `packages/kernel/src/compress/context-bundle.ts` | `context-bundle-handoff` | 通过 |
| `packages/kernel/src/compress/context-bundle.test.ts` | `context-bundle-handoff` | 通过 |
| `packages/kernel/src/compress/index.ts` | `context-bundle-handoff` | 通过 |
| `packages/cli/src/commands/handoff.ts` | `context-bundle-handoff` | 通过 |
| `packages/cli/src/context-bundle.integration.test.ts` | `context-bundle-handoff` | 通过 |
| `packages/cli/src/program.ts` | `context-bundle-handoff` | 通过 |
| `packages/cli/dist/pipeline.mjs` | 四项 capability 的发布 bundle | 通过 |
| `skills/pipeline-build/SKILL.md` | `context-bundle-handoff`、`document-evidence-contract` | 通过 |
| `skills/pipeline-verify/SKILL.md` | `context-bundle-handoff`、`document-evidence-contract` | 通过 |
| `docs/usage/cli-reference.md` | `context-bundle-handoff` | 通过 |
| `docs/TEST-REALITY.md` | `context-bundle-handoff` | 通过 |
| `openspec/specs/context-bundle-handoff/spec.md` | 应用同名 delta | 通过 |
| `openspec/specs/document-evidence-contract/spec.md` | 应用同名 delta | 通过 |
| `openspec/specs/interaction-and-skill-provenance/spec.md` | 应用同名 delta | 通过 |
| `openspec/specs/plugin-distribution/spec.md` | 应用同名 delta | 通过 |

Change 目录、ADR、research、design、journey、plan 和结果报告是上述四项 capability 的治理证据，
已逐份回读；它们不引入独立实现语义。

## 自动化结果

| 验证 | 结果 |
| --- | --- |
| `npm run build` | 通过；kernel/channel/tap/automation/cli/server TypeScript、Dashboard、server bundle、CLI bundle 全部完成 |
| `npm test` | 292 files、5,136 passed、5 skipped、0 failed |
| `npm run test:web` | 49 files、933 passed、0 failed |
| `bash tools/test-hooks.sh` | 446 passed、0 failed |
| `bash tools/test-adapters.sh` | 267 passed、0 failed |
| Context Bundle + legacy handoff 定向测试 | 25 passed |
| Worktree Skill receipt 定向测试 | 34 passed |
| Doctor 定向测试 | 40 passed |
| production dist + 关键新增能力复跑 | 111 passed |
| free artifact producer unit + production-manifest integration | 42 passed |
| `npm run check:comments` | 通过 |
| `npm run check:architecture` | 通过；559 production files |
| `npm run check:docs` | 通过；8 checker tests + 21 canonical Markdown files |
| `npm run check:default-workflow-freshness` | 通过 |
| `bash tools/verify-skills.sh` | 通过；64 路径、63 Skill、63 bundled registry token |
| Shell `bash -n` | 通过 |
| `git diff --check` | 通过 |
| `openspec validate comet-trellis-workflow-analysis --strict` | 通过 |
| 四个本次触达主 spec 的逐项 strict validate | 4/4 通过 |

第一次全量 `npm test` 有一个 production-dist smoke 失败，原因是新 worktree 尚未运行 build，
缺少 `packages/server/dist/workflows.js`。完成 `npm run build` 后，该 smoke 定向复跑通过，
随后重新完整运行达到 5,136/5,136，通过结论取当前实现的新鲜结果。

5 个 skip 均为仓库已有的环境条件测试：真实 Codex 黑盒或 Claude Code 沙箱需要
`PIPELINE_REQUIRE_REAL_CODEX=1` / `CLAUDE_CODE_OAUTH_TOKEN` 和相应镜像。Docker 非凭证路径已真实运行；
这些 skip 不覆盖本 Change 的新增能力。

## 行为 smoke

真实 Change 执行：

```text
pipeline handoff comet-trellis-workflow-analysis --bundle --target build --json
```

结果：

- schema：`context-bundle/v1`
- source/target：`build -> build`
- ledger inputs：11
- budget：27,354 / 120,000 UTF-8 bytes
- aggregate digest：
  `sha256:e1f562324ea128821d415c58b61c176f19efeda518a29d2d5fbf0b0c288ebe4c`

重复编译、digest drift、缺文档、非法输入和超预算行为由 kernel/CLI 集成测试覆盖。

## 单一 Skill 根验证

- Claude 与 Codex plugin manifest 都指向同一 `./skills/`。
- `verify-skills.sh` 会扫描插件包中的全部 `SKILL.md`，canonical `skills/` 外出现第二份即失败。
- native Selected Skill Root 存在时，Codex adapter 不创建项目 `.agents/skills` 投影。
- static-only 模式只创建一个投影且重复运行幂等。
- owned legacy symlink 只在精确解析到 canonical source 时移除。
- 真实目录、dangling/foreign symlink 保留并产生 `shadow-conflict`。
- Doctor 区分 selected native、static-only、`duplicate-projection`、`shadow-conflict` 和 inactive cache。

## 原工作树隔离

`git worktree list --porcelain` 显示：

- 原工作树：`/Users/a1234/Documents/code-manager/projects/pipeline-worklfow`，branch `main`
- 本 Change：`/Users/a1234/Documents/code-manager/projects/pipeline-worklfow-comet-trellis-analysis`，
  branch `codex/comet-trellis-workflow-analysis`

原工作树不存在本 Change 的 Context Bundle 源文件、集成测试、结果报告或 OpenSpec Change 目录，
且原 `handoff.ts` 不含本次新增的 canonical-target 诊断。原工作树已有的其他未提交修改未被读取后写回。

## OpenSpec 回灌

Verify 按 delta→main 规则应用了四个 capability：

- 新增 `context-bundle-handoff`
- 修改 `document-evidence-contract`
- 修改 `interaction-and-skill-provenance`
- 扩展 `plugin-distribution`

四个触达主 spec 均通过 strict validate。全仓 `openspec validate --specs --strict` 仍有 12 个
与本 Change 无关的旧主 spec 因缺少 `## Purpose` 失败；本次未扩大范围批量改写这些历史规格。

## 未执行与残余风险

- 未 push、未创建 PR、未发布插件、未修改外部系统。
- 没有 UI 行为改动，因此不需要浏览器视觉验收。
- Context Bundle v1 当前按 canonical 七阶段 document contract 编译；任意 custom workflow
  step 的声明式 `inputs`/`outputs` 接线仍是后续 P2。
- 自然确认是可审计的确定性分类，不是不可复验的 LLM 自由判断；低置信度继续 fail closed。
- task-level checkpoint、Skill snapshot 和 bundle-to-agent dispatch 属于后续 P3/P4，不在本次范围。

上述限制不影响本次四项 capability 的验收结论。
