import {
  stateStorageExistsSync,
  type StateStore,
} from '@tenon/kernel'
import { buildSnapshot, type SnapshotDeps } from './snapshot.js'
import {
  readCurrentWorkflowDefinition,
  resolveWorkflowDefinitionStatusRoute,
} from './serverWorkflowDefinitionStatusRoutes.js'
import { resolveOrchestrationGraphRoute } from './serverOrchestrationGraphRoutes.js'
import type { WorkflowDefinitionStatusResponse } from './workflowDefinitionStatus.js'
import type { WorkflowRootAnchor } from './workflows.js'

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
    readChange: async (root, name) => {
      const snapshot = await buildSnapshot(deps.snapshotDeps())
      return snapshot.projects.find((project) => project.root === root)
        ?.changes.find((change) => change.name === name) ?? null
    },
    readDefinition: async (root, name) => {
      const params = new URLSearchParams({ root, change: name })
      const result = await resolveWorkflowDefinitionStatusRoute(
        `/api/workflow-definition-status?${params.toString()}`,
        '/api/workflow-definition-status',
        {
          workflowRootForRequest: deps.workflowRootForRequest,
          stateStorageExists: stateStorageExistsSync,
          readState: (changeDir) => deps.store.read(changeDir),
          readCurrent: readCurrentWorkflowDefinition,
        },
      )
      if (result?.status !== 200
        || typeof result.body !== 'object'
        || result.body === null
        || !('schema' in result.body)
        || result.body.schema !== 'workflow-definition-status/v1') {
        throw new Error('workflow definition status unavailable')
      }
      return result.body as WorkflowDefinitionStatusResponse
    },
  })
  if (graph !== null) return graph

  return resolveWorkflowDefinitionStatusRoute(rawUrl, path, {
    workflowRootForRequest: deps.workflowRootForRequest,
    stateStorageExists: stateStorageExistsSync,
    readState: (changeDir) => deps.store.read(changeDir),
    readCurrent: readCurrentWorkflowDefinition,
  })
}
