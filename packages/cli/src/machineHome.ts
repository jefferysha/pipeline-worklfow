import { canonicalMachineStateHome } from '@pipeline-lite/kernel'

/**
 * Resolve the home used only for pipeline's machine-level state.
 *
 * Runtime skills and Codex credentials continue to use the operating-system home. Tests and
 * isolated dashboard instances may redirect the project registry and secrets with the same
 * PIPELINE_DASHBOARD_HOME contract used by the server.
 */
export function resolveMachineStateHome(
  env: Readonly<Record<string, string | undefined>>,
  defaultHome: string,
): string {
  const overridden = env.PIPELINE_DASHBOARD_HOME?.trim()
  return canonicalMachineStateHome(overridden === undefined || overridden === '' ? defaultHome : overridden)
}
