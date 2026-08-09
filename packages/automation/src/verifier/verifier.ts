/**
 * host VerifierPort（GOAL 清单 H · H7 verifier Phase 2）—— automation runtime 一侧的结构化核验
 * 产生面 + settlement 消费面判定表。
 *
 * 与 kernel `verification/`（H7 Phase 1，只定类型+窄校验+isTrustedPass，automation 侧此前零引用）
 * 的分工：本模块是 automation 包内**第一个**实际调用 VerificationResult 类型的生产代码——
 *   · VerifierPort：host 侧核验产生面契约（lifecycle.ts 在 merge 之前、取得权威 build SHA 后调用，
 *     见 lifecycle.ts::runChangeInSandbox）。
 *   · createDefaultVerifierPort：未接线真实核验能力时的安全兜底——诚实回 inconclusive（能力缺失），
 *     绝不冒充 trusted pass（D4 裁决：trusted 由 issuer 类型派生，sandbox 自报恒不可信；host-verifier
 *     issuer 恒 trusted:true，但 verdict=inconclusive 时 isTrustedPass 恒 false，不构成 merge 授权）。
 *   · enforceVerificationBoundary：H7 复审阻断1 核心修复——VerifierPort.verify() 的运行时输出边界。
 *     VerifierPort 只是接口契约（`Promise<VerificationResult>` 只是编译期承诺），任何注入实现（含
 *     未来第三方/沙箱可控适配器）在运行时都可能返回不满足不变式的对象（sandbox 冒充 trusted:true、
 *     passed 却零 evidence、verdict 是垃圾字面量……），TS 静态类型对此零保护。lifecycle.ts 拿到
 *     verify() 的返回值后必须**立即**经本函数过 kernel validateVerificationResult 窄校验、且核对
 *     subject 与本次调用 input 一致（H7 复审 §6：形状合法但 subject 张冠李戴——verifier 误绑/复用
 *     了别的 workflow run/attempt/change/revision 的合法结果——同样不可信）——两者但凡有一处不满足
 *     → 替换成本函数自产的安全 sentinel（issuer 降级 sandbox-report/trusted:false + verdict
 *     inconclusive，"不知道"是唯一诚实的判决，绝不冒充 trusted pass），都满足 → 原样放行。绝不让裸
 *     非法或张冠李戴对象向下游传播（那会在 ledger 写入时才被 ledger-codec 拒绝，或让错误 change 的
 *     merge 判定被安到当次 run 头上，形成"merge 判定已经做出但 ledger 无法诚实记录/记录到错处"的
 *     撕裂窗口，见复审阻断4）。
 *   · evaluateVerificationGate：scheduler settlement 消费点的判定表（D3 裁决「结算选
 *     merged/paused/retry 之前执行 verification gate」）——纯函数，供 scheduler.ts 复用，settlement
 *     只持久化判定结果，不在 ledger 锁里跑 verifier。H7 复审阻断2 核心修复：本函数不再只读
 *     `issuer.trusted` 布尔——第一步就地重跑 validateVerificationResult，非法/未知 verdict/空
 *     evidence 等一律先落 untrusted（fail-closed）。这是**第二道独立防线**：即便某个调用点忘了先
 *     经 enforceVerificationBoundary 消毒（含未来新增消费点），本函数自身也不可能把非法 result 判
 *     authorized——不依赖任何调用方记得先校验。
 *
 * 稳定寻址（D2 裁决）：本模块不引入 G2 workflow gate/action ID——VerificationBinding 用声明坐标
 * （workflow_digest+workflow+step+event，或 default-transition 的 event，或 runtime-verifier 的
 * verifier+version）定位，见 kernel verification/types.ts。
 *
 * H7-S2（H7 返工·修死 r2 阻断1-4 的 automation 半边）：
 *   · enforceVerificationBoundary 新增 binding 完整性校验（bindingMatchesInput）——subjectMatchesInput
 *     只查 subject 四字段、刻意不查 binding（真 verifier 未来可能合法补 guard_index/action_index），
 *     但"不查"不等于"整份可换"：本函数补上这一半，杀「verifier 把 binding 整份换成别的 workflow
 *     坐标」这类此前能穿透的绕过。同时新增 issuer identity 信任锚（VerifierInput.
 *     expectedIssuerIdentity，由 host 装配层提供，绝非 verify() 返回对象自报）——kind 相同仍须按
 *     分支比对 host verifier/version、human actor_id 或 sandbox runner，阻断 B/999 冒充 A/version。
 *   · evaluateVerificationGate 收口只消费 validateVerificationResult 返回的 canonical（冻结副本），
 *     不再对参数里的原始 verification 做任何二次裸读——r2 第二轮裁决指出的「四拍循环 getter」可在
 *     两次独立裸读之间翻牌，本函数改为全程只认一次抽取出的副本，gate 本身也补齐这条纵深防御。入参
 *     新增 expectedSubject（workflow_run_id/attempt_id/change，lifecycle 与 scheduler 各自从持有的
 *     context/record 派生）——此前只比对 revision SHA，scheduler 绕过 lifecycle 直连时一个"别的
 *     change/attempt/workflow_run 的合法结果 + 相同 buildSha"仍会被误判 authorized（r2 §3）。入参
 *     再新增 requireWorkflowBinding（custom workflow fail-closed）：custom workflow 的核验结果必须
 *     真落在 workflow-transition binding，否则即便 trusted+passed+subject+SHA 全符也不放行——绝不让
 *     "custom workflow 坐标从未真正接线"冒充"已核验通过"（阻断5）。
 */
import { createHash } from 'node:crypto'
import {
  isTrustedPass, validateAutomationPolicySnapshot, validateVerificationResult,
  makeBuildRevisionBlocker,
  type AutomationPolicySnapshot, type VerificationBinding, type VerificationIssuer, type VerificationResult,
} from '@tenon/kernel'
import type { ExecutionContext } from '../admission/execution-context.js'

/** 装配层持有的完整 issuer 身份；trusted 仍由 kernel 的 issuer kind 字面量不变式派生。 */
export type VerificationIssuerIdentity =
  | { readonly kind: 'host-verifier'; readonly verifier: string; readonly version: string }
  | { readonly kind: 'human-review'; readonly actor_id: string }
  | { readonly kind: 'sandbox-report'; readonly runner: string }

/** VerifierPort.verify 的输入面（实施纲要 §3 产生点原样落地）。 */
export interface VerifierInput {
  readonly context: ExecutionContext
  readonly workflowRunId: string
  readonly workflowBinding: VerificationBinding
  /** 权威 subject revision——lifecycle 由 barrier（命名分支 HEAD）派生，不信沙箱自报。 */
  readonly revisionSha: string
  readonly worktreePath: string
  /**
   * H7 issuer identity 信任锚：由持有该 VerifierPort 真实身份的装配层提供。host-verifier 比较
   * verifier+version，human-review 比较 actor_id，sandbox-report 比较 runner；仅 kind 相同不足以
   * 放行。绝非从 verify() 返回对象自报身份反推锚。字段可选只为兼容不经 boundary 的端口直调；
   * enforceVerificationBoundary 遇到缺席/不完整/不相符都产 sentinel（fail-closed）。默认装配值见
   * DEFAULT_VERIFIER_ISSUER_IDENTITY。
   */
  readonly expectedIssuerIdentity?: VerificationIssuerIdentity
  /** @deprecated 仅保留调用面兼容；kind-only 不足以判定身份，boundary 会忽略本字段并 fail-closed。 */
  readonly expectedIssuerKind?: VerificationIssuer['kind']
}

/** host 侧核验产生面：lifecycle 在 merge 之前、取得权威 build SHA 后调用，产出结构化 VerificationResult。 */
export interface VerifierPort {
  verify(input: VerifierInput): Promise<VerificationResult>
}

export type AutomationPolicyVerificationSubject = NonNullable<VerificationResult['automation_policy']>

/** One canonical derivation used by every verifier producer and both authorization consumers. */
export function automationPolicySubjectFor(
  policy: AutomationPolicySnapshot | undefined,
): AutomationPolicyVerificationSubject | undefined {
  if (policy === undefined) return undefined
  return Object.freeze({
    policy_id: policy.policy_id,
    policy_version: policy.policy_version,
    goal_sha256: createHash('sha256').update(policy.goal).digest('hex'),
  })
}

/** 不可信 verifier 只能看到与 lifecycle 状态脱钩的冻结期望锚，不能原地改写后自证。 */
export function freezeVerifierInput(input: VerifierInput): VerifierInput {
  const automationPolicy = input.context.automation_policy === undefined
    ? undefined
    : validateAutomationPolicySnapshot(input.context.automation_policy)
  const context = Object.freeze({
    ...input.context,
    reservation: Object.freeze({ ...input.context.reservation }),
    ...(automationPolicy === undefined ? {} : { automation_policy: automationPolicy }),
  })
  const workflowBinding = Object.freeze({ ...input.workflowBinding }) as VerificationBinding
  const expectedIssuerIdentity = input.expectedIssuerIdentity === undefined
    ? undefined
    : Object.freeze({ ...input.expectedIssuerIdentity }) as VerificationIssuerIdentity
  return Object.freeze({ ...input, context, workflowBinding, expectedIssuerIdentity })
}

export interface DefaultVerifierPortOptions {
  /** issuer.verifier 标识（缺省 'automation-default-verifier'，诚实自报"这是兜底默认实现"）。 */
  readonly verifierName?: string
  readonly version?: string
  /** 唯一 id 生成器（测试注入确定性序列；缺省内建生成器，同 execution-context.ts::makeIdGen 风格）。 */
  readonly newId?: (prefix: string) => string
  readonly clock?: () => string
}

const defaultNewId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/**
 * 默认端口的完整 issuer identity：createDefaultVerifierPort() 无自定义 name/version 时与本常量逐字段
 * 对齐；lifecycle 缺省锚使用它。接入其它 verifier（包括自定义默认端口 name/version）必须登记该实现
 * 自己的完整 identity，不得把本常量当 host kind 的万能通行证。
 */
export const DEFAULT_VERIFIER_ISSUER_IDENTITY = Object.freeze({
  kind: 'host-verifier',
  verifier: 'automation-default-verifier',
  version: '0',
} as const satisfies VerificationIssuerIdentity)
/** @deprecated 仅供旧调用方识别默认 kind；安全边界必须使用 DEFAULT_VERIFIER_ISSUER_IDENTITY。 */
export const DEFAULT_VERIFIER_ISSUER_KIND: VerificationIssuer['kind'] = DEFAULT_VERIFIER_ISSUER_IDENTITY.kind

/**
 * 默认 host verifier（H7 首版无实际核验能力接线时的安全兜底，实施纲要 §3）：不执行任何真实检查，
 * 诚实回 verdict=inconclusive（能力缺失）——绝不冒充 trusted pass。issuer.kind='host-verifier' 恒
 * trusted:true（由 issuer 类型派生，见 kernel verification/types.ts），但 inconclusive 时
 * isTrustedPass 恒 false，不构成 merge 授权（evaluateVerificationGate 下方判定表）。
 *
 * 真实核验能力（跑测试/静态检查/diff 审查等）由调用方通过 LifecyclePorts.verifier /
 * createLifecyclePorts({ verifier }) / createDockerRunChange({ verifier }) 注入替换本默认实现——
 * 本函数只是「未配置时不静默放行」的安全网，不是长期实现路径。
 */
export function createDefaultVerifierPort(options: DefaultVerifierPortOptions = {}): VerifierPort {
  const verifierName = options.verifierName ?? DEFAULT_VERIFIER_ISSUER_IDENTITY.verifier
  const version = options.version ?? DEFAULT_VERIFIER_ISSUER_IDENTITY.version
  const newId = options.newId ?? defaultNewId
  const clock = options.clock ?? (() => new Date().toISOString())
  return {
    async verify(input: VerifierInput): Promise<VerificationResult> {
      return {
        schema_version: 1,
        verification_id: newId('ver'),
        subject: {
          workflow_run_id: input.workflowRunId,
          attempt_id: input.context.attempt_id,
          change: input.context.change,
          revision: { kind: 'named-branch-head', sha: input.revisionSha },
        },
        binding: input.workflowBinding,
        ...(automationPolicySubjectFor(input.context.automation_policy) === undefined ? {} : {
          automation_policy: automationPolicySubjectFor(input.context.automation_policy),
        }),
        verdict: 'inconclusive',
        evidence: [],
        issuer: { kind: 'host-verifier', verifier: verifierName, version, trusted: true },
        evaluated_at: clock(),
      }
    },
  }
}

/** verification-missing|untrusted|inconclusive|subject-mismatch|binding-unresolved 扩 RunRecord.reason
 *  （kernel ledger-types.ts 同步扩；binding-unresolved 为 H7-S2 custom fail-closed 新增）。 */
export type VerificationBlockReason =
  | 'verification-missing'
  | 'verification-untrusted'
  | 'verification-inconclusive'
  | 'verification-subject-mismatch'
  | 'verification-binding-unresolved'
  | 'verification-policy-mismatch'

export const VERIFY_BUILD_REVISION_UNTRUSTED = 'verify-build-revision-untrusted' as const
export const VERIFY_BUILD_REVISION_REMEDIATION = 'return-to-build-and-capture-current-revision' as const

/**
 * subject 归属一致性校验（H7 复审 §6）：kernel validateVerificationResult 只窄校验 raw 的形状/
 * 不变式（passed 必带 evidence、trusted 由 issuer kind 派生……），不知道也不该知道「这条结果是不是
 * 本次调用产出的」——那需要本次调用的 VerifierInput，kernel 校验层拿不到。一个形状完全合法的
 * VerificationResult 仍可能是 verifier 张冠李戴（复用了别的 workflow run / attempt / change /
 * revision 的合法结果）产出的，故本函数在窄校验通过之后再核对 subject 四个字段与 input 是否一致。
 *
 * 只查 subject 这四个字段，不查 binding：真 verifier 未来可能合法地把 binding 精化得比
 * input.workflowBinding 更细（例如给 workflow-transition 补上 input 构造时尚未知道的
 * guard_index/action_index），那不构成张冠李戴，binding 不参与本次一致性校验。
 */
function subjectMatchesInput(value: VerificationResult, input: VerifierInput): boolean {
  return (
    value.subject.workflow_run_id === input.workflowRunId
    && value.subject.attempt_id === input.context.attempt_id
    && value.subject.change === input.context.change
    && value.subject.revision.sha === input.revisionSha
  )
}

/**
 * H7-S2 binding 完整性校验（阻断5 核验结论收口的另一半）：subjectMatchesInput 只查 subject 四字段，
 * 刻意不查 binding（见其文档——真 verifier 未来可能合法补 guard_index/action_index）。但"不查"不等于
 * "整份可换"：一个形状合法、subject 也对齐的结果，仍可能把 binding 换成完全不同的 workflow 坐标
 * （不同 digest/workflow/step/event，甚至换整个 kind）而不被 subjectMatchesInput 拦下。本函数补上
 * 这一半——kind 必须与 input.workflowBinding 相同，且该 kind 下 input 已声明的每个字段都必须逐字
 * 相等；只有 workflow-transition 的 guard_index/action_index 允许 canonical 补上 input 构造时尚未
 * 知道的值（这两个字段 input 从不携带，见 lifecycle.ts 的 workflowBinding 构造，故"允许补"不产生
 * 任何需要放宽的相等检查——它们不在下面任何一个 kind 分支的比较列表里）。
 */
function bindingMatchesInput(canonical: VerificationBinding, input: VerificationBinding): boolean {
  switch (input.kind) {
    case 'workflow-transition':
      return canonical.kind === 'workflow-transition'
        && canonical.workflow_digest === input.workflow_digest
        && canonical.workflow === input.workflow
        && canonical.step === input.step
        && canonical.event === input.event
    case 'default-transition':
      return canonical.kind === 'default-transition' && canonical.event === input.event
    case 'runtime-verifier':
      return canonical.kind === 'runtime-verifier' && canonical.verifier === input.verifier && canonical.version === input.version
  }
}

/** kind 相同仍不够：按判别分支逐一比较该 issuer 的全部身份字段；锚缺席/畸形一律 false。 */
function issuerMatchesIdentity(canonical: VerificationIssuer, expected: VerificationIssuerIdentity | undefined): boolean {
  if (expected === undefined || canonical.kind !== expected.kind) return false
  switch (expected.kind) {
    case 'host-verifier':
      return canonical.kind === 'host-verifier'
        && canonical.verifier === expected.verifier
        && canonical.version === expected.version
    case 'human-review':
      return canonical.kind === 'human-review' && canonical.actor_id === expected.actor_id
    case 'sandbox-report':
      return canonical.kind === 'sandbox-report' && canonical.runner === expected.runner
  }
}

function automationPolicyMatchesInput(value: VerificationResult, input: VerifierInput): boolean {
  const expected = automationPolicySubjectFor(input.context.automation_policy)
  const actual = value.automation_policy
  if (expected === undefined) return actual === undefined
  return actual !== undefined
    && actual.policy_id === expected.policy_id
    && actual.policy_version === expected.policy_version
    && actual.goal_sha256 === expected.goal_sha256
}

/** boundary 自产对象只含 plain object/array/primitive；递归冻结后才允许进入下游与 WeakSet。 */
function deepFreezeBoundaryResult<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value as Record<string, unknown>)) deepFreezeBoundaryResult(child)
  return Object.freeze(value)
}

/**
 * H7 复审阻断1 核心修复：VerifierPort 运行时输出边界——lifecycle.ts 唯一合法的消费姿势是拿到
 * `port.verify(input)` 的返回值后立即调本函数，绝不原样直信。
 *
 * `raw` 刻意标注 `unknown`（而非 VerificationResult）：调用方虽然从类型系统拿到的是
 * `Promise<VerificationResult>`，但那只是编译期承诺——运行时值可能来自任意注入实现（含
 * `as any`/反序列化外部数据/未来沙箱可控适配器），标 unknown 逼调用方不能绕过下面的窄校验直接
 * 当 VerificationResult 用。
 *
 * 合法（过 kernel validateVerificationResult 窄校验 + subject 与本次调用 input 一致（subjectMatchesInput）
 * + binding 与 input.workflowBinding 一致（bindingMatchesInput，H7-S2）+ issuer 完整身份与
 * input.expectedIssuerIdentity 逐类型一致——四者都满足）→ 原样放行本函数返回的
 * validated.value（kernel canonical 冻结副本，绝非 raw 引用）。任一不满足（形状非法，或形状合法但
 * subject 张冠李戴见 H7 复审 §6，或 binding 被整份换成别的坐标，或 issuer identity 与装配锚不符）
 * → 替换成本函数自产、保证合法的 sentinel：verdict=inconclusive（"不知道"是唯一诚实的判决）+ issuer
 * 降级 sandbox-report/trusted:false（最不信任档，绝不因为「声称自己是 host-verifier」就继续给它
 * trusted:true 的待遇）。sentinel 只使用调用方自己持有、本进程构造的可信输入
 * （input.context/workflowBinding/revisionSha 均非沙箱自报），绝不采信被拒绝的 raw 对象里的任何
 * 字段——它已经证明不可信（或不是本次调用的），没有任何部分值得摘取复用。
 */
export function enforceVerificationBoundary(raw: unknown, input: VerifierInput): VerificationResult {
  const validated = validateVerificationResult(raw)
  if (
    validated.ok
    && subjectMatchesInput(validated.value, input)
    && bindingMatchesInput(validated.value.binding, input.workflowBinding)
    && issuerMatchesIdentity(validated.value.issuer, input.expectedIssuerIdentity)
    && automationPolicyMatchesInput(validated.value, input)
  ) {
    boundaryVerifiedResults.add(validated.value)
    return validated.value
  }
  const sentinel = deepFreezeBoundaryResult<VerificationResult>({
    schema_version: 1,
    verification_id: `verifier-boundary-rejected-${input.workflowRunId}`,
    subject: {
      workflow_run_id: input.workflowRunId,
      attempt_id: input.context.attempt_id,
      change: input.context.change,
      revision: { kind: 'named-branch-head', sha: input.revisionSha },
    },
    binding: { ...input.workflowBinding } as VerificationBinding,
    ...(automationPolicySubjectFor(input.context.automation_policy) === undefined ? {} : {
      automation_policy: automationPolicySubjectFor(input.context.automation_policy),
    }),
    verdict: 'inconclusive',
    evidence: [],
    issuer: { kind: 'sandbox-report', runner: 'verifier-boundary-rejected', trusted: false },
    evaluated_at: new Date().toISOString(),
  })
  boundaryVerifiedResults.add(sentinel)
  return sentinel
}

/**
 * scheduler settlement 消费点判定表（D3 裁决，pure）：
 *   trusted passed 且 subject 全部字段（workflow_run_id/attempt_id/change/revision SHA）与本次调用方
 *   持有的归属数据相符 → authorized（才允许继续结合 level/allowlist/denylist/kill-switch 决定
 *   merged/paused）；trusted failed → failure（同现有 verify-fail 失败路，交 scheduler 走
 *   applyFailure）；absent/untrusted/inconclusive/subject 任一字段漂移/custom workflow 未解析真实
 *   binding → paused + 诚实 reason（fail-closed，绝不 merged）。
 *
 * 判定顺序钉死（D3/D4 裁决 + H7-S2 收口）：trusted 判定先于 verdict 判定——untrusted 的
 * failed/inconclusive/passed 一律先落 verification-untrusted，不会因 verdict 恰好是 failed 就被误判
 * 成 authorized 失败路（那是 trusted failed 专属）。inconclusive 判定先于 subject 比对——inconclusive
 * 没有「诚实的 subject」可比。subject 比对先于 requireWorkflowBinding：张冠李戴的结果连"是不是这次
 * 调用产生的"都不成立，谈不上"它的 binding 是否落在 workflow-transition"。
 *
 * H7-S2（r2 阻断1-4 收口，automation 半边）：本函数是**第二道独立防线**，不依赖调用方记得先经
 * enforceVerificationBoundary 消毒（含 scheduler 绕过 lifecycle 直连的伪造 RunChange）——因此内部
 * 自己重跑 validateVerificationResult 并把返回的 canonical（冻结副本）绑定到局部变量，**下方每一次
 * 字段读取都只读这个 canonical，绝不再读参数里的原始 verification**：若仍读原始对象，一个跨调用返回
 * 不同值的敌意 getter（r2 给出的四拍循环 PoC）能在"validateVerificationResult 内部的单次读取"与"本函数
 * 自己的裸字段读取"这两次独立读取之间翻牌，绕过本该生效的 fail-closed 判定——这正是 r2 第二轮裁决点名
 * gate 仍可被绕过的根因，不是「同函数同输入不可能分叉」这个错误推论能解释的（真正的输入是同一个可变
 * 对象引用，问题在"读了几次"，不在"传了几次"）。
 */
export interface VerificationGateInput {
  readonly verification?: VerificationResult
  readonly buildSha?: string
  /**
   * H7-S2：本次判定期望的归属 subject（workflow_run_id/attempt_id/change）——lifecycle 与 scheduler
   * 两个消费点都必须传，各自从自己持有的 context/record 派生（lifecycle 用 executionContext +
   * workflowRunId；scheduler 用 handleOne 持有的 ExecutionContext，workflow_run_id 同样以
   * `?? attempt_id` 兜底，镜像 lifecycle 对同一 ExecutionContext 形状的兜底规则，保证两处判定的
   * 期望值不因兜底逻辑各写一份而漂移）。canonical.subject 的对应字段与此任一不符 → paused（绕过
   * lifecycle 直连的伪造 RunChange 若返回"别的 change/attempt 的合法结果"，即便 revision SHA 恰好
   * 相符，也在这里被拦下——r2 §3 指出的缺口）。
   */
  readonly expectedSubject: {
    readonly workflow_run_id: string
    readonly attempt_id: string
    readonly change: string
  }
  /**
   * H7-S2 custom fail-closed：调用方声明的 custom workflow 标记（lifecycle 由
   * cfg.workflowKind==='custom' 判定，随 RunOutcome 透传给 scheduler；未传/'default' 语义 → false，
   * 不加此限制，存量调用点行为不变）。true 时 canonical.binding.kind 必须是 'workflow-transition'
   * （证明这次核验真绑定到了该 custom workflow 的具体坐标）——否则即便 trusted+passed+subject 全部
   * 相符，也不得放行（r2 阻断5 核验结论：custom workflow 坐标缺席时不得让 default-transition 冒充
   * "已核验通过"）。
   */
  readonly requireWorkflowBinding: boolean
  /** H4: exact policy snapshot expected by this lifecycle/scheduler consumer. */
  readonly expectedAutomationPolicy?: AutomationPolicySnapshot
}

export type VerificationGateResult =
  | { readonly kind: 'authorized' }
  | { readonly kind: 'failure' }
  | {
      readonly kind: 'paused'
      readonly reason: VerificationBlockReason | typeof VERIFY_BUILD_REVISION_UNTRUSTED
      readonly blocker?: import('@tenon/kernel').BuildRevisionBlocker
    }

/** 仅本模块 boundary 可签发；scheduler 用它区分 lifecycle 核验事实与任意 RunChange 自报对象。 */
const boundaryVerifiedResults = new WeakSet<object>()

export function isBoundaryVerifiedResult(value: unknown): value is VerificationResult {
  return typeof value === 'object' && value !== null && boundaryVerifiedResults.has(value)
}

export function evaluateVerificationGate(input: VerificationGateInput): VerificationGateResult {
  const raw = input.verification
  const authoritativeRevision: unknown = input.buildSha
  if (authoritativeRevision === undefined || authoritativeRevision === '') {
    return {
      kind: 'paused',
      reason: VERIFY_BUILD_REVISION_UNTRUSTED,
      blocker: makeBuildRevisionBlocker('missing'),
    }
  }
  if (authoritativeRevision === null || authoritativeRevision === 'null') {
    return {
      kind: 'paused',
      reason: VERIFY_BUILD_REVISION_UNTRUSTED,
      blocker: makeBuildRevisionBlocker('null'),
    }
  }
  if (Array.isArray(authoritativeRevision)) {
    return {
      kind: 'paused',
      reason: VERIFY_BUILD_REVISION_UNTRUSTED,
      blocker: makeBuildRevisionBlocker('ambiguous'),
    }
  }
  if (typeof authoritativeRevision !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(authoritativeRevision)) {
    return {
      kind: 'paused',
      reason: VERIFY_BUILD_REVISION_UNTRUSTED,
      blocker: makeBuildRevisionBlocker('malformed'),
    }
  }
  if (raw === undefined) return { kind: 'paused', reason: 'verification-missing' }
  // H7 复审阻断2 核心修复 + H7-S2 收口：gate 本身独立重校验完整 result，且此后只消费这次校验产出的
  // canonical 冻结副本——不再对原始 verification 做任何二次裸读（见上方函数文档「两次独立读取」的
  // 攻击面）。lifecycle.ts 在产生点已经过 enforceVerificationBoundary 消毒，但本函数是**第二道独立
  // 防线**——不依赖调用方记得先消毒，任何直接拿裸值调用本函数的路径（含 scheduler 绕过 lifecycle
  // 直连的伪造 RunChange）都不可能把非法/敌意 result 判 authorized。
  const validated = validateVerificationResult(raw)
  if (!validated.ok) return { kind: 'paused', reason: 'verification-untrusted' }
  const canonical = validated.value
  if (!canonical.issuer.trusted) return { kind: 'paused', reason: 'verification-untrusted' }
  if (canonical.verdict === 'failed') return { kind: 'failure' }
  if (canonical.verdict === 'inconclusive') return { kind: 'paused', reason: 'verification-inconclusive' }
  // 走到这里 verdict 必为 'passed'（trusted 已确认、failed/inconclusive 已分流）——subject 比对先行
  // （H7-S2 扩至 workflow_run_id/attempt_id/change + 原有 revision SHA），因为「passed 但对错归属/
  // 错 revision」不该被 isTrustedPass 判 true 掩盖（isTrustedPass 不知道要对齐哪个调用方期望，那是
  // 本函数独有的 D3/H7-S2 裁决）。四项任一不符 → 复用既有 verification-subject-mismatch reason
  // （同一诊断口径，未新增维度即新增 reason 分支）。
  if (
    canonical.subject.workflow_run_id !== input.expectedSubject.workflow_run_id
    || canonical.subject.attempt_id !== input.expectedSubject.attempt_id
    || canonical.subject.change !== input.expectedSubject.change
    || canonical.subject.revision.sha !== authoritativeRevision
  ) {
    if (canonical.subject.revision.sha !== authoritativeRevision) {
      return {
        kind: 'paused',
        reason: VERIFY_BUILD_REVISION_UNTRUSTED,
        blocker: makeBuildRevisionBlocker('revision-stale'),
      }
    }
    return {
      kind: 'paused',
      reason: 'verification-subject-mismatch',
    }
  }
  const expectedPolicy = automationPolicySubjectFor(input.expectedAutomationPolicy)
  const actualPolicy = canonical.automation_policy
  if (
    (expectedPolicy === undefined && actualPolicy !== undefined)
    || (expectedPolicy !== undefined && (
      actualPolicy === undefined
      || actualPolicy.policy_id !== expectedPolicy.policy_id
      || actualPolicy.policy_version !== expectedPolicy.policy_version
      || actualPolicy.goal_sha256 !== expectedPolicy.goal_sha256
    ))
  ) {
    return { kind: 'paused', reason: 'verification-policy-mismatch' }
  }
  // H7-S2 custom fail-closed：subject 已确认是这次调用自己的结果，再查 binding 是否真落在
  // workflow-transition（custom workflow 专属要求，default workflow 不受此限）。
  if (input.requireWorkflowBinding && canonical.binding.kind !== 'workflow-transition') {
    return { kind: 'paused', reason: 'verification-binding-unresolved' }
  }
  // 收口断言复用 kernel Phase 1 的 isTrustedPass（不新造「什么算 trusted pass」的第二份判定逻辑）：
  // 走到这里逻辑上必为 true（trusted 且 passed 都已确认），显式调用只为让判定唯一真相源可见、
  // 且在 VerificationVerdict 未来扩员时自动纵深防御，不必依赖本函数排除法的隐式假设。
  return isTrustedPass(canonical) ? { kind: 'authorized' } : { kind: 'paused', reason: 'verification-untrusted' }
}
