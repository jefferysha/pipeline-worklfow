export type NativeRuntimeHost = 'codex' | 'claude'

export interface RuntimePaths {
  readonly dataRoot: string
  readonly stateRoot: string
  readonly configRoot: string
  readonly releasesRoot: string
  readonly stagingRoot: string
  readonly bootstrapRoot: string
  readonly selectionPath: string
  readonly auditPath: string
}

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

export interface RuntimeAuditEntry {
  readonly version: 1
  readonly at: string
  readonly kind: 'activated' | 'activation-rejected' | 'rolled-back' | 'pruned'
  readonly releaseId?: string
  readonly previousRelease?: string | null
  readonly detail: string
}

export interface RuntimeActivation {
  readonly selection: RuntimeSelection
  readonly release: RuntimeReleaseManifest
  readonly releaseRoot: string
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
