/**
 * 结构化 verification 结果契约（GOAL 清单 H · H7 verifier）——把 automation runtime 的二元、自报
 * `verify_result`（'pass'|'fail'，sandbox 输出，untrusted）升级为「谁签发 · 绑定哪个 revision ·
 * 有哪些可核 evidence · 判决是什么」的 typed 记录。
 *
 * 本模块是纯类型 + 校验基座：只定义 VerificationResult 及其判别联合与不变式。它不含产生点（host
 * verifier 执行）与消费点（scheduler merge gate 判定）——automation 侧没有任何代码引用它；校验逻辑在
 * validate.ts，ledger 的 terminal RunRecord 以可选字段 `verification?` 承载它（loops/ledger-types.ts），
 * 与既有自报 `verify?` 字段并存于同一条记录。
 *
 * 稳定寻址（D2 裁决）：G2 workflow IR 没有可寻址的 verifier/action 稳定 ID——action 仅按 event 寻址，
 * gate 只是 review|confirm|null。故 binding 用「声明坐标组合」定位，不给 G2 加 ID、不改 parse/compile。
 *
 * 信任模型（validate.ts 逐条钉死，判读这些记录的人须知）：
 *   · trusted 不是自报布尔：它由 issuer 类型派生——host-verifier / human-review 恒 trusted:true，
 *     sandbox-report 恒 trusted:false。sandbox 自报结论可落账，但结构上无法把自己冒充成 trusted。
 *   · passed 判决至少携带一条 evidence（裸判决不成立）。
 *   · repo-file evidence 必须是项目相对路径 + 内容 sha256 + 被验 revision_sha，禁绝对路径与 `..` 逃逸。
 *   · inconclusive（能力缺失 / 证据不全 / subject SHA 漂移）是独立判决，isTrustedPass 只认 passed+trusted，
 *     inconclusive 在授权面绝不被折成 pass。
 */

/** verification 判决闭集（VerificationResult.verdict 的判别值）。 */
export type VerificationVerdict = 'passed' | 'failed' | 'inconclusive'

/**
 * 稳定寻址键：把一条 verdict 绑定到「哪个 workflow 坐标或 runtime verifier」产生。
 *   · workflow-transition：workflow_digest + workflow + step + event 定位一次 custom workflow 转换；
 *     可选 guard_index / action_index 是「同一 workflow 快照内」对某枚 guard/action 的细粒度寻址。
 *     workflow_digest 让 YAML 后续重排 action 后，历史记录仍能按当时快照解释（index 只在该 digest 内有效）。
 *   · default-transition：default workflow 无 custom step IR 坐标，仅用 event 定位（如 'verify-pass'）。
 *   · runtime-verifier：不经 workflow 转换、由具名 host verifier 直接产出，用 verifier + version 标识。
 */
export type VerificationBinding =
  | {
      readonly kind: 'workflow-transition'
      readonly workflow_digest: string
      readonly workflow: string
      readonly step: string
      readonly event: string
      readonly guard_index?: number
      readonly action_index?: number
    }
  | {
      readonly kind: 'default-transition'
      readonly event: string
    }
  | {
      readonly kind: 'runtime-verifier'
      readonly verifier: string
      readonly version: string
    }

/**
 * 可核 evidence 引用（passed 判决的支撑事实）。裸文件路径不算证据——必须绑定内容 hash 与被验 revision，
 * 让核验方能在该 revision 对应的 tree 里重算 hash。
 *   · repo-file：项目相对路径 + 内容 sha256（64 位小写 hex）+ 被验 revision_sha（git 对象名）。
 *   · command-result：host 记录的命令 exit code + 可选输出摘要 hash（不信 sandbox 自报的 exit code）。
 */
export type EvidenceRef =
  | {
      readonly kind: 'repo-file'
      readonly path: string
      readonly sha256: string
      readonly revision_sha: string
    }
  | {
      readonly kind: 'command-result'
      readonly command_id: string
      readonly exit_code: number
      readonly stdout_sha256?: string
      readonly stderr_sha256?: string
    }

/**
 * 判决签发方。trusted 由 kind 派生（validate.ts 逐值钉死字面量，杜绝「把信任委托给被判断对象」）：
 *   · host-verifier：automation 宿主进程调用固定版本 verifier，对权威命名分支 SHA 执行核验 → trusted:true。
 *   · human-review：已认证操作者提交的结构化审批，绑定 workflow run / attempt / subject SHA → trusted:true。
 *   · sandbox-report：sandbox `<output>` 自报观测，恒 trusted:false（可落账，不授权 merge）。
 */
export type VerificationIssuer =
  | {
      readonly kind: 'host-verifier'
      readonly verifier: string
      readonly version: string
      readonly trusted: true
    }
  | {
      readonly kind: 'human-review'
      readonly actor_id: string
      readonly trusted: true
    }
  | {
      readonly kind: 'sandbox-report'
      readonly runner: string
      readonly trusted: false
    }

/**
 * 一条结构化 verification 结果 = 判决 + 稳定寻址 binding + subject（被验对象及其权威 revision）+
 * 可核 evidence + 签发方。由承载它的 terminal RunRecord 与结算结果原子同存（loops/ledger-types.ts
 * 的 RunRecord.verification?），不另建 sidecar。
 */
export interface VerificationResult {
  readonly schema_version: 1
  readonly verification_id: string
  readonly subject: {
    readonly workflow_run_id: string
    readonly attempt_id: string
    readonly change: string
    readonly revision: {
      readonly kind: 'named-branch-head'
      readonly sha: string
    }
  }
  readonly binding: VerificationBinding
  /** H4: exact versioned AutomationPolicy goal this verdict evaluated; absent only for explicit legacy/non-loop runs. */
  readonly automation_policy?: {
    readonly policy_id: string
    readonly policy_version: string
    readonly goal_sha256: string
  }
  readonly verdict: VerificationVerdict
  readonly evidence: readonly EvidenceRef[]
  readonly issuer: VerificationIssuer
  readonly evaluated_at: string
}
