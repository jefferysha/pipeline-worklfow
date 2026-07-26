import type { ProductPaths } from '@tenon/kernel'

export type NativeRuntimeHost = 'codex' | 'claude'

export type RuntimePaths = ProductPaths

export interface RuntimeReleaseSource {
  readonly host: NativeRuntimeHost | 'adapter' | 'manual'
  readonly pluginVersion: string
}

export interface RuntimeReleaseManifest {
  readonly version: 1
  readonly releaseId: string
  readonly payloadDigest: string
  readonly createdAt: string
  readonly source: RuntimeReleaseSource
}

export interface RuntimeSelection {
  readonly version: 1
  readonly revision: number
  readonly activeRelease: string | null
  readonly previousRelease: string | null
  readonly updatedAt: string
}

export interface RuntimeLauncherFileSnapshot {
  readonly path: string
  readonly state:
    | { readonly kind: 'missing' }
    | { readonly kind: 'file'; readonly content: string; readonly mode: number }
}

export interface RuntimeLauncherSnapshot {
  readonly tenon: RuntimeLauncherFileSnapshot
  readonly hook: RuntimeLauncherFileSnapshot
}

export interface RuntimeAuditEntry {
  readonly version: 1
  readonly at: string
  readonly kind:
    | 'activated'
    | 'activation-rejected'
    | 'rolled-back'
    | 'rollback-rejected'
    | 'update-rejected'
    | 'pruned'
  readonly releaseId?: string
  readonly previousRelease?: string | null
  readonly detail: string
}

export interface RuntimeActivation {
  readonly selection: RuntimeSelection
  readonly release: RuntimeReleaseManifest
  readonly releaseRoot: string
  /** Exact pre-activation launcher state used by the installer-owned compensation transaction. */
  readonly launcherSnapshot?: RuntimeLauncherSnapshot
  /** Exact launcher state written by this activation; compensation uses it as a CAS ownership proof. */
  readonly launcherCommitted?: RuntimeLauncherSnapshot
}

export interface RuntimeInspection {
  readonly selection: RuntimeSelection
  readonly active: RuntimeReleaseManifest | null
  readonly previous: RuntimeReleaseManifest | null
  readonly activeValid: boolean
  readonly previousValid: boolean
  readonly lastAudit: RuntimeAuditEntry | null
}

export class RuntimeFailure extends Error {
  readonly code: 'candidate-invalid' | 'no-active-release' | 'no-recovery-release' | 'runtime-corrupt'

  constructor(code: RuntimeFailure['code'], message: string) {
    super(message)
    this.name = 'RuntimeFailure'
    this.code = code
  }
}
