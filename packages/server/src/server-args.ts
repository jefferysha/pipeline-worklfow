export type DashboardServerArgumentMode =
  | { readonly mode: 'run' }
  | { readonly mode: 'help' }
  | { readonly mode: 'invalid'; readonly detail: string }

/**
 * The server bundle is an internal managed-runtime entrypoint. Keep its process surface explicit so
 * probing it with `--help` can never silently bind or preempt the production singleton.
 */
export function parseDashboardServerArgs(args: readonly string[]): DashboardServerArgumentMode {
  if (args.length === 0) return { mode: 'run' }
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) return { mode: 'help' }
  return {
    mode: 'invalid',
    detail: `unsupported direct server arguments: ${args.join(' ')}`,
  }
}
