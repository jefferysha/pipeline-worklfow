import {
  ManagedRuntimeIndeterminateError,
  type ManagedDashboardIdentity,
} from '../runtime/installer.js'

export function sameManagedDashboardIdentity(
  left: ManagedDashboardIdentity | undefined,
  right: ManagedDashboardIdentity | undefined,
): boolean {
  return left !== undefined
    && right !== undefined
    && left.version === right.version
    && left.serverVersion === right.serverVersion
    && left.port === right.port
    && left.pid === right.pid
    && left.releaseId === right.releaseId
    && left.stateScopeId === right.stateScopeId
    && left.transactionId === right.transactionId
}

/** Legacy v1.0.1 WAL omitted only serverVersion; every other ownership coordinate stays exact. */
export function sameManagedDashboardCoordinates(
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

export function assertManagedDashboardPort(
  identity: ManagedDashboardIdentity,
  expectedPort: number,
  label: string,
): void {
  if (identity.port !== expectedPort) {
    throw new ManagedRuntimeIndeterminateError(
      `${label} port=${identity.port} 与 frozen dashboardPort=${expectedPort} 不一致`,
    )
  }
}
