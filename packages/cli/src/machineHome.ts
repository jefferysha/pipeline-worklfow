import { canonicalMachineStateHome } from '@tenon/kernel'

/**
 * Resolve the home used only for pipeline's machine-level state.
 *
 * Runtime skills and Codex credentials continue to use the operating-system home. Tests and
 * isolated dashboard instances may redirect the project registry and secrets with the same
 * TENON_DASHBOARD_HOME contract used by the server.
 */
export function resolveMachineStateHome(
  env: Readonly<Record<string, string | undefined>>,
  defaultHome: string,
): string {
  const overridden = env.TENON_DASHBOARD_HOME?.trim()
  return canonicalMachineStateHome(overridden === undefined || overridden === '' ? defaultHome : overridden)
}
