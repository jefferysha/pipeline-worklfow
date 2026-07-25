import type { AutomationPolicySnapshot, EffectiveSkillResolver, LoopEntry, LoopLedgerStore, LoopRegistry, SkillBundleResolutionInput } from '@pipeline-lite/kernel'
import {
  admissionDecision, budgetDayOf, buildAttemptContext, compileAutomationPolicySnapshot, compileConstraintPolicy, evaluateConstraintPolicy,
  indexMergeFactsByAttempt, LedgerDegradedError, loopMaterialUnchanged,
  normalizeOnExceed, projectLoopLedger,
  registryContentEpoch, reservedTokensFor, resolveLoopBinding, resolveSkillBundle, withRegistryGovernanceLock,
  type AdmissionBlock, type AttemptContextLedgerSnapshot, type BudgetExceedAction, type BudgetReservationRecord,
  type ChangeLoopBindingRecord, type LedgerRecord, type MergeIntentRecord, type MergeLandedRecord,
  type ReservationActivatedRecord, type RunRecord, type SkillBundleSnapshotRecord, type UsageRecord, type VerificationResult,
} from '@pipeline-lite/kernel'
import type { AutomationLevel } from '../types.js'
import type { ProviderStructuredUsage } from '../runner/runner.js'
import type { SkillContentLocator } from '../skills/content-locator.js'
import { buildCanonicalManifest, materializeSkillSnapshot, type MaterializeSkillSnapshotOptions } from '../skills/snapshot-store.js'
import type { SkillSnapshotInput, SkillSnapshotProvenance, SkillSnapshotPublishResult } from '../skills/types.js'
import {
  makeIdGen, markLoopPrepared, markNonLoopPrepared,
  type CapturedExecutionCoordinate, type ExecutionContext, type ExecutionCoordinatePort,
  type ExecutionPreparationPort, type PrepareOutcome, type PreparationFailureReason,
  type PreparedExecutionContext, type PreparedSkillSlot,
} from './execution-context.js'
import { errText } from './loop-admission-types.js'

export interface ExecutionPreparationDeps {
  readonly repoRoot: string
  readonly ledger: LoopLedgerStore
  /** 契约同 `LoopAdmissionDeps.loadRegistry`（真实 I/O 故障 throw，ENOENT/解析失败→data:null）。 */
  readonly loadRegistry: (repoRoot: string) => { data: LoopRegistry | null; errors: string[] }
  readonly clock: () => string
  /** 唯一 id 生成器（缺省 makeIdGen()；测试可注入确定性序列）。 */
  readonly newId?: (prefix: string) => string
  /** workflow 坐标捕获口（设计 §3 步骤2/步骤7；生产实现见任务7）。 */
  readonly coordinates: ExecutionCoordinatePort
  /** G2 有效 skill 解析器（喂给 kernel `resolveSkillBundle`；生产装配注入真实 manifest/registry 绑定）。 */
  readonly resolver: EffectiveSkillResolver
  /** skill id → 当前内容目录的物理定位口（生产装配决定具体走哪些根、按什么顺序）。 */
  readonly locator: SkillContentLocator
  /** runner-aware 定位口；给定时每次 prepare 按 ctx.runner 选择，Codex 不得读取 Claude roots。 */
  readonly locatorForRunner?: (runner: string) => SkillContentLocator
  /**
   * CAS 物化原语（缺省真 `materializeSkillSnapshot`）。可选注入点只为测试——需要确定性模拟「复制期间
   * 源内容变化」时，测试可传入包一层 `onAfterBeforeDigest` 钩子的同签名函数；生产装配从不覆盖。
   */
  readonly materialize?: (inputs: readonly SkillSnapshotInput[], options: MaterializeSkillSnapshotOptions) => Promise<SkillSnapshotPublishResult>
}

/**
 * task4 的 locate()/materializeSkillSnapshot() 错误 `_tag` → H10 §5 `PreparationFailureReason`
 * 归类（不 import 具体错误类，只读 `_tag` 字符串——两个模块各自头注已写明对应哪个 reason，本函数
 * 只是把那份映射落成代码）。`undefined` = 未识别的错误类型，调用方须 fail-loud 重新抛出，不得
 * 伪装成某个业务 reason。
 */
function skillErrorReason(e: unknown): PreparationFailureReason | undefined {
  const tag = (e as { _tag?: string } | null | undefined)?._tag
  switch (tag) {
    case 'SkillContentInvalidError': return 'skill-bundle-content-invalid'
    case 'SkillContentAccessError': return 'skill-bundle-content-invalid'
    case 'SkillContentSourceAmbiguousError': return 'skill-bundle-source-ambiguous'
    case 'SkillSnapshotSourceUnstableError': return 'skill-bundle-source-unstable'
    case 'SkillSnapshotIoError': return 'skill-bundle-snapshot-io'
    case 'SkillSnapshotCorruptError': return 'skill-bundle-snapshot-corrupt'
    default: return undefined
  }
}

type LocateOutcome =
  | { readonly ok: true; readonly concreteSkillId: string; readonly contentDir: string }
  | { readonly ok: false; readonly reason: PreparationFailureReason; readonly detail: string }

/**
 * 设计定稿 §2/§3 步骤3：`a|b` alternative slot 按声明顺序选第一个可严格物化的 concrete skill——
 * 候选缺失（`SkillContentNotFoundError`）可尝试下一个；候选存在但内容损坏或来源冲突，立即失败，
 * 不能悄悄降级到下一个候选（那会把一个真实存在但损坏的 skill 悄悄换成另一个，掩盖真实故障）。
 * 全部候选都缺失 → `skill-bundle-skill-not-found`。
 */
async function selectFirstLocatable(locator: SkillContentLocator, alternatives: readonly string[]): Promise<LocateOutcome> {
  const notFoundDetails: string[] = []
  for (const candidateId of alternatives) {
    try {
      const located = await locator.locate(candidateId)
      return { ok: true, concreteSkillId: located.skillId, contentDir: located.contentDir }
    } catch (e) {
      const tag = (e as { _tag?: string } | null | undefined)?._tag
      if (tag === 'SkillContentNotFoundError') { notFoundDetails.push(errText(e)); continue }
      const reason = skillErrorReason(e)
      if (reason === undefined) throw e // 未识别错误类型：fail-loud，不伪装成某个 reason
      return { ok: false, reason, detail: errText(e) }
    }
  }
  return {
    ok: false, reason: 'skill-bundle-skill-not-found',
    detail: `全部候选 alternatives（${alternatives.join('|')}）均未定位到内容：${notFoundDetails.join('; ')}`,
  }
}

/** CAS 目录相对 repoRoot 的路径（设计 §3 步骤6：`.pipeline/loops/skill-snapshots/sha256/<digest>/`）。 */
function skillSnapshotCasRelativePath(digest: string): string {
  return `.pipeline/loops/skill-snapshots/sha256/${digest}`
}

export function createExecutionPreparation(deps: ExecutionPreparationDeps): ExecutionPreparationPort {
  const { repoRoot, ledger, loadRegistry, clock, coordinates, resolver, locator } = deps
  const newId = deps.newId ?? makeIdGen()
  const materialize = deps.materialize ?? materializeSkillSnapshot

  const prepare = async (ctx: ExecutionContext): Promise<PrepareOutcome> => {
    // 二次任务（queued 卡死回归修复）+ H10 r1 阻断3/D5 返工（任务B1）：ctx.skill_bundle_id 缺席/
    // null＝「本次执行无 bundle 绑定」（非 loop 的 AFK 直跑，见 execution-context.ts 头注）——直通
    // 产出判别联合的 NonLoopExecutionContext 分支（markNonLoopPrepared，不是「省略了 skillBundle
    // 字段」的同一形状），不捕获 workflow 坐标、不解析、不物化 CAS、不写 ledger 事件、绝不 pause。
    // 真正的 loop-bundle 绑定（skill_bundle_id 有值）才走下面的完整解析/物化/复核编排，产出
    // LoopPreparedExecutionContext（markLoopPrepared，skillBundle 必填）。
    if (ctx.skill_bundle_id === null || ctx.skill_bundle_id === undefined) {
      return { ok: true, context: markNonLoopPrepared(ctx) }
    }
    // 窄化后固定成 const（narrowing 在下方跨异步闭包引用时不持续对非 const 绑定生效——见
    // ledger.append 调用点内的 `skill_bundle_id: skillBundleId`），供全函数余下部分复用同一个
    // 已确定非空的 profile 字符串。
    const skillBundleId: string = ctx.skill_bundle_id
    const effectiveLocator = deps.locatorForRunner?.(ctx.runner) ?? locator
    // 设计 §3 步骤2：change lock 下捕获并固定 workflow 坐标，capture() 内部自行释放 change lock——
    // 本函数往后（解析/定位/物化）全程无锁（设计 §3：「无锁解析 effective slots」）。
    //
    // H10 r1 阻断6（任务B1）：capture() 此前在结构化异常捕获之外——workflow parse/compile/step 失败
    // 会穿透 prepare() 整体外抛，被 scheduler.ts::handlePreparationThrow 当成未分类基础设施异常
    // 处置，不落 skill-bundle-resolve-failed 语义。此刻尚未拿到 coordinate，无法判定 default/
    // custom，workflowKind 诚实留空——preparationPolicyFor 对 undefined workflowKind 的缺省是「视同
    // default，暂停 loop」（scheduler.ts 头注「resolve-failed（default/未指明 workflowKind）→
    // 暂停 loop」），保守正确：宁可牵连同 profile 下其余 loop 暂停，也不能放行一个坐标都没解析出来
    // 的执行。
    let coordinate: CapturedExecutionCoordinate
    try {
      coordinate = await coordinates.capture(ctx)
    } catch (e) {
      return { ok: false, reason: 'skill-bundle-resolve-failed', detail: errText(e) }
    }
    const resolutionInput: SkillBundleResolutionInput = coordinate.resolution.kind === 'default'
      ? { kind: 'default', stepId: coordinate.resolution.stepId, profileId: skillBundleId }
      : { kind: 'custom', step: coordinate.resolution.step, profileId: skillBundleId }
    // H10 r1 阻断6（任务B1）：resolver 调用（resolveDefault/resolveCustom，可能触及 manifest/
    // step.skills 解析失败）同样此前在结构化捕获之外。此刻 coordinate 已知，workflowKind 精确传
    // coordinate.resolution.kind（default/custom 处置分叉，见设计 §5）。
    let resolved: ReturnType<typeof resolveSkillBundle>
    try {
      resolved = resolveSkillBundle(resolver, resolutionInput)
    } catch (e) {
      return { ok: false, reason: 'skill-bundle-resolve-failed', detail: errText(e), workflowKind: coordinate.resolution.kind }
    }
    const { source, slots } = resolved
    // H10 r1 阻断2/4·D4（任务B1）：本次解析所在 step id——default 轨即 phase 字段值，custom 轨为
    // StepIR.id；下方 provenance/ledger 事件复用同一个值（不各自重复派生）。
    const step = coordinate.resolution.kind === 'default' ? coordinate.resolution.stepId : coordinate.resolution.step.id
    // 镜像 scheduler.ts::expectedSubjectFor 既有的 `ctx.workflow_run_id ?? ctx.attempt_id` 兜底
    // 惯例（ExecutionContext.workflow_run_id 对非 WorkflowRun 归属的旧路径可选缺席，attempt_id
    // 恒存在，可安全顶替）。
    const workflowRunId = coordinate.workflowRunId ?? ctx.workflow_run_id ?? ctx.attempt_id

    // 设计 §2：所有 effective slots 都进入快照——不因标为 recommended 就在缺失时忽略；合法空
    // slots（profile 合法但本 step 解析结果为空）产出确定性空快照，不视为未接线（本函数不做这个
    // 判断，只是 slots=[] 时下面的循环天然不执行，selected 天然是 []）。
    const selected: { token: string; concreteSkillId: string; contentDir: string; alternatives: readonly string[] }[] = []
    for (const slot of slots) {
      const picked = await selectFirstLocatable(effectiveLocator, slot.alternatives)
      if (!picked.ok) return { ok: false, reason: picked.reason, detail: picked.detail, workflowKind: coordinate.resolution.kind }
      selected.push({
        token: slot.token, concreteSkillId: picked.concreteSkillId, contentDir: picked.contentDir,
        alternatives: slot.alternatives,
      })
    }

    // H10 r1 阻断2/4·D4（任务B1）：provenance 的 slots[].tree_sha256 必须在调用 materialize() 之前
    // 就确定——CAS 聚合 digest 覆盖完整 provenance（含 tree_sha256，见
    // snapshot-store.ts::computePublishDigest 头注「digest 必须完整覆盖 provenance」），但
    // tree_sha256 恰恰是 materialize() 内部才计算的产物。这里用同一个只读原语
    // buildCanonicalManifest 对每个已定位的 skill 内容根预先算一遍（与 materialize() 内部「双遍
    // source digest」稳定性检查的首遍是同一算法/同一读取动作），取得的值随 provenance 一起传给
    // materialize()；随后（见下方）用 materialize() 真正物化后得到的 publish.manifests[i].
    // treeSha256 复核与预读值一致——不一致视为「provenance 预读之后、物化开始之前」这段额外窗口的
    // 源内容漂移，归 skill-bundle-source-unstable（复用既有 reason，不新增字面量）：不能让一份
    // 「预读时算出、但物化实际使用的却是不同内容」的 tree_sha256 悄悄写进 CAS digest 覆盖的
    // provenance——那会让 CAS 描述符关于"这份快照对应哪份 provenance"的绑定本身失真。
    //
    // buildCanonicalManifest 与 materialize() 内部同源，会做同一套内容合法性判定（目录逃逸
    // symlink/设备文件/SKILL.md 缺失等）——预读阶段就可能先于 materialize() 撞上这些错误，必须走
    // 同一份 skillErrorReason 映射，不能让它未经归类直接穿透 prepare() 外抛（selectFirstLocatable
    // 已对同类错误做过归类，这里的预读调用不能是漏网的例外）。
    const uniqueSelected = [...new Map(selected.map((s) => [s.concreteSkillId, s])).values()]
    let preManifests: Awaited<ReturnType<typeof buildCanonicalManifest>>[]
    try {
      preManifests = await Promise.all(uniqueSelected.map((s) => buildCanonicalManifest(s.concreteSkillId, s.contentDir)))
    } catch (e) {
      const reason = skillErrorReason(e)
      if (reason === undefined) throw e
      return { ok: false, reason, detail: errText(e), workflowKind: coordinate.resolution.kind }
    }

    // H10 r1 阻断2/4·D4（任务B1）：三处（CAS canonical descriptor / ledger SkillBundleSnapshotRecord
    // / PreparedExecutionContext.skillBundle）必须一致的 provenance 统一对象——一次构造、三处消费，
    // 不给三份拼写各自漂移的机会（字段规范见 skills/types.ts::SkillSnapshotProvenance 头注）。
    const preById = new Map(preManifests.map((m) => [m.skillId, m]))
    const provenance: SkillSnapshotProvenance = {
      loop_id: ctx.loop_id, policy_epoch: ctx.policy_epoch, skill_bundle_id: skillBundleId,
      attempt_id: ctx.attempt_id, reservation_id: ctx.reservation_id, workflow_run_id: workflowRunId,
      workflow: coordinate.workflow, step, track: coordinate.track, coordinate_digest: coordinate.inputsDigest,
      resolution_source: source,
      slots: selected.map((skill) => {
        const manifest = preById.get(skill.concreteSkillId)
        if (manifest === undefined) {
          throw new Error(`skill '${skill.concreteSkillId}' 的预读 manifest 缺失`)
        }
        return {
          alternatives: skill.alternatives,
          concrete_skill_id: skill.concreteSkillId,
          tree_sha256: manifest.treeSha256,
        }
      }),
    }

    let publish: SkillSnapshotPublishResult
    try {
      publish = await materialize(
        uniqueSelected.map((s): SkillSnapshotInput => ({ skillId: s.concreteSkillId, contentDir: s.contentDir })),
        { projectRoot: repoRoot, provenance },
      )
    } catch (e) {
      const reason = skillErrorReason(e)
      if (reason === undefined) throw e
      return { ok: false, reason, detail: errText(e), workflowKind: coordinate.resolution.kind }
    }

    // 预读 treeSha256（provenance 已携带、已纳入 CAS digest 覆盖）与 materialize() 真正物化后的值
    // 必须一致，否则本次快照的 provenance 记录已经与实际发布的内容不符（见上方大段头注）。
    const publishedById = new Map(publish.manifests.map((m) => [m.skillId, m]))
    for (let i = 0; i < selected.length; i++) {
      const skill = selected[i]
      const slot = provenance.slots[i]
      if (skill === undefined || slot === undefined) {
        throw new Error(`skill bundle slot ${i} 在 provenance 对齐时缺失`)
      }
      const actual = publishedById.get(skill.concreteSkillId)
      if (actual === undefined) {
        throw new Error(`skill '${skill.concreteSkillId}' 的已发布 manifest 缺失`)
      }
      if (actual.treeSha256 !== slot.tree_sha256) {
        return {
          ok: false, reason: 'skill-bundle-source-unstable',
          detail: `skill '${skill.concreteSkillId}' 的 provenance 预读 treeSha256（${slot.tree_sha256}）` +
            `与物化后实际值（${actual.treeSha256}）不一致——预读与物化之间源内容发生了变化`,
          workflowKind: coordinate.resolution.kind,
        }
      }
    }

    const casRelativePath = skillSnapshotCasRelativePath(publish.digest)
    const preparedSlots: PreparedSkillSlot[] = selected.map((skill) => {
      const published = publishedById.get(skill.concreteSkillId)
      if (published === undefined) {
        throw new Error(`skill '${skill.concreteSkillId}' 的已发布 manifest 缺失`)
      }
      return {
        token: skill.token,
        alternatives: skill.alternatives,
        concreteSkillId: skill.concreteSkillId,
        treeSha256: published.treeSha256,
      }
    })

    // 设计 §3 步骤7：governance→ledger 固定锁序（铁律，见 governance.ts 头注）下重新严格读取
    // registry，要求 policy_epoch、loop 状态和 skill_bundle_id 未变，同时重新核对 workflow 输入
    // digest；通过后追加 skill-bundle-snapshot 事件。任一不符 → skill-bundle-policy-changed
    // （TOCTOU，retry-queued，不收费，不暂停 loop，重新走整个 admission——不是本函数内部重试）。
    // ledger I/O 故障（append/fsync/lock）在此 throw，不吞成某个业务 reason（镜像 activate() 对
    // ledger I/O 的既有处置：调用方 fail-loud）。
    return withRegistryGovernanceLock(repoRoot, () => ledger.withLedgerLock(repoRoot, async (): Promise<PrepareOutcome> => {
      const reg = loadRegistry(repoRoot)
      const loop = reg.data?.loops.find((l) => l.id === ctx.loop_id)
      const registryStable = reg.data !== null && loop !== undefined && loop.status === 'active'
        && (loop.skill_bundle_id ?? null) === skillBundleId && registryContentEpoch(reg.data) === ctx.policy_epoch
      if (!registryStable) {
        return {
          ok: false, reason: 'skill-bundle-policy-changed',
          detail: `loop「${ctx.loop_id}」的 governance epoch/status/skill_bundle_id 在准备期间已变化（TOCTOU）——需重新 admission`,
          workflowKind: coordinate.resolution.kind,
        }
      }
      let currentInputsDigest: string
      try {
        currentInputsDigest = await coordinates.readCurrentInputsDigest(ctx)
      } catch (e) {
        return {
          ok: false, reason: 'skill-bundle-resolve-failed',
          detail: `change「${ctx.change}」的 workflow/manifest 输入复核失败：${e instanceof Error ? e.message : String(e)}`,
          workflowKind: coordinate.resolution.kind,
        }
      }
      if (currentInputsDigest !== coordinate.inputsDigest) {
        return {
          ok: false, reason: 'skill-bundle-policy-changed',
          detail: `change「${ctx.change}」的 workflow/manifest 输入在准备期间已变化（TOCTOU）——需重新 admission`,
          workflowKind: coordinate.resolution.kind,
        }
      }
      // H10 r1 阻断2/4·D4（任务B1）：全部字段直接取自上方已构造的 provenance（与 CAS descriptor
      // 传给 materialize() 的是同一个对象）——不重复派生，杜绝三处拼写漂移。ledger 的 slots 比
      // provenance.slots 多一个 token（= alternatives 原始声明记法，provenance 本身不携带，见
      // skills/types.ts::SkillSnapshotProvenanceSlot 头注「原始 token 文本可由 alternatives.
      // join('|') 还原」）；workflow_run_id 显式用上方已算好的 workflowRunId（非
      // provenance.workflow_run_id——该字段类型可选，直接透传在个别 TS 配置下不必然被判定为
      // "确定存在"，此处用保证非 undefined 的本地值，语义上是同一个值）。
      await ledger.append(repoRoot, {
        schema_version: 1, record_id: newId('rec'), recorded_at: clock(),
        kind: 'skill-bundle-snapshot',
        attempt_id: provenance.attempt_id, reservation_id: provenance.reservation_id, loop_id: provenance.loop_id,
        skill_bundle_id: provenance.skill_bundle_id, policy_epoch: provenance.policy_epoch,
        resolution_source: provenance.resolution_source, workflow_run_id: workflowRunId,
        workflow: provenance.workflow, step: provenance.step, track: provenance.track,
        coordinate_digest: provenance.coordinate_digest,
        snapshot_sha256: publish.digest, cas_relative_path: casRelativePath,
        slots: provenance.slots.map((slot, index) => {
          const selectedSkill = selected[index]
          if (selectedSkill === undefined) {
            throw new Error(`skill bundle slot ${index} 在 ledger 投影时缺失`)
          }
          return {
            token: selectedSkill.token,
            alternatives: [...slot.alternatives],
            concrete_skill_id: slot.concrete_skill_id,
            tree_sha256: slot.tree_sha256,
          }
        }),
      })
      const prepared = markLoopPrepared({ ...ctx, workflow_run_id: workflowRunId }, {
        snapshotSha256: publish.digest, casRelativePath, resolutionSource: source, slots: preparedSlots,
        workflow: coordinate.workflow, step, track: coordinate.track, coordinateDigest: coordinate.inputsDigest,
        ...(coordinate.resolution.kind === 'custom' && coordinate.resolution.step.prompt !== undefined
          ? { stepPrompt: coordinate.resolution.step.prompt }
          : {}),
      })
      return { ok: true, context: prepared }
    }))
  }

  return { prepare }
}
