import { type StateStore } from '@tenon/kernel'
import type { SnapshotDeps } from './snapshot.js'
import { readAnchoredChangeState, readChangeSnapshot } from './changeSnapshot.js'
import { resolveWorkflowDefinitionStatusRoute } from './serverWorkflowDefinitionStatusRoutes.js'
import { resolveOrchestrationGraphRoute } from './serverOrchestrationGraphRoutes.js'
import type { WorkflowRootAnchor } from './workflows.js'
import { readCurrentWorkflowDefinition } from './workflowDefinitionReader.js'

type WorkflowRootCheck =
  | { readonly ok: true; readonly anchor: WorkflowRootAnchor }
  | { readonly ok: false; readonly code: 403 | 404; readonly error: string }

interface OrchestrationRouteDeps {
  readonly snapshotDeps: (nowMs?: number) => SnapshotDeps
  readonly workflowRootForRequest: (root: string) => WorkflowRootCheck
  readonly store: StateStore
}

export async function resolveOrchestrationRoutes(
  rawUrl: string,
  path: string,
  deps: OrchestrationRouteDeps,
): Promise<{ readonly status: number; readonly body: unknown } | null> {
  const graph = await resolveOrchestrationGraphRoute(rawUrl, path, {
    workflowRootForRequest: deps.workflowRootForRequest,
    readChange: async (root, name) => readChangeSnapshot(deps.snapshotDeps(), root, name),
  })
  if (graph !== null) return graph

  return resolveWorkflowDefinitionStatusRoute(rawUrl, path, {
    workflowRootForRequest: deps.workflowRootForRequest,
    readChangeState: async (anchor, change) =>
      (await readAnchoredChangeState(anchor, change))?.state ?? null,
    readCurrent: readCurrentWorkflowDefinition,
  })
}
