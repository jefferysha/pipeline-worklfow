/** Single source of truth for the production dashboard listener. */
export const DEFAULT_DASHBOARD_PORT = 8765

/**
 * Resolve the optional dashboard override without accepting a malformed or out-of-range port.
 * The frontend development server has its own port; this value always addresses the API/server.
 */
export function resolveDashboardPort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_DASHBOARD_PORT
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535
    ? parsed
    : DEFAULT_DASHBOARD_PORT
}
