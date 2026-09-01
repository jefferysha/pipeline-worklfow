# Capability routing and execution adapter v1

## Goal

在已经完成的 Kernel schema/state/router 之上，补齐一个 Automation 应用边界：模型只能提出能力评估，宿主负责校验、归属和记录；随后把用户自定义 Skill/MCP 的确定性路由接到最小 Skill 执行循环。这样自然语言目标可以进入“评估 → 路由 → 执行 → 结果 envelope”闭环，同时保留异构产出和失败阻塞的诚实语义。

## Background and confirmed facts

- Kernel 已提供 `DevelopmentRequestV1`、`CapabilityAssessmentV1`、`WorkGraphV1`、`CapabilityResolutionV1`、`SkillResultEnvelopeV1` 与不可变 `applyBoardCommand`；它不读取文件系统、模型或进程。
- Automation 已提供 `triage` 的 provider/provenance/unknown-output 边界、queue/scheduler/admission/runner/lifecycle 和 `task-plan-run` 的依赖/资源调度；当前没有面向 orchestration schema 的应用服务。
- 用户 Skill 的输出结构不可预先统一。编排器只能依赖通用 envelope、artifact 引用和宿主 validator；领域 payload 必须保持 opaque。
- 用户显式 Skill 顺序、依赖和并行意图优先；自动选择只填补缺口，并必须记录版本、来源和理由。

## In scope

1. 在 `packages/automation/src/orchestration/` 新增 provider-neutral 的能力评估提案 port、宿主一次性规范化器和 bounded provenance；模型输出是 `unknown`，无效或越界提案只能产生可诊断的 `needs-input`/阻塞结果。
2. 新增一个应用层路由/执行适配器，消费已冻结的 `WorkGraphV1` 与 Kernel `resolveCapabilities`，按显式选择、依赖、可用性、权限和资源冲突确定 Skill/MCP 绑定；不在 Automation 重写 Kernel 状态机。
3. 新增 Skill executor/validator ports：executor 可以返回任意 opaque payload，只有宿主 validator 才能签发 `validated`；没有 validator、输出超限、异常或 contract 不明时，生成 `unknown`/`invalid` envelope 并让 board 进入 `blocked`/`failed`，绝不伪造完成。
4. 通过 `applyBoardCommand` 驱动一个 Change 的 claim → run → result → validation（若可验证）状态链；支持 graph 中可并行的独立 Work Item，遇到写资源冲突或依赖未满足时保持串行/阻塞。
5. 从 `packages/automation/src/index.ts` 导出新应用 port 和用例；用单元测试覆盖成功、无效提案、显式优先、自动补缺、并行/依赖、opaque 输出、validator 失败、runner 异常和重复 active run。

## Out of scope

- 不新增 HTTP/SSE、Dashboard、CLI 命令或持久化 repository；下一子任务再把应用快照接到 Server/Dashboard。
- 不接入具体模型 SDK、MCP vendor 或新的外部依赖；具体 provider 通过 port 注入。
- 不在本子任务生成完整自然语言 Work Graph；graph 由上游规划器/适配器提供，后续子任务再补 deterministic planner。
- 不修改 Kernel 已发布 schema 的字段顺序、默认 workflow 生成物、现有 Automation scheduler/admission 状态或 Docker/Git 合并策略。
- 不把模型置信度当作 gate、测试或人工审批的替代品。

## Acceptance criteria

- [ ] provider 的任意 `unknown` 输出都必须经过宿主 decoder/边界校验；未知字段、错误 request/context 归属、超出大小预算或循环值不能进入 canonical assessment，且返回稳定诊断。
- [ ] 有效 assessment 能在不要求用户选择场景的情况下产出能力需求、约束、风险和待澄清问题；场景标签（若有）只作为信号，不参与状态迁移。
- [ ] 给定用户显式 Skill/MCP、冻结 graph 和 descriptor catalog，路由结果稳定可重复，显式选择优先，自动补缺，版本与理由可审计；不可用、权限不足、依赖环、并行写冲突进入 `blocked`/`needs-input`。
- [ ] 两个无依赖且资源安全的 Work Item 可并行执行；有依赖或共享写资源的 Work Item 不会并行执行，且输入只绑定已完成上游的结果引用。
- [ ] executor 返回任意领域 payload 不会导致编排器崩溃或被错误解释；没有宿主 validator 的结果 `contract_status` 只能是 `unknown`，不能把 Work Item 推进到 `completed`。
- [ ] validator 通过后，结果和 validation report 经 Kernel command/CAS revision 推进；validator 失败、runner 异常、取消和重试均保留诊断并落到可恢复状态，重复 run 不会产生第二个 active run。
- [ ] 相关 Automation 定向测试、`npm run build`、`npm run check:architecture`、`npm run check:comments` 和 `git diff --check` 通过；完整 `npm test` 若受并行 server 超时影响必须单独报告，不能冒称全绿。

## Key decisions and deferred risks

- 采用“双层契约”：provider invocation/proposal 是 untrusted evidence，Kernel assessment/result envelope 才是 canonical state；原始 payload 只允许 bounded reference，不让模型直接改 state。
- 本切片只保证内存中的应用闭环，重启恢复仍依赖下一子任务的 snapshot/repository adapter；因此暂不宣称完整 MVP 已交付。
- `SkillResultEnvelopeV1` 的通用字段足以看板展示，但下游跨 Skill 的语义连接需要 validator/artifact registry；若真实运行中发现大量未验证结果，再据数据决定是否新增 output contract registry，而不是现在预置闭集。

## Open questions

无阻塞的产品决策；实现可按上述范围直接进入设计评审。
