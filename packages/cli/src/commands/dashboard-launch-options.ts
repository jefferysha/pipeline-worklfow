export interface ReleasedDashboardOptions {
  /** Defaults to the single production dashboard port. */
  readonly port?: number
  /** A user-facing setup may request a browser; background updates intentionally do not. */
  readonly openBrowser?: boolean
  /** Present only when a managed release transaction owns this launch attempt. */
  readonly transactionId?: string
  /** Stable product version expected from /api/health for managed release publication. */
  readonly expectedServerVersion?: string
  /** Frozen Node executable used by a native setup/update transaction. */
  readonly trustedNodePath?: string
  /** Re-proves the frozen Node identity immediately before the Dashboard process spawn. */
  readonly verifyTrustedNode?: () => void
}

export function parseDashboardPort(raw: string | undefined): number | null {
  if (raw === undefined || !/^[1-9][0-9]{0,4}$/.test(raw)) return null
  const port = Number.parseInt(raw, 10)
  return port <= 65_535 ? port : null
}

export function dashboardProcessEnvironment(
  port: number,
  transactionId?: string,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TENON_DASHBOARD_PORT: String(port),
    ...(transactionId === undefined ? {} : { TENON_MANAGED_TRANSACTION_ID: transactionId }),
  }
}
