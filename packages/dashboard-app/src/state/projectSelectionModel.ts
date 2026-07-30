import { resolveDashboardRoot } from '../shell/dashboardLocation'
import type { ProjectSnapshot } from '../types'

export type ProjectSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'selected'; readonly root: string }

export function resolveProjectSelection(
  projects: readonly ProjectSnapshot[],
  preferred: string | null,
): ProjectSelection {
  const reachableRoots = projects
    .filter((project) => project.ok || (project.compatibilityIssues?.length ?? 0) > 0)
    .map((project) => project.root)
  const root = resolveDashboardRoot(reachableRoots, preferred)
  return root === '' ? { kind: 'none' } : { kind: 'selected', root }
}

export function selectedProjectRoot(selection: ProjectSelection): string {
  return selection.kind === 'selected' ? selection.root : ''
}
