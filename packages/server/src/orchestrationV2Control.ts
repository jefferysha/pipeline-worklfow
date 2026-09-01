/**
 * Application control service for the canonical orchestration v2 ledger.
 *
 * The service owns resource addressing (trusted project root + bounded change id)
 * while the Kernel remains the only state-transition authority. HTTP, SSE and CLI
 * adapters can share this seam without reimplementing path checks or ledger calls.
 */
import { join } from 'node:path'
import type {
  BoardCommandV2,
  BoardEventV2,
  BoardSnapshotV2,
  LedgerAppendResult,
  LedgerRecoveryResult,
  OrchestrationLedger,
  OrchestrationSeed,
} from '@tenon/kernel'
import type { WorkflowRootAnchor } from './workflows.js'

export type OrchestrationControlRootCheck =
  | { readonly ok: true; readonly anchor: WorkflowRootAnchor }
  | { readonly ok: false; readonly code: 403 | 404; readonly error: string }

export interface OrchestrationV2ControlDeps {
  readonly ledger: OrchestrationLedger
  readonly workflowRootForRequest: (root: string) => OrchestrationControlRootCheck
}

export class OrchestrationV2ControlError extends Error {
  readonly code: 'root-required' | 'root-forbidden' | 'root-not-registered' | 'change-invalid'
  readonly status: 400 | 403 | 404

  constructor(code: OrchestrationV2ControlError['code'], message: string, status: OrchestrationV2ControlError['status']) {
    super(message)
    this.name = 'OrchestrationV2ControlError'
    this.code = code
    this.status = status
  }
}

const CHANGE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u

function validChangeId(changeId: string): boolean {
  return changeId !== '.' && changeId !== '..' && CHANGE_ID.test(changeId) && !changeId.includes('/') && !changeId.includes('\\')
}

export class OrchestrationV2Control {
  readonly ledger: OrchestrationLedger

  private readonly workflowRootForRequest: (root: string) => OrchestrationControlRootCheck

  constructor(deps: OrchestrationV2ControlDeps) {
    this.ledger = deps.ledger
    this.workflowRootForRequest = deps.workflowRootForRequest
  }

  resolveChangeDirectory(root: string, changeId: string): string {
    if (root === '') throw new OrchestrationV2ControlError('root-required', '缺少 root 参数', 400)
    if (!validChangeId(changeId)) throw new OrchestrationV2ControlError('change-invalid', '非法 change 名', 400)
    let check: OrchestrationControlRootCheck
    try { check = this.workflowRootForRequest(root) } catch { throw new OrchestrationV2ControlError('root-forbidden', 'root 不可信', 403) }
    if (!check.ok) {
      throw new OrchestrationV2ControlError(check.code === 404 ? 'root-not-registered' : 'root-forbidden', check.code === 404 ? 'root 未注册' : 'root 不可信', check.code)
    }
    return join(check.anchor.path, 'openspec', 'changes', changeId)
  }

  async initialize(root: string, seed: OrchestrationSeed): Promise<BoardSnapshotV2> {
    return this.ledger.initialize(this.resolveChangeDirectory(root, seed.change_id), seed)
  }

  async readSnapshot(root: string, changeId: string): Promise<BoardSnapshotV2 | undefined> {
    return this.ledger.readSnapshot(this.resolveChangeDirectory(root, changeId))
  }

  async readEvents(root: string, changeId: string, options?: { readonly fromRevision?: number; readonly toRevision?: number }): Promise<readonly BoardEventV2[]> {
    return this.ledger.readEvents(this.resolveChangeDirectory(root, changeId), options)
  }

  async append(root: string, changeId: string, command: BoardCommandV2): Promise<LedgerAppendResult> {
    return this.ledger.append(this.resolveChangeDirectory(root, changeId), command)
  }

  async recover(root: string, changeId: string, now?: string): Promise<LedgerRecoveryResult> {
    return this.ledger.recover(this.resolveChangeDirectory(root, changeId), now)
  }
}

export function createOrchestrationV2Control(deps: OrchestrationV2ControlDeps): OrchestrationV2Control {
  return new OrchestrationV2Control(deps)
}
