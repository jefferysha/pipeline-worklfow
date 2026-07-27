import type { ManagedDashboardIdentity } from '../runtime/installer.js'

export function sameManagedDashboardIdentity(
  left: ManagedDashboardIdentity | undefined,
  right: ManagedDashboardIdentity | undefined,
): boolean {
  return left !== undefined
    && right !== undefined
    && left.version === right.version
    && left.port === right.port
    && left.pid === right.pid
    && left.releaseId === right.releaseId
    && left.stateScopeId === right.stateScopeId
    && left.transactionId === right.transactionId
}
