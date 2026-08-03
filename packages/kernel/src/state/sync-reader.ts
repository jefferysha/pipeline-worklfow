import type { PipelineState } from '../types.js'
import { parsePipeline } from './parse.js'
import { readCurrentRunRevisionFromSync } from './run-revision-store.js'
import {
  attachWorkflowGovernanceBinding,
  parseWorkflowGovernanceBinding,
} from './workflow-governance-binding.js'
import {
  attachWorkflowPlanSnapshot,
  parseWorkflowPlanSnapshot,
} from './workflow-plan-snapshot.js'

const LEGACY_STATE_FILE_NAME = '.pipeline.yaml'

export function readPipelineStateFromSync(
  readText: (relativePath: string) => string | undefined,
  sourceRoot = 'canonical Change state',
): PipelineState | undefined {
  const current = readCurrentRunRevisionFromSync(readText, sourceRoot)
  if (current !== undefined) {
    const bindingRaw = readText('.pipeline-workflow-governance.json')
    const planRaw = readText('.pipeline-workflow-plan.json')
    const state = structuredClone(current.state)
    const governedMetadata = attachWorkflowGovernanceBinding(
      state.runMetadata,
      bindingRaw === undefined ? undefined : parseWorkflowGovernanceBinding(bindingRaw),
    )
    const metadata = attachWorkflowPlanSnapshot(
      governedMetadata,
      planRaw === undefined ? undefined : parseWorkflowPlanSnapshot(planRaw),
    )
    return { ...state, ...(metadata === undefined ? {} : { runMetadata: metadata }) }
  }
  const legacy = readText(LEGACY_STATE_FILE_NAME)
  return legacy === undefined ? undefined : parsePipeline(legacy)
}
