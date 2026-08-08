import type {
  ManagedReleaseOperation,
  ManagedStableReleaseTarget,
  RuntimeInstallerScope,
} from '../runtime/installer.js'
import type { NativeRuntimeHost, RuntimeActivation } from '../runtime/types.js'

export type ManagedReleaseFailureState = 'unchanged' | 'restored' | 'indeterminate'

export type ManagedReleaseOutcome =
  | {
      readonly ok: true
      readonly state: 'ready'
      readonly activation: RuntimeActivation
      readonly stableTarget?: ManagedStableReleaseTarget
    }
  | {
      readonly ok: true
      readonly state: 'current'
      readonly stableTarget?: ManagedStableReleaseTarget
    }
  | {
      readonly ok: false
      readonly state: ManagedReleaseFailureState
      readonly detail: string
    }

export interface ManagedHostPreparationContext {
  readonly transactionId: string
  /** Freeze latest once, or revalidate and reuse the target already owned by this journal. */
  resolveStableTarget(
    resolveLatest: () => Promise<ManagedStableReleaseTarget>,
    proveFrozen: (target: ManagedStableReleaseTarget) => void | Promise<void>,
  ): Promise<ManagedStableReleaseTarget>
  /**
   * Executes one retry-safe host command under a durable before/after checkpoint. A completed
   * step returns its persisted result on recovery instead of replaying earlier host mutations.
   */
  runStep(
    id: string,
    step: import('../runtime/managed-host-reconciliation.js').ManagedHostStepExecution,
  ): Promise<string>
}

export interface ManagedReleaseRequest {
  readonly operation: ManagedReleaseOperation
  readonly source: NativeRuntimeHost | 'adapter'
  readonly runtime: RuntimeInstallerScope
  readonly openBrowser: boolean
  /** Frozen release version which must match the candidate before selection changes. */
  readonly expectedPluginVersion?: string
  /** Native update recovery requires a persisted stable target in every post-prepare phase. */
  readonly requiresStableTarget?: boolean
  readonly proveFrozenTarget?: (
    target: ManagedStableReleaseTarget,
  ) => void | Promise<void>
  /** Optional isolated Dashboard port; absence preserves the production default. */
  readonly dashboardPort?: number
  /**
   * Runs under the same cross-process lock as activation and Dashboard commit.
   * Native hosts perform marketplace mutation and authoritative inventory resolution here.
   */
  readonly prepareCandidate: (host: ManagedHostPreparationContext) =>
    | { readonly candidateRoot: string; readonly evidence?: string; readonly openBrowser?: boolean }
    | { readonly alreadyCurrent: true }
    | Promise<
        | { readonly candidateRoot: string; readonly evidence?: string; readonly openBrowser?: boolean }
        | { readonly alreadyCurrent: true }
      >
  /** Dashboard ready 后才提交与 activation 绑定的外部证据。抛错会回滚 runtime 与 Dashboard。 */
  readonly commitReadyEvidence?: (
    activation: RuntimeActivation,
    candidate: { readonly candidateRoot: string; readonly evidence?: string },
    transactionId: string,
  ) => void | Promise<void>
}
