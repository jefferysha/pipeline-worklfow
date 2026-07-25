import type { DriftItem, DriftReport } from './drift.js'
import type { LoopEntry } from './types.js'

export const RECONCILIATION_PLAN_KIND = 'loop-reconciliation-plan' as const
export const RECONCILIATION_PLAN_SCHEMA_VERSION = 1 as const
export const RECONCILIATION_TARGET = 'LOOP.md' as const
export const MANAGED_LOOP_SECTION_OWNERSHIP = 'pipeline-loop-mirror-v1' as const
export type ResourceEpoch =
  | { readonly kind: 'absent' }
  | { readonly kind: 'sha256'; readonly value: string }

export type ReconciliationScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'loop'; readonly loop_id: string }

export type ReconciliationOperation =
  | {
      readonly kind: 'ensure-managed-loop-section'
      readonly target: typeof RECONCILIATION_TARGET
      readonly loop_id: string
    }
  | {
      readonly kind: 'remove-managed-loop-section'
      readonly target: typeof RECONCILIATION_TARGET
      readonly loop_id: string
      readonly ownership: typeof MANAGED_LOOP_SECTION_OWNERSHIP
    }

export type ReconciliationBlockerReason =
  | 'historical-fact-immutable'
  | 'runtime-remediation-required'
  | 'ambiguous-authority'
  | 'unowned-document-section'
  | 'managed-section-corrupt'

export interface ReconciliationBlocker {
  readonly drift: DriftItem
  readonly reason: ReconciliationBlockerReason
  readonly next_step: string
}

export interface ReconciliationPlan {
  readonly kind: typeof RECONCILIATION_PLAN_KIND
  readonly schema_version: typeof RECONCILIATION_PLAN_SCHEMA_VERSION
  readonly plan_id: string
  readonly generated_at: string
  readonly scope: ReconciliationScope
  readonly observed: {
    readonly registry: { readonly path: '.pipeline/loops.yaml'; readonly epoch: ResourceEpoch }
    readonly loop_doc: { readonly path: typeof RECONCILIATION_TARGET; readonly epoch: ResourceEpoch }
    readonly run_log: {
      readonly path: '.superpowers/loops/progress.md'
      readonly epoch: ResourceEpoch
      readonly role: 'observation-only'
    }
  }
  readonly preconditions: {
    readonly registry_epoch: ResourceEpoch
    readonly loop_doc_epoch: ResourceEpoch
  }
  readonly operations: readonly ReconciliationOperation[]
  readonly blockers: readonly ReconciliationBlocker[]
  readonly expected_loop_doc_epoch: ResourceEpoch
  readonly drift_report: DriftReport
}

export type ReconciliationPlanPayload = Omit<ReconciliationPlan, 'plan_id'>

export interface BuildReconciliationPlanInput {
  readonly generated_at: string
  readonly scope: ReconciliationScope
  readonly loops: readonly LoopEntry[]
  readonly registry_epoch: ResourceEpoch
  readonly run_log_epoch: ResourceEpoch
  readonly loop_doc_bytes: Uint8Array | null
  readonly drift_report: DriftReport
}

export interface ApplyReconciliationOperationsInput {
  readonly loop_doc_bytes: Uint8Array | null
  readonly loops: readonly LoopEntry[]
  readonly operations: readonly ReconciliationOperation[]
}

export type ApplyReconciliationOperationsResult =
  | {
      readonly ok: true
      readonly bytes: Uint8Array
      readonly changed: boolean
      readonly epoch: ResourceEpoch
    }
  | {
      readonly ok: false
      readonly reason: 'invalid-operation' | 'managed-section-corrupt'
      readonly detail: string
    }
