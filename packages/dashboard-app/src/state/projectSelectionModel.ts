import { resolveDashboardRoot } from '../shell/dashboardLocation'
import type { ProjectSnapshot } from '../types'

export type ProjectSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'selected'; readonly root: string }

/**
 * `ok=false` normally means the project is unreachable. A compatibility issue is the one
 * structured exception: the server intentionally keeps readable sibling Changes while failing
 * the future-version Change closed, so Progress must remain reachable for both the notice and
 * those siblings.
 */
export function isProjectNavigable(project: ProjectSnapshot): boolean {
  return project.ok || (project.error === undefined && (project.compatibilityIssues?.length ?? 0) > 0)
}

/**
 * Views that can mutate project state may mount only after the trusted snapshot boundary has
 * positively classified the project as healthy. Missing and compatibility-only projects are
 * deliberately read-only.
 */
export function isProjectWritable(project: ProjectSnapshot | undefined): boolean {
  return project?.ok === true
}

export function resolveProjectSelection(
  projects: readonly ProjectSnapshot[],
  preferred: string | null,
): ProjectSelection {
  const reachableRoots = projects
    .filter(isProjectNavigable)
    .map((project) => project.root)
  const root = resolveDashboardRoot(reachableRoots, preferred)
  return root === '' ? { kind: 'none' } : { kind: 'selected', root }
}

export function selectedProjectRoot(selection: ProjectSelection): string {
  return selection.kind === 'selected' ? selection.root : ''
}
